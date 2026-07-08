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

## Workflow Assistant — local Ollama setup

The in-dispute "Workflow Assistant" runs on a local Ollama model.

1. Install Ollama: https://ollama.com/download
2. Pull a small model (any of these work well on a laptop):
   ```bash
   ollama pull llama3.2:3b      # default
   # or: ollama pull qwen2.5:3b / phi3:mini / gemma2:2b
   ```
3. Ollama serves on http://localhost:11434 by default. The backend reads:
   ```
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=llama3.2:3b
   ```
   Change `OLLAMA_MODEL` to swap the model globally, or pick one from the
   dropdown in the assistant header (it lists every model installed in Ollama).

If Ollama is offline or the model isn't pulled, the assistant shows a clear
message; the rest of the platform is unaffected.

## Legal AI Assistant — external service

The "Legal AI Assistant" page proxies an external RAG service through the
backend. Set in `backend/.env`:
```
LEGAL_AI_URL=https://your-rag-service.example/chat
```
Leave it empty to disable the page. The frontend never contacts the service
directly and never holds its URL.
