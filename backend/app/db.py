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
            if "keycloak_sub" not in cols:
                conn.exec_driver_sql("ALTER TABLE user ADD COLUMN keycloak_sub TEXT")

def get_session():
    with Session(engine) as session:
        yield session
