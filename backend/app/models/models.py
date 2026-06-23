import datetime
import uuid
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base

class Biller(Base):
    __tablename__ = "billers"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category_name = Column(String, nullable=False, default="loan-repayment")
    customer_params = Column(JSON, nullable=False)  # stores customerParams schema list

    sessions = relationship("CustomerFetchSession", back_populates="biller")


class CustomerFetchSession(Base):
    __tablename__ = "customer_fetch_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    biller_id = Column(String, ForeignKey("billers.id"), nullable=False)
    fetch_ref_id = Column(String, nullable=False, index=True)  # Setu fetch request refId
    customer_params = Column(JSON, nullable=False)  # User entered params e.g. {"Loan Account Number": "1895159"}
    bills_data = Column(JSON, nullable=True)  # Fetched bill details from Setu response
    status = Column(String, nullable=False, default="PENDING")  # PENDING, SUCCESS, FAILURE
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    biller = relationship("Biller", back_populates="sessions")
    transactions = relationship("Transaction", back_populates="fetch_session")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fetch_session_id = Column(UUID(as_uuid=True), ForeignKey("customer_fetch_sessions.id"), nullable=False)
    payment_ref_id = Column(String, nullable=True, index=True)  # Setu payment reference ID
    amount = Column(Integer, nullable=False)  # in paise
    payment_gateway = Column(String, nullable=False)  # GPay, PhonePe, Razorpay, etc.
    status = Column(String, nullable=False, default="PENDING")  # PENDING, SUCCESSFUL, FAILED
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    customer_name = Column(String, nullable=False)
    bill_number = Column(String, nullable=False)

    fetch_session = relationship("CustomerFetchSession", back_populates="transactions")
