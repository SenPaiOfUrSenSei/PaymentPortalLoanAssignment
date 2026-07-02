import random
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user
from app.crud import crud
from app.schemas import schemas
from app.models.models import User

logger = logging.getLogger("auth-router")
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/send-otp", response_model=schemas.OTPResponse)
async def send_otp(payload: schemas.OTPRequest, purpose: str = "login", db: Session = Depends(get_db)):
    """
    Generates a 6-digit OTP code for a mobile number.
    Verifies eligibility based on purpose ('register' vs 'login').
    """
    mobile = payload.mobile.strip()
    if not mobile or len(mobile) != 10 or not mobile.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid 10-digit mobile number."
        )

    # Check if user exists
    user_exists = crud.get_user_by_mobile(db, mobile) is not None

    if purpose == "register" and user_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number is already registered. Please log in instead."
        )
    elif purpose == "login" and not user_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mobile number is not registered. Please sign up first."
        )

    # Generate a random 6-digit code
    otp_code = "".join(random.choices("0123456789", k=6))
    
    # Store in database
    crud.create_otp(db, mobile, otp_code)
    
    logger.info(f"OTP generated for {mobile} (purpose: {purpose}): {otp_code}")

    return {
        "mobile": mobile,
        "otp_hint": otp_code,
        "message": "OTP verification code sent successfully."
    }

@router.post("/register", response_model=schemas.TokenResponse)
async def register(payload: schemas.UserRegisterRequest, db: Session = Depends(get_db)):
    """
    Verifies OTP, checks if mobile is unique, accepts T&C, creates User, and issues JWT.
    """
    mobile = payload.mobile.strip()
    
    # Validate T&C acceptance
    if not payload.tcAccepted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must accept the Terms and Conditions to register."
        )

    # Verify OTP
    otp_valid = crud.verify_otp(db, mobile, payload.otpCode)
    if not otp_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code. Please request a new one."
        )

    # Check if already registered
    existing_user = crud.get_user_by_mobile(db, mobile)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number is already registered. Please sign in."
        )

    # Create new User
    try:
        user = crud.create_user(
            db=db,
            first_name=payload.firstName,
            last_name=payload.lastName,
            dob=payload.dob,
            mobile=mobile,
            pan=payload.pan.upper().strip(),
            tc_accepted=payload.tcAccepted
        )
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while creating your account. Please check parameters (PAN/Mobile uniqueness)."
        )

    # Refresh credit score on registration
    refresh_user_credit_score(db, user)

    # Issue access token
    access_token = create_access_token(data={"sub": user.mobile})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.post("/login", response_model=schemas.TokenResponse)
async def login(payload: schemas.UserLoginRequest, db: Session = Depends(get_db)):
    """
    Verifies OTP, checks if user exists, and issues JWT.
    """
    mobile = payload.mobile.strip()
    
    # Verify OTP
    otp_valid = crud.verify_otp(db, mobile, payload.otpCode)
    if not otp_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code. Please request a new one."
        )

    # Fetch user
    user = crud.get_user_by_mobile(db, mobile)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registered user found with this mobile number. Please register first."
        )

    # Refresh credit score on login
    refresh_user_credit_score(db, user)

    # Issue access token
    access_token = create_access_token(data={"sub": user.mobile})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/me", response_model=schemas.UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    Protected route to retrieve current user profile info.
    """
    return current_user


def refresh_user_credit_score(db: Session, user: User):
    """
    Simulates Decentro API handshake to retrieve and update user's credit score.
    """
    import uuid
    # Mock Decentro credit report response
    # We fluctuate the score within 710-775 so the user can visually see it retrieve and cache on login.
    mock_decentro_response = {
        "cIRReportDataLst": [
            {
                "scoreDetails": {
                    "value": str(random.randint(710, 775))
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
    if cir_list:
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
        
        user.credit_score = current_score
        user.credit_utilization_ratio = credit_utilization_ratio
        user.total_active_accounts = total_active_accounts
        user.payment_history_clean = payment_history_clean
        db.commit()
        db.refresh(user)
        logger.info(f"Refreshed and stored credit score ({current_score}) for user {user.mobile}")

        # Seed loans matching mock-setu profiles if none exist
        from app.models.models import Loan
        existing_loans = db.query(Loan).filter(Loan.mobile == user.mobile).count()
        if existing_loans == 0:
            crud.create_loan(
                db=db,
                mobile=user.mobile,
                biller_id="HDFC00000NAT01",
                biller_name="HDFC Bank",
                loan_account_number="XXXXXXXXXXXX5678",
                customer_name=f"{user.first_name} {user.last_name}",
                type="LOAN",
                category="Home Loan",
                total_outstanding=150000000,
                principal_outstanding=120000000,
                interest_outstanding=30000000,
                interest_rate=10.5,
                remaining_tenure_months=36,
                dpd=95
            )
            crud.create_loan(
                db=db,
                mobile=user.mobile,
                biller_id="ADIT00000NAT02",
                biller_name="Aditya Birla Finance",
                loan_account_number="XXXXXXXXXXXX5159",
                customer_name=f"{user.first_name} {user.last_name}",
                type="LOAN",
                category="Personal Loan",
                total_outstanding=85000000,
                principal_outstanding=70000000,
                interest_outstanding=15000000,
                interest_rate=12.0,
                remaining_tenure_months=24,
                dpd=45
            )
            logger.info(f"Dynamically seeded active loans for new user {user.mobile}")
