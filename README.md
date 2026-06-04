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
