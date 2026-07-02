import hmac
import hashlib
import json
import logging
import datetime
import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.orm import Session
import httpx

from app.core.database import get_db
from app.core.config import settings
from app.core.notification import get_notification_service
from app.core.security import get_current_user
from app.models.models import (
    UPIMandate, PreDebitNotification, DebitExecution, Loan, User,
    MandateStatus, NotificationStatus, ExecutionStatus
)
from app.tasks.autopay import trigger_daily_pre_debit_notifications, execute_daily_debits, get_setu_headers

logger = logging.getLogger("mandates_router")

router = APIRouter()

# Pydantic Schemas for API Input/Output
class InitiateMandateRequest(BaseModel):
    loan_id: str
    max_amount_paise: int  # Maximum amount per debit execution, e.g., 1500000 (15,000 INR)

class InitiateMandateResponse(BaseModel):
    mandate_id: str
    setu_mandate_id: str
    status: str
    intent_url: str
    reference_id: str

class TestScheduleRequest(BaseModel):
    loan_id: str
    amount_paise: int
    expected_debit_offset_days: int = 1 # 1 means tomorrow (T+1), 0 means today (T)

def verify_signature(payload: bytes, signature: str) -> bool:
    """Verifies that the incoming webhook is signed by Setu using the configured secret."""
    if not signature:
        return False
    computed = hmac.new(
        key=settings.SETU_WEBHOOK_SECRET.encode("utf-8"),
        msg=payload,
        digestmod=hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed, signature)


# =====================================================================
# ENDPOINT: Initiate Mandate
# =====================================================================
@router.post("/api/mandates/initiate", response_model=InitiateMandateResponse)
async def initiate_mandate(
    body: InitiateMandateRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Creates a new mandate session for a loan account. Communicates with Setu API
    to register the intent, and logs the mandate status as INITIATED.
    """
    # 1. Resolve loan account & borrower details
    loan = db.query(Loan).filter(Loan.id == body.loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan account not found")
        
    if loan.mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot setup AutoPay for another user's loan")

    reference_id = f"MND_REF_{uuid.uuid4().hex[:12].upper()}"
    
    # 2. Build payload optimized for debt collection (MAX limit, AS_PRESENTED frequency)
    # Defaulting dates to 5-year coverage
    start_date = datetime.date.today()
    end_date = start_date + datetime.timedelta(days=365 * 5)
    
    payload = {
        "referenceId": reference_id,
        "customer": {
            "mobile": f"91{loan.mobile}",
            "email": f"borrower_{loan.mobile}@example.com",
            "name": loan.customer_name,
            # In sandbox, using custom VPA pattern
            "vpa": f"borrower_{loan.mobile}@okhdfcbank"
        },
        "mandateDetails": {
            "amount": body.max_amount_paise,
            "amountRule": "MAX",
            "frequency": "AS_PRESENTED",
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "purposeCode": "103", # NPCI code for Loan Repayments
            "merchantDetails": {
                "name": "FinRecovery Solutions Private Limited",
                "categoryCode": "6012"
            }
        },
        "redirectUrl": "https://recovery.finportal.com/mandates/callback",
        "metadata": {
            "loanId": str(loan.id)
        }
    }
    
    try:
        headers = await get_setu_headers()
    except Exception as e:
        logger.error(f"Failed to generate Setu headers: {e}")
        raise HTTPException(status_code=500, detail="Could not authorize Setu client API connection")

    # 3. Call Setu Gateway
    async with httpx.AsyncClient() as client:
        url = f"{settings.SETU_API_BASE_URL.rstrip('/')}/v1/mandates"
        try:
            response = await client.post(url, json=payload, headers=headers, timeout=15.0)
            resp_json = response.json()
        except Exception as e:
            logger.error(f"Network error calling Setu Mandate endpoint: {e}")
            raise HTTPException(status_code=502, detail="Gateway timeout calling Setu API")
            
        if response.status_code != 200 or not resp_json.get("success"):
            logger.error(f"Setu Mandate initiation returned error: {resp_json}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=resp_json.get("error", {}).get("message", "Setu registration failure")
            )
            
        data = resp_json["data"]
        setu_mandate_id = data["id"]
        intent_url = data["intentUrl"]
        
        # 4. Save mandate record in DB
        db_mandate = UPIMandate(
            loan_id=loan.id,
            customer_id=loan.id, # Mapping customer_id to loan_id index in this context
            reference_id=reference_id,
            setu_mandate_id=setu_mandate_id,
            max_amount_paise=body.max_amount_paise,
            amount_rule="MAX",
            frequency="AS_PRESENTED",
            start_date=start_date,
            end_date=end_date,
            status=MandateStatus.INITIATED
        )
        db.add(db_mandate)
        db.commit()
        db.refresh(db_mandate)
        
        return InitiateMandateResponse(
            mandate_id=str(db_mandate.id),
            setu_mandate_id=setu_mandate_id,
            status=db_mandate.status.value,
            intent_url=intent_url,
            reference_id=reference_id
        )


# =====================================================================
# ENDPOINT: Setu Webhook Callback Handler
# =====================================================================
@router.post("/webhooks/setu-autopay")
async def handle_setu_webhook(
    request: Request,
    x_setu_signature: str = Header(None),
    db: Session = Depends(get_db)
):
    """
    Receives and processes signed callbacks from Setu.
    Authenticates messages against the HMAC signature and reconciles DB statuses.
    """
    body_bytes = await request.body()
    
    # 1. Signature Verification
    if not verify_signature(body_bytes, x_setu_signature):
        logger.error("Setu Webhook verification failed. Invalid header signature.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook signature verification failed"
        )
        
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    event_type = payload.get("event")
    data = payload.get("data", {})
    
    logger.info(f"Incoming Setu Webhook: Event={event_type}")
    
    # 2. Process Event Types
    
    if event_type in ["MANDATE_SUCCESSFUL", "mandate.active"]:
        setu_mandate_id = data.get("mandateId")
        umn = data.get("umn")
        
        mandate = db.query(UPIMandate).filter(UPIMandate.setu_mandate_id == setu_mandate_id).first()
        if mandate:
            mandate.umn = umn
            mandate.status = MandateStatus.ACTIVE
            mandate.customer_vpa = data.get("vpa")
            db.commit()
            logger.info(f"Mandate {setu_mandate_id} is now ACTIVE with UMN: {umn}")
            
            # Intercept settlement mandates to update loan outstanding and schedule EMIs
            if mandate.reference_id and mandate.reference_id.startswith("SETTLE_MND_"):
                try:
                    parts = mandate.reference_id.split("_")
                    tenure = int(parts[2])
                    settlement_amount = int(parts[3])
                    
                    loan = db.query(Loan).filter(Loan.id == mandate.loan_id).first()
                    if loan:
                        loan.total_outstanding = settlement_amount
                        loan.settled_amount = settlement_amount
                        db.commit()
                        logger.info(f"Settlement mandate activated for Loan {loan.id}. Adjusted outstanding to {settlement_amount} paise.")
                        
                        # Generate EMI schedule in DB
                        base_emi = settlement_amount // tenure
                        for i in range(tenure):
                            if i == tenure - 1:
                                inst_amount = settlement_amount - (base_emi * (tenure - 1))
                            else:
                                inst_amount = base_emi
                                
                            offset_days = 30 * i
                            
                            if i == 0:
                                expected_debit_date = datetime.date.today()
                                notification = PreDebitNotification(
                                    mandate_id=mandate.id,
                                    amount_paise=inst_amount,
                                    setu_notification_id=f"NTF-SETTLE-MOCK-{uuid.uuid4().hex[:12].upper()}",
                                    scheduled_at=datetime.datetime.now(datetime.timezone.utc),
                                    sent_at=datetime.datetime.now(datetime.timezone.utc),
                                    expected_debit_date=expected_debit_date,
                                    status=NotificationStatus.SUCCESS
                                )
                                db.add(notification)
                                db.commit()
                                db.refresh(notification)
                                
                                debit = DebitExecution(
                                    mandate_id=mandate.id,
                                    pre_debit_notification_id=notification.id,
                                    amount_paise=inst_amount,
                                    scheduled_at=datetime.datetime.now(datetime.timezone.utc),
                                    status=ExecutionStatus.INITIATED,
                                    retry_count=0
                                )
                                db.add(debit)
                                db.commit()
                            else:
                                # Future installments
                                expected_debit_date = datetime.date.today() + datetime.timedelta(days=offset_days)
                                notification = PreDebitNotification(
                                    mandate_id=mandate.id,
                                    amount_paise=inst_amount,
                                    scheduled_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=offset_days),
                                    expected_debit_date=expected_debit_date,
                                    status=NotificationStatus.PENDING
                                )
                                db.add(notification)
                                db.commit()
                                db.refresh(notification)
                                
                                debit = DebitExecution(
                                    mandate_id=mandate.id,
                                    pre_debit_notification_id=notification.id,
                                    amount_paise=inst_amount,
                                    scheduled_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=offset_days),
                                    status=ExecutionStatus.INITIATED,
                                    retry_count=0
                                )
                                db.add(debit)
                                db.commit()
                        logger.info(f"Successfully generated schedule of {tenure} EMIs for mandate {mandate.id}.")
                except Exception as ex:
                    logger.error(f"Error scheduling settlement EMIs for mandate {mandate.id}: {ex}")

    # Event: Customer Revoked Mandate
    elif event_type in ["MANDATE_REVOKED", "mandate.revoked"]:
        setu_mandate_id = data.get("mandateId")
        reason = data.get("revocationReason", "No reason provided")
        
        mandate = db.query(UPIMandate).filter(UPIMandate.setu_mandate_id == setu_mandate_id).first()
        if mandate:
            mandate.status = MandateStatus.REVOKED
            db.commit()
            logger.warning(f"Mandate {setu_mandate_id} revoked by customer. Reason: {reason}")
            
            # Dispatch warning notification (Section 25 Compliance Alert)
            loan = db.query(Loan).filter(Loan.id == mandate.loan_id).first()
            if loan:
                notifier = get_notification_service()
                email_dest = f"borrower_{loan.mobile}@example.com"
                await notifier.send_revocation_alert(
                    email=email_dest,
                    phone=loan.mobile,
                    customer_name=loan.customer_name,
                    loan_id=str(loan.id),
                    reason=reason
                )

    # Event: Debit Successful
    elif event_type in ["DEBIT_SUCCESSFUL", "debit.success"]:
        ref_id = data.get("referenceId")
        settled_amount = data.get("amount") # in paise
        
        debit = db.query(DebitExecution).filter(DebitExecution.id == ref_id).first()
        if debit:
            debit.status = ExecutionStatus.SUCCESS
            debit.debited_amount_paise = settled_amount
            debit.executed_at = datetime.datetime.now(datetime.timezone.utc)
            db.commit()
            
            # Reconcile Balance in Ledger
            loan = db.query(Loan).filter(Loan.id == debit.mandate.loan_id).first()
            if loan:
                # Subtract total outstanding
                loan.total_outstanding = max(0, loan.total_outstanding - settled_amount)
                # Pro-rata reconcile interest and principal for simplicity
                if loan.total_outstanding == 0:
                    loan.status = "SETTLED"
                    loan.settled_at = datetime.datetime.utcnow()
                    loan.settled_amount = loan.total_outstanding # record final
                db.commit()
                logger.info(f"Settled payment of ₹{settled_amount/100:.2f} for Loan {loan.id}. Outstanding: ₹{loan.total_outstanding/100:.2f}")

    # Event: Debit Failed
    elif event_type in ["DEBIT_FAILED", "debit.failed"]:
        ref_id = data.get("referenceId")
        error_info = data.get("error", {})
        npci_code = error_info.get("npciCode")
        err_msg = error_info.get("message")
        
        debit = db.query(DebitExecution).filter(DebitExecution.id == ref_id).first()
        if debit:
            debit.status = ExecutionStatus.FAILED
            debit.npci_response_code = npci_code
            debit.error_code = error_info.get("code")
            debit.error_message = err_msg
            db.commit()
            logger.warning(f"Debit failed for Transaction {ref_id}. NPCI Code: {npci_code}. Message: {err_msg}")
            
            # If failed due to insufficient balance ("51"), trigger smart retry queue
            if npci_code == "51":
                if debit.retry_count < 2:
                    # Retry in 2 days
                    retry_debit = DebitExecution(
                        mandate_id=debit.mandate_id,
                        pre_debit_notification_id=debit.pre_debit_notification_id,
                        amount_paise=debit.amount_paise,
                        scheduled_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=2),
                        retry_count=debit.retry_count + 1,
                        status=ExecutionStatus.INITIATED
                    )
                    db.add(retry_debit)
                    db.commit()
                    logger.info(f"Queued retry attempt #{retry_debit.retry_count} for Debit {debit.id} in 48 hours.")
                else:
                    logger.error(f"Max retries reached for debit execution lifecycle {debit.id}. Flagging manual recovery.")

    return {"status": "ACK"}


# =====================================================================
# TESTING HELPER: Create Mock Test Schedule
# =====================================================================
@router.post("/api/mandates/create-test-schedule")
def create_test_schedule(body: TestScheduleRequest, db: Session = Depends(get_db)):
    """
    Developer Utility Endpoint:
    Creates a pre-debit notification audit trail and scheduled debit record in the DB
    referencing an active mandate, enabling instant execution testing.
    """
    # 1. Resolve active mandate
    mandate = db.query(UPIMandate).filter(
        and_(
            UPIMandate.loan_id == body.loan_id,
            UPIMandate.status == MandateStatus.ACTIVE
        )
    ).first()
    
    if not mandate:
        raise HTTPException(
            status_code=400,
            detail="No active mandate exists for this Loan ID. Please register and authorize a mandate first."
        )
        
    target_date = datetime.date.today() + datetime.timedelta(days=body.expected_debit_offset_days)
    
    # 2. Insert notification record
    notification = PreDebitNotification(
        mandate_id=mandate.id,
        amount_paise=body.amount_paise,
        scheduled_at=datetime.datetime.now(datetime.timezone.utc),
        expected_debit_date=target_date,
        status=NotificationStatus.PENDING
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    
    # 3. Insert debit record
    debit = DebitExecution(
        mandate_id=mandate.id,
        pre_debit_notification_id=notification.id,
        amount_paise=body.amount_paise,
        scheduled_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=body.expected_debit_offset_days),
        status=ExecutionStatus.INITIATED,
        retry_count=0
    )
    db.add(debit)
    db.commit()
    db.refresh(debit)
    
    return {
        "status": "SUCCESS",
        "message": f"Mock schedule created for debit date: {target_date.isoformat()}",
        "data": {
            "mandate_id": str(mandate.id),
            "umn": mandate.umn,
            "notification_id": str(notification.id),
            "debit_execution_id": str(debit.id),
            "expected_debit_date": target_date.isoformat()
        }
    }


# =====================================================================
# TESTING HELPER: Trigger Notification Task Manual Run
# =====================================================================
@router.post("/api/mandates/trigger-notifications")
async def manual_trigger_notifications(db: Session = Depends(get_db)):
    """Runs the T-1 Pre-Debit Notification task manually."""
    results = await trigger_daily_pre_debit_notifications(db)
    return {
        "status": "SUCCESS",
        "processed_notifications": results
    }


# =====================================================================
# TESTING HELPER: Trigger Debit Task Manual Run
# =====================================================================
@router.post("/api/mandates/trigger-debits")
async def manual_trigger_debits(db: Session = Depends(get_db)):
    """Runs the Debit execution task manually. Bypasses the 24h safety gap check for dev."""
    results = await execute_daily_debits(db, bypass_24h_check=True)
    return {
        "status": "SUCCESS",
        "processed_debits": results
    }


# =====================================================================
# TESTING HELPER: Simulate Mandate Revocation
# =====================================================================
@router.post("/api/mandates/simulate-revocation/{setu_mandate_id}")
async def simulate_revocation_gateway(
    setu_mandate_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Calls the mock-setu simulator container to trigger a mandate revocation event,
    which will sign and post the revocation webhook back to the backend.
    """
    mandate = db.query(UPIMandate).filter(UPIMandate.setu_mandate_id == setu_mandate_id).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="Mandate record not found in backend DB")
        
    loan = db.query(Loan).filter(Loan.id == mandate.loan_id).first()
    if not loan or loan.mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot revoke AutoPay mandate for another user's loan")
        
    try:
        headers = await get_setu_headers()
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to get Setu auth headers")
        
    async with httpx.AsyncClient() as client:
        url = f"{settings.SETU_API_BASE_URL.rstrip('/')}/v1/mandates/{setu_mandate_id}/simulate-revoke"
        response = await client.post(url, headers=headers, timeout=10.0)
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Mock Setu simulation call failed: {response.text}"
            )
            
        return response.json()


# =====================================================================
# ENDPOINT: Get Mandate Status (For Frontend Polling)
# =====================================================================
@router.get("/api/mandates/{setu_mandate_id}/status")
def get_mandate_status(
    setu_mandate_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves current mandate status and UMN details for frontend checkouts."""
    mandate = db.query(UPIMandate).filter(UPIMandate.setu_mandate_id == setu_mandate_id).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="Mandate record not found")
        
    loan = db.query(Loan).filter(Loan.id == mandate.loan_id).first()
    if not loan or loan.mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot view mandate status for another user's loan")
        
    return {
        "status": mandate.status.value,
        "umn": mandate.umn,
        "customer_vpa": mandate.customer_vpa,
        "max_amount_paise": mandate.max_amount_paise,
        "loan_id": str(mandate.loan_id)
    }


# =====================================================================
# ENDPOINT: List Mandates (For Autopay Dashboard)
# =====================================================================
@router.get("/api/mandates/list")
def list_mandates(
    mobile: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lists all UPI mandates linked to loan accounts for a given mobile number."""
    if mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot list AutoPay mandates for another user's mobile number")
        
    from app.models.models import Loan
    mandates = db.query(UPIMandate).join(Loan, UPIMandate.loan_id == Loan.id).filter(Loan.mobile == mobile).order_by(UPIMandate.created_at.desc()).all()
    
    result = []
    for m in mandates:
        loan = db.query(Loan).filter(Loan.id == m.loan_id).first()
        result.append({
            "id": str(m.id),
            "setu_mandate_id": m.setu_mandate_id,
            "umn": m.umn,
            "status": m.status.value,
            "max_amount_paise": m.max_amount_paise,
            "customer_vpa": m.customer_vpa,
            "created_at": m.created_at.isoformat(),
            "loan_account_number": loan.loan_account_number if loan else "N/A",
            "biller_name": loan.biller_name if loan else "N/A"
        })
    return result


# =====================================================================
# ENDPOINT: List Eligible Loans for Mandate Creation
# =====================================================================
@router.get("/api/mandates/eligible-loans")
def list_eligible_loans(
    mobile: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves all loans for a mobile number that can be linked to a mandate."""
    if mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot list eligible loans for another user's mobile number")
        
    from app.models.models import Loan
    loans = db.query(Loan).filter(Loan.mobile == mobile).all()
    return [
        {
            "id": str(l.id),
            "loan_account_number": l.loan_account_number,
            "biller_name": l.biller_name,
            "biller_id": l.biller_id,
            "customer_name": l.customer_name,
            "total_outstanding": l.total_outstanding,
            "status": l.status,
            "category": l.category
        }
        for l in loans
    ]


# =====================================================================
# ENDPOINT: List Debit Executions for a Mandate (Audit Log)
# =====================================================================
@router.get("/api/mandates/{setu_mandate_id}/debits")
def list_mandate_debits(
    setu_mandate_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves all automatic payment executions attempted under a mandate."""
    from app.models.models import DebitExecution
    mandate = db.query(UPIMandate).filter(UPIMandate.setu_mandate_id == setu_mandate_id).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="Mandate record not found")
        
    loan = db.query(Loan).filter(Loan.id == mandate.loan_id).first()
    if not loan or loan.mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot access debit logs for another user's mandate")
        
    debits = db.query(DebitExecution).filter(DebitExecution.mandate_id == mandate.id).order_by(DebitExecution.created_at.desc()).all()
    return [
        {
            "id": str(d.id),
            "setu_debit_id": d.setu_debit_id,
            "amount_paise": d.amount_paise,
            "status": d.status.value,
            "error_code": d.error_code,
            "error_message": d.error_message,
            "scheduled_at": d.scheduled_at.isoformat() if d.scheduled_at else None,
            "executed_at": d.executed_at.isoformat() if d.executed_at else None
        }
        for d in debits
    ]
