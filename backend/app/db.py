from sqlmodel import SQLModel, create_engine, Session
from .core.config import settings

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.database_url, echo=False, connect_args=connect_args)

def init_db() -> None:
    SQLModel.metadata.create_all(engine)

    # Lightweight sqlite migration (dev-friendly): add new columns if needed.
    if settings.database_url.startswith("sqlite"):
        with engine.begin() as conn:
            cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(user)").fetchall()}
            user_columns = {
                "keycloak_sub": "TEXT",
                "hashed_password": "TEXT DEFAULT ''",
                "email_verification_code": "TEXT",
                "email_verification_sent_at": "TIMESTAMP",
                "password_reset_code": "TEXT",
                "password_reset_expires_at": "TIMESTAMP",
                "password_reset_sent_at": "TIMESTAMP",
            }
            for name, ddl in user_columns.items():
                if name not in cols:
                    conn.exec_driver_sql(f"ALTER TABLE user ADD COLUMN {name} {ddl}")

def get_session():
    with Session(engine) as session:
        yield session
