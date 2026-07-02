from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime, date

# Biller schema
class BillerBase(BaseModel):
    id: str
    name: str
    categoryName: str = Field(..., serialization_alias="category_name")
    customerParams: List[Dict[str, Any]] = Field(..., serialization_alias="customer_params")

    class Config:
        populate_by_name = True
        from_attributes = True

class BillerDB(BaseModel):
    id: str
    name: str
    category_name: str
    customer_params: List[Dict[str, Any]]

    class Config:
        from_attributes = True

# Portal fetch request schemas
class FetchInitiateRequest(BaseModel):
    billerId: str
    mobile: str
    customerParams: Dict[str, str]

class FetchInitiateResponse(BaseModel):
    fetchSessionId: UUID
    refId: str

class BillDetail(BaseModel):
    amount: Optional[int] = None  # in paise
    billNumber: str
    billPeriod: str
    dueDate: str
    billDate: str
    customerName: str

class MandateSummaryDetail(BaseModel):
    id: UUID
    setuMandateId: str = Field(..., serialization_alias="setu_mandate_id")
    umn: Optional[str] = None
    status: str
    maxAmountPaise: int = Field(..., serialization_alias="max_amount_paise")

    class Config:
        populate_by_name = True

class FetchStatusResponse(BaseModel):
    status: str  # PENDING, SUCCESS, FAILURE
    error: Optional[str] = None
    customerName: Optional[str] = None
    bills: Optional[List[BillDetail]] = None
    mandate: Optional[MandateSummaryDetail] = None
    loanId: Optional[UUID] = Field(None, serialization_alias="loan_id")

# Payment initiate schemas
class PaymentInitiateRequest(BaseModel):
    fetchSessionId: UUID
    amount: int  # in paise
    paymentGateway: str  # GPay, PhonePe, Razorpay, etc.
    customerName: str
    billNumber: str

class PaymentInitiateResponse(BaseModel):
    transactionId: UUID
    paymentRefId: Optional[str] = None
    status: str

# Checkout simulation schemas
class PaymentSimulateRequest(BaseModel):
    confirm: bool  # True to pay, False to fail

class PaymentSimulateResponse(BaseModel):
    transactionId: UUID
    status: str
    paymentRefId: Optional[str] = None
    errorMessage: Optional[str] = None

# Invoice schemas
class TransactionInvoiceResponse(BaseModel):
    transactionId: UUID
    paymentRefId: Optional[str] = None
    amount: int  # in paise
    paymentGateway: str
    status: str
    createdAt: datetime
    completedAt: Optional[datetime] = None
    customerName: str
    billNumber: str
    billerName: str
    billerId: str

    class Config:
        from_attributes = True
        populate_by_name = True


# Settlement schemas
class ConsentRequest(BaseModel):
    mobile: str

class ConsentApproveRequest(BaseModel):
    mobile: str
    otp: str

class CalculateSettlementRequest(BaseModel):
    loanId: UUID

class PaySettlementRequest(BaseModel):
    loanId: UUID
    amount: int  # in paise
    paymentGateway: str


class InitiateSettlementMandateRequest(BaseModel):
    loanId: UUID
    settlementAmount: int  # in paise
    tenureMonths: int


class InitiateSettlementMandateResponse(BaseModel):
    mandateId: UUID
    setuMandateId: str
    status: str
    intentUrl: str
    referenceId: str



# Auth schemas
class OTPRequest(BaseModel):
    mobile: str


class OTPResponse(BaseModel):
    mobile: str
    otpHint: str = Field(..., alias="otp_hint")
    message: str

    class Config:
        populate_by_name = True
        from_attributes = True


class UserRegisterRequest(BaseModel):
    firstName: str = Field(..., alias="first_name")
    lastName: str = Field(..., alias="last_name")
    dob: date  # format: YYYY-MM-DD
    mobile: str
    pan: str
    otpCode: str = Field(..., alias="otp_code")
    tcAccepted: bool = Field(..., alias="tc_accepted")

    class Config:
        populate_by_name = True
        from_attributes = True


class UserLoginRequest(BaseModel):
    mobile: str
    otpCode: str = Field(..., alias="otp_code")

    class Config:
        populate_by_name = True
        from_attributes = True


class UserResponse(BaseModel):
    id: UUID
    firstName: str = Field(..., alias="first_name")
    lastName: str = Field(..., alias="last_name")
    dob: date
    mobile: str
    pan: str
    tcAccepted: bool = Field(..., alias="tc_accepted")
    
    creditScore: Optional[int] = Field(None, alias="credit_score")
    creditUtilizationRatio: Optional[int] = Field(None, alias="credit_utilization_ratio")
    totalActiveAccounts: Optional[int] = Field(None, alias="total_active_accounts")
    paymentHistoryClean: Optional[bool] = Field(None, alias="payment_history_clean")

    class Config:
        from_attributes = True
        populate_by_name = True


class TokenResponse(BaseModel):
    accessToken: str = Field(..., alias="access_token")
    tokenType: str = Field("bearer", alias="token_type")
    user: UserResponse

    class Config:
        populate_by_name = True
        from_attributes = True
