import datetime
import logging
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid
from uuid import UUID
from typing import List, Any
import httpx
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_setu_headers, get_current_user
from app.crud import crud
from app.schemas import schemas
from app.models.models import User, Loan, CustomerFetchSession, Transaction

router = APIRouter()
logger = logging.getLogger("portal-router")

@router.get("/billers", response_model=List[schemas.BillerDB] if False else Any)
async def get_billers(db: Session = Depends(get_db)):
    # Check if we have billers in DB cache
    db_billers = crud.get_billers(db)
    if db_billers:
        logger.info("Serving billers from database cache")
        return [
            {
                "id": b.id,
                "name": b.name,
                "category_name": b.category_name,
                "customer_params": b.customer_params
            }
            for b in db_billers
        ]

    # Fetch from Setu if cache is empty
    url = f"{settings.SETU_API_BASE_URL.rstrip('/')}/api/v2/bbps/billers?categoryName=loan-repayment"
    logger.info(f"DB Cache empty. Fetching billers from Setu: {url}")
    
    headers = await get_setu_headers()
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers, timeout=10.0)
            logger.info(f"Setu Billers Response Status: {response.status_code}")
            
            if response.status_code != 200:
                logger.error(f"Failed to fetch billers from Setu: {response.text}")
                raise HTTPException(status_code=500, detail="Failed to fetch billers from bill utility")
                
            data = response.json()
            if not data.get("success"):
                logger.error(f"Setu response returned success=False: {data}")
                raise HTTPException(status_code=500, detail="Biller fetch returned unsuccessful response")
                
            billers_list = data["data"]["billers"]
            
            # Cache them in DB
            cached_billers = []
            for b in billers_list:
                db_b = crud.create_biller(
                    db=db,
                    id=b["id"],
                    name=b["name"],
                    category_name=b["categoryName"],
                    customer_params=b["customerParams"]
                )
                cached_billers.append({
                    "id": db_b.id,
                    "name": db_b.name,
                    "category_name": db_b.category_name,
                    "customer_params": db_b.customer_params
                })
            
            return cached_billers
        except Exception as e:
            logger.error(f"Exception fetching billers: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Biller fetch exception: {str(e)}")

@router.post("/fetch/initiate", response_model=schemas.FetchInitiateResponse)
async def initiate_fetch(
    payload: schemas.FetchInitiateRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if payload.mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot fetch bill for another user's mobile number")
    # Retrieve biller
    biller = crud.get_biller(db, payload.billerId)
    if not biller:
        raise HTTPException(status_code=404, detail="Biller not found in cached records")
        
    # Setu Fetch Request API call
    url = f"{settings.SETU_API_BASE_URL.rstrip('/')}/api/v2/bbps/bills/fetch/request"
    
    # Structure parameters according to Setu specification
    customer_params_list = [{"name": k, "value": v} for k, v in payload.customerParams.items()]
    
    body = {
        "agent": {
            "id": "AX01AI06512391457204",  # Mock agent ID from specification
            "channel": "INT"
        },
        "biller": {
            "id": payload.billerId
        },
        "customer": {
            "mobile": payload.mobile,
            "customerParams": customer_params_list
        }
    }
    
    headers = await get_setu_headers()
    
    logger.info(f"Setu Fetch Request initiated: {url}")
    logger.debug(f"Payload: {body}")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=body, headers=headers, timeout=10.0)
            logger.info(f"Setu Fetch Response: Status {response.status_code}")
            
            if response.status_code != 200:
                logger.error(f"Setu Fetch Request failed: {response.text}")
                raise HTTPException(status_code=response.status_code, detail=f"Setu fetch failed: {response.text}")
                
            data = response.json()
            if not data.get("success"):
                logger.error(f"Setu Fetch Request success=False: {data}")
                raise HTTPException(status_code=400, detail="Setu fetch request failed")
                
            ref_id = data["data"]["refId"]
            
            # Create session in DB
            session = crud.create_fetch_session(
                db=db,
                biller_id=payload.billerId,
                fetch_ref_id=ref_id,
                customer_params=payload.customerParams
            )
            
            return {
                "fetchSessionId": session.id,
                "refId": ref_id
            }
        except Exception as e:
            logger.error(f"Exception during Setu Fetch Initiate: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

@router.get("/fetch/poll/{fetch_session_id}", response_model=schemas.FetchStatusResponse)
async def poll_fetch(
    fetch_session_id: UUID, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = crud.get_fetch_session(db, fetch_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Fetch session not found")

    # Security check: verify this session belongs to the user
    loan_acc = session.customer_params.get("Loan Account Number")
    mobile_param = session.customer_params.get("Mobile Number")
    
    is_authorized = False
    if mobile_param == current_user.mobile:
        is_authorized = True
    elif loan_acc:
        db_loan = crud.get_loan_by_account_number(db, loan_acc)
        if db_loan and db_loan.mobile == current_user.mobile:
            is_authorized = True
            
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Not authorized to poll this fetch session")

    # Intercept settled loans
    loan_acc = session.customer_params.get("Loan Account Number")
    if loan_acc:
        db_loan = crud.get_loan_by_account_number(db, loan_acc)
        if db_loan and db_loan.status == "SETTLED":
            logger.info(f"Loan account {loan_acc} is settled. Blocking fetch poll.")
            return {
                "status": "FAILURE",
                "error": "No active bills found. This loan account has been fully settled and closed."
            }
        
    # If already terminal state, return directly
    if session.status in ["SUCCESS", "FAILURE"]:
        bills = []
        if session.bills_data:
            bills = session.bills_data
        customer_name = None
        if bills:
            customer_name = bills[0].get("customerName")
            
        mandate_data = None
        loan_id_val = None
        if loan_acc:
            db_loan = crud.get_loan_by_account_number(db, loan_acc)
            if db_loan:
                loan_id_val = db_loan.id
                from app.models.models import UPIMandate
                mandate = db.query(UPIMandate).filter(UPIMandate.loan_id == db_loan.id).order_by(UPIMandate.created_at.desc()).first()
                if mandate:
                    mandate_data = {
                        "id": mandate.id,
                        "setu_mandate_id": mandate.setu_mandate_id,
                        "umn": mandate.umn,
                        "status": mandate.status.value,
                        "max_amount_paise": mandate.max_amount_paise
                    }
        return {
            "status": session.status,
            "customerName": customer_name,
            "bills": bills,
            "mandate": mandate_data,
            "loan_id": loan_id_val
        }
        
    # Poll Setu response API
    url = f"{settings.SETU_API_BASE_URL.rstrip('/')}/api/v2/bbps/bills/fetch/response"
    body = {
        "refId": session.fetch_ref_id
    }
    
    headers = await get_setu_headers()
    logger.info(f"Setu Fetch Poll: {url} for refId: {session.fetch_ref_id}")
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, json=body, headers=headers, timeout=10.0)
            logger.info(f"Setu Fetch Poll Response: Status {response.status_code}")
            
            if response.status_code != 200:
                logger.error(f"Setu Fetch Poll failed: {response.text}")
                crud.update_fetch_session(db, fetch_session_id, "FAILURE")
                return {
                    "status": "FAILURE",
                    "error": "Failed to poll fetch details"
                }
                
            data = response.json()
            if not data.get("success"):
                logger.error(f"Setu Fetch Poll success=False: {data}")
                crud.update_fetch_session(db, fetch_session_id, "FAILURE")
                return {
                    "status": "FAILURE",
                    "error": "Fetch poll request marked unsuccessful"
                }
                
            data_body = data.get("data", {})
            status_str = data_body.get("status")
            
            if status_str == "Processing":
                # Still processing
                return {
                    "status": "PENDING"
                }
            elif status_str == "Success":
                # Success! Retrieve bills list
                bills_list = data_body.get("bills", [])
                
                # Convert amounts, check fields
                cleaned_bills = []
                for b in bills_list:
                    cleaned_bills.append({
                        "amount": b.get("amount"),
                        "billNumber": b.get("billNumber"),
                        "billPeriod": b.get("billPeriod"),
                        "dueDate": b.get("dueDate"),
                        "billDate": b.get("billDate"),
                        "customerName": b.get("customerName")
                    })
                
                # Save to DB
                crud.update_fetch_session(db, fetch_session_id, "SUCCESS", cleaned_bills)
                customer_name = cleaned_bills[0]["customerName"] if cleaned_bills else None
                
                mandate_data = None
                loan_id_val = None
                if loan_acc:
                    db_loan = crud.get_loan_by_account_number(db, loan_acc)
                    if db_loan:
                        loan_id_val = db_loan.id
                        from app.models.models import UPIMandate
                        mandate = db.query(UPIMandate).filter(UPIMandate.loan_id == db_loan.id).order_by(UPIMandate.created_at.desc()).first()
                        if mandate:
                            mandate_data = {
                                "id": mandate.id,
                                "setu_mandate_id": mandate.setu_mandate_id,
                                "umn": mandate.umn,
                                "status": mandate.status.value,
                                "max_amount_paise": mandate.max_amount_paise
                            }
                return {
                    "status": "SUCCESS",
                    "customerName": customer_name,
                    "bills": cleaned_bills,
                    "mandate": mandate_data,
                    "loan_id": loan_id_val
                }
            else:
                # Failure state
                error_msg = data_body.get("error", {}).get("message", "Customer or bill details not found.")
                crud.update_fetch_session(db, fetch_session_id, "FAILURE")
                return {
                    "status": "FAILURE",
                    "error": error_msg
                }
                
        except Exception as e:
            logger.error(f"Exception during Fetch Poll: {str(e)}")
            return {
                "status": "FAILURE",
                "error": str(e)
            }

@router.post("/payment/initiate", response_model=schemas.PaymentInitiateResponse)
async def initiate_payment(
    payload: schemas.PaymentInitiateRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    session = crud.get_fetch_session(db, payload.fetchSessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Fetch session not found")
        
    # Security check: verify the fetch session belongs to the user
    loan_acc = session.customer_params.get("Loan Account Number")
    mobile_param = session.customer_params.get("Mobile Number")
    
    is_authorized = False
    if mobile_param == current_user.mobile:
        is_authorized = True
    elif loan_acc:
        db_loan = crud.get_loan_by_account_number(db, loan_acc)
        if db_loan and db_loan.mobile == current_user.mobile:
            is_authorized = True
            
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Not authorized to initiate payment for this session")
        
    # Create PENDING transaction
    txn = crud.create_transaction(
        db=db,
        fetch_session_id=payload.fetchSessionId,
        amount=payload.amount,
        payment_gateway=payload.paymentGateway,
        customer_name=payload.customerName,
        bill_number=payload.billNumber
    )
    
    return {
        "transactionId": txn.id,
        "status": "PENDING"
    }

@router.post("/payment/simulate/{txn_id}", response_model=schemas.PaymentSimulateResponse)
async def simulate_payment(
    txn_id: UUID, 
    payload: schemas.PaymentSimulateRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    txn = crud.get_transaction(db, txn_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
    session = crud.get_fetch_session(db, txn.fetch_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Fetch session for transaction not found")
        
    loan_acc = session.customer_params.get("Loan Account Number")
    mobile_param = session.customer_params.get("Mobile Number")
    
    is_authorized = False
    if mobile_param == current_user.mobile:
        is_authorized = True
    elif loan_acc:
        db_loan = crud.get_loan_by_account_number(db, loan_acc)
        if db_loan and db_loan.mobile == current_user.mobile:
            is_authorized = True
            
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Not authorized to simulate payment for this transaction")
        
    if txn.status != "PENDING":
        return {
            "transactionId": txn.id,
            "status": txn.status,
            "paymentRefId": txn.payment_ref_id
        }
        
    if not payload.confirm:
        # Simulated cancel/failure from checkout page
        logger.info(f"Payment simulation CANCELLED/FAILED by user for transaction {txn_id}")
        crud.update_transaction(db, txn_id, "FAILED", completed_at=datetime.datetime.utcnow())
        return {
            "transactionId": txn.id,
            "status": "FAILED",
            "errorMessage": "Simulated payment cancellation / failure."
        }
        
    # Get associated session
    session = crud.get_fetch_session(db, txn.fetch_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Fetch session for transaction not found")
        
    # 1. Trigger Payment Request to Setu
    url_req = f"{settings.SETU_API_BASE_URL.rstrip('/')}/api/v2/bbps/bills/payment/request"
    
    # Map payment gateway to Setu payment mode enum values
    # Options: Internet Banking, Debit Card, Credit Card, Prepaid Card, IMPS, Cash, UPI, Wallet, NEFT, etc.
    pay_mode = "UPI" if txn.payment_gateway in ["GPay", "PhonePe"] else "Internet Banking"
    
    body_req = {
        "refId": session.fetch_ref_id,
        "amount": txn.amount,
        "paymentMode": pay_mode
    }
    
    headers = await get_setu_headers()
    logger.info(f"Setu Payment Request: {url_req} for Fetch RefId: {session.fetch_ref_id}")
    
    async with httpx.AsyncClient() as client:
        try:
            response_req = await client.post(url_req, json=body_req, headers=headers, timeout=10.0)
            logger.info(f"Setu Payment Request Response: Status {response_req.status_code}")
            
            if response_req.status_code != 200:
                logger.error(f"Setu Payment Request failed: {response_req.text}")
                crud.update_transaction(db, txn_id, "FAILED", completed_at=datetime.datetime.utcnow())
                return {
                    "transactionId": txn.id,
                    "status": "FAILED",
                    "errorMessage": "Setu payment initialization failed."
                }
                
            data_req = response_req.json()
            if not data_req.get("success"):
                logger.error(f"Setu Payment Request unsuccessful: {data_req}")
                crud.update_transaction(db, txn_id, "FAILED", completed_at=datetime.datetime.utcnow())
                return {
                    "transactionId": txn.id,
                    "status": "FAILED",
                    "errorMessage": "Setu payment request returned unsuccessful status."
                }
                
            payment_ref_id = data_req["data"]["refId"]
            
            # Save temporary payment ref ID
            crud.update_transaction(db, txn_id, "PENDING", payment_ref_id=payment_ref_id)
            
            # 2. Poll Payment Response Status (simulate async check)
            url_poll = f"{settings.SETU_API_BASE_URL.rstrip('/')}/api/v2/bbps/bills/payment/response"
            body_poll = {"refId": payment_ref_id}
            
            max_attempts = 5
            attempt = 0
            settled_status = None
            error_message = None
            
            while attempt < max_attempts:
                attempt += 1
                logger.info(f"Polling Setu Payment Response: {url_poll} (Attempt {attempt}/{max_attempts})")
                
                await asyncio.sleep(1.0)  # Wait between polls
                
                response_poll = await client.post(url_poll, json=body_poll, headers=headers, timeout=10.0)
                logger.info(f"Setu Payment Poll Response: Status {response_poll.status_code}")
                
                if response_poll.status_code != 200:
                    logger.error(f"Setu Payment Poll failed status: {response_poll.text}")
                    error_message = "Failed to fetch payment status"
                    break
                    
                data_poll = response_poll.json()
                if not data_poll.get("success"):
                    logger.error(f"Setu Payment Poll success=False: {data_poll}")
                    error_message = "Payment status request marked unsuccessful"
                    break
                    
                poll_data = data_poll.get("data", {})
                status_str = poll_data.get("status")
                
                if status_str == "Processing":
                    continue
                elif status_str == "Success":
                    settled_status = "SUCCESSFUL"
                    # Capture exact transaction reference returned from Setu if any
                    payment_ref_id = poll_data.get("paymentDetails", {}).get("paymentRefId", payment_ref_id)
                    break
                else:
                    settled_status = "FAILED"
                    error_message = poll_data.get("error", {}).get("message", "Payment settlement failed at core gateway.")
                    break
            
            if settled_status == "SUCCESSFUL":
                logger.info(f"Payment transaction {txn_id} SETTLED SUCCESSFUL")
                crud.update_transaction(db, txn_id, "SUCCESSFUL", payment_ref_id=payment_ref_id, completed_at=datetime.datetime.utcnow())
                return {
                    "transactionId": txn.id,
                    "status": "SUCCESSFUL",
                    "paymentRefId": payment_ref_id
                }
            else:
                logger.info(f"Payment transaction {txn_id} SETTLED FAILED")
                crud.update_transaction(db, txn_id, "FAILED", payment_ref_id=payment_ref_id, completed_at=datetime.datetime.utcnow())
                return {
                    "transactionId": txn.id,
                    "status": "FAILED",
                    "paymentRefId": payment_ref_id,
                    "errorMessage": error_message or "Payment timed out or settlement failed."
                }
                
        except Exception as e:
            logger.error(f"Exception during Payment Simulation: {str(e)}")
            crud.update_transaction(db, txn_id, "FAILED", completed_at=datetime.datetime.utcnow())
            return {
                "transactionId": txn.id,
                "status": "FAILED",
                "errorMessage": f"System error: {str(e)}"
            }

@router.get("/invoice/{txn_id}", response_model=schemas.TransactionInvoiceResponse)
async def get_invoice(
    txn_id: UUID, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    txn = crud.get_transaction(db, txn_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction record not found")
        
    session = crud.get_fetch_session(db, txn.fetch_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Fetch session for transaction not found")
        
    # Security check: verify ownership of the associated transaction
    loan_acc = session.customer_params.get("Loan Account Number")
    mobile_param = session.customer_params.get("Mobile Number")
    
    is_authorized = False
    if mobile_param == current_user.mobile:
        is_authorized = True
    elif loan_acc:
        db_loan = crud.get_loan_by_account_number(db, loan_acc)
        if db_loan and db_loan.mobile == current_user.mobile:
            is_authorized = True
            
    if not is_authorized:
        raise HTTPException(status_code=403, detail="Not authorized to access this invoice")
        
    biller = crud.get_biller(db, session.biller_id)
    biller_name = biller.name if biller else "Unknown Biller"
    biller_id = biller.id if biller else "Unknown"
    
    return {
        "transactionId": txn.id,
        "paymentRefId": txn.payment_ref_id,
        "amount": txn.amount,
        "paymentGateway": txn.payment_gateway,
        "status": txn.status,
        "createdAt": txn.created_at,
        "completedAt": txn.completed_at,
        "customerName": txn.customer_name,
        "billNumber": txn.bill_number,
        "billerName": biller_name,
        "billerId": biller_id
    }


# Account Aggregator and Settlement Routes
@router.post("/settlement/consent/request")
async def request_consent(
    payload: schemas.ConsentRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if payload.mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot request consent for another user's mobile number")
        
    consent_id = "CNS-" + str(uuid.uuid4().hex[:12]).upper()
    return {
        "consentId": consent_id,
        "status": "AWAITING_APPROVAL",
        "redirectUrl": f"https://mock-aa.setu.co/consent/{consent_id}"
    }

@router.post("/settlement/consent/approve")
async def approve_consent(
    payload: schemas.ConsentApproveRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if payload.mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot approve consent for another user's mobile number")
        
    if not payload.otp or len(payload.otp) != 6:
        raise HTTPException(status_code=400, detail="Invalid OTP code format.")
    
    # Accept any 6-digit OTP for the mock
    logger.info(f"Consent approved via OTP {payload.otp} for mobile {payload.mobile}")
    
    consent_id = "CNS-" + str(uuid.uuid4().hex[:12]).upper()
    crud.create_user_consent(
        db=db,
        mobile=payload.mobile,
        consent_id=consent_id,
        fi_types=["LOAN", "CREDIT_CARD"]
    )
    return {
        "success": True,
        "consentId": consent_id,
        "message": "Consent granted indefinitely for LOAN and CREDIT_CARD data types."
    }

@router.get("/settlement/loans")
async def get_settlement_loans(
    mobile: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot view active credit files for another user's mobile number")
        
    # Check if consent exists and is active
    consent = crud.get_user_consent(db, mobile)
    if not consent:
        raise HTTPException(status_code=403, detail="No active Account Aggregator consent found. Please grant consent first.")
        
    from app.models.models import UPIMandate, MandateStatus

    loans = crud.get_user_loans(db, mobile)
    result = []
    for l in loans:
        # Check if there is an active/initiated settlement mandate for this loan
        mandate = db.query(UPIMandate).filter(
            UPIMandate.loan_id == l.id,
            UPIMandate.reference_id.like("SETTLE_MND_%"),
            UPIMandate.status.in_([MandateStatus.ACTIVE, MandateStatus.INITIATED])
        ).order_by(UPIMandate.created_at.desc()).first()
        
        has_settlement_mandate = mandate is not None
        settlement_mandate_id = mandate.setu_mandate_id if mandate else None
        settlement_mandate_status = mandate.status.value if mandate else None
        
        result.append({
            "id": l.id,
            "mobile": l.mobile,
            "billerId": l.biller_id,
            "billerName": l.biller_name,
            "loanAccountNumber": l.loan_account_number,
            "customerName": l.customer_name,
            "type": l.type,
            "category": l.category,
            "totalOutstanding": l.total_outstanding,
            "principalOutstanding": l.principal_outstanding,
            "interestOutstanding": l.interest_outstanding,
            "interestRate": l.interest_rate,
            "remainingTenureMonths": l.remaining_tenure_months,
            "dpd": l.dpd,
            "status": l.status,
            "settledAt": l.settled_at,
            "settledAmount": l.settled_amount,
            "hasActiveSettlementMandate": has_settlement_mandate,
            "settlementMandateId": settlement_mandate_id,
            "settlementMandateStatus": settlement_mandate_status
        })
    return result

@router.post("/settlement/calculate")
async def calculate_settlement(
    payload: schemas.CalculateSettlementRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    loan = crud.get_loan(db, payload.loanId)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan record not found.")
        
    if loan.mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot calculate settlement for another user's loan")
        
    if loan.status == "SETTLED":
        raise HTTPException(status_code=400, detail="Account is already settled.")
        
    # Calculate discount percentages based on DPD
    dpd = loan.dpd
    if dpd < 90:
        raise HTTPException(
            status_code=400,
            detail="Settlement is only offered for critical NPA accounts (overdue >= 90 days)."
        )
        
    if dpd >= 90:
        principal_discount_pct = 0.50
        interest_discount_pct = 0.80
        category = "NPA (Non-Performing Asset - Critical)"
    elif dpd >= 60:
        principal_discount_pct = 0.30
        interest_discount_pct = 0.60
        category = "Substandard (Pre-NPA)"
    elif dpd >= 30:
        principal_discount_pct = 0.15
        interest_discount_pct = 0.40
        category = "SMA-1 (Special Mention Account)"
    else:  # dpd == 0 or SMA-0
        principal_discount_pct = 0.00
        interest_discount_pct = 0.05  # Prepayment waiver
        category = "Standard (Healthy Account)"
        
    principal_discount = int(loan.principal_outstanding * principal_discount_pct)
    interest_discount = int(loan.interest_outstanding * interest_discount_pct)
    total_discount = principal_discount + interest_discount
    settlement_amount = max(0, loan.total_outstanding - total_discount)
    
    return {
        "loanId": loan.id,
        "loanAccountNumber": loan.loan_account_number,
        "billerName": loan.biller_name,
        "billerId": loan.biller_id,
        "customerName": loan.customer_name,
        "type": loan.type,
        "category": category,
        "dpd": dpd,
        "totalOutstanding": loan.total_outstanding,
        "principalOutstanding": loan.principal_outstanding,
        "interestOutstanding": loan.interest_outstanding,
        "principalDiscountPct": principal_discount_pct * 100,
        "interestDiscountPct": interest_discount_pct * 100,
        "principalDiscount": principal_discount,
        "interestDiscount": interest_discount,
        "totalDiscount": total_discount,
        "settlementAmount": settlement_amount
    }

@router.post("/settlement/pay")
async def pay_settlement(
    payload: schemas.PaySettlementRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    loan = crud.get_loan(db, payload.loanId)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan record not found.")
        
    if loan.mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot pay settlement for another user's loan")
        
    if loan.status == "SETTLED":
        return {
            "success": True,
            "message": "Account has already been settled.",
            "loan": {
                "id": loan.id,
                "loanAccountNumber": loan.loan_account_number,
                "billerName": loan.biller_name,
                "customerName": loan.customer_name,
                "status": loan.status
            }
        }
        
    # Mark loan settled in DB
    settled_loan = crud.settle_loan(db, payload.loanId, payload.amount)
    
    # Generate mock No Due Certificate ID
    ndc_id = "NDC-" + str(uuid.uuid4().hex[:14]).upper()
    
    return {
        "success": True,
        "message": "Loan account fully settled and closed.",
        "ndcId": ndc_id,
        "settledAt": settled_loan.settled_at,
        "settledAmount": settled_loan.settled_amount,
        "loan": {
            "status": loan.status
        }
    }


@router.post("/settlement/mandate/initiate", response_model=schemas.InitiateSettlementMandateResponse)
async def initiate_settlement_mandate(
    payload: schemas.InitiateSettlementMandateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.models.models import UPIMandate, MandateStatus
    
    # 1. Resolve loan account & borrower details
    loan = crud.get_loan(db, payload.loanId)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan account not found")
        
    if loan.mobile != current_user.mobile:
        raise HTTPException(status_code=403, detail="Cannot setup AutoPay for another user's loan")

    if loan.status == "SETTLED":
        raise HTTPException(status_code=400, detail="Account is already settled.")

    # Calculate monthly EMI
    emi_amount_paise = payload.settlementAmount // payload.tenureMonths
    
    reference_id = f"SETTLE_MND_{payload.tenureMonths}_{payload.settlementAmount}_{uuid.uuid4().hex[:12].upper()}"
    
    start_date = datetime.date.today()
    end_date = start_date + datetime.timedelta(days=30 * payload.tenureMonths)
    
    setu_payload = {
        "referenceId": reference_id,
        "customer": {
            "mobile": f"91{loan.mobile}",
            "email": f"borrower_{loan.mobile}@example.com",
            "name": loan.customer_name,
            "vpa": f"borrower_{loan.mobile}@okhdfcbank"
        },
        "mandateDetails": {
            "amount": emi_amount_paise,
            "amountRule": "EXACT",
            "frequency": "MONTHLY",
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
            "loanId": str(loan.id),
            "isSettlement": "true",
            "tenureMonths": str(payload.tenureMonths),
            "settlementAmount": str(payload.settlementAmount)
        }
    }
    
    try:
        headers = await get_setu_headers()
    except Exception as e:
        logger.error(f"Failed to generate Setu headers: {e}")
        raise HTTPException(status_code=500, detail="Could not authorize Setu client API connection")

    # Call Setu Gateway
    async with httpx.AsyncClient() as client:
        url = f"{settings.SETU_API_BASE_URL.rstrip('/')}/v1/mandates"
        try:
            response = await client.post(url, json=setu_payload, headers=headers, timeout=15.0)
            resp_json = response.json()
        except Exception as e:
            logger.error(f"Network error calling Setu Mandate endpoint: {e}")
            raise HTTPException(status_code=502, detail="Gateway timeout calling Setu API")
            
        if response.status_code != 200 or not resp_json.get("success"):
            logger.error(f"Setu Mandate initiation returned error: {resp_json}")
            raise HTTPException(
                status_code=400,
                detail=resp_json.get("error", {}).get("message", "Setu registration failure")
            )
            
        data = resp_json["data"]
        setu_mandate_id = data["id"]
        intent_url = data["intentUrl"]
        
        # Save mandate record in DB
        db_mandate = UPIMandate(
            loan_id=loan.id,
            customer_id=loan.id,
            reference_id=reference_id,
            setu_mandate_id=setu_mandate_id,
            max_amount_paise=emi_amount_paise,
            amount_rule="EXACT",
            frequency="MONTHLY",
            start_date=start_date,
            end_date=end_date,
            status=MandateStatus.INITIATED
        )
        db.add(db_mandate)
        db.commit()
        db.refresh(db_mandate)
        
        return {
            "mandateId": db_mandate.id,
            "setuMandateId": setu_mandate_id,
            "status": db_mandate.status.value,
            "intentUrl": intent_url,
            "referenceId": reference_id
        }


# Financial Intelligence Simulator Schemas

class SimulatedAction(BaseModel):
    actionType: str
    monetaryValue: int
    targetAccountType: str

class IntelligenceRequest(BaseModel):
    firstName: str
    lastName: str
    mobileNumber: str
    pan: str
    consentFlag: bool
    consentTimestamp: int
    simulatedAction: SimulatedAction


@router.post("/intelligence/simulate")
async def simulate_credit_score(payload: IntelligenceRequest, db: Session = Depends(get_db)):
    # 1. Input Validation & Consent Audit
    if not payload.consentFlag:
        raise HTTPException(status_code=403, detail="Consent flag must be explicitly set to true.")
        
    if not payload.mobileNumber or len(payload.mobileNumber) != 10 or not payload.mobileNumber.isdigit():
        raise HTTPException(status_code=400, detail="Invalid 10-digit Indian mobile format.")
        
    pan_upper = payload.pan.upper()
    if not pan_upper or len(pan_upper) != 10 or not pan_upper[:5].isalpha() or not pan_upper[5:9].isdigit() or not pan_upper[9].isalpha():
        raise HTTPException(status_code=400, detail="Invalid 10-character PAN format.")

    # 2. Check Database for Existing User and Stored Credit Details
    user = db.query(User).filter(User.mobile == payload.mobileNumber).first()
    
    # Register/persist user if they don't exist yet
    if not user:
        user = User(
            first_name=payload.firstName,
            last_name=payload.lastName,
            dob=datetime.date(1990, 1, 1), # placeholder dob
            mobile=payload.mobileNumber,
            pan=pan_upper,
            tc_accepted=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # 3. Decentro Bureau Handshake & Parsing (if score not cached yet)
    if user.credit_score is None:
        logger.info(f"Credit score not cached for user {user.mobile}. Executing Decentro API handshake...")
        decentro_txn_id = "DEC_TXN_" + str(uuid.uuid4().hex[:12]).upper()
        
        # Mock nested Decentro credit bureau response
        mock_decentro_response = {
            "cIRReportDataLst": [
                {
                    "scoreDetails": {
                        "value": "715"
                    },
                    "numberOfOpenTrades": 3,
                    "tradeLines": [
                        {
                            "currentBalance": 45000,
                            "totalLimit": 60000,
                            "accountType": "CREDIT_CARD",
                            "paymentHistory": "000/000"
                        },
                        {
                            "currentBalance": 0,
                            "totalLimit": 0,
                            "accountType": "PERSONAL_LOAN",
                            "paymentHistory": "000/000"
                        }
                    ]
                }
            ]
        }
        
        cir_list = mock_decentro_response.get("cIRReportDataLst", [])
        if not cir_list:
            raise HTTPException(status_code=500, detail="Failed to parse bureau response from Decentro.")
            
        report = cir_list[0]
        current_score = int(report.get("scoreDetails", {}).get("value", 715))
        total_active_accounts = int(report.get("numberOfOpenTrades", 3))
        
        total_balance = 0
        total_limit = 0
        payment_history_clean = True
        
        for trade in report.get("tradeLines", []):
            total_balance += trade.get("currentBalance", 0)
            total_limit += trade.get("totalLimit", 0)
            
        credit_utilization_ratio = int((total_balance / total_limit) * 100) if total_limit > 0 else 0
        
        # Store in DB User record
        user.credit_score = current_score
        user.credit_utilization_ratio = credit_utilization_ratio
        user.total_active_accounts = total_active_accounts
        user.payment_history_clean = payment_history_clean
        db.commit()
        db.refresh(user)
    else:
        # Serve stored details from DB User record
        logger.info(f"Serving credit score from database cache for user {user.mobile}")
        decentro_txn_id = "DEC_DB_CACHE_" + str(user.id.hex[:12]).upper()
        current_score = user.credit_score
        credit_utilization_ratio = user.credit_utilization_ratio
        total_active_accounts = user.total_active_accounts
        payment_history_clean = user.payment_history_clean

    # Calculate balance metrics based on the stored utilization ratio
    total_limit = 60000
    total_balance = int(total_limit * (credit_utilization_ratio / 100))

    # 4. Deterministic Simulation Matrix
    projected_delta = 0
    action_type = payload.simulatedAction.actionType
    monetary_val = payload.simulatedAction.monetaryValue
    target_type = payload.simulatedAction.targetAccountType
    
    educational_insight = "No significant score impact predicted."

    if action_type == "PAY_OFF_LOAN":
        if target_type == "PERSONAL_LOAN":
            projected_delta = 25
            educational_insight = "Foreclosing an unsecured personal loan reduces your aggregate debt burden, improving lender risk perception."
        else:
            projected_delta = 15
            educational_insight = "Paying off your liability decreases credit load, resulting in a positive score delta."
            
        if total_active_accounts == 1:
            projected_delta = -10
            educational_insight = "Closing your only active credit account collapses your active credit mix and history, leading to a minor deduction."
            
    elif action_type == "PAY_DOWN_CREDIT_CARD_BALANCE":
        initial_cur = credit_utilization_ratio
        new_balance = max(0, total_balance - monetary_val)
        new_cur = int((new_balance / total_limit) * 100) if total_limit > 0 else 0
        
        if initial_cur > 70 and new_cur < 30:
            projected_delta = 45
            educational_insight = "Reducing your aggregate credit card utilization below 30% signals low credit dependency to lenders, causing a rapid positive recovery in your score."
        elif new_cur > 50:
            projected_delta = 10
            educational_insight = "Paying down your balance marginally decreases utilization, showing stable repayment progress."
        else:
            projected_delta = 25
            educational_insight = "Substantial credit utilization drop improves credit score parameters."
            
    elif action_type == "MISS_EMI":
        if current_score >= 750:
            projected_delta = -90
            educational_insight = "A missed EMI penalty causes a severe reduction in high-scoring profiles due to high deviation from historical patterns."
        else:
            projected_delta = -55
            educational_insight = "Missing an EMI installment creates a negative entry in trade logs, reducing your overall score."
            
    elif action_type == "HARD_INQUIRY":
        num_inquiries = max(1, monetary_val)
        projected_delta = -8 * num_inquiries
        educational_insight = "Multiple hard inquiries within a short window signal credit-hungry behavior, leading to minor point deductions."
        
    elif action_type == "UPI_MANDATE":
        projected_delta = 20
        educational_insight = "Setting up a UPI AutoPay mandate ensures automated on-time repayments, avoiding late fees and protecting your credit score from missed EMI penalties."

    elif action_type == "SETTLE_NOW":
        projected_delta = 15
        educational_insight = "Settling your credit liability closes the active debt account. While it settles your obligations, keeping a diverse credit mix is recommended."
        if total_active_accounts == 1:
            projected_delta = -10
            educational_insight = "Closing your only active credit line collapses your active credit mix and history, leading to a minor deduction."

    simulated_score = min(900, max(300, current_score + projected_delta))

    return {
        "status": "SUCCESS",
        "timestamp": payload.consentTimestamp,
        "bureau_profile": {
            "reference_id": decentro_txn_id,
            "current_score": current_score,
            "scoring_bureau": "Experian",
            "metrics": {
                "payment_history_clean": payment_history_clean,
                "credit_utilization_ratio_pct": credit_utilization_ratio,
                "total_active_accounts": total_active_accounts
            }
        },
        "simulation_engine": {
            "action_processed": action_type,
            "monetary_value_processed": monetary_val,
            "projected_delta": projected_delta,
            "simulated_score": simulated_score,
            "educational_insight": educational_insight
        }
    }


# =====================================================================
# ENDPOINT: List Statements (Manual Repayments, Settlements, Autopay Debits)
# =====================================================================
@router.get("/statements/list")
def list_statements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Aggregates all manual BBPS payments, loan settlements, and AutoPay mandate debits for the user."""
    from app.models.models import Loan, Transaction, UPIMandate, DebitExecution
    
    # 1. Fetch user's loans to get loan account numbers and loan IDs
    user_loans = db.query(Loan).filter(Loan.mobile == current_user.mobile).all()
    loan_account_numbers = [l.loan_account_number for l in user_loans]
    loan_ids = [l.id for l in user_loans]
    
    statements = []
    
    # 2. Add manual BBPS transactions
    if loan_account_numbers:
        txns = db.query(Transaction).all()
        for t in txns:
            session = db.query(CustomerFetchSession).filter(CustomerFetchSession.id == t.fetch_session_id).first()
            if session:
                loan_acc = session.customer_params.get("Loan Account Number")
                if loan_acc and loan_acc in loan_account_numbers:
                    matched_loan = next((l for l in user_loans if l.loan_account_number == loan_acc), None)
                    loan_cat = matched_loan.category if matched_loan else "Personal Loan"
                    statements.append({
                        "id": str(t.id),
                        "type": "MANUAL_PAYMENT",
                        "date": (t.completed_at or t.created_at).isoformat(),
                        "amount": t.amount,
                        "status": "SUCCESS" if t.status == "SUCCESSFUL" else ("FAILED" if t.status == "FAILED" else "PENDING"),
                        "description": f"Manual {loan_cat} Repayment",
                        "loanAccountNumber": loan_acc,
                        "details": {
                            "paymentGateway": t.payment_gateway,
                            "paymentRefId": t.payment_ref_id or "N/A"
                        }
                    })
            
    # 3. Add settled loans
    settled_loans = [l for l in user_loans if l.status == "SETTLED"]
    for sl in settled_loans:
        statements.append({
            "id": str(sl.id),
            "type": "SETTLEMENT",
            "date": (sl.settled_at or sl.created_at).isoformat(),
            "amount": sl.settled_amount or 0,
            "status": "SUCCESS",
            "description": f"{sl.category} Settlement Closure",
            "loanAccountNumber": sl.loan_account_number,
            "details": {
                "billerName": sl.biller_name,
                "principalOutstanding": sl.principal_outstanding,
                "interestOutstanding": sl.interest_outstanding
            }
        })
        
    # 4. Add UPI AutoPay debit executions
    if loan_ids:
        debits = db.query(DebitExecution).join(UPIMandate, DebitExecution.mandate_id == UPIMandate.id).filter(UPIMandate.loan_id.in_(loan_ids)).all()
        for d in debits:
            mandate = db.query(UPIMandate).filter(UPIMandate.id == d.mandate_id).first()
            loan = db.query(Loan).filter(Loan.id == mandate.loan_id).first() if mandate else None
            loan_cat = loan.category if loan else "Personal Loan"
            statements.append({
                "id": str(d.id),
                "type": "AUTOPAY_DEBIT",
                "date": (d.executed_at or d.created_at).isoformat(),
                "amount": int(d.debited_amount_paise or d.amount_paise),
                "status": "SUCCESS" if d.status.value == "SUCCESS" else ("FAILED" if d.status.value == "FAILED" else "PENDING"),
                "description": f"AutoPay {loan_cat} Collection",
                "loanAccountNumber": loan.loan_account_number if loan else "N/A",
                "details": {
                    "setuDebitId": d.setu_debit_id or "N/A",
                    "umn": mandate.umn if mandate else "N/A",
                    "vpa": mandate.customer_vpa if mandate else "N/A"
                }
            })
            
    # Sort statements by date descending
    statements.sort(key=lambda x: x["date"], reverse=True)
    return statements
