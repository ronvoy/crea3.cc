#!/usr/bin/env python3
"""CREA3 CI/CD console — stdlib-only HTTP service + single-page UI.

Routes (all except /health and / require the token, as header X-CICD-Token or
query ?token=…; action routes accept GET and POST):

  GET  /health                       liveness (no auth)
  GET  /                             the console UI (reads ?token=… once)
  GET  /api/status                   checkout, ahead/behind, dirty files, stashes, containers, running job
  GET  /api/branches                 git fetch --prune, then remote branches (newest first)
  GET  /api/commits?ref=&limit=      commit history of a branch / ref
  GET  /api/stash/list               stash entries
  GET  /api/jobs                     recent jobs;  GET /api/jobs/<id>?offset=N  job + log tail
  *    /pull                          pull the CURRENT branch (git add . + stash first, then fetch + pull --ff-only)
  *    /pull/<branch>                same for a given branch (checkout first)
  GET/POST /api/autosync {enabled}   auto-sync switch: every CICD_AUTO_SYNC_INTERVAL s (10) fetch the
                                     current branch and pull when origin is ahead
  *    /checkout/<branch|sha>        auto-stash local changes, fetch, checkout (branch tracks origin)
  *    /stash/list | /stash/push | /stash/pop/<n|name> | /stash/drop/<n|name>
  *    /restart/_CREA3x              stop crea3x-backend, re-run _CREA3x/run_be.sh (detached), wait for /health
  *    /restart/_CREA3-Chatbot       run_chatbot.sh --down, then run_chatbot.sh, wait for /health
  POST /deploy {branch, targets, pull}   pull + restart in one job
  POST /webhook/github               GitHub push webhook (HMAC) → auto-deploy CICD_AUTO_DEPLOY_BRANCH

Every state-changing route returns a job; the UI follows its log. One job runs
at a time. The repository is mounted at HOST_REPO_DIR (its host path) and the
host Docker daemon is reached through the mounted socket.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

TOKEN_ENV = os.environ.get("CICD_TOKEN", "")
REPO = os.environ.get("HOST_REPO_DIR", "").rstrip("/") or "/repo"
PLATFORM_DIR = os.path.join(REPO, "_CREA3x")
CHATBOT_DIR = os.path.join(REPO, "_CREA3-Chatbot")
PLATFORM_HEALTH = os.environ.get("PLATFORM_HEALTH", "http://host.docker.internal:8000/health")
CHATBOT_HEALTH = os.environ.get("CHATBOT_HEALTH", "http://host.docker.internal:8094/health")
WEBHOOK_SECRET = os.environ.get("CICD_WEBHOOK_SECRET", "")
AUTO_BRANCH = os.environ.get("CICD_AUTO_DEPLOY_BRANCH", "").strip()
AUTO_TARGETS = [t for t in os.environ.get("CICD_AUTO_DEPLOY_TARGETS", "_CREA3x").split(",") if t.strip()]
PORT = int(os.environ.get("CICD_PORT_INTERNAL", "8088"))
JOBS_DIR = os.environ.get("CICD_JOBS_DIR", "/var/lib/cicd/jobs")
# UI directory: by default the copy inside the image, but when the repository is
# mounted (the normal case) we serve _CICD/ui from it, so a `git pull` or a local
# edit updates the console without rebuilding the image.
_UI_IN_IMAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui")
_UI_IN_REPO = os.path.join(REPO, "_CICD", "ui")
UI_DIR = os.environ.get("CICD_UI_DIR") or (_UI_IN_REPO if os.path.isfile(os.path.join(_UI_IN_REPO, "index.html")) else _UI_IN_IMAGE)
TARGETS = ("_CREA3x", "_CREA3-Chatbot")
STARTED = time.time()
AUTO_SYNC_INTERVAL = int(os.environ.get("CICD_AUTO_SYNC_INTERVAL", "10"))     # seconds
AUTO_SYNC_DEFAULT = os.environ.get("CICD_AUTO_SYNC", "1") not in ("0", "false", "no")

GIT_ENV = {
    **os.environ,
    "GIT_TERMINAL_PROMPT": "0",
    "GIT_SSH_COMMAND": "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/tmp/known_hosts",
}
REF_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$")

# The token is read from the mounted _CICD/.env on every request (cached by
# mtime): the file is the single source of truth, so restoring env.sh or editing
# the token takes effect immediately, without recreating the container — the
# container's own CICD_TOKEN is only a fallback when the file is unreadable.
_ENV_FILE = os.path.join(REPO, "_CICD", ".env")
_token_cache: dict = {"mtime": None, "value": ""}


def current_token() -> str:
    try:
        mtime = os.path.getmtime(_ENV_FILE)
        if _token_cache["mtime"] != mtime:
            value = ""
            with open(_ENV_FILE) as f:
                for line in f:
                    if line.startswith("CICD_TOKEN="):
                        value = line.split("=", 1)[1].strip().strip('"').strip("'")
            _token_cache.update(mtime=mtime, value=value)
        if _token_cache["value"]:
            return _token_cache["value"]
    except OSError:
        pass
    return TOKEN_ENV

try:
    os.makedirs(JOBS_DIR, exist_ok=True)
except OSError:
    JOBS_DIR = "/tmp/cicd-jobs"
    os.makedirs(JOBS_DIR, exist_ok=True)
subprocess.run(["git", "config", "--global", "--add", "safe.directory", "*"], check=False)

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_run_lock = threading.Lock()   # one job at a time

# Auto-sync: every AUTO_SYNC_INTERVAL seconds fetch the current branch from
# origin and, when the checkout is behind, pull it (local changes are added and
# stashed first). The switch is persisted next to the job logs.
_AUTOSYNC_FILE = os.path.join(os.path.dirname(JOBS_DIR), "autosync.json")
_autosync = {"enabled": AUTO_SYNC_DEFAULT, "interval": AUTO_SYNC_INTERVAL, "last_check": None,
             "last_result": None, "branch": None, "pulls": 0}
try:
    with open(_AUTOSYNC_FILE) as _f:
        _autosync["enabled"] = bool(json.load(_f).get("enabled", AUTO_SYNC_DEFAULT))
except Exception:
    pass


def set_autosync(enabled: bool) -> dict:
    _autosync["enabled"] = bool(enabled)
    try:
        with open(_AUTOSYNC_FILE, "w") as f:
            json.dump({"enabled": _autosync["enabled"]}, f)
    except Exception:
        pass
    return dict(_autosync)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sh(cmd: list[str], cwd: str | None = None, timeout: int = 600) -> tuple[int, str]:
    try:
        p = subprocess.run(cmd, cwd=cwd, env=GIT_ENV, capture_output=True, text=True, timeout=timeout)
        return p.returncode, (p.stdout + p.stderr).strip()
    except subprocess.TimeoutExpired:
        return 124, f"timed out after {timeout}s: {' '.join(cmd)}"


def _valid_ref(ref: str) -> bool:
    return bool(REF_RE.match(ref)) and ".." not in ref and not ref.startswith("-")


# ── inspection ────────────────────────────────────────────────────────────────
def repo_status() -> dict:
    if not os.path.isdir(os.path.join(REPO, ".git")):
        return {"ok": False, "error": f"no git checkout at {REPO} (set HOST_REPO_DIR)", "repo": REPO}
    _, branch = _sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], REPO)
    _, sha = _sh(["git", "rev-parse", "--short", "HEAD"], REPO)
    _, full = _sh(["git", "rev-parse", "HEAD"], REPO)
    _, log = _sh(["git", "log", "-1", "--format=%s%n%an%n%cI"], REPO)
    _, dirty = _sh(["git", "status", "--porcelain"], REPO)
    _, remote = _sh(["git", "remote", "get-url", "origin"], REPO)
    parts = (log.split("\n") + ["", "", ""])[:3]
    ahead = behind = None
    if branch != "HEAD":
        code, ab = _sh(["git", "rev-list", "--left-right", "--count", f"HEAD...origin/{branch}"], REPO)
        if code == 0 and "\t" in ab:
            a, b = ab.split("\t")
            ahead, behind = int(a), int(b)
    dirty_files = [l for l in dirty.splitlines() if l.strip()]
    return {
        "ok": True, "repo": REPO, "branch": branch, "detached": branch == "HEAD", "head": sha, "head_full": full,
        "subject": parts[0], "author": parts[1], "committed_at": parts[2],
        "ahead": ahead, "behind": behind,
        "dirty_files": dirty_files[:50], "dirty_count": len(dirty_files),
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
            if any(k in name for k in ("crea3", "keycloak", "mailpit")):
                rows.append({"name": name, "image": d.get("Image"), "status": d.get("Status"), "state": d.get("State")})
    return sorted(rows, key=lambda r: r["name"])


def stash_list() -> list[dict]:
    _, out = _sh(["git", "stash", "list", "--format=%gd|%cI|%s"], REPO)
    items = []
    for line in out.splitlines():
        ref, date, subj = (line.split("|", 2) + ["", ""])[:3]
        items.append({"ref": ref, "index": int(re.sub(r"\D", "", ref) or 0), "date": date, "subject": subj})
    return items


def branches() -> dict:
    code, out = _sh(["git", "fetch", "origin", "--prune"], REPO, timeout=120)
    if code != 0:
        return {"ok": False, "error": out[-800:], "branches": []}
    _, lst = _sh(["git", "for-each-ref", "--sort=-committerdate",
                  "--format=%(refname:short)|%(objectname:short)|%(committerdate:iso8601)|%(authorname)|%(subject)",
                  "refs/remotes/origin"], REPO)
    _, cur = _sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], REPO)
    items = []
    for line in lst.splitlines():
        ref, sha, date, author, subj = (line.split("|", 4) + ["", "", "", ""])[:5]
        if ref.endswith("/HEAD") or "/" not in ref:
            continue
        name = ref.split("/", 1)[1]
        items.append({"name": name, "head": sha, "committed_at": date, "author": author, "subject": subj, "current": name == cur})
    return {"ok": True, "current": cur, "branches": items}


def commits(ref: str, limit: int) -> dict:
    if not _valid_ref(ref):
        return {"ok": False, "error": "bad ref", "commits": []}
    target = ref
    code, _ = _sh(["git", "rev-parse", "--verify", "--quiet", f"origin/{ref}"], REPO)
    if code == 0:
        target = f"origin/{ref}"
    code, out = _sh(["git", "log", target, f"-{max(1, min(limit, 200))}", "--date=iso-strict",
                     "--format=%H|%h|%an|%cI|%s|%D"], REPO)
    if code != 0:
        return {"ok": False, "error": out[-300:], "commits": []}
    _, head = _sh(["git", "rev-parse", "HEAD"], REPO)
    rows = []
    for line in out.splitlines():
        full, short, author, date, subj, refs = (line.split("|", 5) + [""] * 6)[:6]
        rows.append({"sha": full, "short": short, "author": author, "date": date, "subject": subj,
                     "refs": [r.strip() for r in refs.split(",") if r.strip()], "is_head": full == head})
    return {"ok": True, "ref": target, "commits": rows}


# ── jobs ──────────────────────────────────────────────────────────────────────
def _log(job: dict, line: str) -> None:
    stamp = datetime.now().strftime("%H:%M:%S")
    job["log"].append(f"[{stamp}] {line}")
    try:
        with open(os.path.join(JOBS_DIR, job["id"] + ".log"), "a") as f:
            f.write(f"[{stamp}] {line}\n")
    except Exception:
        pass


def _stream(job: dict, cmd: list[str], cwd: str, env: dict | None = None, timeout: int = 1800) -> int:
    _log(job, "$ " + " ".join(cmd))
    try:
        p = subprocess.Popen(cmd, cwd=cwd, env={**GIT_ENV, **(env or {})}, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, text=True, bufsize=1)
    except FileNotFoundError as e:
        _log(job, f"!! {e}")
        return 127
    start = time.time()
    assert p.stdout is not None
    for line in p.stdout:
        _log(job, line.rstrip())
        if time.time() - start > timeout:
            p.kill(); _log(job, f"!! timed out after {timeout}s"); return 124
    return p.wait()


def _wait_health(job: dict, url: str, seconds: int = 240) -> bool:
    _log(job, f"waiting for {url} …")
    for _ in range(max(1, seconds // 3)):
        code, _out = _sh(["curl", "-fsS", "-m", "3", url], timeout=10)
        if code == 0:
            _log(job, "healthy ✓"); return True
        time.sleep(3)
    _log(job, "!! not healthy within the timeout"); return False


def _auto_stash(job: dict, why: str) -> bool:
    _, dirty = _sh(["git", "status", "--porcelain"], REPO)
    if not dirty.strip():
        return False
    n = len(dirty.splitlines())
    _log(job, f"{n} local change(s) — git add . + git stash before {why}")
    # `git add -A` stages untracked files too, so a plain `git stash push` keeps
    # them; `--include-untracked` is deliberately NOT used — it also tries to
    # delete untracked directories such as Docker mount points owned by root
    # (backend/frontend_dist/), fails, and reports the stash as failed.
    if _stream(job, ["git", "add", "-A"], REPO) != 0:
        raise RuntimeError("git add failed")
    rc = _stream(job, ["git", "stash", "push", "-m",
                       f"cicd {datetime.now().strftime('%Y-%m-%d %H:%M')} before {why}"], REPO)
    _, still = _sh(["git", "status", "--porcelain", "--untracked-files=no"], REPO)
    if rc != 0 or still.strip():
        raise RuntimeError("git stash failed — local changes are still in the working tree; nothing was pulled")
    return True


def step_pull(job: dict, branch: str) -> None:
    _log(job, f"== pull {branch}")
    _auto_stash(job, f"pull {branch}")
    if _stream(job, ["git", "fetch", "origin", "--prune"], REPO) != 0:
        raise RuntimeError("git fetch failed")
    _, cur = _sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], REPO)
    if cur != branch:
        if _stream(job, ["git", "checkout", "-B", branch, "--track", f"origin/{branch}"], REPO) != 0:
            raise RuntimeError("git checkout failed")
    if _stream(job, ["git", "pull", "--ff-only", "origin", branch], REPO) != 0:
        raise RuntimeError("git pull failed (non fast-forward?)")
    _, sha = _sh(["git", "log", "-1", "--format=%h %s"], REPO)
    _log(job, f"now at {sha}")


def step_checkout(job: dict, ref: str) -> None:
    _log(job, f"== checkout {ref}")
    _auto_stash(job, f"checkout {ref}")
    _stream(job, ["git", "fetch", "origin", "--prune"], REPO)
    code, _ = _sh(["git", "rev-parse", "--verify", "--quiet", f"origin/{ref}"], REPO)
    if code == 0:
        cmd = ["git", "checkout", "-B", ref, "--track", f"origin/{ref}"]
    else:
        cmd = ["git", "checkout", "--detach", ref]
    if _stream(job, cmd, REPO) != 0:
        raise RuntimeError("git checkout failed")
    _, sha = _sh(["git", "log", "-1", "--format=%h %s"], REPO)
    _log(job, f"now at {sha}")


def step_restart_platform(job: dict) -> bool:
    _log(job, "== restart _CREA3x: stop crea3x-backend, run_be.sh (detached)")
    _stream(job, ["pkill", "-f", "run_be.sh"], REPO)                       # a previous run of ours, if any
    _stream(job, ["docker", "rm", "-f", "crea3x-backend"], REPO)           # ends a foreground run_be.sh too
    rc = _stream(job, ["bash", os.path.join(PLATFORM_DIR, "run_be.sh")], PLATFORM_DIR,
                 env={"CREA3_DETACH": "1", "HOST_REPO_DIR": REPO})
    if rc != 0:
        raise RuntimeError(f"run_be.sh exited with {rc}")
    return _wait_health(job, PLATFORM_HEALTH)


def step_restart_chatbot(job: dict) -> bool:
    _log(job, "== restart _CREA3-Chatbot: run_chatbot.sh --down, then run_chatbot.sh")
    script = os.path.join(CHATBOT_DIR, "run_chatbot.sh")
    _stream(job, ["bash", script, "--down"], CHATBOT_DIR)
    rc = _stream(job, ["bash", script], CHATBOT_DIR, env={"CHATBOT_HEALTH_HOST": "host.docker.internal"})
    if rc != 0:
        raise RuntimeError(f"run_chatbot.sh exited with {rc}")
    return _wait_health(job, CHATBOT_HEALTH, 120)


def run_job(job: dict) -> None:
    with _run_lock:
        job["status"] = "running"; job["started_at"] = _now()
        healthy = True
        try:
            for step in job["steps"]:
                kind, arg = step["kind"], step.get("arg")
                if kind == "pull":
                    step_pull(job, arg)
                elif kind == "checkout":
                    step_checkout(job, arg)
                elif kind == "stash_pop":
                    if _stream(job, ["git", "stash", "pop", arg], REPO) != 0: raise RuntimeError("stash pop failed (conflicts?)")
                elif kind == "stash_drop":
                    if _stream(job, ["git", "stash", "drop", arg], REPO) != 0: raise RuntimeError("stash drop failed")
                elif kind == "stash_push":
                    if not _auto_stash(job, "manual stash"): _log(job, "nothing to stash")
                elif kind == "restart":
                    if arg == "_CREA3x":
                        healthy = step_restart_platform(job) and healthy
                    elif arg == "_CREA3-Chatbot":
                        healthy = step_restart_chatbot(job) and healthy
            job["status"] = "done" if healthy else "unhealthy"
        except Exception as exc:
            _log(job, f"!! {exc}"); job["status"] = "failed"; job["error"] = str(exc)
        finally:
            job["finished_at"] = _now()
            _log(job, f"== {job['status'].upper()}")


def _current_branch() -> str:
    _, b = _sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], REPO)
    return "" if b in ("", "HEAD") else b


def auto_sync_loop() -> None:
    while True:
        time.sleep(max(3, _autosync["interval"]))
        if not _autosync["enabled"] or _run_lock.locked():
            continue
        branch = _current_branch()
        _autosync["branch"] = branch or None
        _autosync["last_check"] = _now()
        if not branch:
            _autosync["last_result"] = "detached HEAD — nothing to track"
            continue
        code, out = _sh(["git", "fetch", "origin", branch, "--quiet"], REPO, timeout=90)
        if code != 0:
            _autosync["last_result"] = f"fetch failed: {out[-160:]}"
            continue
        code, ab = _sh(["git", "rev-list", "--left-right", "--count", f"HEAD...origin/{branch}"], REPO)
        behind = int(ab.split("\t")[1]) if code == 0 and "\t" in ab else 0
        if behind <= 0:
            _autosync["last_result"] = "up to date"
            continue
        _autosync["last_result"] = f"{behind} new commit(s) on origin/{branch} — pulling"
        try:
            start_job(f"auto-sync: pull {branch}", [{"kind": "pull", "arg": branch}], by="auto-sync")
            _autosync["pulls"] += 1
        except RuntimeError as e:
            _autosync["last_result"] = str(e)


def start_job(title: str, steps: list[dict], by: str = "") -> dict:
    if _run_lock.locked():
        raise RuntimeError("a job is already running")
    job = {"id": uuid.uuid4().hex[:12], "title": title, "steps": steps, "status": "queued",
           "created_at": _now(), "started_at": None, "finished_at": None, "error": None, "by": by[:80], "log": []}
    with _jobs_lock:
        _jobs[job["id"]] = job
        for old in list(_jobs)[:-40]:
            _jobs.pop(old, None)
    threading.Thread(target=run_job, args=(job,), daemon=True).start()
    return job


def job_view(job: dict, offset: int = 0, with_log: bool = True) -> dict:
    v = {k: val for k, val in job.items() if k != "log"}
    v["log"] = job["log"][offset:] if with_log else []
    v["log_len"] = len(job["log"])
    return v


# ── HTTP ──────────────────────────────────────────────────────────────────────
class H(BaseHTTPRequestHandler):
    server_version = "crea3-cicd/1.0"

    def _json(self, code: int, obj) -> None:
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _file(self, path: str, ctype: str) -> None:
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError:
            return self._json(404, {"error": "not found"})
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _auth(self, q: dict) -> bool:
        token = current_token()
        if not token:
            self._json(503, {"error": "CICD_TOKEN not configured (set it in _CICD/.env and reload)"}); return False
        given = self.headers.get("X-CICD-Token") or (q.get("token") or [""])[0]
        if not hmac.compare_digest(given, token):
            self._json(401, {"error": "bad token"}); return False
        return True

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        try:
            return json.loads(raw or b"{}")
        except Exception:
            return {}

    def log_message(self, fmt, *args):
        if "/api/jobs/" not in str(args[0] if args else "") and "/api/status" not in str(args[0] if args else ""):
            super().log_message(fmt, *args)

    def _who(self) -> str:
        return self.headers.get("X-CICD-By") or self.client_address[0]

    def _action(self, p: str, q: dict, body: dict) -> bool:
        """Action routes shared by GET and POST. Returns True when handled."""
        seg = [unquote(x) for x in p.strip("/").split("/")]
        try:
            if seg[0] == "pull" and len(seg) == 1:                       # current branch
                cur = _current_branch()
                if not cur:
                    self._json(409, {"error": "detached HEAD — choose a branch"}); return True
                self._json(202, job_view(start_job(f"pull {cur}", [{"kind": "pull", "arg": cur}], self._who()))); return True
            if seg[0] == "api" and len(seg) == 2 and seg[1] == "autosync":
                if body and "enabled" in body:
                    self._json(200, set_autosync(bool(body["enabled"]))); return True
                self._json(200, dict(_autosync)); return True
            if seg[0] == "pull" and len(seg) == 2 and _valid_ref(seg[1]):
                self._json(202, job_view(start_job(f"pull {seg[1]}", [{"kind": "pull", "arg": seg[1]}], self._who()))); return True
            if seg[0] == "checkout" and len(seg) == 2 and _valid_ref(seg[1]):
                self._json(202, job_view(start_job(f"checkout {seg[1]}", [{"kind": "checkout", "arg": seg[1]}], self._who()))); return True
            if seg[0] == "stash":
                if len(seg) == 2 and seg[1] == "list":
                    self._json(200, {"stashes": stash_list()}); return True
                if len(seg) == 2 and seg[1] == "push":
                    self._json(202, job_view(start_job("stash local changes", [{"kind": "stash_push"}], self._who()))); return True
                if len(seg) == 3 and seg[1] in ("pop", "drop"):
                    ref = seg[2] if seg[2].startswith("stash@{") else (f"stash@{{{seg[2]}}}" if seg[2].isdigit() else None)
                    if ref is None:   # by name
                        hit = next((s for s in stash_list() if seg[2] in s["subject"]), None)
                        ref = hit["ref"] if hit else None
                    if not ref:
                        self._json(404, {"error": "no such stash"}); return True
                    self._json(202, job_view(start_job(f"stash {seg[1]} {ref}", [{"kind": f"stash_{seg[1]}", "arg": ref}], self._who()))); return True
            if seg[0] == "restart" and len(seg) == 2 and seg[1] in TARGETS:
                self._json(202, job_view(start_job(f"restart {seg[1]}", [{"kind": "restart", "arg": seg[1]}], self._who()))); return True
            if seg[0] == "deploy" and len(seg) == 1:
                branch = str(body.get("branch") or (q.get("branch") or [""])[0])
                targets = body.get("targets") or q.get("targets", [])
                if isinstance(targets, str): targets = targets.split(",")
                targets = [t for t in targets if t in TARGETS] or ["_CREA3x"]
                pull = body.get("pull", True) if body else (q.get("pull", ["1"])[0] != "0")
                steps = ([{"kind": "pull", "arg": branch}] if pull else []) + [{"kind": "restart", "arg": t} for t in targets]
                if pull and not _valid_ref(branch):
                    self._json(400, {"error": "branch is required"}); return True
                self._json(202, job_view(start_job(f"deploy {branch or 'HEAD'} → {', '.join(targets)}", steps, self._who()))); return True
        except RuntimeError as e:
            self._json(409, {"error": str(e)}); return True
        return False

    def do_GET(self):
        u = urlparse(self.path); p = u.path.rstrip("/") or "/"; q = parse_qs(u.query)
        if p == "/health":
            return self._json(200, {"ok": True, "uptime_s": int(time.time() - STARTED)})
        if p == "/":
            return self._file(os.path.join(UI_DIR, "index.html"), "text/html; charset=utf-8")
        if not self._auth(q):
            return
        if p == "/api/status":
            with _jobs_lock:
                running = next((job_view(j, with_log=False) for j in _jobs.values() if j["status"] == "running"), None)
            return self._json(200, {"repo": repo_status(), "containers": containers(), "stashes": stash_list(),
                                    "running": running, "auto_deploy": {"branch": AUTO_BRANCH, "targets": AUTO_TARGETS, "webhook": bool(WEBHOOK_SECRET)},
                                    "auto_sync": dict(_autosync), "uptime_s": int(time.time() - STARTED)})
        if p == "/api/autosync":
            return self._json(200, dict(_autosync))
        if p == "/api/branches":
            return self._json(200, branches())
        if p == "/api/commits":
            return self._json(200, commits((q.get("ref") or ["HEAD"])[0], int((q.get("limit") or ["50"])[0])))
        if p == "/api/stash/list":
            return self._json(200, {"stashes": stash_list()})
        if p == "/api/jobs":
            with _jobs_lock:
                return self._json(200, {"jobs": [job_view(j, with_log=False) for j in reversed(list(_jobs.values()))]})
        m = re.match(r"^/api/jobs/([a-f0-9]{12})$", p)
        if m:
            with _jobs_lock:
                job = _jobs.get(m.group(1))
            if not job:
                return self._json(404, {"error": "no such job"})
            return self._json(200, job_view(job, int((q.get("offset") or ["0"])[0] or 0)))
        if self._action(p, q, {}):
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path); p = u.path.rstrip("/"); q = parse_qs(u.query)
        if p == "/webhook/github":
            return self._github(self._raw_body())
        if not self._auth(q):
            return
        if self._action(p, q, self._body()):
            return
        self._json(404, {"error": "not found"})

    def _raw_body(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def _github(self, raw: bytes) -> None:
        """GitHub 'push' webhook: verify X-Hub-Signature-256, auto-deploy when the
        pushed branch is CICD_AUTO_DEPLOY_BRANCH."""
        if not WEBHOOK_SECRET:
            return self._json(503, {"error": "CICD_WEBHOOK_SECRET not configured"})
        sig = self.headers.get("X-Hub-Signature-256", "")
        want = "sha256=" + hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, want):
            return self._json(401, {"error": "bad signature"})
        try:
            payload = json.loads(raw or b"{}")
        except Exception:
            return self._json(400, {"error": "invalid JSON"})
        event = self.headers.get("X-GitHub-Event", "")
        ref = str(payload.get("ref") or "")
        branch = ref.split("refs/heads/", 1)[1] if ref.startswith("refs/heads/") else ""
        if event != "push" or not branch:
            return self._json(200, {"ok": True, "ignored": event or "no-branch"})
        if not AUTO_BRANCH or branch != AUTO_BRANCH:
            return self._json(200, {"ok": True, "ignored": f"push to {branch} (auto-deploy branch: {AUTO_BRANCH or 'none'})"})
        try:
            steps = [{"kind": "pull", "arg": branch}] + [{"kind": "restart", "arg": t} for t in AUTO_TARGETS if t in TARGETS]
            job = start_job(f"webhook: deploy {branch}", steps, by=f"github:{(payload.get('pusher') or {}).get('name', '')}")
            return self._json(202, job_view(job, with_log=False))
        except RuntimeError as e:
            return self._json(409, {"error": str(e)})


if __name__ == "__main__":
    print(f"cicd: repo={REPO} ui={UI_DIR} token={'from ' + _ENV_FILE if current_token() and current_token() != TOKEN_ENV else ('set' if current_token() else 'MISSING')} "
          f"port={PORT} auto_deploy={AUTO_BRANCH or '-'} "
          f"auto_sync={'on' if _autosync['enabled'] else 'off'}/{AUTO_SYNC_INTERVAL}s")
    threading.Thread(target=auto_sync_loop, name="auto-sync", daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
