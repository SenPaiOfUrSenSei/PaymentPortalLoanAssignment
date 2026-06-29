import datetime
import uuid
import jwt
import os
import threading
import urllib.request
import hmac
import hashlib
import json
from fastapi import FastAPI, Depends, HTTPException, Header, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from app.mock_data import BILLERS, LOAN_ACCOUNTS

app = FastAPI(title="Setu BBPS v2 Mock Server")

# In-memory storage for simulated async transactions
# Structure: { ref_id: { status, poll_count, biller_id, customer_name, bills } }
fetch_sessions: Dict[str, Dict[str, Any]] = {}
# Structure: { payment_ref_id: { status, poll_count, fetch_ref_id, amount, mode } }
payment_sessions: Dict[str, Dict[str, Any]] = {}

JWT_SECRET = "super_mock_secret_key"
JWT_ALGORITHM = "HS256"

security = HTTPBearer()

# Pydantic Schemas for validation
class AuthRequest(BaseModel):
    clientID: str
    secret: str

class AgentDetails(BaseModel):
    id: str
    channel: str

class BillerDetails(BaseModel):
    id: str

class CustomerParamValue(BaseModel):
    name: str
    value: str

class CustomerDetails(BaseModel):
    mobile: str
    customerParams: List[CustomerParamValue]

class FetchBillRequest(BaseModel):
    agent: AgentDetails
    biller: BillerDetails
    customer: CustomerDetails

class FetchResponseRequest(BaseModel):
    refId: str

class PaymentDetails(BaseModel):
    amount: int
    mode: str
    paymentRefId: str
    timestamp: str

class BillPaymentRequest(BaseModel):
    refId: str  # Fetch Ref ID
    amount: int
    paymentMode: str

class PaymentResponseRequest(BaseModel):
    refId: str  # Payment Ref ID

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token or expired token")

@app.post("/api/v2/auth/token")
def get_token(body: AuthRequest):
    # Standard Mock credential check
    if body.clientID != "mock_client_id" or body.secret != "mock_client_secret":
        raise HTTPException(status_code=401, detail="Invalid clientID or secret")
    
    expires_in = 3600
    expire_time = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
    token = jwt.encode(
        {"sub": body.clientID, "exp": expire_time},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )
    
    return {
        "success": True,
        "token": token,
        "expiresIn": expires_in,
        "traceId": "TR-" + str(uuid.uuid4().hex[:12]).upper()
    }

@app.get("/api/v2/bbps/billers")
def get_billers(categoryName: str = Query(...), token_payload: dict = Depends(verify_token)):
    if categoryName != "loan-repayment":
        return {
            "success": True,
            "data": {"billers": []},
            "traceId": "TR-" + str(uuid.uuid4().hex[:12]).upper()
        }
    
    return {
        "success": True,
        "data": {
            "billers": BILLERS
        },
        "traceId": "TR-" + str(uuid.uuid4().hex[:12]).upper()
    }

@app.post("/api/v2/bbps/bills/fetch/request")
def initiate_fetch(body: FetchBillRequest, token_payload: dict = Depends(verify_token)):
    biller_id = body.biller.id
    customer_params = {p.name: p.value for p in body.customer.customerParams}
    customer_mobile = body.customer.mobile
    
    # Try to find a matching loan account
    matched_account = None
    for acc in LOAN_ACCOUNTS:
        if acc["biller_id"] != biller_id:
            continue
        
        # Check params (like Loan Account Number, and we should check if Mobile is matched or in params)
        # Biller params could include Loan Account Number and Mobile Number
        param_match = True
        for p_name, p_val in acc["params"].items():
            val = customer_params.get(p_name)
            if val is None and p_name == "Mobile Number":
                val = customer_mobile
            if val != p_val:
                param_match = False
                break
            
        if param_match:
            matched_account = acc
            break
            
    # Generate unique refId
    ref_id = "FETCH-" + str(uuid.uuid4().hex[:16]).upper()
    
    # Store session state
    if matched_account:
        fetch_sessions[ref_id] = {
            "status": "Processing",
            "poll_count": 0,
            "biller_id": biller_id,
            "customer_name": matched_account["customer_name"],
            "bills": matched_account["bills"]
        }
    else:
        fetch_sessions[ref_id] = {
            "status": "Processing",
            "poll_count": 0,
            "biller_id": biller_id,
            "customer_name": None,
            "bills": None
        }
        
    return {
        "success": True,
        "data": {
            "refId": ref_id
        },
        "traceId": "TR-" + str(uuid.uuid4().hex[:12]).upper()
    }

@app.post("/api/v2/bbps/bills/fetch/response")
def poll_fetch(body: FetchResponseRequest, token_payload: dict = Depends(verify_token)):
    ref_id = body.refId
    if ref_id not in fetch_sessions:
        raise HTTPException(status_code=404, detail="Invalid fetch session refId")
        
    session = fetch_sessions[ref_id]
    session["poll_count"] += 1
    
    trace_id = "TR-" + str(uuid.uuid4().hex[:12]).upper()
    
    # First poll returns "Processing" status to mimic async API
    if session["poll_count"] == 1:
        return {
            "success": True,
            "traceId": trace_id,
            "data": {
                "refId": ref_id,
                "status": "Processing",
                "billerResponseType": "SINGLE",
                "exactness": "Exact"
            }
        }
    
    # Second+ poll returns Success or Failure depending on matched loan
    if session["bills"]:
        # Match! Return Success with outstanding bills
        bills_with_customer = []
        for bill in session["bills"]:
            b = bill.copy()
            b["customerName"] = session["customer_name"]
            bills_with_customer.append(b)
            
        return {
            "success": True,
            "traceId": trace_id,
            "data": {
                "refId": ref_id,
                "status": "Success",
                "billerSelectionType": "SINGLE",
                "billerResponseType": "SINGLE",
                "exactness": "Exact",
                "bills": bills_with_customer
            }
        }
    else:
        # Failure! Customer/Bill not found
        return {
            "success": True,
            "traceId": trace_id,
            "data": {
                "refId": ref_id,
                "status": "Failure",
                "error": {
                    "code": "customer-not-found",
                    "message": "No active loan found for the provided details."
                }
            }
        }

@app.post("/api/v2/bbps/bills/payment/request")
def initiate_payment(body: BillPaymentRequest, token_payload: dict = Depends(verify_token)):
    # Make sure we have a session associated with this fetch refId
    fetch_ref_id = body.refId
    if fetch_ref_id not in fetch_sessions:
        raise HTTPException(status_code=400, detail="Invalid fetch refId for payment")
    
    # Generate unique payment refId
    pay_ref_id = "PAY-" + str(uuid.uuid4().hex[:16]).upper()
    
    # Store payment session details
    payment_sessions[pay_ref_id] = {
        "status": "Processing",
        "poll_count": 0,
        "fetch_ref_id": fetch_ref_id,
        "amount": body.amount,
        "mode": body.paymentMode
    }
    
    return {
        "success": True,
        "data": {
            "refId": pay_ref_id
        },
        "traceId": "TR-" + str(uuid.uuid4().hex[:12]).upper()
    }

@app.post("/api/v2/bbps/bills/payment/response")
def poll_payment(body: PaymentResponseRequest, token_payload: dict = Depends(verify_token)):
    pay_ref_id = body.refId
    if pay_ref_id not in payment_sessions:
        raise HTTPException(status_code=404, detail="Invalid payment session refId")
        
    payment = payment_sessions[pay_ref_id]
    payment["poll_count"] += 1
    
    trace_id = "TR-" + str(uuid.uuid4().hex[:12]).upper()
    fetch_session = fetch_sessions[payment["fetch_ref_id"]]
    
    # First poll returns "Processing" status
    if payment["poll_count"] == 1:
        return {
            "success": True,
            "traceId": trace_id,
            "data": {
                "refId": pay_ref_id,
                "status": "Processing",
                "paymentDetails": {
                    "amount": payment["amount"],
                    "mode": payment["mode"],
                    "paymentRefId": pay_ref_id,
                    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
                }
            }
        }
    
    # Second+ poll returns Success or Failure
    # We will simulate SUCCESS for standard amounts.
    # If amount is <= 0 or some failure trigger amount (e.g. 99999 paise), simulate failure
    if payment["amount"] == 9999900:  # Rs 99,999 is our failure trigger
        payment["status"] = "Failed"
        return {
            "success": True,
            "traceId": trace_id,
            "data": {
                "refId": pay_ref_id,
                "status": "Failure",
                "error": {
                    "code": "insufficient-funds",
                    "message": "Transaction failed at the issuer end."
                }
            }
        }
    
    payment["status"] = "Success"
    return {
        "success": True,
        "traceId": trace_id,
        "data": {
            "status": "Success",
            "transactionId": "TXN" + str(uuid.uuid4().hex[:16]).upper(),
            "billerId": fetch_session["biller_id"],
            "billerRefId": "ZA" + str(uuid.uuid4().hex[:8]).upper(),
            "paymentDetails": {
                "amount": payment["amount"],
                "mode": payment["mode"],
                "paymentRefId": pay_ref_id,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
            },
            "refId": pay_ref_id
        }
    }


# =====================================================================
# UPI Mandate & AutoPay Mock Implementation
# =====================================================================

mandates: Dict[str, Dict[str, Any]] = {}
debits: Dict[str, Dict[str, Any]] = {}

def send_webhook_background(url: str, payload: dict, secret: str):
    def run():
        try:
            body = json.dumps(payload).encode('utf-8')
            signature = hmac.new(
                key=secret.encode("utf-8"),
                msg=body,
                digestmod=hashlib.sha256
            ).hexdigest()
            
            req = urllib.request.Request(
                url,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Setu-Signature": signature
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                response.read()
            print(f"Webhook sent successfully to {url}", flush=True)
        except Exception as e:
            print(f"Failed to send webhook to {url}: {e}", flush=True)

    threading.Thread(target=run).start()

class MandateCustomer(BaseModel):
    mobile: str
    email: Optional[str] = None
    name: str
    vpa: Optional[str] = None

class MandateMerchantDetails(BaseModel):
    name: str
    categoryCode: str

class MandateBillingAccount(BaseModel):
    number: str
    ifsc: str

class MandateDetailsInput(BaseModel):
    amount: int
    amountRule: str
    frequency: str
    startDate: str
    endDate: str
    purposeCode: str
    merchantDetails: Optional[MandateMerchantDetails] = None
    billingAccount: Optional[MandateBillingAccount] = None

class CreateMandateRequest(BaseModel):
    referenceId: str
    customer: MandateCustomer
    mandateDetails: MandateDetailsInput
    redirectUrl: str
    metadata: Optional[Dict[str, Any]] = None

class NotificationRequest(BaseModel):
    amount: int
    debitDate: str
    note: str

class DebitRequest(BaseModel):
    amount: int
    notificationId: str
    referenceId: str
    debitType: str

@app.post("/v1/mandates")
def create_mandate(body: CreateMandateRequest, token_payload: dict = Depends(verify_token)):
    mandate_id = "MND-" + str(uuid.uuid4().hex[:12]).upper()
    mandates[mandate_id] = {
        "status": "INITIATED",
        "reference_id": body.referenceId,
        "customer": body.customer.dict(),
        "mandate_details": body.mandateDetails.dict(),
        "redirect_url": body.redirectUrl
    }
    
    # Simulate async customer authorization callback
    webhook_url = os.getenv("BACKEND_WEBHOOK_URL", "http://backend:8000/webhooks/setu-autopay")
    webhook_secret = os.getenv("SETU_WEBHOOK_SECRET", "mock_webhook_secret")
    
    payload = {
        "event": "mandate.active",
        "data": {
            "mandateId": mandate_id,
            "umn": "UMN" + str(uuid.uuid4().hex[:16]).upper(),
            "vpa": body.customer.vpa or "customer@upi",
            "referenceId": body.referenceId
        }
    }
    
    def delayed_webhook():
        import time
        time.sleep(2)
        send_webhook_background(webhook_url, payload, webhook_secret)
        
    threading.Thread(target=delayed_webhook).start()
    
    return {
        "success": True,
        "data": {
            "id": mandate_id,
            "status": "INITIATED",
            "intentUrl": f"upi://mandate?pa=setu@ybl&am={body.mandateDetails.amount / 100}&mc=6012&tid={mandate_id}"
        },
        "traceId": "TR-" + str(uuid.uuid4().hex[:12]).upper()
    }

@app.post("/v1/mandates/{id}/notifications")
def create_mandate_notification(id: str, body: NotificationRequest, token_payload: dict = Depends(verify_token)):
    notification_id = "NTF-" + str(uuid.uuid4().hex[:12]).upper()
    return {
        "success": True,
        "data": {
            "notificationId": notification_id,
            "status": "SUCCESS"
        },
        "traceId": "TR-" + str(uuid.uuid4().hex[:12]).upper()
    }

@app.post("/v1/mandates/{id}/debits", status_code=202)
def execute_mandate_debit(id: str, body: DebitRequest, token_payload: dict = Depends(verify_token)):
    debit_id = "DBT-" + str(uuid.uuid4().hex[:12]).upper()
    debits[debit_id] = {
        "mandate_id": id,
        "amount": body.amount,
        "reference_id": body.referenceId,
        "status": "PENDING"
    }
    
    webhook_url = os.getenv("BACKEND_WEBHOOK_URL", "http://backend:8000/webhooks/setu-autopay")
    webhook_secret = os.getenv("SETU_WEBHOOK_SECRET", "mock_webhook_secret")
    
    # Check failure triggers (9999900 paise = 99,999 INR)
    is_failure = (body.amount == 9999900)
    
    if is_failure:
        payload = {
            "event": "debit.failed",
            "data": {
                "debitId": debit_id,
                "referenceId": body.referenceId,
                "amount": body.amount,
                "error": {
                    "code": "insufficient-funds",
                    "npciCode": "51",
                    "message": "Transaction failed at issuer bank end due to insufficient funds."
                }
            }
        }
    else:
        payload = {
            "event": "debit.success",
            "data": {
                "debitId": debit_id,
                "referenceId": body.referenceId,
                "amount": body.amount
            }
        }
        
    def delayed_webhook():
        import time
        time.sleep(2)
        send_webhook_background(webhook_url, payload, webhook_secret)
        
    threading.Thread(target=delayed_webhook).start()
    
    return {
        "success": True,
        "data": {
            "debitId": debit_id,
            "status": "PENDING"
        },
        "traceId": "TR-" + str(uuid.uuid4().hex[:12]).upper()
    }

@app.post("/v1/mandates/{id}/simulate-revoke")
def simulate_mandate_revocation(id: str, token_payload: dict = Depends(verify_token)):
    webhook_url = os.getenv("BACKEND_WEBHOOK_URL", "http://backend:8000/webhooks/setu-autopay")
    webhook_secret = os.getenv("SETU_WEBHOOK_SECRET", "mock_webhook_secret")
    
    payload = {
        "event": "mandate.revoked",
        "data": {
            "mandateId": id,
            "referenceId": mandates.get(id, {}).get("reference_id", "REF-UNKNOWN"),
            "revocationReason": "Revoked by customer inside GPay UPI App."
        }
    }
    
    send_webhook_background(webhook_url, payload, webhook_secret)
    
    return {
        "success": True,
        "message": f"Revocation webhook simulated for mandate {id}"
    }
