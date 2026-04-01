import os
import smtplib
from email.message import EmailMessage


def send_otp_email(to_email, otp_code, purpose):
    """Send an OTP email for signup or password reset."""
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587").strip())
    smtp_username = os.getenv("SMTP_USERNAME", "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD", "").strip().replace(" ", "")
    smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
    smtp_use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() == "true"
    mail_from = os.getenv("MAIL_FROM", smtp_username or "no-reply@example.com").strip()

    if not smtp_host or not smtp_username or not smtp_password:
        return False, "SMTP is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, and MAIL_FROM."

    action_text = "create your account" if purpose == "signup" else "reset your password"

    message = EmailMessage()
    message["Subject"] = "Your OTP Code"
    message["From"] = mail_from
    message["To"] = to_email
    message.set_content(
        f"""
Hello,

Your OTP to {action_text} is: {otp_code}

This OTP will expire in 10 minutes.

If you did not request this, you can ignore this email.
""".strip()
    )

    try:
        if smtp_use_ssl or smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=20) as server:
                server.ehlo()
                server.login(smtp_username, smtp_password)
                server.send_message(message)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
                server.ehlo()
                if smtp_use_tls:
                    server.starttls()
                    server.ehlo()
                server.login(smtp_username, smtp_password)
                server.send_message(message)
        return True, "OTP sent successfully."
    except Exception as error:
        error_text = str(error)
        lowered_error = error_text.lower()
        print(f"SMTP send failed for {to_email}: {error_text}")

        if "smtpclientauthentication is disabled" in lowered_error:
            return False, "Outlook SMTP auth is disabled for this mailbox. Please enable SMTP AUTH in your Outlook account settings."

        if "authentication unsuccessful" in lowered_error or "535" in lowered_error:
            return False, "Email login failed. Please check your Outlook email, password, and app password settings."

        if "timed out" in lowered_error or "timeout" in lowered_error:
            return False, "SMTP connection timed out. Please check whether your hosting provider allows outbound SMTP connections."

        return False, "Failed to send OTP email. Please check your SMTP settings and try again."
