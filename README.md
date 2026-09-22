# CREA3 — repository guide and run order

CREA3 (*Consensual Resolution of Family Disputes*, co-funded by the European Union) is an online platform that helps parties divide a contested estate fairly: they declare the assets, value them, rate how much they want each one, reconcile differences, and receive an equitable allocation proposal with a minimal balancing payment. A retrieval-augmented legal assistant answers jurisdiction-specific questions alongside it.

This file is the **entry point**: what each folder is, which script to run, and in which order. Component details live in the READMEs linked below.

---

## 1. Folders

| Folder | What it is | Its docs |
|---|---|---|
| `_CREA3x/` | **The platform** (current). FastAPI backend + React SPA served on one port, Keycloak, Postgres, Mailpit. | [`_CREA3x/README.md`](_CREA3x/README.md) (operations reference), [`README_RUN.md`](_CREA3x/README_RUN.md), [`DEPLOY.md`](_CREA3x/DEPLOY.md) |
| `_CREA3-Chatbot/` | **Legal AI service** — RAG over six national civil-law corpora (Italy, Estonia, Slovenia, Belgium, Croatia, Lithuania) with per-jurisdiction agents. | [`_CREA3-Chatbot/backend/README.md`](_CREA3-Chatbot/backend/README.md) |
| `_CICD/` | **CI/CD console** — a small container with a web UI to pull branches, manage stashes and restart the platform / chatbot without SSH. Embedded in the admin panel. | [`_CICD/README.md`](_CICD/README.md) |
| `_rsc/thesis/` | Dissertation on the allocation algorithm (`report.md`, `report.docx`, figures, `build.sh`). | [`_rsc/thesis/title.md`](_rsc/thesis/title.md) |
| `_rsc/` | Project documents and deliverables, plus the **port map**. | [`_rsc/ports.md`](_rsc/ports.md) |
| `_CREA3/` | Previous generation of the platform, kept for reference. Not deployed. | `_CREA3/README.md` |
| `index.php`, `.htaccess`, `passenger_wsgi.py` | Public entry point on the cPanel host: reverse-proxies `https://crea3.cc` to wherever the platform runs. | — |
| `env.sh` | Carries every untracked `.env` to another machine (git-ignored, contains secrets). | §2 |

---

## 2. First run on a new machine

Requirements: **Docker Desktop** (or Docker Engine + compose v2), **git**, an SSH deploy key in `~/.ssh` if you want the CI/CD console to fetch from origin.

```bash
git clone git@github.com:ronvoy/crea3.cc.git crea3 && cd crea3

# 1. restore the .env files (copy env.sh over scp first — never by chat/e-mail)
./env.sh                 # --list to see what it carries, --force to overwrite

# 2. legal AI service (port 8094) — start it before the platform
cd _CREA3-Chatbot && ./run_chatbot.sh && cd ..

# 3. CI/CD console (port 8088 or next free) — optional but recommended
cd _CICD && ./run_cicd.sh && cd ..          # prints http://localhost:8088/?token=…

# 4. the platform (port 8000: SPA + API on one origin)
cd _CREA3x && ./run_be.sh                   # Ctrl+C stops it; runs in the foreground
```

Then open **http://localhost:8000** (app) and **http://localhost:8000/admin** (admin console).

Order matters only in two places: the platform reads `_CICD/.env` at start (step 3 before 4, so **System → CI/CD** works), and it calls the chatbot at `LEGAL_AI_URL` (step 2 before 4, or the Legal AI answers are unavailable until the service is up).

`env.sh` deliberately does **not** carry machine-local values — the CI/CD token, its port and the repository path are generated per machine by `run_cicd.sh`, so each machine has its own console secret.

---

## 3. Everyday commands

| Task | Command | Notes |
|---|---|---|
| Start / restart the platform | `_CREA3x/run_be.sh` | Builds the SPA into `frontend/dist`, builds the backend image, starts db/keycloak/mailpit if needed, runs the app on **:8000**. `CREA3_DETACH=1` starts it in the background. |
| Frontend with hot reload | `_CREA3x/run_fe.sh` | Vite on **:5173**, proxies `/api` to :8000. Use *in addition* to `run_be.sh` while working on the UI. |
| Start / stop the chatbot | `_CREA3-Chatbot/run_chatbot.sh` · `--down` · `--logs` | **:8094**. `--rebuild` re-indexes the corpora (slow); `--rebuild-mistral` switches embeddings to Mistral and re-indexes. |
| CI/CD console | `_CICD/run_cicd.sh` · `--url` · `--logs` · `--down` | **:8088**. Pull/checkout/stash, restart either service, GitHub webhook, live job log. |
| Full test + build check | `_CREA3x/preflight.sh` | `--quick` skips the production SPA build. Run before pushing. |
| Re-translate the UI | `_CREA3x/localization.sh` | Default pass translates only flagged/missing strings across the 8 languages. |
| Fresh start (destructive) | `_CREA3x/reset.sh` | Removes containers **and** the Keycloak database volume — all Keycloak users are lost. |
| Carry secrets to another machine | `./env.sh --collect` then copy `env.sh` | Re-embeds the current `.env` files; run it after changing any of them. |
| Rebuild the thesis document | `_rsc/thesis/build.sh` | `report.md` → `report.docx` (needs pandoc). |

---

## 4. Deploying a change

Two equivalent paths — use the console for a running server, the shell when you are on the machine anyway.

**From the admin panel (no SSH):** open `/admin` → **System → CI/CD** → pick the branch → **⬇ Remote pull** (local changes are `git add`-ed and stashed first), or **▶ Pull & deploy** to pull *and* restart the selected targets. Enable **auto-sync** to check origin every 10 s and pull automatically. Backend code and the committed `frontend/dist` are picked up live; only dependency/Dockerfile/compose changes need **Restart platform**.

**From the shell:**

```bash
git pull
cd _CREA3x && ./run_be.sh            # rebuilds the SPA + image and restarts
cd ../_CREA3-Chatbot && ./run_chatbot.sh   # only when the chatbot changed
```

Before pushing: `_CREA3x/preflight.sh` (tests, type-check, build).

---

## 5. Ports

Full table with folders, processes and entry scripts: [`_rsc/ports.md`](_rsc/ports.md).

| Port | Service |
|---|---|
| **8000** | Platform — SPA + API (`crea3x-backend`) |
| **8094** | Legal AI chatbot |
| **8088** | CI/CD console |
| 8080 | Keycloak |
| 5173 | Vite dev server (development only) |
| 1025 / 8025 | Mailpit SMTP / inbox (development only) |
| 11434 | Ollama (optional local LLM) |

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| A `run_*.sh` exits immediately with no output | Docker is not running, or `.env` is missing — run `./env.sh` first. |
| Verification / password-reset e-mails never arrive | SMTP credentials. `docker logs crea3x-backend \| grep SMTP` shows `SMTP OK` or the exact server error; fix `SMTP_*` in `_CREA3x/backend/.env` and restart. The admin panel has **Mail → SMTP check** too. |
| CI/CD console says "Token required" | The browser holds an old token. Run `_CICD/run_cicd.sh --url` on that machine and open the printed link; the console reads the token from `_CICD/.env` on every request. |
| Admin panel says "CI/CD console not configured" | Start `_CICD/run_cicd.sh`, then `_CREA3x/run_be.sh` so the backend picks up the port and token. |
| UI changes don't show | The SPA is served from `frontend/dist`; re-run `run_be.sh` (or `npm run build` in `_CREA3x/frontend`), then hard-refresh the browser. |
| Legal AI answers unavailable | The chatbot is down: `_CREA3-Chatbot/run_chatbot.sh --logs`. The platform falls back to the external model when configured. |
| Keycloak login broken after a reset | `reset.sh` wipes its database; re-register, or restore from a backup. |
