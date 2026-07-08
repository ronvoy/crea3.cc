// Simple fetch wrapper for the FastAPI backend.
//
// IMPORTANT:
// - All frontend calls are written as `/api/...`.
// - In dev, Vite proxies `/api` -> backend (see vite.config.ts).
// - If you set VITE_API_BASE, set it WITHOUT the trailing `/api`.

// Support a few common env var names (older zips used different ones).
let API_BASE = (
  (import.meta as any).env?.VITE_API_BASE ??
  (import.meta as any).env?.VITE_API_BASE_URL ??
  (import.meta as any).env?.VITE_API_URL ??
  ""
).toString();
API_BASE = API_BASE.replace(/\/+$/, ""); // strip trailing slash
if (API_BASE.endsWith("/api")) API_BASE = API_BASE.slice(0, -4);

export { API_BASE };

const TOKEN_KEY = "access_token";

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null) {
  try {
    if (!token) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export type ApiOptions = {
  method?: string;
  body?: any;
  auth?: boolean; // default true
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = joinUrl(API_BASE, path);
  const method = (options.method ?? "GET").toUpperCase();

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };

  let body: BodyInit | undefined = undefined;

  if (options.body !== undefined && options.body !== null) {
    // If it's already a FormData/Blob/string, pass through.
    if (options.body instanceof FormData) {
      body = options.body;
    } else if (options.body instanceof Blob) {
      body = options.body;
    } else if (typeof options.body === "string") {
      body = options.body;
      headers["Content-Type"] = headers["Content-Type"] ?? "text/plain";
    } else {
      body = JSON.stringify(options.body);
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    }
  }

  // Attach bearer token unless explicitly disabled
  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body,
    signal: options.signal,
    credentials: "include",
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data: any = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const message =
      (data && (data.detail || data.message)) ||
      (typeof data === "string" && data) ||
      `Request failed (${res.status})`;
    const err = new Error(String(message)) as Error & { status?: number; detail?: string };
    err.status = res.status;
    if (data && typeof data === "object" && data.detail) err.detail = String(data.detail);
    throw err;
  }

  return data as T;
}

/** Like `api`, but returns the raw response body as a Blob (for file downloads). */
export async function apiBlob(path: string, options: ApiOptions = {}): Promise<Blob> {
  const url = joinUrl(API_BASE, path);
  const method = (options.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    signal: options.signal,
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return await res.blob();
}
