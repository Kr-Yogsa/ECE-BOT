import os
import sys
from datetime import datetime, timezone
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
from services.db import (
    clear_otps,
    create_otp_request,
    create_tables,
    create_user,
    find_user_by_email,
    get_latest_otp_request,
    init_db,
    mark_otp_used,
    update_user_password,
)
from services.email_service import send_otp_email
from services.hardware_service import get_hardware_list, load_hardware_data
from services.ml_service import train_models


OTP_PURPOSE_SIGNUP = "signup"
OTP_PURPOSE_RESET = "reset_password"
otp_attempt_times = {}


def load_local_env():
    """Load key=value pairs from a local .env file without extra packages."""
    env_path = os.path.join(os.path.dirname(__file__), ".env")

    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()

            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()

            if key and key not in os.environ:
                os.environ[key] = value


load_local_env()
app = Flask(__name__, static_folder="frontend", static_url_path="")
app.secret_key = os.getenv("FLASK_SECRET_KEY", os.getenv("JWT_SECRET", "change-this-secret-key"))

DATABASE_PATH = os.path.join(os.path.dirname(__file__), "chatbot.db")
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

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

        request.user_id = payload["user_id"]
        request.user_email = payload["email"]
        return route_function(*args, **kwargs)

    return wrapper


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
        now = datetime.now(timezone.utc).replace(tzinfo=None)
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
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    elapsed_seconds = (now - created_time).total_seconds()

    return elapsed_seconds < cooldown_seconds


def remember_otp_attempt(email, purpose):
    """Store the latest OTP request attempt time, even if sending fails."""
    attempt_key = f"{purpose}:{email}"
    otp_attempt_times[attempt_key] = datetime.now(timezone.utc).replace(tzinfo=None)


def get_selected_hardware_id():
    """Read the selected bot from session, or fall back to the first configured bot."""
    session_hardware = session.get("selected_bot", "").strip()
    if session_hardware in hardware_data:
        return session_hardware

    hardware_ids = list(hardware_data.keys())
    return hardware_ids[0] if hardware_ids else ""


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

    if find_user_by_email(email):
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

    if find_user_by_email(email):
        return jsonify({"error": "User already exists."}), 409

    is_valid, error_message, otp_request = verify_otp_for_purpose(email, otp, OTP_PURPOSE_SIGNUP)
    if not is_valid:
        return jsonify({"error": error_message}), 400

    user_id = create_user(name, email, get_password_hash(password))
    mark_otp_used(otp_request["id"])

    return jsonify(
        {
            "message": "Signup successful. Please login.",
            "user": {"id": user_id, "name": name, "email": email},
        }
    )


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

    token = create_token(user["id"], user["email"])

    return jsonify(
        {
            "message": "Login successful.",
            "token": token,
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
            },
        }
    )


@app.route("/auth/forgot-password/request-otp", methods=["POST"])
def request_password_reset_otp():
    """Send one OTP for password reset."""
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required."}), 400

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

    user = find_user_by_email(email)
    if not user:
        return jsonify({"error": "User not found."}), 404

    is_valid, error_message, otp_request = verify_otp_for_purpose(email, otp, OTP_PURPOSE_RESET)
    if not is_valid:
        return jsonify({"error": error_message}), 400

    update_user_password(email, get_password_hash(new_password))
    mark_otp_used(otp_request["id"])

    return jsonify({"message": "Password updated successfully. Please login."})


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

    reply = build_chat_reply(
        user_id=request.user_id,
        session_id=session_id,
        hardware_id=hardware_id,
        message=message,
        hardware_item=hardware_data[hardware_id],
        model_bundle=hardware_models.get(hardware_id),
    )

    return jsonify(reply)


if __name__ == "__main__":
    init_db(DATABASE_PATH)
    create_tables()
    load_app_data()
    app.run(host="0.0.0.0", port=5000, debug=True)
else:
    init_db(DATABASE_PATH)
    create_tables()
    load_app_data()
