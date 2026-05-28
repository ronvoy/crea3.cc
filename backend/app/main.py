from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .middleware.access_log import AccessLogMiddleware
from .core.config import settings
from .db import init_db
from sqlmodel import Session, select
from .models import User
from .core.security import hash_password
from .api import auth, users, disputes, agents, goods, preferences, proposals, reports, notifications, strategy, ready, mediation, chat, metrics, stats, admin, admin_ui, db_browser

app = FastAPI(title="CREA3 Recreated API", version="0.1.0")

app.add_middleware(AccessLogMiddleware)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()
    seed_mock_mediators()

@app.get("/health")
def health():
    return {"ok": True}

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(disputes.router)
app.include_router(agents.router)
app.include_router(goods.router)
app.include_router(preferences.router)
app.include_router(proposals.router)
app.include_router(reports.router)
app.include_router(strategy.router)
app.include_router(ready.router)
app.include_router(mediation.router)
app.include_router(chat.router)
app.include_router(metrics.router)
app.include_router(stats.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(admin_ui.router)
app.include_router(db_browser.router)


def seed_mock_mediators():
    # Creates mock mediator users (idempotent)
    mediators = [
        # NOTE: `.local` domains are rejected by `email-validator` (used by Pydantic's EmailStr),
        # so use a normal domain to avoid response-model validation errors.
        {"email":"mediator1@example.com","username":"mediator1","password":"mediator123"},
        {"email":"mediator2@example.com","username":"mediator2","password":"mediator123"},
        {"email":"mediator3@example.com","username":"mediator3","password":"mediator123"},
    ]
    from .db import engine
    with Session(engine) as session:
        for m in mediators:
            existing = session.exec(select(User).where(User.email==m["email"])).first()
            if existing:
                continue
            u = User(email=m["email"], username=m["username"], hashed_password=hash_password(m["password"]), role="mediator")
            session.add(u)
        session.commit()

