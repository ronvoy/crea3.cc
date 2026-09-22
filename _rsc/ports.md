# CREA3 — ports, folders and services

All services run as Docker containers on the deployment machine. "Host port" is what a browser or another machine connects to; "container port" is what the process listens on inside its container. Everything under `_CREA3x` is one Docker Compose project (`crea3x_*`), the chatbot and the CI/CD console are separate projects.

| Host port | Container port | Service (container) | Folder | What runs | Started by |
|---|---|---|---|---|---|
| **8000** | 8000 | CREA3 platform — API **and** SPA (`crea3x-backend`) | `_CREA3x/backend` (+ `_CREA3x/frontend/dist`) | `uvicorn app.main:app --reload` (FastAPI); serves the built React app from `frontend/dist` and the REST API under `/api` | `_CREA3x/run_be.sh` |
| 5173 | 5173 | Vite dev server with HMR (`crea3x-frontend`) — *development only* | `_CREA3x/frontend` | `vite --host` (proxies `/api` → `:8000`) | `_CREA3x/run_fe.sh` |
| 8080 | 8080 | Keycloak — identity provider (`crea3x-keycloak-1`) | `_CREA3x/infra/keycloak` (realm import) | Keycloak server (OIDC: registration, login, roles); `keycloak-init` applies client/SMTP settings once | `run_be.sh` → `docker compose up -d db keycloak mailpit` |
| — (internal) | 5432 | PostgreSQL for Keycloak (`crea3x-db-1`) | — | `postgres:16-alpine` (Keycloak's own database; the platform uses SQLite `backend/crea3.db` by default) | compose |
| 1025 | 1025 | Mailpit SMTP sink (`crea3x-mailpit-1`) — *development only* | — | captures outgoing mail when `SMTP_HOST=mailpit` / `localhost:1025` | compose |
| 8025 | 8025 | Mailpit web inbox | — | UI to read captured mail | compose |
| **8094** | 8094 | Legal AI chatbot (`crea3-chatbot-backend-1`) | `_CREA3-Chatbot/backend` | `uvicorn main:app` (FastAPI RAG service: `/chat`, `/chat/stream`, `/sources`, `/cases/retrieve`, `/health`); the platform calls it via `LEGAL_AI_URL` | `_CREA3-Chatbot/run_chatbot.sh` |
| **8088** (or next free) | 8088 | CI/CD console (`crea3-cicd`) | `_CICD` | `python3 cicd.py` — token-protected HTTP API + single-page UI to pull/checkout branches, manage stashes, restart the platform and the chatbot, receive GitHub webhooks | `_CICD/run_cicd.sh` |
| 11434 | 11434 | Ollama (optional local LLM, on the host or the external `api` network) | — | `ollama serve`; reached by the backend as `PRIMARY_LLM_URL` / `OLLAMA_BASE_URL` | host / external |
| 8002 | 8000 | Platform API when started with `docker compose up` instead of `run_be.sh` (`backend` service) | `_CREA3x/backend` | same as :8000 | `docker compose up -d --build` (production layout) |
| 3010 | 80 | nginx serving the SPA + proxying `/api` (`frontend` service) | `_CREA3x/frontend` (Dockerfile, nginx conf) | nginx | `docker compose up -d --build` (production layout) |
| 443 / 80 | — | Public entry point `https://crea3.cc` (cPanel) | repo root: `index.php`, `.htaccess` (or `passenger_wsgi.py`) | PHP reverse proxy: every request is fetched server-side from the stored target (tunnel/VPS URL) and streamed back, so the browser only sees crea3.cc | web host |

## Notes

- `run_be.sh` is the everyday way to run the platform: it builds the SPA into `frontend/dist`, builds the backend image, starts the infra (db, keycloak, mailpit) and runs `crea3x-backend` on **:8000** with `backend/` bind-mounted (hot reload). With `CREA3_DETACH=1` it starts the container in the background and returns — that is how the CI/CD console restarts it.
- `run_be.sh` reads `_CICD/.env` (if the console has been started) and passes `CICD_URL` / `CICD_PORT` / `CICD_TOKEN` to the backend, so the admin panel's **System → CI/CD** block can embed the console. From inside containers the host is reached as `host.docker.internal`.
- The chatbot's `run_chatbot.sh` builds and starts its compose project on **:8094** and waits for `/health` (`CHATBOT_HEALTH_HOST` overrides the host it polls, used by the console).
- Port overrides: `KEYCLOAK_PORT`, `BACKEND_PORT`, `FRONTEND_PORT` in `_CREA3x/.env`; `BACKEND_PORT` in `_CREA3-Chatbot/.env`; `CICD_PORT` in `_CICD/.env` (chosen automatically by `run_cicd.sh`).
- Internal-only endpoints: the platform reaches Keycloak as `http://keycloak:8080` and Ollama as `http://host.docker.internal:11434`; the CI/CD console reaches nothing except the Docker socket and the repository, and is itself reached by the backend at `http://host.docker.internal:<CICD_PORT>`.
