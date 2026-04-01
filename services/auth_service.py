import os
import random
from datetime import datetime, timedelta, timezone

import jwt
from werkzeug.security import check_password_hash, generate_password_hash


JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret-key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24
OTP_EXPIRE_MINUTES = 10


def get_password_hash(password):
    """Hash passwords before saving them."""
    return generate_password_hash(password)


def verify_password(password, password_hash):
    """Compare a plain password with the saved hash."""
    return check_password_hash(password_hash, password)


def generate_otp_code():
    """Create a 6-digit OTP for email verification during login."""
    return f"{random.SystemRandom().randint(100000, 999999)}"


def get_otp_hash(otp_code):
    """Hash the OTP before storing it in the database."""
    return generate_password_hash(otp_code)


def get_otp_expiry_time():
    """Return the OTP expiry time in UTC ISO format."""
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)
    return expires_at.isoformat()


def is_otp_expired(expires_at):
    """Check whether the stored OTP time has already passed."""
    expires_at_value = datetime.fromisoformat(expires_at)
    return datetime.now(timezone.utc) > expires_at_value


def create_token(user_id, email):
    """Create a JWT token for the logged-in user."""
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token):
    """Return the decoded JWT payload if the token is valid."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
