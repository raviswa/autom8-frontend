// Shared authenticated fetch for Munafe Supply portal pages.
// Auto-refreshes supply_token once on 401 / expired-token 403.

import { resolveSupplyApiBase } from '../../config/api';

const API = resolveSupplyApiBase();

let refreshPromise = null;

function getToken() {
  return localStorage.getItem('supply_token');
}

async function refreshSupplyToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem('supply_refresh_token');
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API}/api/supply/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) return false;
      localStorage.setItem('supply_token', data.token);
      if (data.refreshToken) {
        localStorage.setItem('supply_refresh_token', data.refreshToken);
      }
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

function isAuthFailure(status, data) {
  if (status === 401) return true;
  if (status !== 403) return false;
  const msg = String(data?.error || '').toLowerCase();
  return (
    msg.includes('invalid')
    || msg.includes('expired')
    || msg.includes('authentication failed')
    || msg.includes('no token')
  );
}

/**
 * @param {string} path
 * @param {RequestInit} [opts]
 * @param {boolean} [_retried]
 */
export async function supplyApiFetch(path, opts = {}, _retried = false) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken() || ''}`,
      ...(opts.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!_retried && isAuthFailure(res.status, data)) {
      const refreshed = await refreshSupplyToken();
      if (refreshed) return supplyApiFetch(path, opts, true);
    }
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function openWhatsAppWithLink(phone, clientName, orderFormUrl) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits || !orderFormUrl) return false;
  const text = [
    `Hi ${clientName || 'there'},`,
    '',
    'Here is your order form link:',
    orderFormUrl,
  ].join('\n');
  window.open(
    `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener,noreferrer',
  );
  return true;
}
