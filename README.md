# CREA Platform (Keycloak-first) — Local Runbook (Windows-friendly)

This project uses **Keycloak** for:
- Public registration
- Email verification (mandatory)
- Login (OIDC Authorization Code Flow / PKCE)

✅ **Email provider is configurable** (Mailpit / Gmail / Postmark / SES / SendGrid / etc.).  
Keycloak is the source of truth for verification emails.

---

## 0) Configure SMTP provider (optional, but recommended)

Copy the root env file:

```powershell
copy .env.example .env
```

By default, `.env.example` uses **Mailpit** (local inbox UI).  
To switch provider, edit `.env` using one of the examples in `env/*.env.example`.

After changing SMTP settings, re-apply them to Keycloak:

```powershell
docker compose up -d keycloak-init
```

---

## 1) Start infrastructure (Keycloak + Postgres + Mailpit)

From the project root (where `docker-compose.yml` is), run:

```powershell
docker compose up -d
docker compose ps
```

Or use the helper script:

```powershell
.\scripts\windows\start-local.ps1
```

Key URLs:
- Keycloak Admin: `http://localhost:8080/admin` (admin/admin)
- Mailpit Inbox: `http://localhost:8025`

> If Keycloak is not Up yet: `docker compose logs -f keycloak`

---

## 2) Run backend

```powershell
cd backend
copy .env.example .env

python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend: `http://127.0.0.1:8000`

---

## 3) Run frontend

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Frontend: `http://localhost:5173`

---

## 4) Test the verification flow

### Using Mailpit (default)
1. Open `http://localhost:5173/register` → redirects to Keycloak
2. Register a user
3. Open `http://localhost:8025` (Mailpit) and click the verification email link
4. Login at `http://localhost:5173/login`
5. Use the app

### Using a real provider (e.g., Gmail)
1. Set SMTP in `.env` (see `env/gmail.env.example`)
2. Run: `docker compose up -d keycloak-init`
3. Register a user → verify via the real email

The backend rejects requests if the token claim `email_verified=false`.

---

## 5) Routes

### Frontend Routes (`http://localhost:5173`)

Configured in `frontend/src/app.tsx`. Environment variables live in `frontend/.env` (copy from `frontend/.env.example`).

#### Public routes (no login required)

| Path | Page file | Description | Config / alter |
|------|-----------|-------------|----------------|
| `/` | `pages/landing.tsx` | Landing page — platform overview, value props, CTAs to register/login | Static content in component |
| `/register` | `pages/register.tsx` | Triggers Keycloak registration flow (auto-redirect after 650 ms) | `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` in `frontend/.env` |
| `/login` | `pages/login.tsx` | Triggers Keycloak login flow | Same Keycloak vars above |
| `/verify-email` | `pages/verify-email.tsx` | Post-registration instructions; links to Mailpit (`localhost:8025`) in dev | Static copy; Mailpit URL hardcoded in component |
| `/scope` | `pages/scope.tsx` | CREA2 European project scope & objectives | Static content |
| `/partners` | `pages/partners.tsx` | List of 9 European consortium partners | Static content |
| `/help` | `pages/help.tsx` | FAQ — 8 questions covering disputes, workflow, and solution generation | Static content |
| `*` | — | Catch-all → redirects to `/` | `app.tsx` |

#### Admin routes

| Path | Page file | Description | Config / alter |
|------|-----------|-------------|----------------|
| `/admin` | `pages/admin-login.tsx` | Admin login form — uses backend JWT, **not** Keycloak | Credentials: `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend/.env` (defaults `admin@example.com` / `admin123`) |
| `/admin/dashboard` | `pages/admin-dashboard.tsx` | Access-log viewer, summary metrics (unique IPs, top endpoints) | Protected by `admin_token` in localStorage; data from `GET /api/admin/access-logs` |

#### Authenticated app routes (requires Keycloak login — nested under `/app` with `<Shell>` layout)

| Path | Page file | Description | Config / alter |
|------|-----------|-------------|----------------|
| `/app` | `pages/dashboard.tsx` | Dashboard — lists the user's disputes and pending invitations; create-dispute form | Data from `GET /api/disputes`, `GET /api/invitations` |
| `/app/disputes/:id` | `pages/dispute.tsx` | Dispute detail — tabbed view for agents, goods, preferences, proposals, mediation, video room | Data from all `/api/disputes/:id/*` sub-resources |
| `/app/mediators` | `pages/mediators.tsx` | Read-only list of available mediators | Data from `GET /api/users/mediators` |
| `/app/account` | `pages/account.tsx` | Update email, change password, logout | Calls `PATCH /api/users/me`, `POST /api/users/me/password` |
| `/app/settings` | `pages/settings.tsx` | Language (EN/IT/SL/ET/FR/LT/HR) and accessibility preferences | Stored locally via `useI18n()` hook |
| `/app/scope` | `pages/scope.tsx` | Same scope page available inside the authenticated shell | Static |
| `/app/partners` | `pages/partners.tsx` | Same partners page inside the authenticated shell | Static |
| `/app/strategy` | `pages/strategy.tsx` | Strategy & evaluation info (placeholder, directs to open disputes) | Static |
| `/app/ready` | `pages/ready.tsx` | Initialization status info (placeholder) | Static |
| `/app/mediation` | `pages/mediation.tsx` | Mediation coordination info (placeholder) | Static |
| `/app/faq` | `pages/faq.tsx` | FAQ inside authenticated shell | Static |
| `/app/dispute` | — | Redirect → `/app` (prevents stale bare URL) | `app.tsx` |

#### Frontend environment variables (`frontend/.env`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `VITE_API_BASE` | Backend base URL; leave empty to use Vite dev proxy | _(empty)_ |
| `VITE_KEYCLOAK_URL` | Keycloak server URL | `http://localhost:8080` |
| `VITE_KEYCLOAK_REALM` | Keycloak realm | `crea` |
| `VITE_KEYCLOAK_CLIENT_ID` | OIDC client ID | `crea-frontend` |
| `VITE_KEYCLOAK_ACCOUNT_URL` | Link to Keycloak self-service account page | `http://localhost:8080/realms/crea/account` |
| `VITE_PROJECT_CONTACT_NAME` | Footer contact name | `CREA3 Team` |
| `VITE_PROJECT_CONTACT_EMAIL` | Footer contact email | `info@crea3.cc` |
| `VITE_PROJECT_CONTACT_ORG` | Footer organisation name | `CREA3 Consortium` |
| `VITE_PROJECT_WEBSITE` | Footer website link | _(empty)_ |

---

### Backend API Routes (`http://localhost:8000`)

All `/api/*` routes require a Keycloak Bearer token in `Authorization: Bearer <token>` unless noted. Source files are under `backend/app/api/`. Settings come from `backend/.env` (copy from `backend/.env.example`).

#### Auth — `backend/app/api/auth.py`

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| POST | `/api/auth/register` | Create user in Keycloak and local DB; sends verification email | Keycloak vars in `backend/.env`; writes `User` table; calls `send_verification_email` |
| POST | `/api/auth/verify-email` | Validate email token and mark user verified in Keycloak | `User` table; `KEYCLOAK_REQUIRE_VERIFIED_EMAIL` in `backend/.env` |
| POST | `/api/auth/login` | Password grant via Keycloak; returns access + refresh tokens | Keycloak vars; requires `email_verified=true` claim |
| POST | `/api/auth/refresh` | Exchange refresh token for a new access token | Keycloak vars |

#### Users — `backend/app/api/users.py`

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| GET | `/api/users/me` | Return current user profile (id, email, username, role) | `User` table |
| PATCH | `/api/users/me` | Update email address | `User` table + Keycloak |
| POST | `/api/users/me/password` | Change password (validates current password first) | Keycloak via `KeycloakAdmin` |
| DELETE | `/api/users/me/data` | Erase all user data (disputes, preferences, etc.) without deleting the account | Cascades across `Dispute`, `Preference`, `Strategy`, `AllocationProposal`, `MediationSlot`, `Good`, `DisputeAgent`, `AuditEvent` |
| DELETE | `/api/users/me` | Delete account and all data, including Keycloak record | All tables above + Keycloak |
| GET | `/api/users/mediators` | List all users with `role=mediator` | `User` table |

#### Disputes — `backend/app/api/disputes.py`

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| POST | `/api/disputes` | Create a new dispute (status: `draft`) | `Dispute`, `AuditEvent` tables |
| GET | `/api/disputes` | List disputes visible to the current user (role-filtered) | `Dispute`, `DisputeAgent` tables |
| GET | `/api/disputes/{id}` | Get a single dispute; access-controlled | `Dispute` table |
| PATCH | `/api/disputes/{id}/status` | Update dispute status; owner or admin only | `Dispute`, `AuditEvent` tables |
| DELETE | `/api/disputes/{id}` | Delete dispute; owner or admin only | `Dispute`, `AuditEvent` tables |

#### Agents — `backend/app/api/agents.py` (prefix `/api/disputes/{id}/agents`)

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| GET | `/api/disputes/{id}/agents` | List all agents in the dispute | `DisputeAgent` table |
| POST | `/api/disputes/{id}/agents` | Invite an agent by email; sends invite email (best-effort) | `DisputeAgent`, `AuditEvent`; email via `SMTP_*` in `backend/.env` |
| POST | `/api/disputes/{id}/agents/{agent_id}/resend-invite` | Resend invitation email | `AuditEvent`; same SMTP settings |
| PATCH | `/api/disputes/{id}/agents/{agent_id}` | Update agent details (role, share) | `DisputeAgent`, `AuditEvent` |
| DELETE | `/api/disputes/{id}/agents/{agent_id}` | Remove agent from dispute | `DisputeAgent`, `AuditEvent` |

#### Invitations — `backend/app/api/invitations.py`

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| GET | `/api/invitations` | List pending invites for the current user's email | `DisputeAgent`, `Dispute` tables |
| POST | `/api/invitations/{dispute_id}/respond` | Accept or decline an invitation | `DisputeAgent`, `AuditEvent` |

#### Goods — `backend/app/api/goods.py` (prefix `/api/disputes/{id}/goods`)

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| GET | `/api/disputes/{id}/goods` | List goods in the dispute | `Good` table |
| POST | `/api/disputes/{id}/goods` | Add a good (currency defaults to EUR) | `Good`, `AuditEvent` |
| PATCH | `/api/disputes/{id}/goods/{good_id}` | Update a good | `Good`, `AuditEvent` |
| DELETE | `/api/disputes/{id}/goods/{good_id}` | Delete a good | `Good`, `AuditEvent` |

#### Preferences — `backend/app/api/preferences.py` (prefix `/api/disputes/{id}/preferences`)

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| GET | `/api/disputes/{id}/preferences` | Get current user's preferences (star ratings 0–5) | `Preference` table |
| POST | `/api/disputes/{id}/preferences` | Upsert preferences; auto-triggers proposal generation when ≥2 parties ready | `Preference`, `Dispute`, `AuditEvent` |

#### Proposals — `backend/app/api/proposals.py` (prefix `/api/disputes/{id}/proposals`)

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| GET | `/api/disputes/{id}/proposals` | List allocation proposals (mediators can see all) | `AllocationProposal` table |
| POST | `/api/disputes/{id}/proposals` | Generate a new proposal (requires ≥2 ready parties) | `AllocationProposal`; via `proposals_service` |
| POST | `/api/disputes/{id}/proposals/{proposal_id}/accept` | Accept or reject a proposal; auto-marks dispute `accepted` when all agree | `Acceptance`, `Dispute`, `AuditEvent` |

#### Strategy — `backend/app/api/strategy.py` (prefix `/api/disputes/{id}/strategy`)

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| GET | `/api/disputes/{id}/strategy` | Get strategy (own only, or all if mediator) | `Strategy` table |
| POST | `/api/disputes/{id}/strategy` | Upsert strategy; dispute must be in `draft` or `collecting` status | `Strategy`, `AuditEvent` |

#### Ready — `backend/app/api/ready.py` (prefix `/api/disputes/{id}/ready`)

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| POST | `/api/disputes/{id}/ready` | Toggle participant ready status; auto-advances dispute to `validating` when all non-mediators ready | `DisputeAgent`, `Dispute`, `AuditEvent` |

#### Mediation — `backend/app/api/mediation.py` (prefix `/api/disputes/{id}/mediation`)

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| GET | `/api/disputes/{id}/mediation/slots` | List available mediation time slots | `MediationSlot` table |
| POST | `/api/disputes/{id}/mediation/slots` | Propose a mediation slot | `MediationSlot`, `AuditEvent` |
| POST | `/api/disputes/{id}/mediation/slots/{slot_id}/agree` | Agree to a slot; auto-confirms and sets dispute to `mediation` when all agree | `MediationSlot`, `Dispute`, `AuditEvent` |

#### Reports — `backend/app/api/reports.py` (prefix `/api/disputes/{id}/report`)

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| POST | `/api/disputes/{id}/report` | Generate PDF report (requires status `accepted` or `finalized`); sets status to `finalized` | `Report`, `Dispute`, `AllocationProposal`, `Good`; PDF written to `generated_reports/` |
| GET | `/api/disputes/{id}/report` | Download the generated PDF report | `Report` table; serves file from disk |

#### Notifications — `backend/app/api/notifications.py`

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| GET | `/api/notifications` | List pending invitations (alias of `/api/invitations`) | `DisputeAgent`, `Dispute` |
| POST | `/api/notifications/{invite_id}/accept` | Accept invite, set status to `joined` | `DisputeAgent`, `AuditEvent` |
| POST | `/api/notifications/{invite_id}/decline` | Decline invite, removes agent record | `DisputeAgent`, `AuditEvent` |

#### Chat — `backend/app/api/chat.py`

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| POST | `/api/chat` | Chat with local FAQ fallback; proxies to upstream AI if configured | `CHAT_UPSTREAM_URL` in `backend/.env`; FAQ hardcoded in `chat.py` |

#### Metrics & Stats — `backend/app/api/metrics.py`, `stats.py`

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| POST | `/api/metrics/visit` | Increment visit counter | `AppMetric` table (key `visits`) |
| GET | `/api/metrics/summary` | Return visits, registered users, dispute counts | `AppMetric`, `User`, `Dispute` tables |
| POST | `/api/stats/visits` | Increment legacy visit counter | `VisitCounter` table |
| GET | `/api/stats/visits` | Return legacy total visit count | `VisitCounter` table |

#### Admin API — `backend/app/api/admin.py`

| Method | Path | Description | Config / DB |
|--------|------|-------------|-------------|
| POST | `/api/admin/login` | Authenticate with admin credentials; returns short-lived JWT | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, `ADMIN_TOKEN_TTL_MINUTES` in `backend/.env` |
| GET | `/api/admin/access-logs` | Paginated access log (default 50, max 500 rows) | `AccessLog` table; `limit` & `offset` query params |

---

### Dev / Tool Endpoints

| URL | Auth | Description | Config / alter |
|-----|------|-------------|----------------|
| `http://localhost:8000/dbms` | Password form (cookie session) | Adminer-style DB browser — table overview, paginated rows, schema, full CRUD | Password: `DBMS_PASS` in `backend/.env` (default `CREA3`) |
| `http://localhost:8000/admin/login` | None | HTML admin login page | Credentials from `backend/.env`: `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| `http://localhost:8000/docs` | None | FastAPI auto-generated Swagger UI — try all API endpoints interactively | Always available in dev |
| `http://localhost:8000/redoc` | None | ReDoc alternative API docs | Always available in dev |
| `http://localhost:8080/admin` | Keycloak admin credentials | Keycloak Admin Console — manage realm, users, SMTP, clients | `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` in root `.env` (default `admin`/`admin`) |
| `http://localhost:8025` | None | Mailpit — local email inbox for catching verification emails in dev | Switch provider via `SMTP_*` in root `.env` |

---

### Backend environment variables (`backend/.env`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | SQLAlchemy DB URL | `sqlite:///./crea3.db` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173` |
| `KEYCLOAK_URL` | Keycloak base URL (internal Docker: `http://keycloak:8080`) | `http://localhost:8080` |
| `KEYCLOAK_REALM` | Realm name | `crea` |
| `KEYCLOAK_CLIENT_ID` | Public client ID for token validation | `crea-frontend` |
| `KEYCLOAK_ADMIN_CLIENT_ID` | Service-account client for admin ops | `crea-backend` |
| `KEYCLOAK_ADMIN_CLIENT_SECRET` | Service-account secret | `crea-backend-secret` |
| `KEYCLOAK_REQUIRE_VERIFIED_EMAIL` | Reject tokens with `email_verified=false` | `true` |
| `ADMIN_EMAIL` | Local admin login email | `admin@example.com` |
| `ADMIN_PASSWORD` | Local admin login password | `admin123` |
| `JWT_SECRET` | Secret for signing admin JWTs | `change-me` |
| `ADMIN_TOKEN_TTL_MINUTES` | Admin token lifetime | `60` |
| `CHAT_UPSTREAM_URL` | Optional upstream AI chat URL; empty = FAQ-only mode | _(empty)_ |
| `SMTP_HOST` | Outgoing mail server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP login username | — |
| `SMTP_PASS` | SMTP login password | — |
| `SMTP_FROM` | Sender address | `no-reply@crea.local` |
| `SMTP_FROM_NAME` | Sender display name | `CREA3` |
| `SMTP_STARTTLS` | Enable STARTTLS | `false` |
| `SMTP_SSL` | Enable implicit SSL (port 465) | `false` |
| `DBMS_PASS` | Password for the `/dbms` DB browser | `CREA3` |
