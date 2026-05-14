// Central API client for the Oracle frontend.
//
// Responsibilities:
//   - Prepend VITE_API_BASE_URL to relative paths (Vercel → Render/Railway).
//   - Attach `Authorization: Bearer <token>` from localStorage when present.
//   - Normalise error handling for JSON responses.
//   - Expose `apiRequest` for raw Response access (used by the TTS binary path).
//   - Provide token helpers (get/set/clear) plus a `lockOracle()` shortcut.
//
// A 401 from any request clears the stored token and broadcasts an
// `oracle:unauthorized` event so the AccessGate re-prompts.

const TOKEN_KEY = 'oracle_access_token';

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim();
const BASE_URL = RAW_BASE.replace(/\/+$/, '');

export function getAccessToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setAccessToken(token) {
  try { localStorage.setItem(TOKEN_KEY, String(token || '')); } catch {}
}

export function clearAccessToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

function emitUnauthorized() {
  try {
    window.dispatchEvent(new CustomEvent('oracle:unauthorized'));
  } catch {}
}

export function lockOracle() {
  clearAccessToken();
  emitUnauthorized();
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!BASE_URL) return path;
  return path.startsWith('/') ? `${BASE_URL}${path}` : `${BASE_URL}/${path}`;
}

function buildHeaders(extra) {
  const headers = { ...(extra || {}) };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function readErrorMessage(res, fallback) {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {}
  return fallback;
}

/**
 * JSON helper. Sends `body` as JSON when defined; parses response as JSON.
 * Throws on non-2xx with a useful message.
 */
export async function apiFetch(method, path, body) {
  const init = {
    method,
    headers: buildHeaders(
      body !== undefined ? { 'Content-Type': 'application/json' } : undefined
    ),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  const res = await fetch(buildUrl(path), init);

  if (res.status === 401) {
    const msg = await readErrorMessage(res, 'Access denied. Re-enter your Oracle access code.');
    clearAccessToken();
    emitUnauthorized();
    throw new Error(msg);
  }

  if (!res.ok) {
    const msg = await readErrorMessage(res, `HTTP ${res.status}`);
    throw new Error(msg);
  }

  // No content
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Lower-level helper for non-JSON responses (e.g. TTS audio). Returns the raw
 * Response, but still clears the token + dispatches the unauthorized event on
 * a 401. The caller is responsible for checking `res.ok` and reading the body.
 */
export async function apiRequest(path, init = {}) {
  const headers = buildHeaders(init.headers);
  const res = await fetch(buildUrl(path), { ...init, headers });
  if (res.status === 401) {
    clearAccessToken();
    emitUnauthorized();
  }
  return res;
}

/** Read the configured backend base URL (may be empty in local dev). */
export function getApiBaseUrl() {
  return BASE_URL;
}
