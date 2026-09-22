# CREA3 CI/CD console

A standalone container (default port **8088**, or the next free one) that lets an
administrator manage the deployment from the browser — no SSH, no GitHub Actions:

- see the checkout (branch, HEAD, ahead/behind origin, local changes), branches, commit history, stashes, containers;
- `pull` a branch (local changes are **stashed automatically**, with untracked files), `checkout` a branch or commit;
- list / pop / drop stashes;
- restart the platform (`_CREA3x/run_be.sh`) and the chatbot (`_CREA3-Chatbot/run_chatbot.sh`), following the job log live;
- optionally auto-deploy on a GitHub push webhook.

The platform's admin panel (**System → CI/CD**) embeds this console; `_CREA3x/run_be.sh`
reads `_CICD/.env` and hands the port and token to the backend, so nothing else is configured by hand.

## Run

```bash
./run_cicd.sh            # build + start; prints http://localhost:8088/?token=…
./run_cicd.sh --url      # print the URL again
./run_cicd.sh --logs     # follow logs
./run_cicd.sh --down     # stop
```

`run_cicd.sh` writes `CICD_PORT`, `CICD_TOKEN` and `HOST_REPO_DIR` to `_CICD/.env`.
Optional keys in the same file:

| Key | Purpose |
|---|---|
| `CICD_PUBLIC_URL` | how the admin's browser reaches the console when it is not `http://<platform-host>:<port>` (e.g. behind a tunnel) |
| `CICD_WEBHOOK_SECRET` | secret of a GitHub *push* webhook pointed at `POST /webhook/github` |
| `CICD_AUTO_DEPLOY_BRANCH` | branch whose pushes trigger pull + restart |
| `CICD_AUTO_DEPLOY_TARGETS` | `_CREA3x`, `_CREA3-Chatbot` or both (comma separated) |

Requirements on the server: Docker (the socket is mounted), the repository cloned
(`HOST_REPO_DIR`, mounted at the same path so the scripts' bind mounts resolve), and a
deploy key in `~/.ssh` for `git fetch origin` (SSH remote).

## API

All routes except `/health` and `/` need the token — header `X-CICD-Token: …` or `?token=…`.
Action routes accept **GET and POST** and return a *job*; the UI follows `GET /api/jobs/<id>`.

| Route | Effect |
|---|---|
| `GET /api/status` | checkout, ahead/behind, dirty files, stashes, containers, running job |
| `GET /api/branches` | `git fetch --prune`, remote branches newest first |
| `GET /api/commits?ref=<branch>&limit=50` | commit history |
| `GET /api/jobs`, `GET /api/jobs/<id>?offset=N` | job list / job with log tail |
| `/pull/<branch>` | auto-stash → fetch → checkout → `pull --ff-only` |
| `/checkout/<branch-or-sha>` | auto-stash → fetch → checkout (branch tracks origin; sha = detached) |
| `/stash/list`, `/stash/push`, `/stash/pop/<n\|name>`, `/stash/drop/<n\|name>` | stash management |
| `/restart/_CREA3x` | stop `crea3x-backend`, run `run_be.sh` detached, wait for `/health` |
| `/restart/_CREA3-Chatbot` | `run_chatbot.sh --down`, `run_chatbot.sh`, wait for `/health` |
| `POST /deploy {branch, targets, pull}` | pull + restart in one job |
| `POST /webhook/github` | HMAC-verified GitHub push → auto-deploy |

One job runs at a time; logs are kept in the `cicd_jobs` volume.
