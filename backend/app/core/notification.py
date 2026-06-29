import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from abc import ABC, abstractmethod
from app.core.config import settings

logger = logging.getLogger("notifications")

class BaseNotificationService(ABC):
    @abstractmethod
    async def send_pre_debit_notification(
        self, email: str, phone: str, customer_name: str, amount_in_paise: int, expected_debit_date: str, loan_id: str
    ) -> bool:
        """Sends pre-debit notification T-1 days before debit execution."""
        pass

    @abstractmethod
    async def send_revocation_alert(
        self, email: str, phone: str, customer_name: str, loan_id: str, reason: str
    ) -> bool:
        """Sends warning alert when customer cancels or revokes a mandate."""
        pass


class ConsoleNotificationService(BaseNotificationService):
    async def send_pre_debit_notification(
        self, email: str, phone: str, customer_name: str, amount_in_paise: int, expected_debit_date: str, loan_id: str
    ) -> bool:
        amount_in_rupees = amount_in_paise / 100.0
        logger.info(
            f"[CONSOLE NOTIFICATION] Pre-debit alert sent to {customer_name} ({phone} / {email}). "
            f"Amount: ₹{amount_in_rupees:.2f}. Expected Debit Date: {expected_debit_date}. Loan ID: {loan_id}"
        )
        return True

    async def send_revocation_alert(
        self, email: str, phone: str, customer_name: str, loan_id: str, reason: str
    ) -> bool:
        logger.info(
            f"[CONSOLE NOTIFICATION] Revocation alert sent. Customer: {customer_name} ({phone} / {email}) "
            f"has revoked their mandate for Loan {loan_id}. Reason: {reason}"
        )
        return True


class SMTPNotificationService(BaseNotificationService):
    def _send_email(self, recipient_email: str, subject: str, html_body: str) -> bool:
        if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
            logger.warning("SMTP credentials (SMTP_USER / SMTP_PASSWORD) not set in environment.")
            logger.warning(f"--- EMAIL SIMULATION OUTBOX ---\nTo: {recipient_email}\nSubject: {subject}\nContent:\n{html_body}\n------------------------------")
            return True

        try:
            msg = MIMEMultipart()
            msg['From'] = settings.SMTP_FROM_EMAIL
            msg['To'] = recipient_email
            msg['Subject'] = subject

            msg.attach(MIMEText(html_body, 'html'))

            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)

            logger.info(f"Email sent successfully to {recipient_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {recipient_email} via SMTP: {str(e)}")
            return False

    async def send_pre_debit_notification(
        self, email: str, phone: str, customer_name: str, amount_in_paise: int, expected_debit_date: str, loan_id: str
    ) -> bool:
        amount_in_rupees = amount_in_paise / 100.0
        subject = "IMPORTANT: Upcoming Auto-Debit Notification for your Loan"
        
        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
                <h2 style="color: #2e7d32; border-bottom: 2px solid #2e7d32; padding-bottom: 8px;">Upcoming Auto-Debit Alert</h2>
                <p>Dear {customer_name},</p>
                <p>This is a pre-debit notification in compliance with NPCI regulations for your UPI AutoPay mandate.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
                    <tr style="background-color: #f9f9f9;">
                        <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #eee; width: 40%;">Loan Account ID</td>
                        <td style="padding: 12px; border-bottom: 1px solid #eee;">{loan_id}</td>
                    </tr>
                    <tr>
                        <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #eee;">Scheduled Amount</td>
                        <td style="padding: 12px; border-bottom: 1px solid #eee; font-size: 16px; color: #c62828; font-weight: bold;">₹{amount_in_rupees:.2f}</td>
                    </tr>
                    <tr style="background-color: #f9f9f9;">
                        <td style="padding: 12px; font-weight: bold; border-bottom: 1px solid #eee;">Scheduled Debit Date</td>
                        <td style="padding: 12px; border-bottom: 1px solid #eee; font-weight: bold;">{expected_debit_date}</td>
                    </tr>
                </table>
                <p>Please ensure that your linked bank account has sufficient balance to avoid mandate failure charges or penalty interest.</p>
                <p style="font-size: 11px; color: #777; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
                    This is an automated notification. Do not reply directly to this mail.
                </p>
            </div>
        </body>
        </html>
        """
        logger.info(f"Dispatching pre-debit SMTP email to {email} for ₹{amount_in_rupees:.2f}")
        return self._send_email(email, subject, html_body)

    async def send_revocation_alert(
        self, email: str, phone: str, customer_name: str, loan_id: str, reason: str
    ) -> bool:
        subject = "ALERT: Loan Mandate Revoked - Action Required"
        
        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #ffffff; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
                <h2 style="color: #c62828; border-bottom: 2px solid #c62828; padding-bottom: 8px;">UPI AutoPay Mandate Cancelled</h2>
                <p>Dear {customer_name},</p>
                <p>We received an alert that you have manually cancelled or revoked the UPI AutoPay mandate linked to your Loan (Account ID: {loan_id}).</p>
                <p><strong>Reason reported:</strong> {reason}</p>
                <p style="color: #d84315; font-weight: bold; font-size: 15px;">
                    Please note that cancelling active autopay mandates without providing an alternate payment channel is a violation of loan agreements.
                </p>
                <p>Kindly contact your loan officer or log into the loan payment portal immediately to link a new mandate or make a manual clearing transaction.</p>
                <p style="font-size: 11px; color: #777; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
                    This is a security alert. For assistance, contact support.
                </p>
            </div>
        </body>
        </html>
        """
        logger.info(f"Dispatching mandate revocation SMTP email to {email}")
        return self._send_email(email, subject, html_body)


class SMSNotificationService(BaseNotificationService):
    """
    SMS Notification adapter. Pluggable gateway in the future (e.g., Twilio, Gupshup).
    Currently acts as a bridge logging output and defaulting to email fallback.
    """
    async def send_pre_debit_notification(
        self, email: str, phone: str, customer_name: str, amount_in_paise: int, expected_debit_date: str, loan_id: str
    ) -> bool:
        amount_in_rupees = amount_in_paise / 100.0
        sms_text = f"Alert: AutoPay debit of Rs.{amount_in_rupees:.2f} is scheduled on {expected_debit_date} for your loan {str(loan_id)[-8:]}. Ensure sufficient balance."
        logger.info(f"[SMS OUTBOX GATEWAY] Destination: {phone}. Text: '{sms_text}'")
        
        # Fallback to email to guarantee visibility during simulation
        email_service = SMTPNotificationService()
        await email_service.send_pre_debit_notification(email, phone, customer_name, amount_in_paise, expected_debit_date, loan_id)
        return True

    async def send_revocation_alert(
        self, email: str, phone: str, customer_name: str, loan_id: str, reason: str
    ) -> bool:
        sms_text = f"Alert: Your UPI Mandate for loan {str(loan_id)[-8:]} was revoked (Reason: {reason}). Avoid defaults, set up a new mandate."
        logger.info(f"[SMS OUTBOX GATEWAY] Destination: {phone}. Text: '{sms_text}'")
        
        email_service = SMTPNotificationService()
        await email_service.send_revocation_alert(email, phone, customer_name, loan_id, reason)
        return True


def get_notification_service() -> BaseNotificationService:
    """Factory method returning notification implementation based on system configuration."""
    channel = settings.NOTIFICATION_CHANNEL.upper()
    if channel == "EMAIL":
        return SMTPNotificationService()
    elif channel == "SMS":
        return SMSNotificationService()
    else:
        return ConsoleNotificationService()
