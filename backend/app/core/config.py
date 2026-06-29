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
    SETU_WEBHOOK_SECRET: str = Field(default="mock_webhook_secret")

    # JWT Config Settings
    JWT_SECRET: str = Field(default="super_secret_jwt_key_arisx_2026")
    JWT_ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=1440) # 24 hours

    # Notification & SMTP settings for simulations
    NOTIFICATION_CHANNEL: str = Field(default="EMAIL") # Options: EMAIL, SMS, CONSOLE
    SMTP_HOST: str = Field(default="smtp.mailtrap.io")
    SMTP_PORT: int = Field(default=2525)
    SMTP_USER: str = Field(default="")
    SMTP_PASSWORD: str = Field(default="")
    SMTP_FROM_EMAIL: str = Field(default="no-reply@paymentportal.local")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
