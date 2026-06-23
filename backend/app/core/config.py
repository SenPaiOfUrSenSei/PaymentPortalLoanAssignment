from pydantic_settings import BaseSettings
from pydantic import Field

class Settings(BaseSettings):
    DATABASE_URL: str = Field(
        default="postgresql://postgres:postgres@postgres-db:5432/payment_portal"
    )
    SETU_API_BASE_URL: str = Field(default="http://mock-setu:8081")
    SETU_CLIENT_ID: str = Field(default="mock_client_id")
    SETU_CLIENT_SECRET: str = Field(default="mock_client_secret")
    SETU_PARTNER_ID: str = Field(default="123456")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
