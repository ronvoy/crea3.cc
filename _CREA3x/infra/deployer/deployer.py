#!/usr/bin/env python3
"""CREA3 deployer sidecar — a tiny HTTP API (stdlib only) that the platform's
admin endpoints call to (1) inspect the git checkout and the containers,
(2) list remote branches, (3) pull a branch and rebuild/restart the platform
(./run_be.sh) and/or the chatbot (docker compose up -d --build), streaming the
log of the job.

Security: not published on the host; only reachable on the compose network,
and every request must carry X-Deployer-Token = $DEPLOYER_TOKEN.

Environment
  DEPLOYER_TOKEN   shared secret (required)
  HOST_REPO_DIR    absolute path of the repository ON THE HOST; the same path
                   is bind-mounted into this container, so bind mounts issued
                   by run_be.sh resolve on the host
  PLATFORM_HEALTH  URL to poll after a platform deploy (default http://crea3x-backend:8000/health)
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

TOKEN = os.environ.get("DEPLOYER_TOKEN", "")
REPO = os.environ.get("HOST_REPO_DIR", "").rstrip("/") or "/repo"
PLATFORM_DIR = os.path.join(REPO, "_CREA3x")
CHATBOT_DIR = os.path.join(REPO, "_CREA3-Chatbot")
PLATFORM_HEALTH = os.environ.get("PLATFORM_HEALTH", "http://crea3x-backend:8000/health")
JOBS_DIR = os.environ.get("DEPLOYER_JOBS_DIR", "/var/lib/deployer/jobs")
GIT_ENV = {
    **os.environ,
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_SSH_COMMAND": "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/tmp/known_hosts",
}
TARGETS = ("platform", "chatbot")

try:
    os.makedirs(JOBS_DIR, exist_ok=True)
except OSError:
    JOBS_DIR = "/tmp/deployer-jobs"; os.makedirs(JOBS_DIR, exist_ok=True)
subprocess.run(["git", "config", "--global", "--add", "safe.directory", "*"], check=False)

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_run_lock = threading.Lock()   # one deploy at a time


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sh(cmd: list[str], cwd: str | None = None, timeout: int = 600) -> tuple[int, str]:
    p = subprocess.run(cmd, cwd=cwd, env=GIT_ENV, capture_output=True, text=True, timeout=timeout)
    return p.returncode, (p.stdout + p.stderr).strip()


# ── repo / containers ─────────────────────────────────────────────────────────
def repo_status() -> dict:
    if not os.path.isdir(os.path.join(REPO, ".git")):
        return {"ok": False, "error": f"no git checkout at {REPO} (set HOST_REPO_DIR)", "repo": REPO}
    _, branch = _sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], REPO)
    _, sha = _sh(["git", "rev-parse", "--short", "HEAD"], REPO)
    _, log = _sh(["git", "log", "-1", "--format=%s%n%an%n%cI"], REPO)
    _, dirty = _sh(["git", "status", "--porcelain", "--untracked-files=no"], REPO)
    _, remote = _sh(["git", "remote", "get-url", "origin"], REPO)
    parts = (log.split("\n") + ["", "", ""])[:3]
    return {
        "ok": True, "repo": REPO, "branch": branch, "head": sha,
        "subject": parts[0], "author": parts[1], "committed_at": parts[2],
        "dirty_files": len([l for l in dirty.splitlines() if l.strip()]),
        "remote": remote,
    }


def containers() -> list[dict]:
    code, out = _sh(["docker", "ps", "-a", "--format", "{{json .}}"], timeout=30)
    rows = []
    if code == 0:
        for line in out.splitlines():
            try:
                d = json.loads(line)
            except Exception:
                continue
            name = d.get("Names", "")
            if any(k in name for k in ("crea3x", "crea3-chatbot", "crea3_chatbot", "keycloak", "mailpit")):
                rows.append({"name": name, "image": d.get("Image"), "status": d.get("Status"), "state": d.get("State")})
    return rows


def branches() -> dict:
    code, out = _sh(["git", "fetch", "origin", "--prune"], REPO, timeout=120)
    if code != 0:
        return {"ok": False, "error": out[-800:], "branches": []}
    _, lst = _sh(["git", "for-each-ref", "--sort=-committerdate", "--format=%(refname:short)|%(objectname:short)|%(committerdate:iso8601)|%(subject)", "refs/remotes/origin"], REPO)
    items = []
    for line in lst.splitlines():
        ref, sha, date, subj = (line.split("|", 3) + ["", "", ""])[:4]
        if ref.endswith("/HEAD") or "/" not in ref:      # skip origin/HEAD (shown as bare "origin")
            continue
        items.append({"name": ref.split("/", 1)[1], "head": sha, "committed_at": date, "subject": subj})
    return {"ok": True, "branches": items}


# ── jobs ──────────────────────────────────────────────────────────────────────
def _job_log(job: dict, line: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    job["log"].append(f"[{stamp}] {line}")
    try:
        with open(os.path.join(JOBS_DIR, job["id"] + ".log"), "a") as f:
            f.write(f"[{stamp}] {line}\n")
    except Exception:
        pass


def _stream(job: dict, cmd: list[str], cwd: str, env: dict | None = None, timeout: int = 1800) -> int:
    """Run a command and stream its output into the job log."""
    _job_log(job, "$ " + " ".join(cmd))
    p = subprocess.Popen(cmd, cwd=cwd, env={**GIT_ENV, **(env or {})}, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True, bufsize=1)
    start = time.time()
    assert p.stdout is not None
    for line in p.stdout:
        _job_log(job, line.rstrip())
        if time.time() - start > timeout:
            p.kill(); _job_log(job, f"!! timed out after {timeout}s"); return 124
    return p.wait()


def _wait_health(job: dict, url: str, seconds: int = 180) -> bool:
    _job_log(job, f"waiting for {url} …")
    for _ in range(seconds // 3):
        code, _out = _sh(["curl", "-fsS", "-m", "3", url], timeout=10)
        if code == 0:
            _job_log(job, "healthy ✓"); return True
        time.sleep(3)
    _job_log(job, "!! not healthy within the timeout"); return False


def run_job(job: dict) -> None:
    with _run_lock:
        job["status"] = "running"; job["started_at"] = _now()
        ok = True
        try:
            branch, targets, pull = job["branch"], job["targets"], job["pull"]
            if pull:
                _job_log(job, f"== git: fetch + checkout {branch} + pull (ff-only)")
                if _stream(job, ["git", "fetch", "origin", "--prune"], REPO) != 0: raise RuntimeError("git fetch failed")
                _, cur = _sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], REPO)
                if cur != branch:
                    if _stream(job, ["git", "checkout", "-B", branch, "--track", f"origin/{branch}"], REPO) != 0:
                        raise RuntimeError("git checkout failed")
                if _stream(job, ["git", "pull", "--ff-only", "origin", branch], REPO) != 0:
                    raise RuntimeError("git pull failed (non fast-forward or dirty checkout?)")
                _, sha = _sh(["git", "rev-parse", "--short", "HEAD"], REPO)
                _job_log(job, f"now at {sha}")
            if "platform" in targets:
                _job_log(job, "== platform: ./run_be.sh (build SPA, build image, restart crea3x-backend)")
                rc = _stream(job, ["bash", os.path.join(PLATFORM_DIR, "run_be.sh")], PLATFORM_DIR,
                             env={"CREA3_DETACH": "1", "HOST_REPO_DIR": REPO})
                if rc != 0: raise RuntimeError(f"run_be.sh exited with {rc}")
                if not _wait_health(job, PLATFORM_HEALTH): ok = False
            if "chatbot" in targets:
                _job_log(job, "== chatbot: docker compose up -d --build")
                rc = _stream(job, ["docker", "compose", "-f", os.path.join(CHATBOT_DIR, "docker-compose.yml"), "up", "-d", "--build"], CHATBOT_DIR)
                if rc != 0: raise RuntimeError(f"chatbot compose exited with {rc}")
                _job_log(job, "chatbot containers: " + ", ".join(f"{c['name']} ({c['status']})" for c in containers() if "chatbot" in c["name"]))
            job["status"] = "done" if ok else "unhealthy"
        except Exception as exc:
            _job_log(job, f"!! {exc}"); job["status"] = "failed"; job["error"] = str(exc)
        finally:
            job["finished_at"] = _now()
            _job_log(job, f"== {job['status'].upper()}")


def start_job(body: dict) -> dict:
    branch = re.sub(r"[^A-Za-z0-9._/-]", "", str(body.get("branch") or ""))[:120]
    targets = [t for t in (body.get("targets") or ["platform"]) if t in TARGETS]
    if not branch: raise ValueError("branch is required")
    if not targets: raise ValueError("no valid target (platform, chatbot)")
    if _run_lock.locked(): raise RuntimeError("a deployment is already running")
    job = {"id": uuid.uuid4().hex[:12], "branch": branch, "targets": targets, "pull": bool(body.get("pull", True)),
           "status": "queued", "created_at": _now(), "started_at": None, "finished_at": None, "error": None,
           "by": str(body.get("by") or "")[:80], "log": []}
    with _jobs_lock:
        _jobs[job["id"]] = job
        for old in list(_jobs)[:-30]:   # keep the last 30 in memory
            _jobs.pop(old, None)
    threading.Thread(target=run_job, args=(job,), daemon=True).start()
    return job


def job_view(job: dict, offset: int = 0) -> dict:
    v = {k: v for k, v in job.items() if k != "log"}
    v["log"] = job["log"][offset:]
    v["log_len"] = len(job["log"])
    return v


# ── HTTP ──────────────────────────────────────────────────────────────────────
class H(BaseHTTPRequestHandler):
    def _json(self, code: int, obj) -> None:
        data = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def _auth(self) -> bool:
        if not TOKEN:
            self._json(503, {"error": "DEPLOYER_TOKEN not configured"}); return False
        if self.headers.get("X-Deployer-Token", "") != TOKEN:
            self._json(401, {"error": "bad token"}); return False
        return True

    def log_message(self, fmt, *args):  # quieter default logging
        if "/jobs/" not in str(args[0] if args else ""):
            super().log_message(fmt, *args)

    def do_GET(self):
        u = urlparse(self.path); p = u.path.rstrip("/")
        if p == "/health": return self._json(200, {"ok": True})
        if not self._auth(): return
        if p == "/status": return self._json(200, {"repo": repo_status(), "containers": containers(), "running": _run_lock.locked()})
        if p == "/branches": return self._json(200, branches())
        if p == "/jobs":
            with _jobs_lock: return self._json(200, {"jobs": [job_view(j)|{"log": []} for j in reversed(list(_jobs.values()))]})
        m = re.match(r"^/jobs/([a-f0-9]{12})$", p)
        if m:
            q = dict(x.split("=", 1) for x in u.query.split("&") if "=" in x)
            with _jobs_lock: job = _jobs.get(m.group(1))
            if not job: return self._json(404, {"error": "no such job"})
            return self._json(200, job_view(job, int(q.get("offset", "0") or 0)))
        self._json(404, {"error": "not found"})

    def do_POST(self):
        p = urlparse(self.path).path.rstrip("/")
        if not self._auth(): return
        n = int(self.headers.get("Content-Length") or 0)
        try: body = json.loads(self.rfile.read(n) or b"{}")
        except Exception: return self._json(400, {"error": "invalid JSON"})
        if p == "/deploy":
            try: return self._json(202, job_view(start_job(body)))
            except (ValueError, RuntimeError) as e: return self._json(409, {"error": str(e)})
        self._json(404, {"error": "not found"})


if __name__ == "__main__":
    print(f"deployer: repo={REPO} token={'set' if TOKEN else 'MISSING'} health={PLATFORM_HEALTH}")
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("DEPLOYER_PORT", "9000"))), H).serve_forever()
