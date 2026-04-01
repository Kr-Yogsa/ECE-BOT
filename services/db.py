import os
from datetime import datetime

from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text, create_engine, inspect, text
from sqlalchemy.orm import declarative_base, relationship, scoped_session, sessionmaker


Base = declarative_base()
engine = None
SessionLocal = None


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
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


def normalize_database_url(database_url):
    """Convert simple database URLs into SQLAlchemy-ready URLs."""
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)

    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)

    return database_url


def init_db(database_path=None):
    """Initialize SQLAlchemy using DATABASE_URL or local SQLite."""
    global engine, SessionLocal

    database_url = os.getenv("DATABASE_URL", "").strip()

    if database_url:
        engine = create_engine(normalize_database_url(database_url), future=True, pool_pre_ping=True)
    else:
        engine = create_engine(f"sqlite:///{database_path}", future=True)

    SessionLocal = scoped_session(sessionmaker(bind=engine, autoflush=False, autocommit=False))


def get_now():
    return datetime.utcnow().isoformat()


def get_session():
    return SessionLocal()


def to_dict(model, fields):
    return {field: getattr(model, field) for field in fields}


def create_tables():
    """Create all SQLite tables."""
    Base.metadata.create_all(bind=engine)
    ensure_compatible_schema()


def ensure_compatible_schema():
    """Add missing columns for older deployed databases without destructive changes."""
    inspector = inspect(engine)

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
        return

    with engine.begin() as connection:
        for statement in alter_statements:
            connection.execute(text(statement))


def create_user(name, email, password_hash):
    db = get_session()
    user = User(name=name, email=email, password_hash=password_hash, created_at=get_now())
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user.id


def update_user_password(email, password_hash):
    db = get_session()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        db.close()
        return False

    user.password_hash = password_hash
    db.commit()
    db.close()
    return True


def find_user_by_email(email):
    db = get_session()
    user = db.query(User).filter(User.email == email).first()
    db.close()

    if not user:
        return None

    return to_dict(user, ["id", "name", "email", "password_hash", "created_at"])


def clear_otps(email, purpose):
    db = get_session()
    db.query(OtpRequest).filter(OtpRequest.email == email, OtpRequest.purpose == purpose).delete()
    db.commit()
    db.close()


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
    db.close()
    return otp.id


def get_latest_otp_request(email, purpose):
    db = get_session()
    otp = (
        db.query(OtpRequest)
        .filter(OtpRequest.email == email, OtpRequest.purpose == purpose)
        .order_by(OtpRequest.id.desc())
        .first()
    )
    db.close()

    if not otp:
        return None

    return to_dict(otp, ["id", "email", "otp_hash", "purpose", "expires_at", "is_used", "created_at"])


def mark_otp_used(otp_id):
    db = get_session()
    otp = db.query(OtpRequest).filter(OtpRequest.id == otp_id).first()
    if otp:
        otp.is_used = 1
        db.commit()
    db.close()


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
    db.close()
    return session.id


def get_chat_session(session_id, user_id):
    db = get_session()
    session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == user_id)
        .first()
    )
    db.close()

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
    db.close()


def get_chat_sessions(user_id):
    db = get_session()
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc(), ChatSession.id.desc())
        .all()
    )
    db.close()
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
    db.close()
    return [
        to_dict(message, ["id", "role", "message", "response_source", "confidence", "created_at"])
        for message in messages
    ]
