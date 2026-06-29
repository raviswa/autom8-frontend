// Runtime API base — production hostname wins over stale Railway build env vars.
// All three resolvers follow the same pattern:
//   1. Hard-code the production hostname mapping (immune to wrong build-time env vars)
//   2. Fall back to a VITE_ env var for local/staging overrides
//   3. Final fallback to localhost for developer machines

export function resolveApiBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'app.autom8.works') {
    return 'https://api.autom8.works';
  }
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
}

export function resolveWsBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'app.autom8.works') {
    return 'wss://api.autom8.works/ws';
  }
  if (import.meta.env.VITE_WS_URL) {
    const base = import.meta.env.VITE_WS_URL.split('?')[0].replace(/\/$/, '');
    return base.endsWith('/ws') ? base : `${base}/ws`;
  }
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    const wsBase = apiUrl.replace(/^http/i, 'ws').replace(/\/$/, '');
    return wsBase.endsWith('/ws') ? wsBase : `${wsBase}/ws`;
  }
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.hostname}:3001/ws`;
}

// ── Supply API ────────────────────────────────────────────────────────────────
// Points to the autom8-backend-supply Railway service (server-supply.js),
// which is separate from the restaurant backend (server.js / api.autom8.works).
//
// All supply pages import from THIS file:
//   import { resolveSupplyApiBase } from '../../config/api';
//
// Do NOT set VITE_SUPPLY_API_URL in Railway production — the hostname
// check below handles it automatically.  Only set it for local dev or
// staging environments that use a non-default supply API URL.
export function resolveSupplyApiBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'app.autom8.works') {
    return 'https://supply-api.autom8.works';
  }
  return import.meta.env.VITE_SUPPLY_API_URL || 'http://localhost:3002';
}
