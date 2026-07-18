import os
import re
import sys
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Flask, jsonify, redirect, request, send_from_directory, session

# Make sure local packages like "services" are importable on hosting platforms.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from services.auth_service import (
    create_token,
    generate_otp_code,
    get_otp_expiry_time,
    get_otp_hash,
    get_password_hash,
    is_otp_expired,
    verify_password,
    verify_token,
)
from services.chat_service import (
    build_chat_reply,
    create_new_chat_session,
    get_user_chat_messages,
    get_user_chat_session,
    get_user_chat_sessions,
)
from services.config_service import load_local_env
from services.db import (
    clear_otps,
    count_users_by_role,
    create_otp_request,
    create_tables,
    create_user,
    delete_user_by_id,
    find_user_by_id,
    find_user_by_email,
    get_machine_dashboard,
    get_machine_live_stream,
    get_latest_otp_request,
    get_latest_machine_telemetry,
    get_latest_motor_status,
    create_motor_status,
    init_db,
    list_machine_telemetry,
    list_users_by_role,
    mark_otp_used,
    update_user_account_setup,
    update_user_password,
    promote_user_to_operator,
    upsert_machine_live_stream,
    update_user_role,
    update_user_status,
)
from services.email_service import (
    send_operator_invite_email,
    send_operator_promotion_email,
    send_operator_removal_email,
    send_otp_email,
)
from services.hardware_service import get_hardware_list, load_hardware_data
from services.ml_service import train_models


OTP_PURPOSE_SIGNUP = "signup"
OTP_PURPOSE_RESET = "reset_password"
ROLE_ADMIN = "admin"
ROLE_OPERATOR = "operator"
ROLE_USER = "user"
MACHINE_OFFLINE_AFTER_SECONDS = int(os.getenv("MACHINE_OFFLINE_AFTER_SECONDS", "15"))
otp_attempt_times = {}
EMAIL_PATTERN = re.compile(r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$", re.IGNORECASE)


def get_utc_now():
    """Return a timezone-aware UTC datetime for comparisons."""
    return datetime.now(timezone.utc)


def parse_iso_datetime(value):
    if not value:
        return None

    cleaned = str(value).strip()
    if not cleaned:
        return None

    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def build_machine_status(latest):
    if not latest:
        return {
            "is_online": False,
            "status_text": "Components are off",
            "offline_after_seconds": MACHINE_OFFLINE_AFTER_SECONDS,
        }

    recorded_at = parse_iso_datetime(latest.get("recorded_at"))
    if not recorded_at:
        return {
            "is_online": False,
            "status_text": "Components are off",
            "offline_after_seconds": MACHINE_OFFLINE_AFTER_SECONDS,
        }

    is_online = (get_utc_now() - recorded_at) <= timedelta(seconds=MACHINE_OFFLINE_AFTER_SECONDS)
    return {
        "is_online": is_online,
        "status_text": "Components are on" if is_online else "Components are off",
        "offline_after_seconds": MACHINE_OFFLINE_AFTER_SECONDS,
    }


def get_machine_live_stream_url(machine_id):
    """Return the configured live stream URL for one machine, if available."""
    normalized_machine_id = (machine_id or "").strip().lower()
    if not normalized_machine_id:
        return ""

    saved_stream = get_machine_live_stream(normalized_machine_id)
    if saved_stream and saved_stream.get("stream_url"):
        return saved_stream["stream_url"].strip()

    machine_specific_url = os.getenv(f"{normalized_machine_id.upper()}_LIVE_STREAM_URL", "").strip()
    if machine_specific_url:
        return machine_specific_url

    return os.getenv("LIVE_STREAM_URL", "").strip()


def is_valid_email(email):
    """Validate a basic email format before sending OTP or creating accounts."""
    return bool(EMAIL_PATTERN.fullmatch((email or "").strip()))


def is_valid_http_url(value):
    """Allow only public HTTP(S) stream URLs to be saved."""
    return bool(re.fullmatch(r"https?://[^\s]+", (value or "").strip(), re.IGNORECASE))


load_local_env()
app = Flask(__name__, static_folder="frontend", static_url_path="")
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.getenv("JWT_SECRET", "change-this-secret-key"))

hardware_data = {}
hardware_models = {}


def load_app_data():
    """Load hardware datasets and train the ML model for each hardware."""
    global hardware_data, hardware_models
    hardware_data = load_hardware_data()
    hardware_models = train_models(hardware_data)


def token_required(route_function):
    """Protect routes with a simple JWT check."""

    @wraps(route_function)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "").strip()

        if not token:
            return jsonify({"error": "Authorization token is required."}), 401

        payload = verify_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token."}), 401

        user = find_user_by_id(payload["user_id"])
        if not user:
            return jsonify({"error": "User account not found."}), 401

        if not user["is_active"]:
            return jsonify({"error": "Your account is deactivated. Please contact the admin."}), 403

        request.user_id = user["id"]
        request.user_email = user["email"]
        request.user_role = user["role"]
        return route_function(*args, **kwargs)

    return wrapper


def admin_required(route_function):
    """Allow only admin accounts to access the route."""

    @token_required
    @wraps(route_function)
    def wrapper(*args, **kwargs):
        if request.user_role != ROLE_ADMIN:
            return jsonify({"error": "Admin access is required."}), 403

        return route_function(*args, **kwargs)

    return wrapper


def operator_or_admin_required(route_function):
    """Allow only admin or operator accounts to access the route."""

    @token_required
    @wraps(route_function)
    def wrapper(*args, **kwargs):
        if request.user_role not in {ROLE_ADMIN, ROLE_OPERATOR}:
            return jsonify({"error": "Operator or admin access is required."}), 403

        return route_function(*args, **kwargs)

    return wrapper


def get_signup_role_for_email(existing_user):
    """Decide whether the incoming signup should become a user or complete an invited operator account."""
    if not existing_user:
        if count_users_by_role(ROLE_ADMIN) == 0:
            return ROLE_ADMIN
        return ROLE_USER

    if existing_user["role"] == ROLE_OPERATOR and not existing_user["email_verified"]:
        return ROLE_OPERATOR

    return None


def build_user_response(user):
    """Return the frontend-safe user payload."""
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "is_active": bool(user["is_active"]),
        "email_verified": bool(user["email_verified"]),
    }


def send_single_otp(email, purpose):
    """Create exactly one OTP row for the request, then send exactly one email."""
    clear_otps(email, purpose)

    otp_code = generate_otp_code()
    otp_hash = get_otp_hash(otp_code)
    expires_at = get_otp_expiry_time()
    create_otp_request(email, otp_hash, purpose, expires_at)

    is_sent, message = send_otp_email(email, otp_code, purpose)
    if not is_sent:
        clear_otps(email, purpose)

    return is_sent, message


def verify_otp_for_purpose(email, otp, purpose):
    """Check whether the latest OTP is valid for the requested purpose."""
    otp_request = get_latest_otp_request(email, purpose)

    if not otp_request:
        return False, "No OTP request found. Please request a new OTP.", None

    if otp_request["is_used"]:
        return False, "This OTP has already been used. Please request a new OTP.", None

    if is_otp_expired(otp_request["expires_at"]):
        clear_otps(email, purpose)
        return False, "OTP expired. Please request a new OTP.", None

    if not verify_password(otp, otp_request["otp_hash"]):
        return False, "Invalid OTP.", None

    return True, "OTP verified.", otp_request


def was_otp_requested_recently(email, purpose, cooldown_seconds=60):
    """Prevent repeated OTP emails inside a short cooldown window."""
    attempt_key = f"{purpose}:{email}"
    attempt_time = otp_attempt_times.get(attempt_key)

    if attempt_time:
        now = get_utc_now()
        elapsed_seconds = (now - attempt_time).total_seconds()
        if elapsed_seconds < cooldown_seconds:
            return True

    otp_request = get_latest_otp_request(email, purpose)

    if not otp_request:
        return False

    created_at = otp_request.get("created_at", "")
    if not created_at:
        return False

    created_time = datetime.fromisoformat(created_at)
    if created_time.tzinfo is None:
        created_time = created_time.replace(tzinfo=timezone.utc)

    now = get_utc_now()
    elapsed_seconds = (now - created_time).total_seconds()

    return elapsed_seconds < cooldown_seconds


def remember_otp_attempt(email, purpose):
    """Store the latest OTP request attempt time, even if sending fails."""
    attempt_key = f"{purpose}:{email}"
    otp_attempt_times[attempt_key] = get_utc_now()


def get_selected_hardware_id():
    """Read the selected bot from session, or fall back to the first configured bot."""
    session_hardware = session.get("selected_bot", "").strip()
    if session_hardware in hardware_data:
        return session_hardware

    hardware_ids = list(hardware_data.keys())
    return hardware_ids[0] if hardware_ids else ""


def get_public_signup_url():
    """Build the signup URL used inside operator invitation emails."""
    configured_base_url = os.getenv("APP_BASE_URL", "").strip().rstrip("/")
    if configured_base_url:
        return f"{configured_base_url}/signup"

    return f"{request.host_url.rstrip('/')}/signup"


def build_display_name_from_email(email):
    """Create a simple fallback display name from the email local part."""
    local_part = (email or "").split("@", 1)[0].strip()
    cleaned_name = re.sub(r"[^a-zA-Z0-9]+", " ", local_part).strip()
    return cleaned_name[:80] or "Operator"


@app.route("/")
def home_page():
    return send_from_directory(app.static_folder, "login.html")


@app.route("/machine/<hardware_id>")
def machine_login_page(hardware_id):
    """Open the login page for a specific machine barcode URL."""
    selected_hardware = hardware_id.strip().lower()

    if selected_hardware not in hardware_data:
        return jsonify({"error": "Unknown hardware selected."}), 404

    return redirect(f"/?bot={selected_hardware}")


@app.route("/signup")
def signup_page():
    return send_from_directory(app.static_folder, "signup.html")


@app.route("/chat-page")
def chat_page():
    return send_from_directory(app.static_folder, "chat.html")


@app.route("/auth/request-signup-otp", methods=["POST"])
def request_signup_otp():
    """Send OTP only for account creation."""
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required."}), 400

    if not is_valid_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    existing_user = find_user_by_email(email)
    signup_role = get_signup_role_for_email(existing_user)
    if not signup_role:
        return jsonify({"error": "User already exists."}), 409

    if was_otp_requested_recently(email, OTP_PURPOSE_SIGNUP):
        return jsonify({"error": "OTP already sent. Please wait 1 minute before requesting again."}), 429

    remember_otp_attempt(email, OTP_PURPOSE_SIGNUP)
    is_sent, message = send_single_otp(email, OTP_PURPOSE_SIGNUP)
    if not is_sent:
        return jsonify({"error": message}), 500

    return jsonify({"message": "OTP sent to your email."})


@app.route("/auth/signup", methods=["POST"])
def signup():
    """Create a new user account after OTP verification."""
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()
    otp = data.get("otp", "").strip()

    if not name or not email or not password or not otp:
        return jsonify({"error": "Name, email, password, and OTP are required."}), 400

    if not is_valid_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    existing_user = find_user_by_email(email)
    signup_role = get_signup_role_for_email(existing_user)
    if not signup_role:
        return jsonify({"error": "User already exists."}), 409

    is_valid, error_message, otp_request = verify_otp_for_purpose(email, otp, OTP_PURPOSE_SIGNUP)
    if not is_valid:
        return jsonify({"error": error_message}), 400

    if signup_role == ROLE_OPERATOR:
        update_user_account_setup(existing_user["id"], name, get_password_hash(password), email_verified=True)
        user = find_user_by_email(email)
    else:
        user_id = create_user(
            name,
            email,
            get_password_hash(password),
            role=signup_role,
            is_active=True,
            email_verified=True,
        )
        user = find_user_by_id(user_id)

    mark_otp_used(otp_request["id"])

    return jsonify(
        {
            "message": "Signup successful. Please login.",
            "user": build_user_response(user),
        }
    )


@app.route("/auth/verify-signup-otp", methods=["POST"])
def verify_signup_otp():
    """Verify signup OTP before allowing password creation."""
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    otp = data.get("otp", "").strip()

    if not email or not otp:
        return jsonify({"error": "Email and OTP are required."}), 400

    if not is_valid_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    existing_user = find_user_by_email(email)
    signup_role = get_signup_role_for_email(existing_user)
    if not signup_role:
        return jsonify({"error": "User already exists."}), 409

    is_valid, error_message, _ = verify_otp_for_purpose(email, otp, OTP_PURPOSE_SIGNUP)
    if not is_valid:
        return jsonify({"error": error_message}), 400

    return jsonify({"message": "OTP verified. You can now create your password."})


@app.route("/auth/login", methods=["POST"])
def login():
    """Simple login using email and password only."""
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "").strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    user = find_user_by_email(email)
    if not user or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid email or password."}), 401

    if user["role"] == ROLE_OPERATOR and not user["email_verified"]:
        return jsonify({"error": "Complete your invited operator signup first."}), 403

    if not user["is_active"]:
        return jsonify({"error": "Your account is deactivated. Please contact the admin."}), 403

    token = create_token(user["id"], user["email"], user["role"])

    return jsonify(
        {
            "message": "Login successful.",
            "token": token,
            "user": build_user_response(user),
        }
    )


@app.route("/auth/session", methods=["GET"])
@token_required
def auth_session():
    """Validate the current token and return the latest user profile."""
    user = find_user_by_id(request.user_id)
    return jsonify({"user": build_user_response(user)})


@app.route("/auth/forgot-password/request-otp", methods=["POST"])
def request_password_reset_otp():
    """Send one OTP for password reset."""
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required."}), 400

    if not is_valid_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    if not find_user_by_email(email):
        return jsonify({"error": "User not found."}), 404

    if was_otp_requested_recently(email, OTP_PURPOSE_RESET):
        return jsonify({"error": "OTP already sent. Please wait 1 minute before requesting again."}), 429

    remember_otp_attempt(email, OTP_PURPOSE_RESET)
    is_sent, message = send_single_otp(email, OTP_PURPOSE_RESET)
    if not is_sent:
        return jsonify({"error": message}), 500

    return jsonify({"message": "OTP sent to your email."})


@app.route("/auth/forgot-password/verify-otp", methods=["POST"])
def verify_password_reset_otp():
    """Verify OTP before showing the new password form."""
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    otp = data.get("otp", "").strip()

    if not email or not otp:
        return jsonify({"error": "Email and OTP are required."}), 400

    if not is_valid_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    is_valid, error_message, _ = verify_otp_for_purpose(email, otp, OTP_PURPOSE_RESET)
    if not is_valid:
        return jsonify({"error": error_message}), 400

    return jsonify({"message": "OTP verified. You can set a new password now."})


@app.route("/auth/forgot-password/reset", methods=["POST"])
def reset_password():
    """Set a new password after verifying the reset OTP."""
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    otp = data.get("otp", "").strip()
    new_password = data.get("new_password", "").strip()

    if not email or not otp or not new_password:
        return jsonify({"error": "Email, OTP, and new password are required."}), 400

    if not is_valid_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    user = find_user_by_email(email)
    if not user:
        return jsonify({"error": "User not found."}), 404

    is_valid, error_message, otp_request = verify_otp_for_purpose(email, otp, OTP_PURPOSE_RESET)
    if not is_valid:
        return jsonify({"error": error_message}), 400

    update_user_password(email, get_password_hash(new_password))
    mark_otp_used(otp_request["id"])

    return jsonify({"message": "Password updated successfully. Please login."})


@app.route("/admin/operators", methods=["GET"])
@admin_required
def list_operators():
    """Return all operator accounts for the admin panel."""
    current_admin = find_user_by_id(request.user_id)
    return jsonify(
        {
            "current_admin": build_user_response(current_admin),
            "operators": list_users_by_role(ROLE_OPERATOR),
        }
    )


@app.route("/admin/operators", methods=["POST"])
@admin_required
def create_operator():
    """Create or upgrade an operator account and notify the target email."""
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required."}), 400

    if not is_valid_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    admin_user = find_user_by_id(request.user_id)
    admin_name = admin_user["name"] if admin_user else "Admin"
    placeholder_name = "Operator"
    existing_user = find_user_by_email(email)
    if existing_user:
        if existing_user["role"] == ROLE_ADMIN:
            return jsonify({"error": "Admin accounts cannot be converted into operators."}), 409

        if existing_user["role"] == ROLE_OPERATOR:
            if existing_user["email_verified"]:
                promote_user_to_operator(existing_user["id"], request.user_id, email_verified=True, is_active=True)
                updated_operator = find_user_by_id(existing_user["id"])
                is_sent, email_message = send_operator_promotion_email(
                    email,
                    updated_operator["name"] or placeholder_name,
                    admin_name,
                )
                if not is_sent:
                    return jsonify({"error": email_message}), 500

                return jsonify(
                    {
                        "message": "Existing operator access confirmed and notification email sent.",
                        "operator": build_user_response(updated_operator),
                    }
                ), 200

            signup_url = get_public_signup_url()
            is_sent, email_message = send_operator_invite_email(
                email,
                existing_user["name"] or placeholder_name,
                admin_name,
                signup_url,
            )
            if not is_sent:
                return jsonify({"error": email_message}), 500

            return jsonify(
                {
                    "message": "Existing pending operator invitation email sent again.",
                    "operator": build_user_response(existing_user),
                }
            ), 200

        promote_user_to_operator(existing_user["id"], request.user_id, email_verified=True, is_active=True)
        updated_operator = find_user_by_id(existing_user["id"])
        is_sent, email_message = send_operator_promotion_email(
            email,
            updated_operator["name"] or placeholder_name,
            admin_name,
        )
        if not is_sent:
            return jsonify({"error": email_message}), 500

        return jsonify(
            {
                "message": "Existing user promoted to operator successfully.",
                "operator": build_user_response(updated_operator),
            }
        ), 200

    temp_password_hash = get_password_hash(secrets.token_urlsafe(24))
    operator_id = create_user(
        placeholder_name,
        email,
        temp_password_hash,
        role=ROLE_OPERATOR,
        is_active=True,
        email_verified=False,
        created_by_user_id=request.user_id,
    )
    operator = find_user_by_id(operator_id)
    signup_url = get_public_signup_url()
    is_sent, email_message = send_operator_invite_email(
        email,
        placeholder_name,
        admin_name,
        signup_url,
    )

    if not is_sent:
        delete_user_by_id(operator_id)
        return jsonify({"error": email_message}), 500

    return jsonify(
        {
            "message": "Operator invited successfully. Invitation email has been sent.",
            "operator": build_user_response(operator),
        }
    ), 201


@app.route("/admin/operators/<int:user_id>/status", methods=["PATCH"])
@admin_required
def update_operator_status_route(user_id):
    """Activate an operator account or remove operator access."""
    data = request.get_json() or {}

    if "is_active" not in data:
        return jsonify({"error": "is_active is required."}), 400

    operator = find_user_by_id(user_id)
    if not operator or operator["role"] != ROLE_OPERATOR:
        return jsonify({"error": "Operator not found."}), 404

    if not bool(data["is_active"]):
        admin_user = find_user_by_id(request.user_id)
        admin_name = admin_user["name"] if admin_user else "Admin"
        update_user_role(user_id, ROLE_USER)
        update_user_status(user_id, True)
        updated_user = find_user_by_id(user_id)
        is_sent, email_message = send_operator_removal_email(
            updated_user["email"],
            updated_user["name"] or "User",
            admin_name,
        )
        if not is_sent:
            return jsonify({"error": email_message}), 500

        return jsonify(
            {
                "message": "Operator access removed successfully. The account is now a normal user.",
                "operator": build_user_response(updated_user),
            }
        )

    update_user_status(user_id, bool(data["is_active"]))
    updated_operator = find_user_by_id(user_id)

    return jsonify(
        {
            "message": "Operator status updated successfully.",
            "operator": build_user_response(updated_operator),
        }
    )


@app.route("/admin/operators/<int:user_id>", methods=["DELETE"])
@admin_required
def delete_operator_route(user_id):
    """Delete an operator account only after it has been deactivated."""
    operator = find_user_by_id(user_id)
    if not operator or operator["role"] != ROLE_OPERATOR:
        return jsonify({"error": "Operator not found."}), 404

    if operator["is_active"]:
        return jsonify({"error": "Deactivate the operator before deleting the account."}), 400

    delete_user_by_id(user_id)
    return jsonify({"message": "Operator deleted successfully."})


@app.route("/hardware-list", methods=["GET"])
@token_required
def hardware_list():
    """Send the bot list to the frontend dropdown."""
    return jsonify(
        {
            "hardware": get_hardware_list(hardware_data),
            "selected_bot": get_selected_hardware_id(),
        }
    )


@app.route("/select-bot", methods=["POST"])
@token_required
def select_bot():
    """Store the selected bot in the Flask session."""
    data = request.get_json() or {}
    hardware_id = data.get("hardware_id", "").strip()

    if hardware_id not in hardware_data:
        return jsonify({"error": "Unknown hardware selected."}), 404

    session["selected_bot"] = hardware_id

    return jsonify(
        {
            "message": "Bot selected successfully.",
            "selected_bot": hardware_id,
            "selected_name": hardware_data[hardware_id]["name"],
        }
    )


@app.route("/api/machine-stats/<machine_id>", methods=["GET"])
@operator_or_admin_required
def machine_stats(machine_id):
    """Return the latest stored telemetry for one machine."""
    normalized_machine_id = (machine_id or "").strip().lower()

    if normalized_machine_id not in hardware_data:
        return jsonify({"error": "Unknown machine selected."}), 404

    latest = get_latest_machine_telemetry(normalized_machine_id)
    latest_motor = get_latest_motor_status(normalized_machine_id)
    motor_state = latest_motor["state"] if latest_motor else 0
    if latest:
        latest["motor"] = motor_state
    else:
        latest = {"motor": motor_state}

    return jsonify(
        {
            "machine_id": normalized_machine_id,
            "machine_name": hardware_data[normalized_machine_id]["name"],
            "has_data": True,
            "stats": latest,
            "status": build_machine_status(latest),
        }
    )


@app.route("/api/machine-stats/<machine_id>/dashboard", methods=["GET"])
@operator_or_admin_required
def machine_stats_dashboard(machine_id):
    """Return aggregated telemetry windows plus a short trend series for the dashboard."""
    normalized_machine_id = (machine_id or "").strip().lower()

    if normalized_machine_id not in hardware_data:
        return jsonify({"error": "Unknown machine selected."}), 404

    latest = get_latest_machine_telemetry(normalized_machine_id)
    latest_motor = get_latest_motor_status(normalized_machine_id)
    motor_state = latest_motor["state"] if latest_motor else 0
    if latest:
        latest["motor"] = motor_state
    else:
        latest = {"motor": motor_state}

    dashboard = get_machine_dashboard(normalized_machine_id)

    return jsonify(
        {
            "machine_id": normalized_machine_id,
            "machine_name": hardware_data[normalized_machine_id]["name"],
            "has_data": True,
            "latest": latest,
            "status": build_machine_status(latest),
            "summaries": dashboard["summaries"],
            "trend": dashboard["trend"],
        }
    )


@app.route("/api/machine-stats/<machine_id>/history", methods=["GET"])
@operator_or_admin_required
def machine_stats_history(machine_id):
    """Return recent telemetry history for dashboards, ML prep, and exports."""
    normalized_machine_id = (machine_id or "").strip().lower()

    if normalized_machine_id not in hardware_data:
        return jsonify({"error": "Unknown machine selected."}), 404

    try:
        limit = int(request.args.get("limit", 100))
    except ValueError:
        return jsonify({"error": "limit must be a number."}), 400

    limit = max(1, min(limit, 1000))
    history = list_machine_telemetry(normalized_machine_id, limit=limit)

    return jsonify(
        {
            "machine_id": normalized_machine_id,
            "machine_name": hardware_data[normalized_machine_id]["name"],
            "count": len(history),
            "history": history,
        }
    )


@app.route("/api/machine-control/<machine_id>", methods=["POST"])
@operator_or_admin_required
def machine_control(machine_id):
    """Publish a motor control command to the machine via MQTT and log it in the database."""
    normalized_machine_id = (machine_id or "").strip().lower()

    if normalized_machine_id not in hardware_data:
        return jsonify({"error": "Unknown machine selected."}), 404

    data = request.get_json() or {}
    motor_state = data.get("motor")

    if motor_state is None:
        return jsonify({"error": "Motor state is required."}), 400

    try:
        motor_val = int(float(motor_state))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid motor state value."}), 400

    if motor_val not in (0, 1):
        return jsonify({"error": "Motor state must be 0 or 1."}), 400

    # 1. Publish to MQTT HiveMQ broker
    try:
        from services.mqtt_service import publish_control_message
        publish_control_message(normalized_machine_id, {"motor": motor_val})
    except Exception as error:
        return jsonify({"error": f"Failed to publish control command: {str(error)}"}), 500

    # 2. Write to motor_status table
    try:
        create_motor_status(normalized_machine_id, motor_val)
    except Exception as error:
        return jsonify({"error": f"Failed to log motor status to DB: {str(error)}"}), 500

    return jsonify({"success": True, "motor": motor_val})


@app.route("/api/machine-live/<machine_id>", methods=["GET"])
@operator_or_admin_required
def machine_live(machine_id):
    """Return the configured remote live stream URL for one machine."""
    normalized_machine_id = (machine_id or "").strip().lower()

    if normalized_machine_id not in hardware_data:
        return jsonify({"error": "Unknown machine selected."}), 404

    stream_url = get_machine_live_stream_url(normalized_machine_id)

    return jsonify(
        {
            "machine_id": normalized_machine_id,
            "machine_name": hardware_data[normalized_machine_id]["name"],
            "is_configured": bool(stream_url),
            "stream_url": stream_url,
        }
    )


@app.route("/api/machine-live/<machine_id>/url", methods=["POST"])
def update_machine_live_url(machine_id):
    """Allow a Raspberry Pi boot script to publish its current tunnel URL."""
    update_token = os.getenv("MACHINE_LIVE_UPDATE_TOKEN", "").strip()
    request_token = request.headers.get("X-Live-Update-Token", "").strip()

    if not update_token:
        return jsonify({"error": "Live stream update token is not configured."}), 503

    if not secrets.compare_digest(update_token, request_token):
        return jsonify({"error": "Invalid live stream update token."}), 401

    normalized_machine_id = (machine_id or "").strip().lower()
    if normalized_machine_id not in hardware_data:
        return jsonify({"error": "Unknown machine selected."}), 404

    data = request.get_json() or {}
    stream_url = data.get("stream_url", "").strip()

    if not is_valid_http_url(stream_url):
        return jsonify({"error": "A valid http or https stream_url is required."}), 400

    saved_stream = upsert_machine_live_stream(
        normalized_machine_id,
        stream_url,
        source=data.get("source", "raspberry_pi"),
    )

    return jsonify(
        {
            "message": "Live stream URL updated successfully.",
            "machine_id": normalized_machine_id,
            "machine_name": hardware_data[normalized_machine_id]["name"],
            "stream": saved_stream,
        }
    )


@app.route("/chat/sessions", methods=["GET"])
@token_required
def chat_sessions():
    """Return chat sessions for the sidebar."""
    return jsonify({"sessions": get_user_chat_sessions(request.user_id)})


@app.route("/chat/session/<int:session_id>", methods=["GET"])
@token_required
def chat_session_messages(session_id):
    """Return all messages from one chat session."""
    chat_session = get_user_chat_session(request.user_id, session_id)
    if not chat_session:
        return jsonify({"error": "Chat session not found."}), 404

    return jsonify(
        {
            "session": chat_session,
            "messages": get_user_chat_messages(request.user_id, session_id),
        }
    )


@app.route("/chat", methods=["POST"])
@token_required
def chat():
    """Main chat endpoint used by the chat page."""
    data = request.get_json() or {}
    message = data.get("message", "").strip()
    session_id = data.get("session_id")
    hardware_id = get_selected_hardware_id()

    if not message:
        return jsonify({"error": "Message is required."}), 400

    if hardware_id not in hardware_data:
        return jsonify({"error": "Unknown hardware selected."}), 404

    if session_id:
        chat_session = get_user_chat_session(request.user_id, session_id)
        if not chat_session:
            return jsonify({"error": "Chat session not found."}), 404
        session_id = chat_session["id"]
        hardware_id = chat_session["hardware_id"]
        session["selected_bot"] = hardware_id
    else:
        session_id = create_new_chat_session(request.user_id, hardware_id, message)

    try:
        reply = build_chat_reply(
            user_id=request.user_id,
            session_id=session_id,
            hardware_id=hardware_id,
            message=message,
            hardware_item=hardware_data[hardware_id],
            model_bundle=hardware_models.get(hardware_id),
        )
        return jsonify(reply)
    except Exception:
        app.logger.exception("Chat request failed for user_id=%s session_id=%s", request.user_id, session_id)
        return jsonify({"error": "Chat service is busy right now. Please try again in a moment."}), 503


if __name__ == "__main__":
    init_db()
    create_tables()
    load_app_data()
    app.run(host="0.0.0.0", port=5000, debug=True)
else:
    init_db()
    create_tables()
    load_app_data()
