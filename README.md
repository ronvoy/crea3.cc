# CREA3 (Recreated) - Full-stack starter

This is a *recreated* version of the CREA3 PoC app:
- FastAPI + SQLModel backend
- React + Vite + Tailwind frontend
- Keycloak-based authentication (register, email verification, login, refresh)
- Disputes: create/manage, agents, goods, preferences (bids/rates), proposal generation, acceptance, report PDF

> Security note: refresh tokens are handled by the frontend in localStorage for simplicity.
> For production, prefer httpOnly secure cookies + CSRF protection.

## Start Keycloak + Mailpit (recommended)

This project includes a docker-compose bundle:

```bash
docker compose up -d
```

- Keycloak: http://localhost:8080
- Mailpit inbox UI: http://localhost:8025

The realm `crea` is imported automatically, including:
- public client `crea-frontend` (Direct Access Grants enabled)
- service account client `crea-backend` (used by the backend to create users, mark emails verified, change passwords)

## Run backend

```bash
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

For local email verification (SMTP), keep defaults in `backend/.env`:
- SMTP host `localhost`, port `1025` (Mailpit)

## Run frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Frontend defaults to API at http://localhost:8000
