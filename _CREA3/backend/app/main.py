import os

from .api import admin_panel, app_config, google_oauth, rag
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select

from .middleware.access_log import AccessLogMiddleware
from .core.config import settings
from .db import init_db
from .models import User
from .core.security import hash_password

from .api import (
    auth,
    users,
    disputes,
    agents,
    goods,
    preferences,
    proposals,
    reports,
    notifications,
    strategy,
    ready,
    mediation,
    chat,
    metrics,
    stats,
    admin,
    admin_ui,
    invitations,
    db_browser,
)

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
app.include_router(google_oauth.router)
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

app.include_router(invitations.router)
app.include_router(db_browser.router)
app.include_router(rag.router)
app.include_router(app_config.router)
app.include_router(admin_panel.router)


# ── Serve the built frontend (single-origin: app + API on the same host) ──────────
# Enabled when FRONTEND_DIST_DIR points at a Vite `dist` build. This lets the whole
# app be reached through ONE URL/port (ideal for Cloudflare/serveo tunnels and
# simple prod), so the browser calls the API at a relative path with no CORS or
# mixed-content problems.
_DIST = os.path.abspath(settings.frontend_dist_dir) if settings.frontend_dist_dir else ""
if _DIST and os.path.isdir(_DIST):
    _assets = os.path.join(_DIST, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    _index = os.path.join(_DIST, "index.html")
    # Paths owned by the backend — never overridden by the SPA fallback.
    _RESERVED = ("api/", "api", "dbms", "docs", "redoc", "openapi.json", "health")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        if full_path.startswith(_RESERVED):
            raise HTTPException(status_code=404)
        # Serve a real static file when it exists (e.g. favicon), else index.html
        # so client-side routes (/login, /administrator, …) load the SPA.
        candidate = os.path.normpath(os.path.join(_DIST, full_path))
        if candidate.startswith(_DIST) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(_index)


def seed_mock_mediators():
    # Creates mock mediator users (idempotent)
    mediators = [
        # NOTE: `.local` domains are rejected by `email-validator` (used by Pydantic's EmailStr),
        # so use a normal domain to avoid response-model validation errors.
        {"email": "mediator1@example.com", "username": "mediator1", "password": "mediator123"},
        {"email": "mediator2@example.com", "username": "mediator2", "password": "mediator123"},
        {"email": "mediator3@example.com", "username": "mediator3", "password": "mediator123"},
    ]
    from .db import engine

    with Session(engine) as session:
        for m in mediators:
            existing = session.exec(select(User).where(User.email == m["email"])).first()
            if existing:
                continue
            u = User(
                email=m["email"],
                username=m["username"],
                hashed_password=hash_password(m["password"]),
                role="mediator",
                email_verified=True,
            )
            session.add(u)
        session.commit()
