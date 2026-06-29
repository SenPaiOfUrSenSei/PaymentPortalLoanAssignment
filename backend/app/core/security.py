import time
import httpx
import logging
from app.core.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("setu-security")

class SetuTokenManager:
    def __init__(self):
        self.token: str = ""
        self.expires_at: float = 0.0

    async def get_token(self) -> str:
        current_time = time.time()
        # If token exists and is valid for at least 30 more seconds, return it
        if self.token and self.expires_at > current_time + 30:
            return self.token
        
        # Otherwise, fetch a new one
        await self.refresh_token()
        return self.token

    async def refresh_token(self):
        url = f"{settings.SETU_API_BASE_URL.rstrip('/')}/api/v2/auth/token"
        payload = {
            "clientID": settings.SETU_CLIENT_ID,
            "secret": settings.SETU_CLIENT_SECRET
        }
        
        logger.info(f"Setu Auth: Fetching new token from {url}")
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, timeout=10.0)
                logger.info(f"Setu Auth Response Status: {response.status_code}")
                
                if response.status_code != 200:
                    logger.error(f"Setu Auth Failed: {response.text}")
                    raise Exception(f"Failed to fetch Setu auth token: {response.text}")
                
                data = response.json()
                if not data.get("success"):
                    logger.error(f"Setu Auth Success is False: {data}")
                    raise Exception("Setu Auth request was not successful")
                
                self.token = data["token"]
                # Buffer of 10 seconds before actual expiration
                self.expires_at = time.time() + float(data.get("expiresIn", 3600)) - 10
                logger.info("Setu Auth: Successfully fetched and cached new token.")
            except Exception as e:
                logger.error(f"Setu Auth Exception: {str(e)}")
                raise

token_manager = SetuTokenManager()

async def get_setu_headers() -> dict:
    token = await token_manager.get_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "X-PARTNER-ID": settings.SETU_PARTNER_ID,
        "Content-Type": "application/json"
    }
    
    # Clean tracing log as required by instructions
    # We display authorization header with mask to protect token in logs but keep it identifiable
    masked_token = f"{token[:10]}...{token[-10:]}" if len(token) > 20 else token
    logger.info(
        f"Setu Headers - Authorization: Bearer {masked_token} | X-PARTNER-ID: {settings.SETU_PARTNER_ID}"
    )
    
    return headers


# =====================================================================
# JWT Authentication Helper Functions
# =====================================================================
import jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.models import User

security_scheme = HTTPBearer()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        mobile: str = payload.get("sub")
        if mobile is None:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token signature has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise credentials_exception
        
    user = db.query(User).filter(User.mobile == mobile).first()
    if user is None:
        raise credentials_exception
    return user
