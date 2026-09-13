"""
passenger_wsgi.py — cPanel / Phusion Passenger entry point

Acts as a REVERSE PROXY in front of the CREA3 platform: the browser only ever
sees this host (e.g. https://crea3.cc/...), while every request is fetched
server-side from the stored target (a tunnel URL, a VPS, …) and streamed back.
The target URL never appears in the address bar, in redirects, or in cookies.

Routes
------
ANY /<anything>
    Proxied to the stored target, preserving method, path, query string,
    headers and body:
        crea3.cc/user            -> <target>/user
        crea3.cc/app/disputes/7  -> <target>/app/disputes/7
        crea3.cc/x?key=abc       -> <target>/x?key=abc
    Falls back to DEFAULT_URL if no URL has been set yet.

GET /alter/<token>/<url>
    If <token> matches SECRET_TOKEN, saves <url> as the new target.
    Otherwise returns a 403 Invalid Token page.

Configuration
-------------
SECRET_TOKEN / DEFAULT_URL below. The active URL is persisted in
redirect_url.txt next to this file so it survives process restarts.

Set PROXY_MODE = False to fall back to the previous behaviour (302/307
redirects, target visible in the address bar).
"""

import os
import socket
import urllib.error
import urllib.request
from urllib.parse import unquote, urlsplit, urlunsplit

# ── Configuration ──────────────────────────────────────────────────────────────
SECRET_TOKEN = "9818"
DEFAULT_URL  = "https://crea3.serveousercontent.com"
URL_FILE     = os.path.join(os.path.dirname(os.path.abspath(__file__)), "redirect_url.txt")

# True  → fetch the target server-side and mask it behind this host (proxy).
# False → send the browser to the target (the old redirect behaviour).
PROXY_MODE = True

# Upstream timeout in seconds. Long AI answers are delivered through background
# jobs + polling, so requests here are short; raise it if you proxy slow pages.
PROXY_TIMEOUT = 120

# Streaming chunk size for response bodies.
CHUNK = 64 * 1024

# ── TLS enforcement ───────────────────────────────────────────────────────────
# True  → a plaintext request is answered with a permanent redirect to the same
#         URL on https, and every response carries HSTS so the browser never
#         tries http again. Same-domain links the app emits are upgraded too.
# False → serve whatever scheme the request arrived on.
FORCE_HTTPS = True

# How long browsers should remember to use https only (seconds; 1 year).
HSTS_MAX_AGE = 31536000

# Ask the browser to upgrade any http subresource on an HTML page, so a mixed
# http:// asset can never downgrade a page that was served over TLS.
UPGRADE_INSECURE_REQUESTS = True

# ── Tunnel interstitials ──────────────────────────────────────────────────────
# Tunnel providers show a "you are about to visit…" warning page to anything
# that looks like a browser navigation (browser User-Agent + Accept: text/html).
# Because this proxy forwards the visitor's own headers, that warning would
# otherwise appear INSIDE our domain. Each provider honours a skip header, so
# we send them all — they are ignored by hosts that do not use them.
TUNNEL_SKIP_HEADERS = {
    "serveo-skip-browser-warning": "true",   # Serveo
    "ngrok-skip-browser-warning": "true",    # ngrok
    "bypass-tunnel-reminder": "true",        # localtunnel
}

# Headers that belong to a single hop and must never be forwarded either way.
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "trailers", "transfer-encoding", "upgrade",
}


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
        "a{color:#2563eb}"
        "</style></head>"
        f"<body><div class='box'>{body_html}</div></body></html>"
    ).encode("utf-8")


def _client_scheme(environ) -> str:
    """Work out whether the BROWSER reached us over https.

    Passenger sits behind Apache, which terminates TLS and forwards plaintext,
    so `wsgi.url_scheme` alone says "http" even for a secure request. Getting
    this wrong in the strict direction causes an endless redirect loop, so every
    signal the front end may set is consulted before falling back.
    """
    forwarded = (environ.get("HTTP_X_FORWARDED_PROTO") or "").split(",")[0].strip().lower()
    if forwarded in ("http", "https"):
        return forwarded
    if (environ.get("HTTP_X_FORWARDED_SSL") or "").lower() == "on":
        return "https"
    if (environ.get("HTTP_FRONT_END_HTTPS") or "").lower() == "on":
        return "https"
    if (environ.get("HTTPS") or "").lower() in ("on", "1", "true"):
        return "https"
    if str(environ.get("SERVER_PORT") or "") == "443":
        return "https"
    return (environ.get("wsgi.url_scheme") or "http").lower()


def _https_redirect(environ, start_response):
    """Send a plaintext request to the identical https URL on this same host."""
    host = environ.get("HTTP_HOST") or environ.get("SERVER_NAME") or ""
    path = environ.get("PATH_INFO", "/") or "/"
    query = environ.get("QUERY_STRING", "")
    target = f"https://{host}{path}" + (f"?{query}" if query else "")

    # 308 keeps the method and body for POST/PUT/PATCH; 301 is the cacheable
    # permanent answer for plain navigation.
    method = environ.get("REQUEST_METHOD", "GET").upper()
    status = "301 Moved Permanently" if method in ("GET", "HEAD") else "308 Permanent Redirect"

    start_response(status, [
        ("Location", target),
        ("Content-Type", "text/plain; charset=utf-8"),
        ("Cache-Control", "no-store"),
        ("Strict-Transport-Security", f"max-age={HSTS_MAX_AGE}; includeSubDomains"),
    ])
    return [b""]


def _force_https_url(url: str, public_host: str) -> str:
    """Upgrade an http:// URL on OUR OWN domain to https."""
    if not FORCE_HTTPS or not url.startswith("http://"):
        return url
    parts = urlsplit(url)
    if public_host and parts.netloc == public_host:
        return urlunsplit(("https", parts.netloc, parts.path, parts.query, parts.fragment))
    return url


def _request_headers(environ, target_host: str, host_header: str) -> dict:
    """Rebuild the client's headers for the upstream request.

    The upstream sees the real client address and the PUBLIC host, so any
    absolute URL it generates points back at this domain rather than at the
    internal target.
    """
    headers = {}
    for key, value in environ.items():
        if not key.startswith("HTTP_"):
            continue
        name = key[5:].replace("_", "-").lower()
        if name in HOP_BY_HOP or name in ("host", "content-length"):
            continue
        headers[name] = value

    if environ.get("CONTENT_TYPE"):
        headers["content-type"] = environ["CONTENT_TYPE"]

    # Virtual hosts and tunnels route on Host, so it must name the target.
    headers["host"] = target_host

    # Never let a tunnel's browser-warning page reach the visitor.
    headers.update(TUNNEL_SKIP_HEADERS)

    # Fetch metadata describes the BROWSER's context with this proxy, not the
    # upstream hop, and is part of what triggers those warning pages.
    for stale in ("sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site", "sec-fetch-user"):
        headers.pop(stale, None)

    # Let the application build correct public links and log the real client.
    forwarded_for = environ.get("HTTP_X_FORWARDED_FOR")
    client = environ.get("REMOTE_ADDR", "")
    headers["x-forwarded-for"] = f"{forwarded_for}, {client}" if forwarded_for else client
    headers["x-forwarded-proto"] = "https" if FORCE_HTTPS else _client_scheme(environ)
    headers["x-forwarded-host"] = host_header
    headers["x-real-ip"] = client
    return headers


def _rewrite_location(value: str, target_base: str, public_base: str) -> str:
    """Point a redirect back at THIS host when it aims at the target.

    Without this the first redirect (e.g. "/" -> "/app") would hand the browser
    the internal URL and the mask would fall off.
    """
    if not value:
        return value
    t, p = urlsplit(target_base), urlsplit(public_base)
    v = urlsplit(value)
    if v.scheme and v.netloc and v.netloc == t.netloc:
        return urlunsplit((p.scheme, p.netloc, v.path, v.query, v.fragment))
    return value


def _clean_set_cookie(value: str, target_host: str) -> str:
    """Drop a Domain= that names the internal host.

    A cookie scoped to the tunnel domain would be ignored by the browser on
    this domain; removing the attribute makes it a host-only cookie here.
    """
    parts = [p for p in value.split(";")]
    kept = []
    for part in parts:
        name = part.strip().lower()
        if name.startswith("domain="):
            domain = name[len("domain="):].lstrip(".")
            if domain and domain in target_host:
                continue          # host-only cookie on the public domain
        kept.append(part)
    return ";".join(kept)


def _proxy(environ, start_response):
    """Fetch the target server-side and stream the response back unchanged."""
    target_base = (_read_url() or DEFAULT_URL).strip().rstrip("/")
    url = _build_target(target_base, environ.get("PATH_INFO", "/"),
                        environ.get("QUERY_STRING", ""))

    method = environ.get("REQUEST_METHOD", "GET").upper()
    host_header = environ.get("HTTP_HOST", "")
    # Links we hand back must always name https when TLS is enforced.
    scheme = "https" if FORCE_HTTPS else _client_scheme(environ)
    public_base = f"{scheme}://{host_header}" if host_header else ""
    target_host = urlsplit(target_base).netloc

    # Body: pass the input stream through when the client sent one.
    body = None
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
    except (TypeError, ValueError):
        length = 0
    if length > 0:
        body = environ["wsgi.input"].read(length)
    elif method in ("POST", "PUT", "PATCH") and environ.get("HTTP_TRANSFER_ENCODING"):
        body = environ["wsgi.input"].read()

    headers = _request_headers(environ, target_host, host_header)
    if body is not None:
        headers["content-length"] = str(len(body))

    req = urllib.request.Request(url, data=body, method=method)
    for name, value in headers.items():
        req.add_header(name, value)

    # Redirects must be handed to the browser (rewritten), never followed here:
    # following them silently would re-expose the target and break POSTs.
    opener = urllib.request.build_opener(_NoRedirect)

    try:
        resp = opener.open(req, timeout=PROXY_TIMEOUT)
    except urllib.error.HTTPError as exc:
        resp = exc                               # 4xx/5xx are valid responses
    except (urllib.error.URLError, socket.timeout, OSError) as exc:
        start_response("502 Bad Gateway", [("Content-Type", "text/html; charset=utf-8"),
                                           ("Cache-Control", "no-store")])
        return [_page(
            "<h2>Service temporarily unavailable</h2>"
            f"<p>The application could not be reached.</p>"
            f"<p style='color:#64748b;font-size:.85rem'>{type(exc).__name__}</p>"
        )]

    status = f"{resp.status} {resp.reason or ''}".strip()
    out_headers = []
    for name, value in resp.headers.items():
        low = name.lower()
        if low in HOP_BY_HOP or low == "content-length":
            continue                              # length is re-derived below
        if low == "location":
            value = _force_https_url(
                _rewrite_location(value, target_base, public_base), host_header)
        elif low == "set-cookie":
            value = _clean_set_cookie(value, target_host)
        out_headers.append((name, value))

    # Keep Content-Length when the upstream gave one and we are not streaming
    # an event stream; browsers handle both, but a correct length helps caches.
    content_length = resp.headers.get("Content-Length")
    ctype = resp.headers.get("Content-Type") or ""
    is_stream = "text/event-stream" in ctype
    if content_length and not is_stream:
        out_headers.append(("Content-Length", content_length))

    if FORCE_HTTPS:
        out_headers.append(("Strict-Transport-Security",
                            f"max-age={HSTS_MAX_AGE}; includeSubDomains"))
        if UPGRADE_INSECURE_REQUESTS and "text/html" in ctype:
            out_headers.append(("Content-Security-Policy", "upgrade-insecure-requests"))

    start_response(status, out_headers)

    if method == "HEAD":
        resp.close()
        return [b""]

    def stream():
        try:
            while True:
                chunk = resp.read(CHUNK)
                if not chunk:
                    break
                yield chunk
        finally:
            resp.close()

    return stream()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Return redirects to the caller instead of following them."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


# ── WSGI Application ───────────────────────────────────────────────────────────
def application(environ, start_response):
    path = environ.get("PATH_INFO", "/")

    # ── TLS first: nothing (not even /alter) is served over plaintext ─────────
    if FORCE_HTTPS and _client_scheme(environ) != "https":
        return _https_redirect(environ, start_response)

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
        start_response("200 OK", [("Content-Type", "text/html; charset=utf-8"),
                                  ("Cache-Control", "no-store")])
        return [_page(
            "<h2>&#x2705; Target updated</h2>"
            f"<p style='color:#64748b;font-size:.9rem;word-break:break-all'>{url}</p>"
            "<p style='margin-top:1rem'>It is served from this domain — "
            "<a href='/'>open the site</a>.</p>"
        )]

    # ── everything else ───────────────────────────────────────────────────────
    if PROXY_MODE:
        return _proxy(environ, start_response)

    # Legacy behaviour: hand the browser the target URL (target becomes visible).
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
