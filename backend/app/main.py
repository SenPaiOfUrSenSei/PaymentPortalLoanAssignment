import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base, SessionLocal
from app.routers import portal, mandates, auth
from app.models.models import Loan, UPIMandate, PreDebitNotification, DebitExecution, User
from app.crud import crud

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("backend-main")

# Automatically create tables on startup
logger.info("Initializing database tables...")
Base.metadata.create_all(bind=engine)
logger.info("Database tables initialized successfully.")

# Seed initial loans for the settlement demo
def seed_initial_loans():
    db = SessionLocal()
    try:
        if db.query(Loan).count() == 0:
            logger.info("Database contains no loans. Seeding initial mock loans...")
            # Aarav Sharma: 9876543210
            crud.create_loan(
                db=db,
                mobile="9876543210",
                biller_id="HDFC00000NAT01",
                biller_name="HDFC Loan Services",
                loan_account_number="12345678",
                customer_name="Aarav Sharma",
                type="LOAN",
                total_outstanding=150000000, # paise (Rs. 1,500,000)
                principal_outstanding=120000000, # paise (Rs. 1,200,000)
                interest_outstanding=30000000, # paise (Rs. 300,000)
                interest_rate=10.5,
                remaining_tenure_months=36,
                dpd=95
            )
            crud.create_loan(
                db=db,
                mobile="9876543210",
                biller_id="ADIT00000NAT02",
                biller_name="Aditya Birla Finance",
                loan_account_number="1895159",
                customer_name="Aarav Sharma",
                type="LOAN",
                total_outstanding=85000000, # paise (Rs. 850,000)
                principal_outstanding=70000000,
                interest_outstanding=15000000,
                interest_rate=12.0,
                remaining_tenure_months=24,
                dpd=45
            )
            crud.create_loan(
                db=db,
                mobile="9876543210",
                biller_id="SBIL00000NAT03",
                biller_name="SBI Loans",
                loan_account_number="99999999",
                customer_name="Aarav Sharma",
                type="LOAN",
                total_outstanding=42000000, # paise (Rs. 420,000)
                principal_outstanding=38000000,
                interest_outstanding=4000000,
                interest_rate=9.5,
                remaining_tenure_months=12,
                dpd=0
            )
            crud.create_loan(
                db=db,
                mobile="9876543210",
                biller_id="HDFC00000NAT01",
                biller_name="HDFC Credit Services",
                loan_account_number="4532XXXXXXXX1122",
                customer_name="Aarav Sharma",
                type="CREDIT_CARD",
                total_outstanding=12000000, # paise (Rs. 120,000)
                principal_outstanding=9000000,
                interest_outstanding=3000000,
                interest_rate=42.0,
                remaining_tenure_months=0,
                dpd=110
            )

            # Priya Patel: 9999988888
            crud.create_loan(
                db=db,
                mobile="9999988888",
                biller_id="SBIL00000NAT03",
                biller_name="SBI Loans",
                loan_account_number="1111222233",
                customer_name="Priya Patel",
                type="LOAN",
                total_outstanding=500000000, # paise (Rs. 5,000,000)
                principal_outstanding=450000000,
                interest_outstanding=50000000,
                interest_rate=8.75,
                remaining_tenure_months=180,
                dpd=15
            )
            crud.create_loan(
                db=db,
                mobile="9999988888",
                biller_id="ADIT00000NAT02",
                biller_name="Aditya Birla Finance",
                loan_account_number="2222333344",
                customer_name="Priya Patel",
                type="LOAN",
                total_outstanding=35000000, # paise (Rs. 350,000)
                principal_outstanding=30000000,
                interest_outstanding=5000000,
                interest_rate=13.5,
                remaining_tenure_months=36,
                dpd=70
            )
            logger.info("Pre-seeded initial mock loans successfully.")
        
        # Seed users
        if db.query(User).count() == 0:
            logger.info("Database contains no users. Seeding initial mock users...")
            import datetime
            aarav = User(
                first_name="Aarav",
                last_name="Sharma",
                dob=datetime.date(1990, 1, 15),
                mobile="9876543210",
                pan="ABCDE1234F",
                tc_accepted=True
            )
            db.add(aarav)
            
            priya = User(
                first_name="Priya",
                last_name="Patel",
                dob=datetime.date(1993, 5, 20),
                mobile="9999988888",
                pan="XYZWP9876Q",
                tc_accepted=True
            )
            db.add(priya)
            db.commit()
            logger.info("Pre-seeded initial mock users successfully.")
    except Exception as e:
        logger.error(f"Error seeding loans and users: {str(e)}")
    finally:
        db.close()

seed_initial_loans()

app = FastAPI(
    title="Loan Payment Portal Backend",
    description="FastAPI service coordinating between frontend and Setu BBPS v2"
)

# Enable CORS for frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev/sandbox setup
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(portal.router, prefix="/api", tags=["Portal"])
app.include_router(auth.router, tags=["Authentication"])
app.include_router(mandates.router, tags=["Mandates"])

@app.get("/health")
def health():
    return {"status": "healthy"}
