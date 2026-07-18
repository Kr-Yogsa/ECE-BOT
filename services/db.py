import os
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text, create_engine, inspect, text
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from sqlalchemy.orm import declarative_base, relationship, scoped_session, sessionmaker


Base = declarative_base()
engine = None
SessionLocal = None
IST_TIMEZONE = ZoneInfo("Asia/Kolkata")
LOGGER = logging.getLogger(__name__)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    role = Column(String(50), nullable=False, default="user")
    is_active = Column(Integer, nullable=False, default=1)
    email_verified = Column(Integer, nullable=False, default=1)
    created_by_user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(Text, nullable=False)


class OtpRequest(Base):
    __tablename__ = "otp_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False)
    otp_hash = Column(Text, nullable=False)
    purpose = Column(String(100), nullable=False)
    expires_at = Column(Text, nullable=False)
    is_used = Column(Integer, nullable=False, default=0)
    created_at = Column(Text, nullable=False)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    hardware_id = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    created_at = Column(Text, nullable=False)
    updated_at = Column(Text, nullable=False)

    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False)
    role = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    response_source = Column(String(100))
    confidence = Column(Float)
    created_at = Column(Text, nullable=False)

    session = relationship("ChatSession", back_populates="messages")


class MachineTelemetry(Base):
    __tablename__ = "machine_telemetry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(String(100), nullable=False, index=True)
    temperature = Column(Float)
    humidity = Column(Float)
    vibration = Column(Float)
    proximity = Column(Float)
    source_topic = Column(String(255))
    recorded_at = Column(Text, nullable=False)
    created_at = Column(Text, nullable=False)


class MachineLiveStream(Base):
    __tablename__ = "machine_live_streams"

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(String(100), unique=True, nullable=False, index=True)
    stream_url = Column(Text, nullable=False)
    updated_at = Column(Text, nullable=False)
    source = Column(String(100))


class MotorStatus(Base):
    __tablename__ = "motor_status"

    id = Column(Integer, primary_key=True, autoincrement=True)
    machine_id = Column(String(100), nullable=False, index=True)
    state = Column(Integer, nullable=False)
    recorded_at = Column(Text, nullable=False)
    created_at = Column(Text, nullable=False)


def normalize_database_url(database_url):
    """Convert simple database URLs into SQLAlchemy-ready URLs."""
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)

    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)

    return database_url


def init_db():
    """Initialize SQLAlchemy using the configured Postgres DATABASE_URL."""
    global engine, SessionLocal

    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is required. Local SQLite fallback has been removed.")

    engine = create_engine(
        normalize_database_url(database_url),
        future=True,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_timeout=15,
        pool_use_lifo=True,
        pool_size=3,
        max_overflow=5,
        connect_args={
            "connect_timeout": 10,
            "application_name": "ece-bot",
        },
    )

    SessionLocal = scoped_session(sessionmaker(bind=engine, autoflush=False, autocommit=False))


def get_now():
    """Return timestamps in Indian Standard Time for display in Supabase."""
    return datetime.now(IST_TIMEZONE).isoformat()


def get_session():
    return SessionLocal()


def close_session_safely(db):
    """Close a session without crashing the request if the DB server already dropped it."""
    if db is None:
        return

    try:
        db.close()
    except SQLAlchemyError:
        try:
            db.invalidate()
        except Exception:
            pass

        try:
            SessionLocal.remove()
        except Exception:
            pass

        LOGGER.warning("Database session close failed after connection drop.", exc_info=True)


def to_dict(model, fields):
    return {field: getattr(model, field) for field in fields}


def create_tables():
    """Create all database tables, tolerating concurrent app worker startup."""
    try:
        Base.metadata.create_all(bind=engine)
    except OperationalError as error:
        if "already exists" not in str(error).lower():
            raise

    ensure_compatible_schema()


def ensure_compatible_schema():
    """Add missing columns for older deployed databases without destructive changes."""
    inspector = inspect(engine)

    if "users" in inspector.get_table_names():
        existing_user_columns = {column["name"] for column in inspector.get_columns("users")}
        user_alter_statements = []

        if "role" not in existing_user_columns:
            user_alter_statements.append("ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user'")

        if "is_active" not in existing_user_columns:
            user_alter_statements.append("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")

        if "email_verified" not in existing_user_columns:
            user_alter_statements.append("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1")

        if "created_by_user_id" not in existing_user_columns:
            user_alter_statements.append("ALTER TABLE users ADD COLUMN created_by_user_id INTEGER")

        if user_alter_statements:
            with engine.begin() as connection:
                for statement in user_alter_statements:
                    connection.execute(text(statement))

    if "chat_messages" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("chat_messages")}
    alter_statements = []

    if "response_source" not in existing_columns:
        alter_statements.append("ALTER TABLE chat_messages ADD COLUMN response_source VARCHAR(100)")

    if "confidence" not in existing_columns:
        dialect_name = engine.dialect.name
        confidence_type = "DOUBLE PRECISION" if dialect_name == "postgresql" else "FLOAT"
        alter_statements.append(f"ALTER TABLE chat_messages ADD COLUMN confidence {confidence_type}")

    if not alter_statements:
        alter_statements = []

    with engine.begin() as connection:
        for statement in alter_statements:
            connection.execute(text(statement))

    if "machine_telemetry" not in inspector.get_table_names():
        return

    telemetry_columns = {column["name"] for column in inspector.get_columns("machine_telemetry")}
    telemetry_statements = []

    if "source_topic" not in telemetry_columns:
        telemetry_statements.append("ALTER TABLE machine_telemetry ADD COLUMN source_topic VARCHAR(255)")

    if "vibration" not in telemetry_columns:
        dialect_name = engine.dialect.name
        number_type = "DOUBLE PRECISION" if dialect_name == "postgresql" else "FLOAT"
        telemetry_statements.append(f"ALTER TABLE machine_telemetry ADD COLUMN vibration {number_type}")

    if "proximity" not in telemetry_columns:
        dialect_name = engine.dialect.name
        number_type = "DOUBLE PRECISION" if dialect_name == "postgresql" else "FLOAT"
        telemetry_statements.append(f"ALTER TABLE machine_telemetry ADD COLUMN proximity {number_type}")

    if "recorded_at" not in telemetry_columns:
        telemetry_statements.append(
            "ALTER TABLE machine_telemetry ADD COLUMN recorded_at TEXT NOT NULL DEFAULT ''"
        )

    if telemetry_statements:
        with engine.begin() as connection:
            for statement in telemetry_statements:
                connection.execute(text(statement))


def create_machine_telemetry(
    machine_id,
    temperature=None,
    humidity=None,
    vibration=None,
    proximity=None,
    source_topic=None,
    recorded_at=None,
):
    db = get_session()
    now = get_now()
    telemetry_recorded_at = recorded_at or datetime.now(timezone.utc).isoformat()
    telemetry = MachineTelemetry(
        machine_id=machine_id,
        temperature=temperature,
        humidity=humidity,
        vibration=vibration,
        proximity=proximity,
        source_topic=source_topic,
        recorded_at=telemetry_recorded_at,
        created_at=now,
    )
    db.add(telemetry)
    db.commit()
    db.refresh(telemetry)
    close_session_safely(db)
    return telemetry.id


def get_latest_machine_telemetry(machine_id):
    db = get_session()
    telemetry = (
        db.query(MachineTelemetry)
        .filter(MachineTelemetry.machine_id == machine_id)
        .order_by(MachineTelemetry.recorded_at.desc(), MachineTelemetry.id.desc())
        .first()
    )
    close_session_safely(db)

    if not telemetry:
        return None

    return to_dict(
        telemetry,
        [
            "id",
            "machine_id",
            "temperature",
            "humidity",
            "vibration",
            "proximity",
            "source_topic",
            "recorded_at",
            "created_at",
        ],
    )


def create_motor_status(machine_id, state, recorded_at=None):
    db = get_session()
    now = get_now()
    recorded_time = recorded_at or datetime.now(timezone.utc).isoformat()

    motor_status = MotorStatus(
        machine_id=machine_id,
        state=state,
        recorded_at=recorded_time,
        created_at=now
    )
    db.add(motor_status)
    db.commit()
    db.refresh(motor_status)
    close_session_safely(db)
    return motor_status.id


def get_latest_motor_status(machine_id):
    db = get_session()
    status = (
        db.query(MotorStatus)
        .filter(MotorStatus.machine_id == machine_id)
        .order_by(MotorStatus.recorded_at.desc(), MotorStatus.id.desc())
        .first()
    )
    close_session_safely(db)
    if not status:
        return None
    return to_dict(status, ["id", "machine_id", "state", "recorded_at", "created_at"])


def get_machine_live_stream(machine_id):
    db = get_session()
    stream = (
        db.query(MachineLiveStream)
        .filter(MachineLiveStream.machine_id == machine_id)
        .first()
    )
    close_session_safely(db)

    if not stream:
        return None

    return to_dict(stream, ["id", "machine_id", "stream_url", "updated_at", "source"])


def upsert_machine_live_stream(machine_id, stream_url, source="raspberry_pi"):
    db = get_session()
    now = get_now()
    stream = (
        db.query(MachineLiveStream)
        .filter(MachineLiveStream.machine_id == machine_id)
        .first()
    )

    if stream:
        stream.stream_url = stream_url
        stream.updated_at = now
        stream.source = source
    else:
        stream = MachineLiveStream(
            machine_id=machine_id,
            stream_url=stream_url,
            updated_at=now,
            source=source,
        )
        db.add(stream)

    db.commit()
    db.refresh(stream)
    result = to_dict(stream, ["id", "machine_id", "stream_url", "updated_at", "source"])
    close_session_safely(db)
    return result


def list_machine_telemetry(machine_id, limit=100):
    db = get_session()
    rows = (
        db.query(MachineTelemetry)
        .filter(MachineTelemetry.machine_id == machine_id)
        .order_by(MachineTelemetry.recorded_at.desc(), MachineTelemetry.id.desc())
        .limit(limit)
        .all()
    )
    close_session_safely(db)
    return [
        to_dict(
            row,
            [
                "id",
                "machine_id",
                "temperature",
                "humidity",
                "vibration",
                "proximity",
                "source_topic",
                "recorded_at",
                "created_at",
            ],
        )
        for row in rows
    ]


def delete_old_machine_telemetry(machine_id, keep_latest=5000):
    db = get_session()
    retained_ids = [
        row.id
        for row in (
            db.query(MachineTelemetry.id)
            .filter(MachineTelemetry.machine_id == machine_id)
            .order_by(MachineTelemetry.recorded_at.desc(), MachineTelemetry.id.desc())
            .limit(keep_latest)
            .all()
        )
    ]

    if retained_ids:
        db.query(MachineTelemetry).filter(
            MachineTelemetry.machine_id == machine_id,
            ~MachineTelemetry.id.in_(retained_ids),
        ).delete(synchronize_session=False)
        db.commit()

    close_session_safely(db)


def build_machine_summary(machine_id, window_start):
    db = get_session()
    summary = db.execute(
        text(
            """
            SELECT
                COUNT(*) AS reading_count,
                AVG(temperature) AS avg_temperature,
                MIN(temperature) AS min_temperature,
                MAX(temperature) AS max_temperature,
                AVG(humidity) AS avg_humidity,
                MIN(humidity) AS min_humidity,
                MAX(humidity) AS max_humidity,
                AVG(vibration) AS avg_vibration,
                MIN(vibration) AS min_vibration,
                MAX(vibration) AS max_vibration,
                AVG(proximity) AS avg_proximity,
                MIN(proximity) AS min_proximity,
                MAX(proximity) AS max_proximity,
                MAX(NULLIF(recorded_at, '')::timestamptz) AS latest_recorded_at
            FROM machine_telemetry
            WHERE machine_id = :machine_id
              AND NULLIF(recorded_at, '') IS NOT NULL
              AND NULLIF(recorded_at, '')::timestamptz >= :window_start
            """
        ),
        {"machine_id": machine_id, "window_start": window_start},
    ).mappings().first()
    close_session_safely(db)

    if not summary:
        return {
            "reading_count": 0,
            "avg_temperature": None,
            "min_temperature": None,
            "max_temperature": None,
            "avg_humidity": None,
            "min_humidity": None,
            "max_humidity": None,
            "avg_vibration": None,
            "min_vibration": None,
            "max_vibration": None,
            "avg_proximity": None,
            "min_proximity": None,
            "max_proximity": None,
            "latest_recorded_at": None,
        }

    return dict(summary)


def get_machine_dashboard(machine_id):
    now_utc = datetime.now(timezone.utc)
    now_ist = datetime.now(IST_TIMEZONE)
    start_of_today_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_yesterday_ist = start_of_today_ist - timedelta(days=1)
    end_of_yesterday_ist = start_of_today_ist

    summary_windows = {
        "last_1_minute": now_utc - timedelta(minutes=1),
        "last_1_hour": now_utc - timedelta(hours=1),
        "today": start_of_today_ist.astimezone(timezone.utc),
        "yesterday": start_of_yesterday_ist.astimezone(timezone.utc),
    }

    summaries = {
        key: build_machine_summary(machine_id, window_start)
        for key, window_start in summary_windows.items()
    }
    yesterday_summary = summaries["yesterday"]
    db = get_session()
    yesterday_filtered = db.execute(
        text(
            """
            SELECT
                COUNT(*) AS reading_count,
                AVG(temperature) AS avg_temperature,
                MIN(temperature) AS min_temperature,
                MAX(temperature) AS max_temperature,
                AVG(humidity) AS avg_humidity,
                MIN(humidity) AS min_humidity,
                MAX(humidity) AS max_humidity,
                AVG(vibration) AS avg_vibration,
                MIN(vibration) AS min_vibration,
                MAX(vibration) AS max_vibration,
                AVG(proximity) AS avg_proximity,
                MIN(proximity) AS min_proximity,
                MAX(proximity) AS max_proximity,
                MAX(NULLIF(recorded_at, '')::timestamptz) AS latest_recorded_at
            FROM machine_telemetry
            WHERE machine_id = :machine_id
              AND NULLIF(recorded_at, '') IS NOT NULL
              AND NULLIF(recorded_at, '')::timestamptz >= :window_start
              AND NULLIF(recorded_at, '')::timestamptz < :window_end
            """
        ),
        {
            "machine_id": machine_id,
            "window_start": start_of_yesterday_ist.astimezone(timezone.utc),
            "window_end": end_of_yesterday_ist.astimezone(timezone.utc),
        },
    ).mappings().first()
    close_session_safely(db)

    if yesterday_filtered:
        summaries["yesterday"] = dict(yesterday_filtered)

    return {"summaries": summaries, "trend": []}


def create_user(
    name,
    email,
    password_hash,
    role="user",
    is_active=True,
    email_verified=True,
    created_by_user_id=None,
):
    db = get_session()
    user = User(
        name=name,
        email=email,
        password_hash=password_hash,
        role=role,
        is_active=1 if is_active else 0,
        email_verified=1 if email_verified else 0,
        created_by_user_id=created_by_user_id,
        created_at=get_now(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    close_session_safely(db)
    return user.id


def update_user_password(email, password_hash):
    db = get_session()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        close_session_safely(db)
        return False

    user.password_hash = password_hash
    db.commit()
    close_session_safely(db)
    return True


def update_user_account_setup(user_id, name, password_hash, email_verified=True):
    db = get_session()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        close_session_safely(db)
        return False

    user.name = name
    user.password_hash = password_hash
    user.email_verified = 1 if email_verified else 0
    db.commit()
    close_session_safely(db)
    return True


def update_user_status(user_id, is_active):
    db = get_session()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        close_session_safely(db)
        return False

    user.is_active = 1 if is_active else 0
    db.commit()
    close_session_safely(db)
    return True


def update_user_role(user_id, role):
    db = get_session()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        close_session_safely(db)
        return False

    user.role = role
    db.commit()
    close_session_safely(db)
    return True
def promote_user_to_operator(user_id, created_by_user_id=None, email_verified=True, is_active=True):
    """Promote an existing account to operator access and keep it usable immediately."""
    db = get_session()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        close_session_safely(db)
        return False

    user.role = "operator"
    user.is_active = 1 if is_active else 0
    user.email_verified = 1 if email_verified else 0
    user.created_by_user_id = created_by_user_id
    db.commit()
    close_session_safely(db)
    return True


def count_users_by_role(role):
    db = get_session()
    count = db.query(User).filter(User.role == role).count()
    close_session_safely(db)
    return count


def find_user_by_id(user_id):
    db = get_session()
    user = db.query(User).filter(User.id == user_id).first()
    close_session_safely(db)

    if not user:
        return None

    return to_dict(
        user,
        [
            "id",
            "name",
            "email",
            "password_hash",
            "role",
            "is_active",
            "email_verified",
            "created_by_user_id",
            "created_at",
        ],
    )


def find_user_by_email(email):
    db = get_session()
    user = db.query(User).filter(User.email == email).first()
    close_session_safely(db)

    if not user:
        return None

    return to_dict(
        user,
        [
            "id",
            "name",
            "email",
            "password_hash",
            "role",
            "is_active",
            "email_verified",
            "created_by_user_id",
            "created_at",
        ],
    )


def list_users_by_role(role):
    db = get_session()
    users = (
        db.query(User)
        .filter(User.role == role)
        .order_by(User.created_at.desc(), User.id.desc())
        .all()
    )
    close_session_safely(db)
    return [
        to_dict(
            user,
            ["id", "name", "email", "role", "is_active", "email_verified", "created_by_user_id", "created_at"],
        )
        for user in users
    ]


def delete_user_by_id(user_id):
    db = get_session()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        close_session_safely(db)
        return False

    session_ids = [item.id for item in db.query(ChatSession.id).filter(ChatSession.user_id == user_id).all()]

    if session_ids:
        db.query(ChatMessage).filter(ChatMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
        db.query(ChatSession).filter(ChatSession.id.in_(session_ids)).delete(synchronize_session=False)

    db.delete(user)
    db.commit()
    close_session_safely(db)
    return True


def clear_otps(email, purpose):
    db = get_session()
    db.query(OtpRequest).filter(OtpRequest.email == email, OtpRequest.purpose == purpose).delete()
    db.commit()
    close_session_safely(db)


def create_otp_request(email, otp_hash, purpose, expires_at):
    db = get_session()
    otp = OtpRequest(
        email=email,
        otp_hash=otp_hash,
        purpose=purpose,
        expires_at=expires_at,
        is_used=0,
        created_at=get_now(),
    )
    db.add(otp)
    db.commit()
    db.refresh(otp)
    close_session_safely(db)
    return otp.id


def get_latest_otp_request(email, purpose):
    db = get_session()
    otp = (
        db.query(OtpRequest)
        .filter(OtpRequest.email == email, OtpRequest.purpose == purpose)
        .order_by(OtpRequest.id.desc())
        .first()
    )
    close_session_safely(db)

    if not otp:
        return None

    return to_dict(otp, ["id", "email", "otp_hash", "purpose", "expires_at", "is_used", "created_at"])


def mark_otp_used(otp_id):
    db = get_session()
    otp = db.query(OtpRequest).filter(OtpRequest.id == otp_id).first()
    if otp:
        otp.is_used = 1
        db.commit()
    close_session_safely(db)


def create_chat_session(user_id, hardware_id, title):
    db = get_session()
    now = get_now()
    session = ChatSession(
        user_id=user_id,
        hardware_id=hardware_id,
        title=title,
        created_at=now,
        updated_at=now,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    close_session_safely(db)
    return session.id


def get_chat_session(session_id, user_id):
    db = get_session()
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == user_id)
        .first()
    )
    close_session_safely(db)

    if not session:
        return None

    return to_dict(session, ["id", "user_id", "hardware_id", "title", "created_at", "updated_at"])


def add_chat_message(session_id, role, message, response_source=None, confidence=None):
    db = get_session()
    now = get_now()
    chat_message = ChatMessage(
        session_id=session_id,
        role=role,
        message=message,
        response_source=response_source,
        confidence=confidence,
        created_at=now,
    )
    db.add(chat_message)

    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session:
        session.updated_at = now

    db.commit()
    close_session_safely(db)


def get_chat_sessions(user_id):
    db = get_session()
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc(), ChatSession.id.desc())
        .all()
    )
    close_session_safely(db)
    return [
        to_dict(session, ["id", "hardware_id", "title", "created_at", "updated_at"])
        for session in sessions
    ]


def get_chat_messages(session_id, user_id):
    db = get_session()
    messages = (
        db.query(ChatMessage)
        .join(ChatSession, ChatSession.id == ChatMessage.session_id)
        .filter(ChatMessage.session_id == session_id, ChatSession.user_id == user_id)
        .order_by(ChatMessage.id.asc())
        .all()
    )
    close_session_safely(db)
    return [
        to_dict(message, ["id", "role", "message", "response_source", "confidence", "created_at"])
        for message in messages
    ]
