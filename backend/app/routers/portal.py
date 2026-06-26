import datetime
import logging
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid
from uuid import UUID
from typing import List, Any
import httpx

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_setu_headers
from app.crud import crud
from app.schemas import schemas

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
async def initiate_fetch(payload: schemas.FetchInitiateRequest, db: Session = Depends(get_db)):
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
async def poll_fetch(fetch_session_id: UUID, db: Session = Depends(get_db)):
    session = crud.get_fetch_session(db, fetch_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Fetch session not found")

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
        return {
            "status": session.status,
            "customerName": customer_name,
            "bills": bills
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
                
                return {
                    "status": "SUCCESS",
                    "customerName": customer_name,
                    "bills": cleaned_bills
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
async def initiate_payment(payload: schemas.PaymentInitiateRequest, db: Session = Depends(get_db)):
    session = crud.get_fetch_session(db, payload.fetchSessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Fetch session not found")
        
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
async def simulate_payment(txn_id: UUID, payload: schemas.PaymentSimulateRequest, db: Session = Depends(get_db)):
    txn = crud.get_transaction(db, txn_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
        
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
async def get_invoice(txn_id: UUID, db: Session = Depends(get_db)):
    txn = crud.get_transaction(db, txn_id)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction record not found")
        
    session = crud.get_fetch_session(db, txn.fetch_session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Fetch session for transaction not found")
        
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
async def request_consent(payload: schemas.ConsentRequest, db: Session = Depends(get_db)):
    consent_id = "CNS-" + str(uuid.uuid4().hex[:12]).upper()
    return {
        "consentId": consent_id,
        "status": "AWAITING_APPROVAL",
        "redirectUrl": f"https://mock-aa.setu.co/consent/{consent_id}"
    }

@router.post("/settlement/consent/approve")
async def approve_consent(payload: schemas.ConsentApproveRequest, db: Session = Depends(get_db)):
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
async def get_settlement_loans(mobile: str, db: Session = Depends(get_db)):
    # Check if consent exists and is active
    consent = crud.get_user_consent(db, mobile)
    if not consent:
        raise HTTPException(status_code=403, detail="No active Account Aggregator consent found. Please grant consent first.")
        
    loans = crud.get_user_loans(db, mobile)
    return [
        {
            "id": l.id,
            "mobile": l.mobile,
            "billerId": l.biller_id,
            "billerName": l.biller_name,
            "loanAccountNumber": l.loan_account_number,
            "customerName": l.customer_name,
            "type": l.type,
            "totalOutstanding": l.total_outstanding,
            "principalOutstanding": l.principal_outstanding,
            "interestOutstanding": l.interest_outstanding,
            "interestRate": l.interest_rate,
            "remainingTenureMonths": l.remaining_tenure_months,
            "dpd": l.dpd,
            "status": l.status,
            "settledAt": l.settled_at,
            "settledAmount": l.settled_amount
        }
        for l in loans
    ]

@router.post("/settlement/calculate")
async def calculate_settlement(payload: schemas.CalculateSettlementRequest, db: Session = Depends(get_db)):
    loan = crud.get_loan(db, payload.loanId)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan record not found.")
        
    if loan.status == "SETTLED":
        raise HTTPException(status_code=400, detail="Account is already settled.")
        
    # Calculate discount percentages based on DPD
    dpd = loan.dpd
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
    settlement_amount = loan.total_outstanding - total_discount
    
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
async def pay_settlement(payload: schemas.PaySettlementRequest, db: Session = Depends(get_db)):
    loan = crud.get_loan(db, payload.loanId)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan record not found.")
        
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
            "id": settled_loan.id,
            "loanAccountNumber": settled_loan.loan_account_number,
            "billerName": settled_loan.biller_name,
            "customerName": settled_loan.customer_name,
            "status": settled_loan.status
        }
    }
