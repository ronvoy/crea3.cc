<?php
/**
 * index.php — PHP / cPanel (mod_php or PHP-FPM) entry point
 *
 * A PHP port of passenger_wsgi.py. Acts as a REVERSE PROXY in front of the
 * CREA3 platform: the browser only ever sees this host (e.g. https://crea3.cc/…),
 * while every request is fetched server-side from the stored target (a tunnel
 * URL, a VPS, …) and streamed back. The target URL never appears in the address
 * bar, in redirects, or in cookies.
 *
 * Routes
 * ------
 * ANY /<anything>
 *     Proxied to the stored target, preserving method, path, query string,
 *     headers and body:
 *         crea3.cc/user            -> <target>/user
 *         crea3.cc/app/disputes/7  -> <target>/app/disputes/7
 *         crea3.cc/x?key=abc       -> <target>/x?key=abc
 *     Falls back to DEFAULT_URL if no URL has been set yet.
 *
 * GET /alter/<token>/<url>
 *     If <token> matches SECRET_TOKEN, saves <url> as the new target.
 *     Otherwise returns a 403 Invalid Token page.
 *
 * Configuration
 * -------------
 * SECRET_TOKEN / DEFAULT_URL below. The active URL is persisted in
 * redirect_url.txt next to this file so it survives process restarts.
 *
 * Set PROXY_MODE = false to fall back to the previous behaviour (302/307
 * redirects, target visible in the address bar).
 *
 * Routing note
 * ------------
 * Unlike WSGI, PHP serves files directly, so every request must be funnelled
 * to this script. Ship the .htaccess below (or an equivalent nginx rewrite)
 * next to it:
 *
 *     RewriteEngine On
 *     RewriteCond %{REQUEST_FILENAME} !-f
 *     RewriteRule ^ index.php [QSA,L]
 *
 * The `!-f` guard lets real files (favicon, etc.) still be served if present;
 * remove it to force absolutely everything through the proxy.
 */

// ── Configuration ──────────────────────────────────────────────────────────────
const SECRET_TOKEN = "9818";
const DEFAULT_URL  = "https://crea3.serveousercontent.com";
define("URL_FILE", __DIR__ . "/redirect_url.txt");

// true  → fetch the target server-side and mask it behind this host (proxy).
// false → send the browser to the target (the old redirect behaviour).
const PROXY_MODE = true;

// Upstream timeout in seconds. Long AI answers are delivered through background
// jobs + polling, so requests here are short; raise it if you proxy slow pages.
const PROXY_TIMEOUT = 120;

// Streaming chunk size for response bodies.
const CHUNK = 65536; // 64 * 1024

// ── TLS enforcement ───────────────────────────────────────────────────────────
// true  → a plaintext request is answered with a permanent redirect to the same
//         URL on https, and every response carries HSTS so the browser never
//         tries http again. Same-domain links the app emits are upgraded too.
// false → serve whatever scheme the request arrived on.
const FORCE_HTTPS = true;

// How long browsers should remember to use https only (seconds; 1 year).
const HSTS_MAX_AGE = 31536000;

// Ask the browser to upgrade any http subresource on an HTML page, so a mixed
// http:// asset can never downgrade a page that was served over TLS.
const UPGRADE_INSECURE_REQUESTS = true;

// ── Tunnel interstitials ──────────────────────────────────────────────────────
// Tunnel providers show a "you are about to visit…" warning page to anything
// that looks like a browser navigation (browser User-Agent + Accept: text/html).
// Because this proxy forwards the visitor's own headers, that warning would
// otherwise appear INSIDE our domain. Each provider honours a skip header, so
// we send them all — they are ignored by hosts that do not use them.
const TUNNEL_SKIP_HEADERS = [
    "serveo-skip-browser-warning" => "true",   // Serveo
    "ngrok-skip-browser-warning"  => "true",   // ngrok
    "bypass-tunnel-reminder"      => "true",   // localtunnel
];

// Headers that belong to a single hop and must never be forwarded either way.
const HOP_BY_HOP = [
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "trailers", "transfer-encoding", "upgrade",
];


// ── Helpers ────────────────────────────────────────────────────────────────────
function read_url(): string
{
    $val = @file_get_contents(URL_FILE);
    if ($val === false) {
        return DEFAULT_URL;
    }
    $val = trim($val);
    return $val !== "" ? $val : DEFAULT_URL;
}


function write_url(string $url): void
{
    file_put_contents(URL_FILE, trim($url), LOCK_EX);
}


/**
 * Join the stored target with the incoming path + query string.
 *
 * crea3.cc/user?x=1  ->  <base>/user?x=1
 *
 * The query string must be preserved: verification / password-reset links
 * carry their token there (e.g. ?key=...), so dropping it would break them.
 */
function build_target(string $base, string $path, string $query): string
{
    $base = rtrim(trim($base !== "" ? $base : DEFAULT_URL), "/");

    if ($path === "") {
        $path = "/";
    }
    if ($path[0] !== "/") {
        $path = "/" . $path;
    }

    // "/" adds nothing — avoids emitting a bare trailing slash.
    $url = $path === "/" ? $base : $base . $path;
    if ($query !== "") {
        $url = "$url?$query";
    }
    return $url;
}


function render_page(string $body_html): string
{
    return "<!doctype html><html><head>"
        . '<meta charset="utf-8">'
        . "<style>*{margin:0;padding:0;box-sizing:border-box}"
        . "body{font-family:sans-serif;display:flex;align-items:center;"
        . "justify-content:center;height:100vh;background:#f4f4f4}"
        . ".box{background:#fff;padding:2rem 3rem;border-radius:8px;"
        . "box-shadow:0 2px 12px rgba(0,0,0,.12);text-align:center}"
        . "a{color:#2563eb}"
        . "</style></head>"
        . "<body><div class='box'>$body_html</div></body></html>";
}


/**
 * Work out whether the BROWSER reached us over https.
 *
 * PHP may sit behind Apache/nginx, which terminates TLS and forwards plaintext,
 * so $_SERVER['HTTPS'] alone can say "off" even for a secure request. Getting
 * this wrong in the strict direction causes an endless redirect loop, so every
 * signal the front end may set is consulted before falling back.
 */
function client_scheme(): string
{
    $forwarded = strtolower(trim(explode(",", $_SERVER["HTTP_X_FORWARDED_PROTO"] ?? "")[0]));
    if ($forwarded === "http" || $forwarded === "https") {
        return $forwarded;
    }
    if (strtolower($_SERVER["HTTP_X_FORWARDED_SSL"] ?? "") === "on") {
        return "https";
    }
    if (strtolower($_SERVER["HTTP_FRONT_END_HTTPS"] ?? "") === "on") {
        return "https";
    }
    $https = strtolower($_SERVER["HTTPS"] ?? "");
    if ($https === "on" || $https === "1" || $https === "true") {
        return "https";
    }
    if ((string)($_SERVER["SERVER_PORT"] ?? "") === "443") {
        return "https";
    }
    return "http";
}


/** Send a plaintext request to the identical https URL on this same host. */
function https_redirect(): void
{
    $host  = $_SERVER["HTTP_HOST"] ?? ($_SERVER["SERVER_NAME"] ?? "");
    $path  = $_SERVER["REQUEST_URI"] ?? "/";
    // REQUEST_URI already carries the query string, so use it whole.
    $target = "https://$host$path";

    // 308 keeps the method and body for POST/PUT/PATCH; 301 is the cacheable
    // permanent answer for plain navigation.
    $method = strtoupper($_SERVER["REQUEST_METHOD"] ?? "GET");
    $status = ($method === "GET" || $method === "HEAD")
        ? "301 Moved Permanently"
        : "308 Permanent Redirect";

    header("HTTP/1.1 $status");
    header("Location: $target");
    header("Content-Type: text/plain; charset=utf-8");
    header("Cache-Control: no-store");
    header("Strict-Transport-Security: max-age=" . HSTS_MAX_AGE . "; includeSubDomains");
}


/** Upgrade an http:// URL on OUR OWN domain to https. */
function force_https_url(string $url, string $public_host): string
{
    if (!FORCE_HTTPS || strncmp($url, "http://", 7) !== 0) {
        return $url;
    }
    $parts = parse_url($url);
    if ($parts === false) {
        return $url;
    }
    $netloc = ($parts["host"] ?? "");
    if (isset($parts["port"])) {
        $netloc .= ":" . $parts["port"];
    }
    if ($public_host !== "" && $netloc === $public_host) {
        $rebuilt = "https://" . $netloc . ($parts["path"] ?? "");
        if (isset($parts["query"])) {
            $rebuilt .= "?" . $parts["query"];
        }
        if (isset($parts["fragment"])) {
            $rebuilt .= "#" . $parts["fragment"];
        }
        return $rebuilt;
    }
    return $url;
}


/**
 * Rebuild the client's headers for the upstream request.
 *
 * The upstream sees the PUBLIC host and the real client address, so any
 * absolute URL it generates points back at this domain rather than at the
 * internal target.
 *
 * @return array<string,string> lowercase header name => value
 */
function request_headers(string $target_host, string $host_header): array
{
    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (strncmp($key, "HTTP_", 5) !== 0) {
            continue;
        }
        $name = strtolower(str_replace("_", "-", substr($key, 5)));
        if (in_array($name, HOP_BY_HOP, true) || $name === "host" || $name === "content-length") {
            continue;
        }
        $headers[$name] = $value;
    }

    // CONTENT_TYPE / CONTENT_LENGTH arrive without the HTTP_ prefix.
    if (!empty($_SERVER["CONTENT_TYPE"])) {
        $headers["content-type"] = $_SERVER["CONTENT_TYPE"];
    }

    // Virtual hosts and tunnels route on Host, so it must name the target.
    $headers["host"] = $target_host;

    // Never let a tunnel's browser-warning page reach the visitor.
    foreach (TUNNEL_SKIP_HEADERS as $k => $v) {
        $headers[$k] = $v;
    }

    // Fetch metadata describes the BROWSER's context with this proxy, not the
    // upstream hop, and is part of what triggers those warning pages.
    foreach (["sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site", "sec-fetch-user"] as $stale) {
        unset($headers[$stale]);
    }

    // Let the application build correct public links and log the real client.
    $forwarded_for = $_SERVER["HTTP_X_FORWARDED_FOR"] ?? null;
    $client = $_SERVER["REMOTE_ADDR"] ?? "";
    $headers["x-forwarded-for"] = $forwarded_for ? "$forwarded_for, $client" : $client;
    $headers["x-forwarded-proto"] = FORCE_HTTPS ? "https" : client_scheme();
    $headers["x-forwarded-host"] = $host_header;
    $headers["x-real-ip"] = $client;
    return $headers;
}


/**
 * Point a redirect back at THIS host when it aims at the target.
 *
 * Without this the first redirect (e.g. "/" -> "/app") would hand the browser
 * the internal URL and the mask would fall off.
 */
function rewrite_location(string $value, string $target_base, string $public_base): string
{
    if ($value === "") {
        return $value;
    }
    $t = parse_url($target_base);
    $p = parse_url($public_base);
    $v = parse_url($value);
    if ($t === false || $p === false || $v === false) {
        return $value;
    }
    $netloc = static function (array $u): string {
        $n = $u["host"] ?? "";
        if (isset($u["port"])) {
            $n .= ":" . $u["port"];
        }
        return $n;
    };
    // Absolute URL that names the internal target → swap in our scheme+host.
    if (!empty($v["scheme"]) && !empty($v["host"]) && $netloc($v) === $netloc($t)) {
        $rebuilt = ($p["scheme"] ?? "https") . "://" . $netloc($p) . ($v["path"] ?? "");
        if (isset($v["query"])) {
            $rebuilt .= "?" . $v["query"];
        }
        if (isset($v["fragment"])) {
            $rebuilt .= "#" . $v["fragment"];
        }
        return $rebuilt;
    }
    return $value;
}


/**
 * Drop a Domain= that names the internal host.
 *
 * A cookie scoped to the tunnel domain would be ignored by the browser on this
 * domain; removing the attribute makes it a host-only cookie here.
 */
function clean_set_cookie(string $value, string $target_host): string
{
    $parts = explode(";", $value);
    $kept = [];
    foreach ($parts as $part) {
        $name = strtolower(trim($part));
        if (strncmp($name, "domain=", 7) === 0) {
            $domain = ltrim(substr($name, 7), ".");
            if ($domain !== "" && strpos($target_host, $domain) !== false) {
                continue; // host-only cookie on the public domain
            }
        }
        $kept[] = $part;
    }
    return implode(";", $kept);
}


/** Fetch the target server-side and stream the response back unchanged. */
function proxy(string $path, string $query): void
{
    $target_base = rtrim(trim(read_url() !== "" ? read_url() : DEFAULT_URL), "/");
    $url = build_target($target_base, $path, $query);

    $method = strtoupper($_SERVER["REQUEST_METHOD"] ?? "GET");
    $host_header = $_SERVER["HTTP_HOST"] ?? "";
    // Links we hand back must always name https when TLS is enforced.
    $scheme = FORCE_HTTPS ? "https" : client_scheme();
    $public_base = $host_header !== "" ? "$scheme://$host_header" : "";
    $target_parts = parse_url($target_base);
    $target_host = ($target_parts["host"] ?? "");
    if (isset($target_parts["port"])) {
        $target_host .= ":" . $target_parts["port"];
    }

    // Body: read the raw input stream when the client sent one.
    $body = null;
    $length = (int)($_SERVER["CONTENT_LENGTH"] ?? 0);
    if ($length > 0) {
        $body = file_get_contents("php://input");
    } elseif (in_array($method, ["POST", "PUT", "PATCH"], true) && !empty($_SERVER["HTTP_TRANSFER_ENCODING"])) {
        $body = file_get_contents("php://input");
    }

    $headers = request_headers($target_host, $host_header);
    if ($body !== null) {
        $headers["content-length"] = (string)strlen($body);
    }

    // Rebuild the header list in "Name: value" form for cURL.
    $curl_headers = [];
    foreach ($headers as $name => $value) {
        $curl_headers[] = "$name: $value";
    }

    // Collect the upstream response headers as they arrive, and stream the body
    // straight to the client so large / event-stream responses are not buffered.
    $status_line = "";
    $out_sent = false;
    $resp_headers = [];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $curl_headers,
        CURLOPT_FOLLOWLOCATION => false, // hand redirects to the browser, rewritten
        CURLOPT_TIMEOUT => PROXY_TIMEOUT,
        CURLOPT_CONNECTTIMEOUT => PROXY_TIMEOUT,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_ACCEPT_ENCODING => "", // keep upstream compression transparent
        CURLOPT_HEADERFUNCTION => function ($ch, string $header) use (&$status_line, &$resp_headers) {
            $trimmed = trim($header);
            if ($trimmed === "") {
                return strlen($header); // end of header block
            }
            if (stripos($trimmed, "HTTP/") === 0) {
                // A new status line (there may be several across redirects/100s).
                $status_line = $trimmed;
                $resp_headers = [];
                return strlen($header);
            }
            $colon = strpos($trimmed, ":");
            if ($colon !== false) {
                $resp_headers[] = [substr($trimmed, 0, $colon), ltrim(substr($trimmed, $colon + 1))];
            }
            return strlen($header);
        },
        CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (
            &$out_sent, &$status_line, &$resp_headers,
            $target_base, $public_base, $host_header, $target_host, $method
        ) {
            if (!$out_sent) {
                send_upstream_headers($status_line, $resp_headers, $target_base,
                    $public_base, $host_header, $target_host);
                $out_sent = true;
                if ($method === "HEAD") {
                    return strlen($chunk); // discard any body on HEAD
                }
            }
            echo $chunk;
            @ob_flush();
            @flush();
            return strlen($chunk);
        },
    ]);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    // Disable PHP output buffering so streaming reaches the client promptly.
    while (ob_get_level() > 0) {
        ob_end_flush();
    }

    $ok = curl_exec($ch);

    if ($ok === false && !$out_sent) {
        $errno = curl_errno($ch);
        $err = curl_error($ch);
        curl_close($ch);
        header("HTTP/1.1 502 Bad Gateway");
        header("Content-Type: text/html; charset=utf-8");
        header("Cache-Control: no-store");
        echo render_page(
            "<h2>Service temporarily unavailable</h2>"
            . "<p>The application could not be reached.</p>"
            . "<p style='color:#64748b;font-size:.85rem'>cURL error $errno</p>"
        );
        return;
    }

    // A HEAD (or an empty body) never triggers WRITEFUNCTION, so flush headers now.
    if (!$out_sent) {
        send_upstream_headers($status_line, $resp_headers, $target_base,
            $public_base, $host_header, $target_host);
    }

    curl_close($ch);
}


/**
 * Translate the upstream status + headers into this response, rewriting
 * Location / Set-Cookie and adding HSTS / CSP the way the WSGI proxy did.
 *
 * @param array<int,array{0:string,1:string}> $resp_headers
 */
function send_upstream_headers(
    string $status_line,
    array $resp_headers,
    string $target_base,
    string $public_base,
    string $host_header,
    string $target_host
): void {
    if ($status_line !== "") {
        header($status_line);
    }

    $ctype = "";
    foreach ($resp_headers as [$name, $value]) {
        $low = strtolower($name);
        if (in_array($low, HOP_BY_HOP, true) || $low === "content-length") {
            // Length is left to the SAPI; hop-by-hop headers never forward.
            if ($low === "content-length") {
                // Preserve it unless we are chunk-streaming (SAPI decides).
                header("Content-Length: $value");
            }
            continue;
        }
        if ($low === "location") {
            $value = force_https_url(
                rewrite_location($value, $target_base, $public_base), $host_header);
        } elseif ($low === "set-cookie") {
            $value = clean_set_cookie($value, $target_host);
            // Multiple Set-Cookie headers must each be preserved.
            header("Set-Cookie: $value", false);
            continue;
        } elseif ($low === "content-type") {
            $ctype = $value;
        }
        header("$name: $value");
    }

    if (FORCE_HTTPS) {
        header("Strict-Transport-Security: max-age=" . HSTS_MAX_AGE . "; includeSubDomains");
        if (UPGRADE_INSECURE_REQUESTS && stripos($ctype, "text/html") !== false) {
            header("Content-Security-Policy: upgrade-insecure-requests");
        }
    }
}


/** Legacy behaviour: hand the browser the target URL (target becomes visible). */
function legacy_redirect(string $path, string $query): void
{
    $location = build_target(read_url(), $path, $query);

    // 307 (not 302) so non-GET requests keep their method and body: a 302 would
    // turn a POST into a GET and drop the payload.
    $method = strtoupper($_SERVER["REQUEST_METHOD"] ?? "GET");
    $status = ($method === "GET" || $method === "HEAD")
        ? "302 Found"
        : "307 Temporary Redirect";

    header("HTTP/1.1 $status");
    header("Location: $location");
    header("Content-Type: text/plain");
    header("Cache-Control: no-store");
}


// ── Application ────────────────────────────────────────────────────────────────
function main(): void
{
    // REQUEST_URI holds "/path?query"; split it into PATH_INFO + QUERY_STRING.
    $request_uri = $_SERVER["REQUEST_URI"] ?? "/";
    $qpos = strpos($request_uri, "?");
    if ($qpos === false) {
        $path = $request_uri;
        $query = $_SERVER["QUERY_STRING"] ?? "";
    } else {
        $path = substr($request_uri, 0, $qpos);
        $query = substr($request_uri, $qpos + 1);
    }
    if ($path === "") {
        $path = "/";
    }

    // ── TLS first: nothing (not even /alter) is served over plaintext ─────────
    if (FORCE_HTTPS && client_scheme() !== "https") {
        https_redirect();
        return;
    }

    // ── /alter/<token>/<url> ──────────────────────────────────────────────────
    if (strncmp($path, "/alter/", 7) === 0) {
        $rest  = substr($path, 7);         // "9818/https://example.com/..."
        $slash = strpos($rest, "/");

        if ($slash === false) {
            header("HTTP/1.1 400 Bad Request");
            header("Content-Type: text/html; charset=utf-8");
            echo render_page("<h2>Bad request</h2><p>Usage: /alter/&lt;token&gt;/&lt;url&gt;</p>");
            return;
        }

        $token   = substr($rest, 0, $slash);
        $raw_url = substr($rest, $slash + 1);   // everything after the token slash
        // The URL portion may carry its own query string; keep it attached.
        $decoded = rawurldecode($raw_url);      // decode %3A etc.
        $url = trim($query !== "" ? "$decoded?$query" : $decoded);

        // Ensure a scheme is present
        if ($url !== "" && strncmp($url, "http://", 7) !== 0 && strncmp($url, "https://", 8) !== 0) {
            $url = "https://" . $url;
        }

        if ($token !== SECRET_TOKEN) {
            header("HTTP/1.1 403 Forbidden");
            header("Content-Type: text/html; charset=utf-8");
            echo render_page("<h2>&#x274C; Invalid token</h2>");
            return;
        }

        if ($url === "") {
            header("HTTP/1.1 400 Bad Request");
            header("Content-Type: text/html; charset=utf-8");
            echo render_page("<h2>Bad request</h2><p>No URL provided.</p>");
            return;
        }

        write_url($url);
        header("HTTP/1.1 200 OK");
        header("Content-Type: text/html; charset=utf-8");
        header("Cache-Control: no-store");
        $safe = htmlspecialchars($url, ENT_QUOTES);
        echo render_page(
            "<h2>&#x2705; Target updated</h2>"
            . "<p style='color:#64748b;font-size:.9rem;word-break:break-all'>$safe</p>"
            . "<p style='margin-top:1rem'>It is served from this domain — "
            . "<a href='/'>open the site</a>.</p>"
        );
        return;
    }

    // ── everything else ───────────────────────────────────────────────────────
    if (PROXY_MODE) {
        proxy($path, $query);
        return;
    }

    legacy_redirect($path, $query);
}

main();
