from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime

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

class FetchStatusResponse(BaseModel):
    status: str  # PENDING, SUCCESS, FAILURE
    error: Optional[str] = None
    customerName: Optional[str] = None
    bills: Optional[List[BillDetail]] = None

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
