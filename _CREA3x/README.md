# CREA3 — Conflict Resolution with Equitative Algorithms

A web platform for **equitable division of assets** in family-law disputes
(divorce, inheritance). Parties privately value the assets; a game-theoretic
engine (Knaster method of sealed bids) produces a fair allocation plus a single
balancing payment, and the result is delivered as a professional PDF report.

| Layer | Stack | Default URL |
|-------|-------|-------------|
| **Frontend** | React + Vite + TypeScript + Tailwind | http://localhost:5173 |
| **Backend** | FastAPI + SQLModel (SQLite by default) | http://127.0.0.1:8000 |
| **Auth** | Keycloak (OIDC / PKCE), via Docker | http://localhost:8080 |
| **Email (dev)** | Mailpit (catch-all inbox) | http://localhost:8025 |
| **Workflow assistant** *(optional)* | Ollama (local LLM) | http://localhost:11434 |
| **Legal AI** *(optional)* | External RAG service | set via `LEGAL_AI_URL` |

> **TL;DR for the impatient** — see [Quick start](#quick-start). Then open
> http://localhost:5173.

---

## Table of contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Quick start](#quick-start)
4. [Detailed setup](#detailed-setup)
   - [1. Infrastructure (Keycloak + Postgres + Mailpit)](#1-infrastructure)
   - [2. Backend](#2-backend)
   - [3. Frontend](#3-frontend)
   - [4. Optional services (Ollama, Legal AI)](#4-optional-services)
5. [Running the test suite](#running-the-test-suite)
6. [Preflight — one command to check the whole app](#preflight)
7. [End-to-end smoke test (manual)](#end-to-end-smoke-test)
8. [Configuration reference](#configuration-reference)
9. [Common commands cheat-sheet](#cheat-sheet)
10. [Troubleshooting](#troubleshooting)
11. [Project layout](#project-layout)
12. [API overview](#api-overview)

---

## Architecture

```
┌─────────────┐      /api (proxy)       ┌──────────────┐
│  Frontend   │ ───────────────────────▶│   Backend    │
│  Vite :5173 │                         │ FastAPI :8000│
└──────┬──────┘                         └──────┬───────┘
       │ OIDC login (PKCE)                     │ verifies JWT (JWKS)
       ▼                                       ▼
┌─────────────────────────────────────────────────────┐
│              Keycloak  :8080  (Docker)               │
│   realm "crea" · clients: crea-frontend, crea-backend│
└──────┬──────────────────────────┬───────────────────┘
       │ stores users             │ sends verification email
       ▼                          ▼
  Postgres (Docker)         Mailpit :8025 (Docker, dev)

Optional, called by the backend:
  • Ollama :11434  → in-app "workflow assistant"
  • Legal AI (HTTP) → proxied legal Q&A   (LEGAL_AI_URL)
```

Authentication is **Keycloak-only**. The backend trusts the OIDC access token and
grants admin rights via the Keycloak `admin` realm role. The app database
(disputes, assets, proposals) is **SQLite by default** and is created
automatically on first start — no migration step.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Python** | 3.11+ | backend |
| **Node.js** | 18+ (20 recommended) | frontend |
| **npm** | 9+ | ships with Node |
| **Docker + Docker Compose** | recent | for Keycloak/Postgres/Mailpit |
| **Ollama** *(optional)* | latest | only for the workflow assistant |

Check them:

```bash
python3 --version
node --version
npm --version
docker --version
docker compose version
```

---

## Quick start

Three terminals. From the project root:

```bash
# ── Terminal 1 — infrastructure (Keycloak + Postgres + Mailpit) ──
cp .env.example .env          # then edit secrets (see Configuration)
docker compose up -d
docker compose ps             # wait until keycloak is "healthy"

# ── Terminal 2 — backend ──
cd backend
cp .env.example .env          # safe defaults; SQLite, localhost Keycloak
python3 -m venv .venv
source .venv/bin/activate      # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# ── Terminal 3 — frontend ──
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open **http://localhost:5173**. Register → verify the email in **Mailpit**
(http://localhost:8025) → log in → create a dispute.

> Want to verify the install without clicking through the UI? Run
> [`./preflight.sh`](#preflight).

---

## Detailed setup

### 1. Infrastructure

Keycloak (auth), Postgres (Keycloak's DB), and Mailpit (a local inbox that
catches all outgoing email) all run via Docker Compose. The realm `crea` and the
clients `crea-frontend` / `crea-backend` are imported automatically from
`infra/keycloak/realm-crea.json`.

```bash
# from the project root (where docker-compose.yml lives)
cp .env.example .env          # set KEYCLOAK_ADMIN_PASSWORD, KC_DB_PASSWORD, etc.
docker compose up -d
docker compose ps
docker compose logs -f keycloak   # follow until "Running the server"
```

Useful endpoints once it is up:

- Keycloak admin console — http://localhost:8080/admin (user/pass from `.env`)
- Mailpit inbox — http://localhost:8025

**SMTP / verification email.** By default everything goes to Mailpit, so you
never need a real mail provider in development. To use a real provider (Gmail,
SendGrid, Postmark, SES) copy the matching template from `env/*.env.example`
into `.env`, then re-apply it to the realm:

```bash
docker compose up -d --force-recreate keycloak-init
```

Stop / reset infrastructure:

```bash
docker compose down            # stop containers
docker compose down -v         # stop AND wipe Keycloak's Postgres volume (full reset)
```

### 2. Backend

FastAPI app, SQLModel ORM, SQLite by default (file `backend/crea3.db`, created on
first run). Runs on port **8000**.

```bash
cd backend
cp .env.example .env

# virtual environment
python3 -m venv .venv
source .venv/bin/activate                 # Windows: .\.venv\Scripts\Activate.ps1

# dependencies
pip install --upgrade pip
pip install -r requirements.txt

# run (auto-reload for development)
uvicorn app.main:app --reload --port 8000
```

Verify it is alive:

```bash
curl http://127.0.0.1:8000/health         # → {"ok":true}
```

- Interactive API docs (Swagger UI): http://127.0.0.1:8000/docs
- Alternative docs (ReDoc): http://127.0.0.1:8000/redoc
- OpenAPI schema: http://127.0.0.1:8000/openapi.json

**Production-style run** (no reload, multiple workers):

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 3. Frontend

React + Vite. Runs on port **5173** and proxies `/api` → `http://127.0.0.1:8000`,
so the backend must be running for API calls to work.

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                    # dev server with hot reload
```

Build and preview the production bundle:

```bash
npm run build                  # type-check (tsc -b) + vite build → dist/
npm run preview                # serve the built dist/ locally
```

### 4. Optional services

These are **not required** to run the core dispute-resolution workflow. The app
degrades gracefully if they are absent.

**Ollama — the in-app "workflow assistant"** (general help + guidance grounded in
the user's own dispute):

```bash
# install from https://ollama.com, then:
ollama serve                   # starts the server on :11434
ollama pull llama3.2:3b        # default model (see OLLAMA_MODEL)
```

Point the backend at it (defaults already match a local install):

```bash
# backend/.env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

**Legal AI assistant** — an external RAG service for legal Q&A, proxied by the
backend so the URL is never exposed to the browser:

```bash
# backend/.env
LEGAL_AI_URL=https://your-legal-ai-service.example/answer
```

If `LEGAL_AI_URL` is empty, the Legal AI panel simply reports it is unavailable.

---

## Running the test suite

The backend ships an automated **pytest** suite (engine math + end-to-end
mediation through the real HTTP layer). No database or network required — it uses
an isolated SQLite file and stubs auth.

```bash
cd backend
source .venv/bin/activate                  # Windows: .\.venv\Scripts\Activate.ps1
pip install pytest                         # if not already installed
python3 -m pytest tests/ -q
```

Expected: **8 passed**.

Useful variants:

```bash
python3 -m pytest tests/ -v                          # verbose, per-test names
python3 -m pytest tests/test_game_theory.py -q       # just the engine
python3 -m pytest tests/test_mediation.py -q         # just the scheduler
python3 -m pytest tests/ -k "equitable"              # filter by name
```

Frontend checks:

```bash
cd frontend
npx tsc --noEmit               # type-check only (no output files)
npm run build                  # full production build (also type-checks)
```

---

## Preflight

Preflight runs the **entire** local test/build suite in one shot — the fastest
way to confirm a clean checkout actually works — and prints a branded,
colour-coded report. Exit code `0` means everything is green.

**macOS / Linux (or Git Bash / WSL on Windows):**

```bash
./preflight.sh                 # full run
./preflight.sh --quick         # skip the (slower) frontend production build
./preflight.sh --no-color      # plain output (for CI logs)
```

**Windows (native PowerShell)** — `preflight.sh` is a Bash script and will **not**
run in PowerShell (you'll get *"'./preflight.sh' is not recognized"*). Use the
PowerShell version instead:

```powershell
.\preflight.ps1                # full run
.\preflight.ps1 -Quick         # skip the frontend production build
.\preflight.ps1 -NoColor       # plain output

# if you hit an execution-policy error, run it this way once:
powershell -ExecutionPolicy Bypass -File .\preflight.ps1
```

Both versions check: the toolchain (Python/Node/npm); the backend (files compile,
app imports, **pytest suite**, server boots + `/health` + a protected-route
probe, security sweep); and the frontend (deps, `tsc`, production build). The
Bash version additionally checks i18n key parity.

```
  14 passed   0 failed   0 skipped
  ✔ PREFLIGHT PASSED — the platform is ready.
```

---

## End-to-end smoke test

A full manual pass through the product, exercising every stage of the workflow:

1. **Start** infrastructure, backend, and frontend (see [Quick start](#quick-start)).
2. **Register** at http://localhost:5173 → you are redirected to Keycloak.
3. **Verify email**: open Mailpit (http://localhost:8025) and click the link.
4. **Log in** and **create a dispute** (choose Bids or Rates).
5. **Add the other party** (and optionally a mediator) by email, and **add assets**.
6. As each party, **submit valuations** (a value and/or a star rating per asset).
7. **Mark ready** → the dispute moves to **reconciliation**.
8. **Reconcile**: where valuations differ, agree to the average or keep your own;
   value any asset the other party didn't list. Then **generate the proposal**.
9. Review the **proposal** and the **fairness summary**, then **download the PDF**.
10. **Accept** the proposal (all parties) → optionally **schedule a meeting**
    (propose date/time; everyone, including the mediator, agrees → confirmed).
11. **Generate the final report** once accepted.

> The only part that genuinely requires the optional services is the in-app
> assistant (Ollama) and the Legal AI panel (`LEGAL_AI_URL`). Everything else
> works with just the three core processes running.

---

## Configuration reference

Three `.env` files. Copy each from its `.example` and fill in real values. **Never
commit a real `.env`.**

### Root `.env` (used by `docker compose`)

| Variable | Purpose | Example |
|----------|---------|---------|
| `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin bootstrap | `admin` / *(secret)* |
| `KEYCLOAK_REALM` | realm name | `crea` |
| `KC_DB_DATABASE` / `KC_DB_USER` / `KC_DB_PASSWORD` | Keycloak's Postgres | `keycloak` / … |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | verification email | Mailpit or a real provider |
| `SMTP_FROM` / `SMTP_FROM_NAME` | sender identity | `noreply@…` / `CREA3` |
| `SMTP_STARTTLS` / `SMTP_SSL` | transport security | `true` / `false` |

### `backend/.env`

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `sqlite:///./crea3.db` | app database (use Postgres in prod) |
| `CORS_ORIGINS` | `http://localhost:5173` | allowed browser origin(s) |
| `KEYCLOAK_URL` | `http://localhost:8080` | Keycloak base URL |
| `KEYCLOAK_REALM` | `crea` | realm |
| `KEYCLOAK_CLIENT_ID` | `crea-frontend` | public client (token audience) |
| `KEYCLOAK_ADMIN_CLIENT_ID` | `crea-backend` | confidential client (admin API) |
| `KEYCLOAK_CLIENT_SECRET` / `KEYCLOAK_ADMIN_CLIENT_SECRET` | *(empty)* | **must** match the realm config |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | workflow assistant (optional) |
| `OLLAMA_MODEL` | `llama3.2:3b` | model to use |
| `LEGAL_AI_URL` | *(empty)* | external legal RAG service (optional) |

### `frontend/.env`

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE` | *(empty)* | leave empty to use the dev proxy `/api → :8000` |
| `VITE_KEYCLOAK_URL` | `http://localhost:8080` | Keycloak base URL |
| `VITE_KEYCLOAK_REALM` | `crea` | realm |
| `VITE_KEYCLOAK_CLIENT_ID` | `crea-frontend` | public client |
| `VITE_PROJECT_CONTACT_*` | — | footer/contact text |

> **Secrets must match.** `KEYCLOAK_CLIENT_SECRET` / `KEYCLOAK_ADMIN_CLIENT_SECRET`
> in `backend/.env` have to equal the client secrets in
> `infra/keycloak/realm-crea.json`. The shipped values are placeholders — change
> them in **both** places for any real deployment.

---

## Cheat-sheet

| Task | macOS / Linux | Windows (PowerShell) |
|------|---------------|----------------------|
| Copy env file | `cp .env.example .env` | `copy .env.example .env` |
| Start infra | `docker compose up -d` | `docker compose up -d` |
| Stop infra | `docker compose down` | `docker compose down` |
| Reset infra (wipe Keycloak DB) | `docker compose down -v` | `docker compose down -v` |
| Create venv | `python3 -m venv .venv` | `python -m venv .venv` |
| Activate venv | `source .venv/bin/activate` | `.\.venv\Scripts\Activate.ps1` |
| Install backend deps | `pip install -r requirements.txt` | same |
| Run backend | `uvicorn app.main:app --reload --port 8000` | same |
| Run backend tests | `python3 -m pytest tests/ -q` | `python -m pytest tests/ -q` |
| Install frontend deps | `npm install` | `npm install` |
| Run frontend | `npm run dev` | `npm run dev` |
| Build frontend | `npm run build` | `npm run build` |
| Type-check frontend | `npx tsc --noEmit` | `npx tsc --noEmit` |
| Full preflight | `./preflight.sh` | `.\preflight.ps1` *(native)* |

There are also helper scripts for Windows:

```powershell
.\scripts\windows\start-local.ps1     # bring up infra
.\scripts\windows\reset-local.ps1     # reset local state
```

---

## Troubleshooting

**Keycloak isn't reachable / login redirects fail.**
Check it is healthy: `docker compose ps`. Follow logs:
`docker compose logs -f keycloak`. First boot can take 30–60 s.

**Backend starts but every API call is 401.**
The browser needs a valid Keycloak token. Make sure you logged in (not just
registered) and that `KEYCLOAK_URL` / realm / client id match between
`backend/.env` and `frontend/.env`. A bare `curl` to a protected route returning
`401` is expected.

**"email_verified = false" / can't log in.**
Open Mailpit (http://localhost:8025) and click the verification link. The backend
rejects unverified accounts by default (`KEYCLOAK_REQUIRE_VERIFIED_EMAIL=true`).

**Frontend loads but API calls fail with network errors.**
The backend must be running on `:8000` (the Vite proxy forwards `/api` there).
Confirm `curl http://127.0.0.1:8000/health`.

**Port already in use.**
Change the port: backend `--port 8001`; frontend `npm run dev -- --port 5174`
(update the proxy/`VITE_API_BASE` accordingly); Keycloak via `KEYCLOAK_PORT` in
the root `.env`.

**Workflow assistant says it's unavailable.**
Ollama isn't running or the model isn't pulled. `ollama serve` then
`ollama pull llama3.2:3b`. This is optional and does not affect the core workflow.

**Reset everything and start clean.**

```bash
docker compose down -v                 # wipe Keycloak's Postgres
rm -f backend/crea3.db                 # wipe the app database
rm -rf frontend/node_modules frontend/dist
```

**`preflight.ps1` shows "UnexpectedToken" or strange characters (â–ˆ ...).**
You are running an OLD copy of the file. Re-download/extract the latest package
(delete the old `preflight.ps1` first so it is overwritten). The current script is
pure ASCII with a UTF-8 BOM and parses on every Windows console. If you still see
it, run the plain-ASCII fallback instead: `.\preflight.ps1 -NoColor`.

**`./preflight.sh` not recognized in PowerShell.**
`preflight.sh` is a Bash script. On Windows either run the native PowerShell
version — `.\preflight.ps1` — or run the Bash one from **Git Bash** / **WSL**.

**Tests fail with "unable to open database file" (Windows).**
This was fixed: the test suite now uses your OS temp directory. If you still see
it, make sure you pulled the latest `backend/tests/` (including `conftest.py`)
and that `%TEMP%` is writable.

---

## Project layout

```
crea_fixed/
├── preflight.sh              # one-command full-app test runner (bash)
├── preflight.ps1             # same, for native Windows PowerShell
├── docker-compose.yml        # Keycloak + Postgres + Mailpit (+ SMTP init)
├── .env.example              # root env (docker compose)
├── env/                      # SMTP provider templates (gmail, sendgrid, …)
├── infra/
│   └── keycloak/
│       └── realm-crea.json   # auto-imported realm + clients
├── scripts/
│   ├── keycloak/apply-smtp.sh
│   └── windows/              # start-local.ps1, reset-local.ps1
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── main.py           # FastAPI app (creates tables on startup)
│   │   ├── models.py         # SQLModel tables
│   │   ├── game_theory.py    # Knaster sealed-bids engine
│   │   ├── reconciliation.py # pre-proposal reconciliation
│   │   ├── core/             # config, workflow, auth helpers
│   │   ├── api/              # routers (disputes, reconciliation, mediation, …)
│   │   └── services/         # report_pdf, proposals_service, history
│   └── tests/                # pytest suite (engine + mediation)
└── frontend/
    ├── .env.example
    ├── package.json
    ├── vite.config.ts        # dev proxy /api → :8000
    └── src/
        ├── pages/            # dispute, dashboard, login, …
        ├── components/       # reconciliation panel, scheduler, …
        └── i18n.tsx          # 7 languages
```

---

## API overview

All endpoints are under `/api` and (except health) require a Keycloak bearer
token. Full, always-current docs are at **http://127.0.0.1:8000/docs**.

| Area | Method & path | Purpose |
|------|---------------|---------|
| Health | `GET /health` | liveness check (no auth) |
| Me | `GET /api/users/me` · `DELETE /api/users/me/data` | profile · GDPR data wipe |
| Disputes | `GET/POST /api/disputes` · `GET /api/disputes/{id}` | list / create / read |
| Agents | `GET/POST /api/disputes/{id}/agents` | participants |
| Assets | `GET/POST /api/disputes/{id}/goods` | disputed assets |
| Preferences | `POST /api/disputes/{id}/preferences` | private valuations |
| Reconciliation | `GET …/reconciliation` · `POST …/value` · `…/omitted` · `…/finalize` | reconcile then generate proposal |
| Proposals | `GET/POST …/proposals` · `POST …/proposals/{id}/accept` | allocation + acceptance |
| **Meeting scheduler** | `GET/POST …/mediation/slots` · `…/{id}/agree` · `…/{id}/decline` · `DELETE …/{id}` | propose/agree on a meeting time |
| Reports | `POST …/report/proposal` · `POST …/report` · `GET …/report` | proposal / final PDF |
| Invitations | `GET /api/invitations` · `POST /api/invitations/{id}/respond` | pending invites (notification bell) |

---

*Built for the CREA3 project (Conflict Resolution with Equitative Algorithms),
co-funded by the Justice Programme of the European Union. This software produces
decision-support documents that have no legal value; see the legal notice in each
generated report.*
