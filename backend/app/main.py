import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base
from app.routers import portal

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

# Include portal router
app.include_router(portal.router, prefix="/api", tags=["Portal"])

@app.get("/health")
def health():
    return {"status": "healthy"}
