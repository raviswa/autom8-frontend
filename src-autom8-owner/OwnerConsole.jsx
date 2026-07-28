import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveApiBase } from '../src/config/api';

const h = React.createElement;
const SECRET_KEY = 'autom8_owner_kds_secret';
const PLATFORM_USERNAME = 'autom8.admin';

const NAV = [
  { id: 'clients', label: 'New Clients' },
  { id: 'failures', label: 'Registration Failures' },
  { id: 'phonepe', label: 'PhonePe Partnership' },
  { id: 'offers', label: 'Offer Codes' },
  { id: 'paid', label: 'Paid Features' },
];

const ORDER_FEATURES = [
  'token_management',
  'dine_in',
  'takeaway',
  'delivery',
  'reserve_table',
];
const INFRA_FEATURES = [
  'captain_app',
  'kds',
  'packing',
  'marketing',
  'analytics',
];
const ALL_FEATURES = [...ORDER_FEATURES, ...INFRA_FEATURES];

function apiBaseFromDom() {
  const el = document.getElementById('autom8-owner-root');
  if (el && el.dataset.api) return String(el.dataset.api).replace(/\/$/, '');
  try {
    return String(resolveApiBase() || '').replace(/\/$/, '') || 'https://api.autom8.works';
  } catch {
    return 'https://api.autom8.works';
  }
}

function useApi(secret) {
  const base = useMemo(() => apiBaseFromDom().replace(/\/$/, ''), []);
  const request = useCallback(async (method, path, body) => {
    const headers = {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    };
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }, [base, secret]);
  return { request, base };
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch {
    return String(iso);
  }
}

function Shell({ screen, setScreen, onLogout, children }) {
  return h('div', { style: styles.app },
    h('aside', { style: styles.sidebar },
      h('div', { style: styles.brand },
        h('div', { style: styles.brandTitle }, 'Autom8 Works'),
        h('div', { style: styles.brandSub }, 'Owner console'),
      ),
      h('nav', { style: styles.nav },
        NAV.map((n) => h('button', {
          key: n.id,
          type: 'button',
          style: {
            ...styles.navBtn,
            ...(screen === n.id ? styles.navBtnActive : {}),
          },
          onClick: () => setScreen(n.id),
        }, n.label)),
      ),
      h('button', { type: 'button', style: styles.logout, onClick: onLogout }, 'Sign out'),
    ),
    h('main', { style: styles.main }, children),
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { request } = useApi(secret);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      if (username.trim() !== PLATFORM_USERNAME) {
        setErr('Invalid username or password');
        return;
      }
      await request('GET', '/api/admin/ping');
      onLogin(secret.trim());
    } catch (ex) {
      setErr(ex.status === 403 ? 'Invalid username or password' : (ex.message || 'Login failed'));
    } finally {
      setBusy(false);
    }
  };

  return h('div', { style: styles.loginWrap },
    h('form', { style: styles.loginCard, onSubmit: submit },
      h('h1', { style: styles.h1 }, 'Autom8 Works'),
      h('p', { style: styles.muted }, 'Platform owner console'),
      h('label', { style: styles.label, htmlFor: 'platform-username' }, 'Username'),
      h('input', {
        type: 'text',
        name: 'username',
        id: 'platform-username',
        autoComplete: 'username',
        value: username,
        onChange: (e) => setUsername(e.target.value),
        style: styles.input,
        autoFocus: true,
        required: true,
        placeholder: 'autom8.admin',
      }),
      h('label', { style: styles.label, htmlFor: 'platform-password' }, 'Password'),
      h('input', {
        type: 'password',
        name: 'password',
        id: 'platform-password',
        autoComplete: 'current-password',
        value: secret,
        onChange: (e) => setSecret(e.target.value),
        style: styles.input,
        required: true,
        placeholder: 'AUTOM8_KDS_SECRET',
      }),
      err && h('div', { style: styles.error }, err),
      h('button', {
        type: 'submit',
        disabled: busy || !username.trim() || !secret.trim(),
        style: styles.primaryBtn,
      }, busy ? 'Checking…' : 'Enter console'),
    ),
  );
}

function ClientsScreen({ api }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '25' });
      if (q.trim()) qs.set('q', q.trim());
      setData(await api.request('GET', `/api/admin/tenants?${qs}`));
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }, [api, page, q]);

  useEffect(() => { load(); }, [load]);

  return h('div', null,
    h('h2', { style: styles.h2 }, 'New Clients'),
    h('p', { style: styles.muted }, 'Newest restaurant / LOB tenants first.'),
    h('div', { style: styles.toolbar },
      h('input', {
        style: { ...styles.input, maxWidth: 280 },
        placeholder: 'Search name, email, WABA…',
        value: q,
        onChange: (e) => { setPage(1); setQ(e.target.value); },
      }),
      h('button', { type: 'button', style: styles.secondaryBtn, onClick: load }, 'Refresh'),
    ),
    err && h('div', { style: styles.error }, err),
    loading && h('div', { style: styles.muted }, 'Loading…'),
    data && h('div', { style: styles.tableWrap },
      h('table', { style: styles.table },
        h('thead', null,
          h('tr', null,
            ['Created', 'Business', 'Email', 'WABA', 'LOB', 'WA', 'Catalog', 'Sub'].map((c) =>
              h('th', { key: c, style: styles.th }, c)),
          ),
        ),
        h('tbody', null,
          (data.items || []).map((t) => h('tr', { key: t.id },
            h('td', { style: styles.td }, fmtDate(t.created_at)),
            h('td', { style: styles.td },
              h('div', { style: { fontWeight: 600 } }, t.display_name || t.name),
              h('div', { style: styles.mono }, t.id.slice(0, 8) + '…'),
            ),
            h('td', { style: styles.td }, t.email || '—'),
            h('td', { style: styles.td }, t.whatsapp_number || '—'),
            h('td', { style: styles.td }, t.lob_type || '—'),
            h('td', { style: styles.td }, t.whatsapp_connected ? '✓' : '○'),
            h('td', { style: styles.td }, t.catalog_item_count),
            h('td', { style: styles.td }, t.subscription?.status || '—'),
          )),
        ),
      ),
    ),
    data && h('div', { style: styles.pager },
      h('button', {
        type: 'button',
        style: styles.secondaryBtn,
        disabled: page <= 1,
        onClick: () => setPage((p) => p - 1),
      }, 'Prev'),
      h('span', { style: styles.muted }, `Page ${page} · ${data.total || 0} total`),
      h('button', {
        type: 'button',
        style: styles.secondaryBtn,
        disabled: page * (data.limit || 25) >= (data.total || 0),
        onClick: () => setPage((p) => p + 1),
      }, 'Next'),
    ),
  );
}

function FailuresScreen({ api }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      setData(await api.request('GET', `/api/admin/registration-failures?page=${page}&limit=25`));
    } catch (ex) {
      setErr(ex.message);
    }
  }, [api, page]);

  useEffect(() => { load(); }, [load]);

  return h('div', null,
    h('h2', { style: styles.h2 }, 'Registration Failures'),
    h('p', { style: styles.muted }, 'Partial signup failures for support triage.'),
    err && h('div', { style: styles.error }, err),
    data && h('div', { style: styles.tableWrap },
      h('table', { style: styles.table },
        h('thead', null,
          h('tr', null,
            ['When', 'Email', 'Step', 'Error', 'Slug'].map((c) =>
              h('th', { key: c, style: styles.th }, c)),
          ),
        ),
        h('tbody', null,
          (data.items || []).map((f) => h('tr', { key: f.id },
            h('td', { style: styles.td }, fmtDate(f.created_at)),
            h('td', { style: styles.td }, f.email || '—'),
            h('td', { style: styles.td }, f.failed_step || '—'),
            h('td', { style: styles.td }, f.error_message || '—'),
            h('td', { style: styles.td }, f.slug || '—'),
          )),
        ),
      ),
    ),
    data && h('div', { style: styles.pager },
      h('button', { type: 'button', style: styles.secondaryBtn, disabled: page <= 1, onClick: () => setPage((p) => p - 1) }, 'Prev'),
      h('span', { style: styles.muted }, `Page ${page} · ${data.total || 0} total`),
      h('button', {
        type: 'button',
        style: styles.secondaryBtn,
        disabled: page * 25 >= (data.total || 0),
        onClick: () => setPage((p) => p + 1),
      }, 'Next'),
    ),
  );
}

function PhonePeScreen({ api }) {
  const [gateways, setGateways] = useState([]);
  const [err, setErr] = useState('');
  const [statusEdits, setStatusEdits] = useState({});
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const data = await api.request('GET', '/api/subscription/payment-gateways?limit=500');
      setGateways(data.gateways || []);
    } catch (ex) {
      setErr(ex.message);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const saveStatus = async (g) => {
    setMsg('');
    try {
      const status = statusEdits[g.id] || g.status;
      await api.request('PUT', '/api/subscription/payment-gateway/status', {
        restaurant_id: g.restaurant_id,
        status,
        merchant_id: g.merchant_id,
        merchant_name: g.merchant_name,
        partner_referral_code: g.partner_referral_code,
      });
      setMsg(`Updated ${g.restaurant_id.slice(0, 8)}… → ${status}`);
      await load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  return h('div', null,
    h('h2', { style: styles.h2 }, 'PhonePe Partnership'),
    h('p', { style: styles.muted }, 'Merchant IDs submitted by restaurants — elevate status when verified.'),
    err && h('div', { style: styles.error }, err),
    msg && h('div', { style: styles.ok }, msg),
    h('button', { type: 'button', style: styles.secondaryBtn, onClick: load }, 'Refresh'),
    h('div', { style: { ...styles.tableWrap, marginTop: 16 } },
      h('table', { style: styles.table },
        h('thead', null,
          h('tr', null,
            ['Restaurant', 'MID', 'Name', 'Partner code', 'Status', ''].map((c) =>
              h('th', { key: c, style: styles.th }, c)),
          ),
        ),
        h('tbody', null,
          gateways.map((g) => h('tr', { key: g.id },
            h('td', { style: styles.td }, h('span', { style: styles.mono }, g.restaurant_id)),
            h('td', { style: styles.td }, g.merchant_id || '—'),
            h('td', { style: styles.td }, g.merchant_name || '—'),
            h('td', { style: styles.td }, g.partner_referral_code || '—'),
            h('td', { style: styles.td },
              h('select', {
                style: styles.input,
                value: statusEdits[g.id] ?? g.status ?? 'pending',
                onChange: (e) => setStatusEdits((s) => ({ ...s, [g.id]: e.target.value })),
              },
                ['pending', 'verified', 'active', 'rejected', 'suspended'].map((s) =>
                  h('option', { key: s, value: s }, s)),
              ),
            ),
            h('td', { style: styles.td },
              h('button', { type: 'button', style: styles.primaryBtn, onClick: () => saveStatus(g) }, 'Save'),
            ),
          )),
        ),
      ),
    ),
  );
}

function OffersScreen({ api }) {
  const [offers, setOffers] = useState([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percent',
    discount_value: '10',
    max_redemptions: '',
  });

  const load = useCallback(async () => {
    setErr('');
    try {
      const data = await api.request('GET', '/api/subscription/offers');
      setOffers(data.offers || []);
    } catch (ex) {
      setErr(ex.message);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api.request('POST', '/api/subscription/offers', {
        code: form.code,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
      });
      setForm({ code: '', discount_type: 'percent', discount_value: '10', max_redemptions: '' });
      await load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  const toggleActive = async (offer) => {
    try {
      await api.request('PUT', `/api/subscription/offers/${offer.id}`, {
        is_active: !offer.is_active,
      });
      await load();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  return h('div', null,
    h('h2', { style: styles.h2 }, 'Offer Codes'),
    h('p', { style: styles.muted },
      'Subscription discount codes for restaurant / LOB clients (₹1000/mo). Not for shoppers.'),
    err && h('div', { style: styles.error }, err),
    h('form', { style: styles.formRow, onSubmit: create },
      h('input', {
        style: styles.input,
        placeholder: 'CODE',
        value: form.code,
        onChange: (e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() })),
        required: true,
      }),
      h('select', {
        style: styles.input,
        value: form.discount_type,
        onChange: (e) => setForm((f) => ({ ...f, discount_type: e.target.value })),
      },
        h('option', { value: 'percent' }, 'Percent'),
        h('option', { value: 'flat' }, 'Flat ₹'),
      ),
      h('input', {
        style: styles.input,
        type: 'number',
        min: '0',
        step: '0.01',
        value: form.discount_value,
        onChange: (e) => setForm((f) => ({ ...f, discount_value: e.target.value })),
        required: true,
      }),
      h('input', {
        style: styles.input,
        type: 'number',
        min: '1',
        placeholder: 'Max uses (opt)',
        value: form.max_redemptions,
        onChange: (e) => setForm((f) => ({ ...f, max_redemptions: e.target.value })),
      }),
      h('button', { type: 'submit', style: styles.primaryBtn }, 'Create'),
    ),
    h('div', { style: styles.tableWrap },
      h('table', { style: styles.table },
        h('thead', null,
          h('tr', null,
            ['Code', 'Type', 'Value', 'Used', 'Active', ''].map((c) =>
              h('th', { key: c, style: styles.th }, c)),
          ),
        ),
        h('tbody', null,
          offers.map((o) => h('tr', { key: o.id },
            h('td', { style: styles.td }, h('strong', null, o.code)),
            h('td', { style: styles.td }, o.discount_type),
            h('td', { style: styles.td }, String(o.discount_value)),
            h('td', { style: styles.td },
              `${o.redemption_count || 0}${o.max_redemptions != null ? ` / ${o.max_redemptions}` : ''}`),
            h('td', { style: styles.td }, o.is_active ? 'yes' : 'no'),
            h('td', { style: styles.td },
              h('button', {
                type: 'button',
                style: styles.secondaryBtn,
                onClick: () => toggleActive(o),
              }, o.is_active ? 'Deactivate' : 'Activate'),
            ),
          )),
        ),
      ),
    ),
  );
}

function PaidFeaturesScreen({ api }) {
  const [restaurantId, setRestaurantId] = useState('');
  const [selected, setSelected] = useState(() => new Set(ALL_FEATURES));
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const toggle = (f) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const paid_features = ALL_FEATURES.filter((f) => selected.has(f));
      const data = await api.request('PUT', '/api/subscription/paid-features', {
        restaurant_id: restaurantId.trim(),
        paid_features,
      });
      setMsg(`Updated ${data.restaurant_id}: ${paid_features.length} features`);
    } catch (ex) {
      setErr(ex.message);
    }
  };

  return h('div', null,
    h('h2', { style: styles.h2 }, 'Paid Features'),
    h('p', { style: styles.muted }, 'Set which features a restaurant is billed / entitled for.'),
    err && h('div', { style: styles.error }, err),
    msg && h('div', { style: styles.ok }, msg),
    h('form', { onSubmit: save },
      h('label', { style: styles.label }, 'Restaurant UUID'),
      h('input', {
        style: { ...styles.input, maxWidth: 420, marginBottom: 16 },
        value: restaurantId,
        onChange: (e) => setRestaurantId(e.target.value),
        placeholder: 'tenants.id',
        required: true,
      }),
      h('div', { style: styles.featureGrid },
        ALL_FEATURES.map((f) => h('label', {
          key: f,
          style: styles.featureChip,
        },
          h('input', {
            type: 'checkbox',
            checked: selected.has(f),
            onChange: () => toggle(f),
          }),
          ' ',
          f,
        )),
      ),
      h('button', {
        type: 'submit',
        style: { ...styles.primaryBtn, marginTop: 16 },
        disabled: !restaurantId.trim() || selected.size === 0,
      }, 'Save paid features'),
    ),
  );
}

export default function OwnerConsole() {
  const [secret, setSecret] = useState(() => {
    try { return sessionStorage.getItem(SECRET_KEY) || ''; } catch { return ''; }
  });
  const [screen, setScreen] = useState('clients');
  const api = useApi(secret);

  const onLogin = (s) => {
    try { sessionStorage.setItem(SECRET_KEY, s); } catch { /* ignore */ }
    setSecret(s);
  };
  const onLogout = () => {
    try { sessionStorage.removeItem(SECRET_KEY); } catch { /* ignore */ }
    setSecret('');
  };

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = 'body{margin:0}';
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  if (!secret) return h(Login, { onLogin });

  let body = null;
  if (screen === 'clients') body = h(ClientsScreen, { api });
  else if (screen === 'failures') body = h(FailuresScreen, { api });
  else if (screen === 'phonepe') body = h(PhonePeScreen, { api });
  else if (screen === 'offers') body = h(OffersScreen, { api });
  else if (screen === 'paid') body = h(PaidFeaturesScreen, { api });

  return h(Shell, { screen, setScreen, onLogout }, body);
}

const styles = {
  app: { display: 'flex', minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' },
  sidebar: {
    width: 220, flexShrink: 0, background: '#020617', borderRight: '1px solid #1e293b',
    padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 8,
  },
  brand: { marginBottom: 20 },
  brandTitle: { fontSize: 18, fontWeight: 700, color: '#34d399' },
  brandSub: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  nav: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  navBtn: {
    textAlign: 'left', background: 'transparent', border: 'none', color: '#94a3b8',
    padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500,
  },
  navBtnActive: { background: '#064e3b', color: '#ecfdf5' },
  logout: {
    marginTop: 'auto', background: 'transparent', border: '1px solid #334155',
    color: '#94a3b8', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
  },
  main: { flex: 1, padding: '28px 32px', overflow: 'auto' },
  h1: { margin: '0 0 8px', fontSize: 24, color: '#f8fafc' },
  h2: { margin: '0 0 8px', fontSize: 22, color: '#f8fafc' },
  muted: { color: '#94a3b8', fontSize: 13, marginBottom: 16 },
  label: { display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
    border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13,
  },
  primaryBtn: {
    background: '#059669', color: '#fff', border: 'none', borderRadius: 8,
    padding: '9px 14px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
  },
  secondaryBtn: {
    background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 8,
    padding: '8px 12px', cursor: 'pointer', fontSize: 13,
  },
  error: {
    background: '#450a0a', color: '#fecaca', border: '1px solid #7f1d1d',
    padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13,
  },
  ok: {
    background: '#052e16', color: '#bbf7d0', border: '1px solid #14532d',
    padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13,
  },
  loginWrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0f172a', padding: 20,
  },
  loginCard: {
    width: '100%', maxWidth: 380, background: '#020617', border: '1px solid #1e293b',
    borderRadius: 16, padding: 28,
  },
  toolbar: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  tableWrap: { overflowX: 'auto', border: '1px solid #1e293b', borderRadius: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    textAlign: 'left', padding: '10px 12px', background: '#020617', color: '#94a3b8',
    borderBottom: '1px solid #1e293b', whiteSpace: 'nowrap',
  },
  td: { padding: '10px 12px', borderBottom: '1px solid #1e293b', verticalAlign: 'top' },
  mono: { fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#64748b' },
  pager: { display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 },
  formRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' },
  featureGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  featureChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 10px',
    background: '#1e293b', borderRadius: 8, fontSize: 12, cursor: 'pointer',
  },
};
