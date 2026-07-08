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
            user_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(user)").fetchall()}
            if "keycloak_sub" not in user_cols:
                conn.exec_driver_sql("ALTER TABLE user ADD COLUMN keycloak_sub TEXT")

            # Good.divisible (engine may split divisible goods into fractions)
            good_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(good)").fetchall()}
            if good_cols and "divisible" not in good_cols:
                conn.exec_driver_sql("ALTER TABLE good ADD COLUMN divisible BOOLEAN DEFAULT 0")

            # Dispute.hidden_from_active (soft delete -> stays in archive)
            disp_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(dispute)").fetchall()}
            if disp_cols and "hidden_from_active" not in disp_cols:
                conn.exec_driver_sql("ALTER TABLE dispute ADD COLUMN hidden_from_active BOOLEAN DEFAULT 0")

            # User provenance: country / timezone / locale
            user_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(user)").fetchall()}
            if user_cols and "country" not in user_cols:
                conn.exec_driver_sql("ALTER TABLE user ADD COLUMN country VARCHAR")
            if user_cols and "timezone" not in user_cols:
                conn.exec_driver_sql("ALTER TABLE user ADD COLUMN timezone VARCHAR")
            if user_cols and "locale" not in user_cols:
                conn.exec_driver_sql("ALTER TABLE user ADD COLUMN locale VARCHAR")
            # Notification preferences (default on)
            for col in ("notify_email_invitations", "notify_email_meetings", "notify_email_milestones"):
                if user_cols and col not in user_cols:
                    conn.exec_driver_sql(f"ALTER TABLE user ADD COLUMN {col} BOOLEAN DEFAULT 1")

            # Dispute deadline columns
            if disp_cols and "deadline_at" not in disp_cols:
                conn.exec_driver_sql("ALTER TABLE dispute ADD COLUMN deadline_at TIMESTAMP")
            if disp_cols and "deadline_reminded" not in disp_cols:
                conn.exec_driver_sql("ALTER TABLE dispute ADD COLUMN deadline_reminded BOOLEAN DEFAULT 0")

            # DisputeAgent.claimed_entitlement_share (party's own claimed share)
            agent_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(disputeagent)").fetchall()}
            if agent_cols and "claimed_entitlement_share" not in agent_cols:
                conn.exec_driver_sql("ALTER TABLE disputeagent ADD COLUMN claimed_entitlement_share FLOAT")
            if agent_cols and "entitlement_position" not in agent_cols:
                conn.exec_driver_sql("ALTER TABLE disputeagent ADD COLUMN entitlement_position VARCHAR")
            if agent_cols and "goods_locked" not in agent_cols:
                conn.exec_driver_sql("ALTER TABLE disputeagent ADD COLUMN goods_locked BOOLEAN DEFAULT 0")

def get_session():
    with Session(engine) as session:
        yield session
