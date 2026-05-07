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
    """Read the transactional email API key."""
    return os.getenv("BREVO_API_KEY", "").strip()


def get_email_sender_config():
    """Return the configured sender details used for transactional emails."""
    api_key = get_brevo_api_key()
    if not api_key:
        return None, None, None, None, "The email service is not configured right now. Please contact support."

    mail_from = os.getenv("MAIL_FROM", "").strip()
    mail_from_name = os.getenv("MAIL_FROM_NAME", "ECE-BOT").strip() or "ECE-BOT"
    request_timeout = int(os.getenv("BREVO_API_TIMEOUT_SECONDS", "15").strip())

    if not mail_from or not EMAIL_PATTERN.fullmatch(mail_from):
        return None, None, None, None, "The email sender is not configured correctly. Please contact support."

    return api_key, mail_from, mail_from_name, request_timeout, ""


def send_email_via_brevo_api(to_email, subject, text_body, html_body):
    """Send a transactional email using Brevo."""
    api_key, mail_from, mail_from_name, request_timeout, config_error = get_email_sender_config()
    if config_error:
        return False, config_error

    payload = {
        "sender": {"name": mail_from_name, "email": mail_from},
        "to": [{"email": to_email}],
        "subject": subject.strip(),
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
            "The email service is temporarily unavailable. Please try again later.",
            error_text,
        )

    if response.ok:
        return True, "OTP sent successfully."

    error_text = response.text.strip()
    logger.error("Brevo API rejected email for %s: %s", to_email, error_text)
    lowered_error = error_text.lower()

    if response.status_code in (401, 403):
        return False, with_debug_details(
            "The email service is not available right now. Please contact support.",
            error_text,
        )

    if "sender" in lowered_error and "not valid" in lowered_error:
        return False, with_debug_details(
            "The email sender is not configured correctly. Please contact support.",
            error_text,
        )

    return False, with_debug_details(
        "The email service could not send the OTP right now. Please try again later.",
        error_text,
    )


def send_otp_via_brevo_api(to_email, otp_code, purpose):
    """Send OTP using the configured email provider HTTPS API."""
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

    return send_email_via_brevo_api(to_email, subject, text_body, html_body)


def send_otp_email(to_email, otp_code, purpose):
    """Send an OTP email for signup or password reset."""
    if not EMAIL_PATTERN.fullmatch((to_email or "").strip()):
        return False, "Please enter a valid email address."

    if not get_brevo_api_key():
        return False, "The email service is not configured right now. Please contact support."

    return send_otp_via_brevo_api(to_email, otp_code, purpose)


def send_operator_invite_email(to_email, operator_name, admin_name, signup_url):
    """Send an operator invitation email after the admin grants access."""
    if not EMAIL_PATTERN.fullmatch((to_email or "").strip()):
        return False, "Please enter a valid email address."

    safe_operator_name = (operator_name or "Operator").strip() or "Operator"
    safe_admin_name = (admin_name or "Admin").strip() or "Admin"
    safe_signup_url = (signup_url or "").strip()

    subject = "You have been invited as an ECE-BOT operator"
    text_body = (
        f"Hello {safe_operator_name},\n\n"
        f"ECE-Bot team has invited you to join ECE-BOT as an operator.\n\n"
        "Next steps:\n"
        "1. Open the signup page.\n"
        "2. Enter the same email address used for this invitation.\n"
        "3. Request OTP and verify your email.\n"
        "4. Create your password and complete signup.\n\n"
        f"Signup link: {safe_signup_url}\n\n"
        "After signup, you can log in with your email and password.\n"
        "If you did not expect this invitation, you can ignore this email."
    )
    html_body = (
        f"<p>Hello {safe_operator_name},</p>"
        f"<p><strong>{safe_admin_name}</strong> has invited you to join ECE-BOT as an operator.</p>"
        "<p>Next steps:</p>"
        "<ol>"
        "<li>Open the signup page.</li>"
        "<li>Enter the same email address used for this invitation.</li>"
        "<li>Request OTP and verify your email.</li>"
        "<li>Create your password and complete signup.</li>"
        "</ol>"
        f'<p><a href="{safe_signup_url}">Open signup page</a></p>'
        f'<p>Signup link: <a href="{safe_signup_url}">{safe_signup_url}</a></p>'
        "<p>After signup, you can log in with your email and password.</p>"
        "<p>If you did not expect this invitation, you can ignore this email.</p>"
    )

    return send_email_via_brevo_api(to_email, subject, text_body, html_body)


def send_operator_promotion_email(to_email, operator_name, admin_name):
    """Notify an existing account that it now has operator access."""
    if not EMAIL_PATTERN.fullmatch((to_email or "").strip()):
        return False, "Please enter a valid email address."

    safe_operator_name = (operator_name or "Operator").strip() or "Operator"
    safe_admin_name = (admin_name or "Admin").strip() or "Admin"

    subject = "Your ECE-BOT account now has operator access"
    text_body = (
        f"Hello {safe_operator_name},\n\n"
        f"{safe_admin_name} has promoted your ECE-BOT account to the operator role.\n\n"
        "You can now log in with your existing email and password and access operator features.\n\n"
        "If you did not expect this role change, please contact support."
    )
    html_body = (
        f"<p>Hello {safe_operator_name},</p>"
        f"<p><strong>{safe_admin_name}</strong> has promoted your ECE-BOT account to the operator role.</p>"
        "<p>You can now log in with your existing email and password and access operator features.</p>"
        "<p>If you did not expect this role change, please contact support.</p>"
    )

    return send_email_via_brevo_api(to_email, subject, text_body, html_body)


def send_operator_removal_email(to_email, operator_name, admin_name):
    """Notify a user that operator access has been removed."""
    if not EMAIL_PATTERN.fullmatch((to_email or "").strip()):
        return False, "Please enter a valid email address."

    safe_operator_name = (operator_name or "User").strip() or "User"
    safe_admin_name = (admin_name or "Admin").strip() or "Admin"

    subject = "Your ECE-BOT account has been moved back to user role"
    text_body = (
        f"Hello {safe_operator_name},\n\n"
        f"{safe_admin_name} has removed operator access from your ECE-BOT account.\n\n"
        "Your account is still active, and you can continue using ECE-BOT as a normal user.\n\n"
        "If you did not expect this role change, please contact support."
    )
    html_body = (
        f"<p>Hello {safe_operator_name},</p>"
        f"<p><strong>{safe_admin_name}</strong> has removed operator access from your ECE-BOT account.</p>"
        "<p>Your account is still active, and you can continue using ECE-BOT as a normal user.</p>"
        "<p>If you did not expect this role change, please contact support.</p>"
    )

    return send_email_via_brevo_api(to_email, subject, text_body, html_body)
