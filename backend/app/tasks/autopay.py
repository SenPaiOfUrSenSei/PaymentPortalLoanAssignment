import logging
import datetime
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import and_, select

from app.core.config import settings
from app.core.notification import get_notification_service
from app.models.models import (
    UPIMandate, PreDebitNotification, DebitExecution, Loan,
    MandateStatus, NotificationStatus, ExecutionStatus
)

logger = logging.getLogger("autopay_tasks")

async def get_setu_headers() -> dict:
    """Authenticates with Setu and generates auth headers dynamically."""
    async with httpx.AsyncClient() as client:
        url = f"{settings.SETU_API_BASE_URL.rstrip('/')}/api/v2/auth/token"
        response = await client.post(
            url,
            json={"clientID": settings.SETU_CLIENT_ID, "secret": settings.SETU_CLIENT_SECRET}
        )
        if response.status_code != 200:
            logger.error(f"Failed to authenticate with Setu. Status: {response.status_code}, Body: {response.text}")
            raise httpx.HTTPStatusError("Failed to get Setu auth token", request=None, response=response)
        token = response.json()["token"]
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Setu-Product-ID": "upi-autopay"
        }

async def trigger_daily_pre_debit_notifications(db: Session) -> list:
    """
    Looks for active mandates and queues/sends pre-debit notifications for scheduled
    payments occurring tomorrow (T+1).
    """
    today = datetime.date.today()
    tomorrow = today + datetime.timedelta(days=1)
    
    # Query pending notification objects expected tomorrow
    stmt = select(PreDebitNotification).where(
        and_(
            PreDebitNotification.expected_debit_date == tomorrow,
            PreDebitNotification.status == NotificationStatus.PENDING
        )
    )
    pending_notifications = db.scalars(stmt).all()
    
    processed = []
    if not pending_notifications:
        logger.info("No pending pre-debit notifications scheduled for tomorrow.")
        return processed

    try:
        headers = await get_setu_headers()
    except Exception as e:
        logger.error(f"Could not initialize Setu API client for notifications: {e}")
        return processed

    notifier = get_notification_service()

    async with httpx.AsyncClient() as client:
        for notification in pending_notifications:
            mandate: UPIMandate = notification.mandate
            
            # Compliance Check: Mandate must be active
            if mandate.status != MandateStatus.ACTIVE:
                logger.warning(f"Aborting notification for Mandate {mandate.id}: Status is {mandate.status}")
                notification.status = NotificationStatus.FAILED
                notification.error_message = f"Mandate was in status {mandate.status} at notification time"
                db.commit()
                continue

            payload = {
                "amount": notification.amount_paise,
                "debitDate": tomorrow.isoformat(),
                "note": f"EMI Recovery for Loan Account: {str(mandate.loan_id)[:8]}"
            }
            
            try:
                url = f"{settings.SETU_API_BASE_URL.rstrip('/')}/v1/mandates/{mandate.setu_mandate_id}/notifications"
                response = await client.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=15.0
                )
                
                resp_json = response.json()
                if response.status_code == 200 and resp_json.get("success"):
                    notification.status = NotificationStatus.SUCCESS
                    notification.setu_notification_id = resp_json["data"]["notificationId"]
                    notification.sent_at = datetime.datetime.now(datetime.timezone.utc)
                    
                    # Resolve customer contact info via Loan object
                    loan = db.query(Loan).filter(Loan.id == mandate.loan_id).first()
                    email_dest = f"borrower_{loan.mobile}@example.com" if loan else "customer@example.com"
                    mobile_dest = loan.mobile if loan else "919999999999"
                    cust_name = loan.customer_name if loan else "Valued Customer"
                    
                    # Dispatch fallback SMTP email (simulating SMS pre-debit notice)
                    await notifier.send_pre_debit_notification(
                        email=email_dest,
                        phone=mobile_dest,
                        customer_name=cust_name,
                        amount_in_paise=notification.amount_paise,
                        expected_debit_date=tomorrow.isoformat(),
                        loan_id=str(mandate.loan_id)
                    )
                    
                    logger.info(f"Registered pre-debit notice for mandate {mandate.id}. Notification ID: {notification.setu_notification_id}")
                    processed.append({
                        "mandate_id": str(mandate.id),
                        "notification_id": notification.setu_notification_id,
                        "status": "SUCCESS"
                    })
                else:
                    notification.status = NotificationStatus.FAILED
                    notification.error_code = resp_json.get("error", {}).get("code", "API_ERROR")
                    notification.error_message = resp_json.get("error", {}).get("message", "API response error")
                    logger.error(f"Setu notification creation failed for mandate {mandate.id}: {resp_json}")
                    processed.append({
                        "mandate_id": str(mandate.id),
                        "status": "FAILED",
                        "error": notification.error_message
                    })
            
            except Exception as e:
                notification.status = NotificationStatus.FAILED
                notification.error_message = str(e)
                logger.error(f"Network error sending pre-debit notice for mandate {mandate.id}: {e}")
                processed.append({
                    "mandate_id": str(mandate.id),
                    "status": "FAILED",
                    "error": str(e)
                })
            
            db.commit()
            
    return processed

async def execute_daily_debits(db: Session, bypass_24h_check: bool = False) -> list:
    """
    Looks for scheduled debits occurring today and submits them to Setu for execution.
    Verifies that a pre-debit notification was successfully registered at least 24 hours prior.
    """
    today = datetime.date.today()
    
    # Query scheduled debits today which are in INITIATED status
    stmt = select(DebitExecution).join(PreDebitNotification).where(
        and_(
            DebitExecution.status == ExecutionStatus.INITIATED,
            PreDebitNotification.status == NotificationStatus.SUCCESS,
            PreDebitNotification.expected_debit_date == today
        )
    )
    eligible_debits = db.scalars(stmt).all()
    
    processed = []
    if not eligible_debits:
        logger.info("No eligible debits scheduled for execution today.")
        return processed

    try:
        headers = await get_setu_headers()
    except Exception as e:
        logger.error(f"Could not initialize Setu API client for debits: {e}")
        return processed

    async with httpx.AsyncClient() as client:
        for debit in eligible_debits:
            mandate: UPIMandate = debit.mandate
            
            # Mandate state verification
            if mandate.status != MandateStatus.ACTIVE:
                debit.status = ExecutionStatus.FAILED
                debit.error_message = f"Aborted: Mandate status is {mandate.status}"
                db.commit()
                continue
            
            # Compliance Check: Minimum 24 hours gap since pre-debit notification
            notification: PreDebitNotification = debit.notification
            if not bypass_24h_check:
                time_since_notification = datetime.datetime.now(datetime.timezone.utc) - notification.sent_at.replace(tzinfo=datetime.timezone.utc)
                if time_since_notification < datetime.timedelta(hours=24):
                    logger.warning(f"Compliance violation: Less than 24h since pre-debit notice for debit {debit.id}. Skipping.")
                    continue

            payload = {
                "amount": debit.amount_paise,
                "notificationId": notification.setu_notification_id,
                "referenceId": str(debit.id),
                "debitType": "RECURRING"
            }
            
            try:
                debit.status = ExecutionStatus.PENDING
                db.commit()
                
                url = f"{settings.SETU_API_BASE_URL.rstrip('/')}/v1/mandates/{mandate.setu_mandate_id}/debits"
                response = await client.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=20.0
                )
                
                resp_json = response.json()
                if response.status_code in [200, 202]:
                    debit.setu_debit_id = resp_json["data"]["debitId"]
                    logger.info(f"Debit initialized with Setu for mandate {mandate.id}. Debit ID: {debit.setu_debit_id}")
                    processed.append({
                        "debit_execution_id": str(debit.id),
                        "setu_debit_id": debit.setu_debit_id,
                        "status": "PENDING"
                    })
                else:
                    debit.status = ExecutionStatus.FAILED
                    debit.error_code = resp_json.get("error", {}).get("code", "DEBIT_INIT_ERROR")
                    debit.error_message = resp_json.get("error", {}).get("message", "API response error")
                    logger.error(f"Failed to execute debit for {debit.id}: {resp_json}")
                    processed.append({
                        "debit_execution_id": str(debit.id),
                        "status": "FAILED",
                        "error": debit.error_message
                    })
            
            except Exception as e:
                debit.status = ExecutionStatus.FAILED
                debit.error_message = str(e)
                logger.error(f"Network error executing debit for {debit.id}: {e}")
                processed.append({
                    "debit_execution_id": str(debit.id),
                    "status": "FAILED",
                    "error": str(e)
                })
            
            db.commit()
            
    return processed
