# CREA3 — Deployment with Docker Compose

Everything runs on **one origin**: the `frontend` container serves the SPA and
reverse-proxies the API (`/api`) and Keycloak (`/realms`). So the UI, the API,
and authentication all share the same URL — which means it works on `localhost`
now and behind a **single Cloudflare tunnel** later, with no CORS to configure.

| Service         | Build / image      | Role                                             | Host port |
|-----------------|--------------------|--------------------------------------------------|-----------|
| `frontend`      | build `./frontend` | nginx: serves the SPA + proxies `/api`, `/realms`| `3000`    |
| `backend`       | build `./backend`  | FastAPI API (Uvicorn), SQLite on a volume        | `8000`    |
| `keycloak`      | keycloak:24.0.5    | Authentication (realm auto-imported)             | `8080`    |
| `db`            | postgres:16        | Keycloak's database                              | -         |
| `keycloak-init` | keycloak:24.0.5    | One-shot: syncs client secret + origins + SMTP   | -         |
| `mailpit`       | axllent/mailpit    | Captures outgoing email (dev/demo)               | `8025`    |

## 1. Configure
```bash
cp .env.example .env
```
The only URL you normally touch is **APP_PUBLIC_URL** (default
`http://localhost:3000`). With the default SMTP, verification/reset emails are
captured by Mailpit.

## 2. Run
```bash
docker compose up -d --build
```
- App:            http://localhost:3000
- Keycloak admin: http://localhost:8080/admin  (KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD)
- Mail inbox:     http://localhost:8025

Register -> open the verification mail (Mailpit by default) -> click the link ->
sign in. Every feature runs on http://localhost:3000.

## 3. Expose later with ONE Cloudflare tunnel
Point a tunnel at the frontend port only:
```bash
cloudflared tunnel --url http://localhost:3000
```
Take the printed URL (e.g. https://random-words.trycloudflare.com), put it in
`.env`, and rebuild so the SPA + Keycloak use it:
```env
APP_PUBLIC_URL=https://random-words.trycloudflare.com
```
```bash
docker compose up -d --build
```
That one origin serves the UI and proxies the API and Keycloak, so login,
tokens and email links all work through the tunnel. No other tunnels needed.

## 4. Why one origin
The backend validates the token **issuer** against the URL the browser used.
The browser reaches Keycloak via the frontend proxy at
`${APP_PUBLIC_URL}/realms/...`, so `KC_HOSTNAME_URL=${APP_PUBLIC_URL}` makes the
issuer and email links match, while the backend fetches JWKS / calls the admin
API internally at `http://keycloak:8080` (`KEYCLOAK_INTERNAL_URL`). The SPA calls
`/api` and `/realms` on its own origin -> no cross-origin requests, no CORS.

## 5. Verify quickly
```bash
docker compose ps                                    # all healthy; keycloak-init Exited (0)
docker compose logs keycloak-init                    # "client secret set from env" / "direct grants ON"
curl -fsS http://localhost:8000/health               # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/disputes   # 401 = reachable (good)
docker compose logs keycloak | grep invalid_client_credentials || echo "secret OK"
```

## 6. Production hardening
- Change every secret/password in `.env`. `KEYCLOAK_ADMIN_CLIENT_SECRET` is kept
  in sync with Keycloak automatically by `keycloak-init`.
- Tighten the `crea-frontend` client's redirect/web origins from `*` to your
  exact domain (in `scripts/keycloak/apply-config.sh` or the admin console).
- Keycloak runs in `start-dev`; for production use `start --optimized` with a
  fixed hostname and HTTPS.
- App data is SQLite on `crea_backend_data`; uploads/reports on
  `crea_uploads`/`crea_reports`. For Postgres, set `DATABASE_URL` and add
  `psycopg[binary]` to `backend/requirements.txt`.

## 7. Optional: chatbot (Ollama)
Leave `OLLAMA_BASE_URL` empty to disable (UI degrades gracefully), or:
```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.2:3b
```

## 8. Common commands
```bash
docker compose logs -f backend       # API logs
docker compose up -d --build         # apply changes / rebuild
docker compose down                  # stop (keeps data)
docker compose down -v               # stop and DELETE all data (fresh start)
```
> After changing APP_PUBLIC_URL, the client secret, or any SMTP_* value, re-run
> `docker compose up -d --build`.
