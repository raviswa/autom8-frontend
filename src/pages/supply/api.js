// Runtime API base — production hostname wins over stale Railway build env vars.

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

export function resolveSupplyApiBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'app.autom8.works') {
    return 'https://supply-api.autom8.works';
  }
  return import.meta.env.VITE_SUPPLY_API_URL
    || import.meta.env.VITE_API_URL
    || 'http://localhost:3002';
}

export function resolveSupplyApiBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'app.autom8.works') {
    return 'https://supply-api.autom8.works';
  }
  return import.meta.env.VITE_SUPPLY_API_URL || 'http://localhost:3002';
}
