"""
passenger_wsgi.py — cPanel / Phusion Passenger entry point

Routes
------
ANY /<anything>
    Forwards to the currently stored URL, PRESERVING the path and query string:
        crea3.cc/user            -> <target>/user
        crea3.cc/app/disputes/7  -> <target>/app/disputes/7
        crea3.cc/x?key=abc       -> <target>/x?key=abc
    Falls back to DEFAULT_URL if no URL has been set yet.

GET /alter/<token>/<url>
    If <token> matches SECRET_TOKEN, saves <url> as the new redirect target
    and renders it inside a full-screen iframe.
    Otherwise returns a 403 Invalid Token page.

Configuration
-------------
Change SECRET_TOKEN and DEFAULT_URL below as needed.
The active URL is persisted in redirect_url.txt next to this file so it
survives process restarts.
"""

import os
from urllib.parse import unquote

# ── Configuration ──────────────────────────────────────────────────────────────
SECRET_TOKEN = "9818"
DEFAULT_URL  = "https://crea3.serveousercontent.com"
URL_FILE     = os.path.join(os.path.dirname(os.path.abspath(__file__)), "redirect_url.txt")

# ── Helpers ────────────────────────────────────────────────────────────────────
def _read_url() -> str:
    try:
        with open(URL_FILE) as f:
            val = f.read().strip()
        return val if val else DEFAULT_URL
    except FileNotFoundError:
        return DEFAULT_URL


def _write_url(url: str) -> None:
    with open(URL_FILE, "w") as f:
        f.write(url.strip())


def _build_target(base: str, path: str, query: str) -> str:
    """Join the stored target with the incoming path + query string.

    crea3.cc/user?x=1  ->  <base>/user?x=1

    The query string must be preserved: verification / password-reset links
    carry their token there (e.g. ?key=...), so dropping it would break them.
    """
    base = (base or DEFAULT_URL).strip().rstrip("/")

    if not path:
        path = "/"
    if not path.startswith("/"):
        path = "/" + path

    # "/" adds nothing — avoids emitting a bare trailing slash.
    url = base if path == "/" else base + path
    if query:
        url = f"{url}?{query}"
    return url


def _page(body_html: str) -> bytes:
    return (
        "<!doctype html><html><head>"
        '<meta charset="utf-8">'
        "<style>*{margin:0;padding:0;box-sizing:border-box}"
        "body{font-family:sans-serif;display:flex;align-items:center;"
        "justify-content:center;height:100vh;background:#f4f4f4}"
        ".box{background:#fff;padding:2rem 3rem;border-radius:8px;"
        "box-shadow:0 2px 12px rgba(0,0,0,.12);text-align:center}"
        "</style></head>"
        f"<body><div class='box'>{body_html}</div></body></html>"
    ).encode("utf-8")


def _iframe_page(url: str) -> bytes:
    return (
        "<!doctype html><html><head>"
        '<meta charset="utf-8">'
        "<style>"
        "*{margin:0;padding:0;box-sizing:border-box}"
        "html,body,iframe{width:100%;height:100%;border:none;display:block}"
        "</style></head>"
        f'<body><iframe src="{url}" allowfullscreen></iframe></body></html>'
    ).encode("utf-8")


# ── WSGI Application ───────────────────────────────────────────────────────────
def application(environ, start_response):
    path = environ.get("PATH_INFO", "/")

    # ── /alter/<token>/<url> ──────────────────────────────────────────────────
    if path.startswith("/alter/"):
        rest  = path[len("/alter/"):]          # "9818/https://example.com/..."
        slash = rest.find("/")

        if slash == -1:
            # Missing URL portion
            start_response("400 Bad Request", [("Content-Type", "text/html; charset=utf-8")])
            return [_page("<h2>Bad request</h2><p>Usage: /alter/&lt;token&gt;/&lt;url&gt;</p>")]

        token    = rest[:slash]
        raw_url  = rest[slash + 1:]            # everything after the token slash
        url      = unquote(raw_url).strip()    # decode %3A etc.

        # Ensure a scheme is present
        if url and not url.startswith(("http://", "https://")):
            url = "https://" + url

        if token != SECRET_TOKEN:
            start_response("403 Forbidden", [("Content-Type", "text/html; charset=utf-8")])
            return [_page("<h2>&#x274C; Invalid token</h2>")]

        if not url:
            start_response("400 Bad Request", [("Content-Type", "text/html; charset=utf-8")])
            return [_page("<h2>Bad request</h2><p>No URL provided.</p>")]

        _write_url(url)
        start_response("200 OK", [("Content-Type", "text/html; charset=utf-8")])
        return [_iframe_page(url)]

    # ── everything else → forward to <target> + same path + same query ────────
    location = _build_target(_read_url(), path, environ.get("QUERY_STRING", ""))

    # 307 (not 302) so non-GET requests keep their method and body: a 302 would
    # turn a POST into a GET and drop the payload.
    status = "302 Found" if environ.get("REQUEST_METHOD", "GET").upper() in ("GET", "HEAD") else "307 Temporary Redirect"

    start_response(status, [
        ("Location", location),
        ("Content-Type", "text/plain"),
        ("Cache-Control", "no-store"),
    ])
    return [b""]
