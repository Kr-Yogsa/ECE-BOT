import os
import re
import logging

import requests


EMAIL_PATTERN = re.compile(r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$", re.IGNORECASE)
logger = logging.getLogger(__name__)
BREVO_SEND_EMAIL_URL = "https://api.brevo.com/v3/smtp/email"


def is_email_debug_enabled():
    """Optionally return the raw provider error to help with deployment debugging."""
    return os.getenv("SHOW_SMTP_ERROR_DETAILS", "false").strip().lower() == "true"


def with_debug_details(message, error_text):
    """Append the provider error only when explicit email debugging is enabled."""
    if not is_email_debug_enabled() or not error_text:
        return message

    return f"{message} Details: {error_text}"


def format_provider_error(error):
    """Create a readable provider error string even when str(error) is empty."""
    error_text = str(error).strip()
    if error_text:
        return error_text

    if getattr(error, "args", None):
        joined_args = " | ".join(str(item) for item in error.args if str(item).strip())
        if joined_args:
            return joined_args

    return repr(error)


def get_brevo_api_key():
    """Read the Brevo API key used for transactional email."""
    return os.getenv("BREVO_API_KEY", "").strip()


def send_otp_via_brevo_api(to_email, otp_code, purpose):
    """Send OTP using Brevo's HTTPS API to avoid SMTP connectivity issues."""
    api_key = get_brevo_api_key()
    if not api_key:
        return False, "Brevo API key is not configured."

    mail_from = os.getenv("MAIL_FROM", "").strip()
    mail_from_name = os.getenv("MAIL_FROM_NAME", "ECE-BOT").strip() or "ECE-BOT"
    request_timeout = int(os.getenv("BREVO_API_TIMEOUT_SECONDS", "15").strip())

    if not mail_from or not EMAIL_PATTERN.fullmatch(mail_from):
        return False, "MAIL_FROM must be a valid verified sender email for Brevo."

    action_text = "create your account" if purpose == "signup" else "reset your password"
    subject = "Your OTP Code"
    text_body = (
        f"Hello,\n\n"
        f"Your OTP to {action_text} is: {otp_code}\n\n"
        f"This OTP will expire in 10 minutes.\n\n"
        f"If you did not request this, you can ignore this email."
    )

    html_body = (
        "<p>Hello,</p>"
        f"<p>Your OTP to {action_text} is: <strong>{otp_code}</strong></p>"
        "<p>This OTP will expire in 10 minutes.</p>"
        "<p>If you did not request this, you can ignore this email.</p>"
    )

    payload = {
        "sender": {"name": mail_from_name, "email": mail_from},
        "to": [{"email": to_email}],
        "subject": subject,
        "textContent": text_body,
        "htmlContent": html_body,
    }
    headers = {
        "accept": "application/json",
        "api-key": api_key,
        "content-type": "application/json",
    }

    try:
        response = requests.post(
            BREVO_SEND_EMAIL_URL,
            json=payload,
            headers=headers,
            timeout=request_timeout,
        )
    except requests.RequestException as error:
        error_text = format_provider_error(error)
        logger.exception("Brevo API send failed for %s: %s", to_email, error_text)
        return False, with_debug_details(
            "Brevo API request failed. Please check your hosting network access and Brevo API configuration.",
            error_text,
        )

    if response.ok:
        return True, "OTP sent successfully."

    error_text = response.text.strip()
    logger.error("Brevo API rejected email for %s: %s", to_email, error_text)
    lowered_error = error_text.lower()

    if response.status_code in (401, 403):
        return False, with_debug_details(
            "Brevo API authentication failed. Please check BREVO_API_KEY.",
            error_text,
        )

    if "sender" in lowered_error and "not valid" in lowered_error:
        return False, with_debug_details(
            "MAIL_FROM is not a verified Brevo sender email.",
            error_text,
        )

    return False, with_debug_details(
        "Brevo failed to send OTP email. Please check your Brevo sender and API settings.",
        error_text,
    )


def send_otp_email(to_email, otp_code, purpose):
    """Send an OTP email for signup or password reset."""
    if not EMAIL_PATTERN.fullmatch((to_email or "").strip()):
        return False, "Please enter a valid email address."

    if not get_brevo_api_key():
        return False, "Brevo API key is not configured."

    return send_otp_via_brevo_api(to_email, otp_code, purpose)
