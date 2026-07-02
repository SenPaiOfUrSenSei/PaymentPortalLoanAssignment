import datetime
import uuid
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, Float, Enum, BigInteger, Date, Boolean
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


class UserConsent(Base):
    __tablename__ = "user_consents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mobile = Column(String, nullable=False, index=True)
    consent_id = Column(String, nullable=False, unique=True, index=True)
    status = Column(String, nullable=False, default="ACTIVE")  # ACTIVE, REVOKED
    fi_types = Column(JSON, nullable=False)  # list of FI types, e.g. ["LOAN", "CREDIT_CARD"]
    expiry = Column(DateTime, nullable=True)  # null represents indefinite
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Loan(Base):
    __tablename__ = "loans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mobile = Column(String, nullable=False, index=True)
    biller_id = Column(String, nullable=False)
    biller_name = Column(String, nullable=False)
    loan_account_number = Column(String, nullable=False, index=True)
    customer_name = Column(String, nullable=False)
    type = Column(String, nullable=False, default="LOAN")  # LOAN, CREDIT_CARD
    category = Column(String, nullable=False, default="Personal Loan")  # e.g. Personal Loan, Home Loan, Credit Card
    total_outstanding = Column(Integer, nullable=False)  # in paise
    principal_outstanding = Column(Integer, nullable=False)  # in paise
    interest_outstanding = Column(Integer, nullable=False)  # in paise
    interest_rate = Column(Float, nullable=False, default=12.0)
    remaining_tenure_months = Column(Integer, nullable=False, default=12)
    dpd = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="ACTIVE")  # ACTIVE, SETTLED
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    settled_at = Column(DateTime, nullable=True)
    settled_amount = Column(Integer, nullable=True)  # in paise


import enum

class MandateStatus(str, enum.Enum):
    INITIATED = "INITIATED"
    ACTIVE = "ACTIVE"
    REJECTED = "REJECTED"
    REVOKED = "REVOKED"
    PAUSED = "PAUSED"
    EXPIRED = "EXPIRED"

class NotificationStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"

class ExecutionStatus(str, enum.Enum):
    INITIATED = "INITIATED"
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    RETRYING = "RETRYING"

class UPIMandate(Base):
    __tablename__ = "upi_mandates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    loan_id = Column(UUID(as_uuid=True), ForeignKey("loans.id", ondelete="CASCADE"), nullable=False)
    customer_id = Column(UUID(as_uuid=True), nullable=False)
    reference_id = Column(String(100), unique=True, nullable=False, index=True)
    setu_mandate_id = Column(String(100), unique=True, nullable=True, index=True)
    umn = Column(String(100), unique=True, nullable=True, index=True)
    customer_vpa = Column(String(255), nullable=True)
    max_amount_paise = Column(BigInteger, nullable=False)
    amount_rule = Column(String(10), default="MAX")
    frequency = Column(String(30), default="AS_PRESENTED")
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(Enum(MandateStatus), default=MandateStatus.INITIATED, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    notifications = relationship("PreDebitNotification", back_populates="mandate")
    debits = relationship("DebitExecution", back_populates="mandate")


class PreDebitNotification(Base):
    __tablename__ = "pre_debit_notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mandate_id = Column(UUID(as_uuid=True), ForeignKey("upi_mandates.id", ondelete="CASCADE"), nullable=False)
    setu_notification_id = Column(String(100), unique=True, nullable=True)
    amount_paise = Column(BigInteger, nullable=False)
    scheduled_at = Column(DateTime, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    expected_debit_date = Column(Date, nullable=False, index=True)
    status = Column(Enum(NotificationStatus), default=NotificationStatus.PENDING, nullable=False)
    error_code = Column(String(50), nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    mandate = relationship("UPIMandate", back_populates="notifications")
    debit_executions = relationship("DebitExecution", back_populates="notification")


class DebitExecution(Base):
    __tablename__ = "debit_executions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mandate_id = Column(UUID(as_uuid=True), ForeignKey("upi_mandates.id", ondelete="CASCADE"), nullable=False)
    pre_debit_notification_id = Column(UUID(as_uuid=True), ForeignKey("pre_debit_notifications.id"), nullable=True)
    setu_debit_id = Column(String(100), unique=True, nullable=True)
    amount_paise = Column(BigInteger, nullable=False)
    debited_amount_paise = Column(BigInteger, nullable=True)
    scheduled_at = Column(DateTime, nullable=False)
    executed_at = Column(DateTime, nullable=True)
    status = Column(Enum(ExecutionStatus), default=ExecutionStatus.INITIATED, nullable=False)
    retry_count = Column(Integer, default=0, nullable=False)
    npci_response_code = Column(String(10), nullable=True)
    error_code = Column(String(50), nullable=True)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    mandate = relationship("UPIMandate", back_populates="debits")
    notification = relationship("PreDebitNotification", back_populates="debit_executions")


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    dob = Column(Date, nullable=False)
    mobile = Column(String, unique=True, nullable=False, index=True)
    pan = Column(String, unique=True, nullable=False)
    tc_accepted = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Credit Bureau Fields (stored from Decentro handshake)
    credit_score = Column(Integer, nullable=True)
    credit_utilization_ratio = Column(Integer, nullable=True)
    total_active_accounts = Column(Integer, nullable=True)
    payment_history_clean = Column(Boolean, nullable=True)


class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mobile = Column(String, nullable=False, index=True)
    otp_code = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
