from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .middleware.access_log import AccessLogMiddleware
from .core.config import settings
from .db import init_db

from .api import (
    users,
    disputes,
    agents,
    goods,
    preferences,
    proposals,
    reports,
    strategy,
    ready,
    reconciliation,
    mediation,
    chat,
    assistant,
    metrics,
    admin,
    invitations,
    notifications,
    documents,
    mediator_tools, support, auth,)

app = FastAPI(title="CREA3 API", version="0.2.0")

app.add_middleware(AccessLogMiddleware)

_cors_origins = settings.cors_list()
_cors_allow_all = "*" in _cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _cors_allow_all else _cors_origins,
    # A wildcard origin cannot be combined with credentials (the browser rejects
    # "*" + credentials). The API authenticates with Bearer tokens in the
    # Authorization header (no cookies), so disabling credentials is safe and
    # lets the frontend be served from any origin / tunnel.
    allow_credentials=not _cors_allow_all,
    # Enumerate explicitly rather than "*", since credentials are allowed.
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(users.router)
app.include_router(disputes.router)
app.include_router(agents.router)
app.include_router(goods.router)
app.include_router(preferences.router)
app.include_router(proposals.router)
app.include_router(reports.router)
app.include_router(strategy.router)
app.include_router(ready.router)
app.include_router(reconciliation.router)
app.include_router(mediation.router)
app.include_router(chat.router)          # external Legal AI proxy
app.include_router(assistant.router)     # local Ollama workflow assistant
app.include_router(metrics.router)
app.include_router(admin.router)
app.include_router(invitations.router)
app.include_router(notifications.router)
app.include_router(documents.router)
app.include_router(mediator_tools.router)
app.include_router(support.router)
app.include_router(auth.router)
