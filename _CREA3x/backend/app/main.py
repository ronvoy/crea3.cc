import os

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .middleware.access_log import AccessLogMiddleware
from .core.config import settings
from .db import init_db

from .api import (
    consent,
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
    mediator_tools, support, auth, admin_panel, admin_kb, chat_history,)

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
    # Seed the Knowledge Base 'workflow' section with the CREA3 workflow doc on
    # first run (no-op if it already has documents). Never blocks startup.
    try:
        from .core import knowledge
        from .db import engine
        from sqlmodel import Session
        with Session(engine) as _s:
            knowledge.seed_workflow_doc(_s)
    except Exception:
        pass


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
app.include_router(chat_history.router)  # per-user assistant chat history
app.include_router(metrics.router)
app.include_router(admin.router)
app.include_router(admin_panel.router)  # /admin-dashboard: Users / Mail / Database
app.include_router(admin_kb.router)     # /admin-dashboard: Knowledge Base (RAG)
app.include_router(invitations.router)
app.include_router(notifications.router)
app.include_router(documents.router)
app.include_router(mediator_tools.router)
app.include_router(support.router)
app.include_router(auth.router)
app.include_router(consent.router)   # GDPR cookie consent


# ── Reverse-proxy Keycloak under this origin (single port) ────────────────────
# So the browser reaches Keycloak at  <origin>/realms/...  and <origin>/resources/...
# instead of :8082. That lets the whole app (SPA + API + Keycloak login/verify
# links) be tunnelled through ONE port. X-Forwarded-* tell Keycloak the public
# origin so it builds correct token issuers + verification links for any domain.
_KC_INTERNAL = (settings.keycloak_internal_url or settings.keycloak_url).rstrip("/")
_KC_HOP_BY_HOP = {"content-encoding", "transfer-encoding", "content-length", "connection", "keep-alive"}


async def _proxy_keycloak(request: Request, kc_path: str) -> Response:
    fwd_headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    fwd_headers["X-Forwarded-Host"] = request.headers.get("host", "")
    fwd_headers["X-Forwarded-Proto"] = request.headers.get("x-forwarded-proto", request.url.scheme)
    if request.client:
        fwd_headers["X-Forwarded-For"] = request.client.host
    body = await request.body()
    try:
        async with httpx.AsyncClient(follow_redirects=False, timeout=30.0) as client:
            kc = await client.request(
                request.method, f"{_KC_INTERNAL}{kc_path}",
                params=request.query_params, content=body, headers=fwd_headers,
            )
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Identity provider is unreachable.")
    # Relay status + body + headers (preserving multiple Set-Cookie via raw headers).
    out = Response(content=kc.content, status_code=kc.status_code)
    out.raw_headers = [
        (k.encode("latin-1"), v.encode("latin-1"))
        for k, v in kc.headers.multi_items()
        if k.lower() not in _KC_HOP_BY_HOP
    ]
    return out


@app.api_route("/realms/{kc_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"], include_in_schema=False)
async def _kc_realms(kc_path: str, request: Request):
    return await _proxy_keycloak(request, f"/realms/{kc_path}")


@app.api_route("/resources/{kc_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
async def _kc_resources(kc_path: str, request: Request):
    return await _proxy_keycloak(request, f"/resources/{kc_path}")


# ── Serve the built frontend (single origin: app + API on http://localhost:8000)
# Enabled when FRONTEND_DIST_DIR points at a Vite `dist` build. The SPA calls the
# API at a relative path (/api) on this same origin. Keycloak stays on :8082.
_DIST = os.path.abspath(settings.frontend_dist_dir) if settings.frontend_dist_dir else ""
if _DIST and os.path.isdir(_DIST):
    _assets = os.path.join(_DIST, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    _index = os.path.join(_DIST, "index.html")
    _RESERVED = ("api/", "api", "docs", "redoc", "openapi.json", "health", "realms", "resources", "admin/")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        if full_path.startswith(_RESERVED):
            raise HTTPException(status_code=404)
        candidate = os.path.normpath(os.path.join(_DIST, full_path))
        if candidate.startswith(_DIST) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(_index)
