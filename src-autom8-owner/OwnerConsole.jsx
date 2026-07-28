import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveApiBase } from '../src/config/api';

const h = React.createElement;
const SECRET_KEY = 'autom8_owner_kds_secret';
const ROLE_KEY = 'autom8_owner_role';
const USER_KEY = 'autom8_owner_username';

const PLATFORM_USERS = {
  'autom8.admin': 'super_admin',
  'autom8.support': 'support_readonly',
};

const NAV = [
  { id: 'tenants', label: 'Tenants' },
  { id: 'churn', label: 'Churn' },
  { id: 'billing', label: 'Billing' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'failures', label: 'Registration Failures' },
  { id: 'phonepe', label: 'PhonePe Partnership' },
  { id: 'offers', label: 'Offer Codes' },
  { id: 'paid', label: 'Paid Features' },
  { id: 'wa_cost', label: 'WhatsApp Cost' },
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

const SOURCE_LABELS = {
  existing_owner: 'Referral',
  google: 'Organic / ads',
  social: 'Organic / ads',
  sales: 'Outreach',
  friend: 'Referral',
  other: 'Other',
};

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

function Shell({ screen, setScreen, onLogout, role, children }) {
  return h('div', { style: styles.app },
    h('aside', { style: styles.sidebar },
      h('div', { style: styles.brand },
        h('div', { style: styles.brandTitle }, 'Autom8 Works'),
        h('div', { style: styles.brandSub }, role === 'support_readonly' ? 'Support console' : 'Owner console'),
      ),
      h('nav', { style: styles.nav },
        NAV.map((n) => h('button', {
          key: n.id,
          type: 'button',
          style: {
            ...styles.navBtn,
            ...(screen === n.id || (screen === 'tenant_detail' && n.id === 'tenants') ? styles.navBtnActive : {}),
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
      const expectedRole = PLATFORM_USERS[username.trim()];
      if (!expectedRole) {
        setErr('Invalid username or password');
        return;
      }
      const data = await request('GET', '/api/admin/ping');
      const role = data.role || expectedRole;
      if (expectedRole === 'super_admin' && role !== 'super_admin') {
        setErr('Invalid username or password');
        return;
      }
      if (expectedRole === 'support_readonly' && role !== 'support_readonly') {
        setErr('Invalid username or password');
        return;
      }
      onLogin(secret.trim(), role, username.trim());
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
        placeholder: 'autom8.admin or autom8.support',
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
        placeholder: 'Matching platform secret',
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

function TenantsScreen({ api, onOpenTenant }) {
  const [q, setQ] = useState('');
  const [lob, setLob] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
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
      if (lob) qs.set('lob_type', lob);
      if (status) qs.set('status', status);
      if (source) qs.set('referral_source', source);
      setData(await api.request('GET', `/api/admin/tenants?${qs}`));
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }, [api, page, q, lob, status, source]);

  useEffect(() => { load(); }, [load]);

  return h('div', null,
    h('h2', { style: styles.h2 }, 'Tenants'),
    h('p', { style: styles.muted }, 'Roster with activation risk, signup source, and MRR.'),
    h('div', { style: styles.toolbar },
      h('input', {
        style: { ...styles.input, maxWidth: 220 },
        placeholder: 'Search name, email, WABA…',
        value: q,
        onChange: (e) => { setPage(1); setQ(e.target.value); },
      }),
      h('select', {
        style: { ...styles.input, maxWidth: 140 },
        value: lob,
        onChange: (e) => { setPage(1); setLob(e.target.value); },
      },
        h('option', { value: '' }, 'All LOBs'),
        ['restaurant', 'food_products', 'retail', 'jewellery', 'psl', 'b2b'].map((v) =>
          h('option', { key: v, value: v }, v)),
      ),
      h('select', {
        style: { ...styles.input, maxWidth: 140 },
        value: status,
        onChange: (e) => { setPage(1); setStatus(e.target.value); },
      },
        h('option', { value: '' }, 'All status'),
        ['active', 'at_risk', 'churned', 'suspended'].map((v) =>
          h('option', { key: v, value: v }, v)),
      ),
      h('select', {
        style: { ...styles.input, maxWidth: 160 },
        value: source,
        onChange: (e) => { setPage(1); setSource(e.target.value); },
      },
        h('option', { value: '' }, 'All sources'),
        Object.keys(SOURCE_LABELS).map((v) =>
          h('option', { key: v, value: v }, SOURCE_LABELS[v] + ` (${v})`)),
      ),
      h('button', { type: 'button', style: styles.secondaryBtn, onClick: load }, 'Refresh'),
    ),
    err && h('div', { style: styles.error }, err),
    loading && h('div', { style: styles.muted }, 'Loading…'),
    data && h('div', { style: styles.tableWrap },
      h('table', { style: styles.table },
        h('thead', null,
          h('tr', null,
            ['Created', 'Business', 'Source', 'LOB', 'Status', 'Idle', 'Orders', 'MRR', 'WA', 'Sub'].map((c) =>
              h('th', { key: c, style: styles.th }, c)),
          ),
        ),
        h('tbody', null,
          (data.items || []).map((t) => h('tr', {
            key: t.id,
            style: { cursor: 'pointer' },
            onClick: () => onOpenTenant(t.id),
          },
            h('td', { style: styles.td }, fmtDate(t.created_at)),
            h('td', { style: styles.td },
              h('div', { style: { fontWeight: 600 } }, t.display_name || t.name),
              h('div', { style: styles.mono }, t.id.slice(0, 8) + '…'),
            ),
            h('td', { style: styles.td }, SOURCE_LABELS[t.referral_source] || t.referral_source || '—'),
            h('td', { style: styles.td }, t.lob_type || '—'),
            h('td', { style: styles.td }, t.status_label || '—'),
            h('td', { style: styles.td }, t.idle_days != null ? `${t.idle_days}d` : '—'),
            h('td', { style: styles.td }, t.lifetime_orders ?? 0),
            h('td', { style: styles.td }, t.mrr ? `₹${t.mrr}` : '—'),
            h('td', { style: styles.td }, t.whatsapp_connected ? '✓' : '○'),
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

function TenantDetailScreen({ api, tenantId, role, onBack }) {
  const isSuper = role === 'super_admin';
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('30');
  const [fssai, setFssai] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      setData(await api.request('GET', `/api/admin/tenants/${tenantId}`));
    } catch (ex) {
      setErr(ex.message);
    }
  }, [api, tenantId]);

  useEffect(() => { load(); }, [load]);

  const act = async (path, body = {}) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const res = await api.request('POST', path, { reason: reason.trim() || undefined, ...body });
      setMsg(res.login_url ? `Impersonate link ready` : 'Done');
      if (res.login_url) {
        window.open(res.login_url, '_blank', 'noopener,noreferrer');
      }
      setReason('');
      await load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data && !err) return h('div', { style: styles.muted }, 'Loading…');
  const t = data?.tenant || {};
  const events = data?.activation_events || [];

  return h('div', null,
    h('button', { type: 'button', style: styles.secondaryBtn, onClick: onBack }, '← Back to tenants'),
    h('h2', { style: { ...styles.h2, marginTop: 16 } }, t.display_name || t.name || 'Tenant'),
    h('p', { style: styles.muted }, t.id),
    err && h('div', { style: styles.error }, err),
    msg && h('div', { style: styles.ok }, msg),
    data && h('div', { style: { display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' } },
      h('div', { style: styles.panel },
        h('h3', { style: styles.h3 }, 'Attribution'),
        h('div', null, `Source: ${SOURCE_LABELS[t.referral_source] || t.referral_source || '—'}`),
        h('div', null, `Detail: ${t.signup_source_detail || '—'}`),
        h('div', null, `UTM: ${t.utm_source || '—'} / ${t.utm_campaign || '—'}`),
        h('div', null, `Email: ${t.email || '—'}`),
        h('div', null, `LOB: ${t.lob_type || '—'}`),
        h('div', null, `FSSAI: ${t.fssai_license || '—'}`),
        h('div', null, `WA: ${data.whatsapp?.connected ? 'connected' : 'not connected'}`),
        h('div', null, `Activity: ${data.activity?.status_label || '—'} · idle ${data.activity?.idle_days ?? '—'}d · orders ${data.activity?.lifetime_orders ?? 0}`),
        h('div', null, `Sub: ${data.subscription?.status || '—'} · soft-lock ${data.soft_locked ? 'yes' : 'no'}`),
      ),
      h('div', { style: styles.panel },
        h('h3', { style: styles.h3 }, 'Activation timeline'),
        events.length === 0 && h('div', { style: styles.muted }, 'No events yet'),
        events.map((ev) => h('div', { key: ev.id, style: { marginBottom: 8, fontSize: 12 } },
          h('strong', null, ev.event_type),
          ' · ',
          fmtDate(ev.occurred_at),
        )),
      ),
    ),
    h('div', { style: { ...styles.panel, marginTop: 16 } },
      h('h3', { style: styles.h3 }, 'Actions'),
      h('label', { style: styles.label }, 'Reason (required for most writes)'),
      h('input', {
        style: { ...styles.input, maxWidth: 420, marginBottom: 12 },
        value: reason,
        onChange: (e) => setReason(e.target.value),
        placeholder: 'Why are you doing this?',
      }),
      h('div', { style: styles.toolbar },
        h('button', {
          type: 'button',
          style: styles.primaryBtn,
          disabled: busy,
          onClick: () => act(`/api/admin/tenants/${tenantId}/impersonate`, { reason: reason || 'support' }),
        }, 'Impersonate (magic link)'),
        isSuper && h('button', {
          type: 'button', style: styles.secondaryBtn, disabled: busy || !reason.trim(),
          onClick: () => act(`/api/admin/tenants/${tenantId}/suspend`),
        }, 'Suspend'),
        isSuper && h('button', {
          type: 'button', style: styles.secondaryBtn, disabled: busy || !reason.trim(),
          onClick: () => act(`/api/admin/tenants/${tenantId}/reactivate`),
        }, 'Reactivate'),
        isSuper && h('input', {
          style: { ...styles.input, maxWidth: 80 },
          value: days,
          onChange: (e) => setDays(e.target.value),
          placeholder: 'days',
        }),
        isSuper && h('button', {
          type: 'button', style: styles.secondaryBtn, disabled: busy || !reason.trim(),
          onClick: () => act(`/api/admin/tenants/${tenantId}/extend-trial`, { days: Number(days) }),
        }, 'Extend trial'),
        isSuper && h('button', {
          type: 'button', style: styles.secondaryBtn, disabled: busy || !reason.trim(),
          onClick: () => act(`/api/admin/tenants/${tenantId}/referral-credit`, { days: Number(days) || 30 }),
        }, 'Referral credit'),
        isSuper && h('button', {
          type: 'button', style: styles.secondaryBtn, disabled: busy || !reason.trim(),
          onClick: () => act(`/api/admin/tenants/${tenantId}/churn/miss-you`),
        }, 'Send miss-you'),
        isSuper && h('button', {
          type: 'button', style: styles.secondaryBtn, disabled: busy || !reason.trim(),
          onClick: () => act(`/api/admin/tenants/${tenantId}/churn/cancel`),
        }, 'Cancel churn seq'),
        isSuper && h('button', {
          type: 'button', style: styles.secondaryBtn, disabled: busy || !reason.trim(),
          onClick: () => act(`/api/admin/tenants/${tenantId}/force-wa-refresh`),
        }, 'Force WA refresh flag'),
      ),
      isSuper && h('div', { style: { ...styles.toolbar, marginTop: 8 } },
        h('input', {
          style: { ...styles.input, maxWidth: 220 },
          value: fssai,
          onChange: (e) => setFssai(e.target.value),
          placeholder: 'FSSAI license',
        }),
        h('button', {
          type: 'button',
          style: styles.secondaryBtn,
          disabled: busy || !reason.trim() || !fssai.trim(),
          onClick: () => act(`/api/admin/tenants/${tenantId}/fssai-override`, { fssai_license: fssai.trim() }),
        }, 'FSSAI override'),
      ),
      !isSuper && h('p', { style: styles.muted }, 'Support role: view + impersonate only.'),
    ),
  );
}

function ChurnScreen({ api, onOpenTenant }) {
  const [queue, setQueue] = useState([]);
  const [counts, setCounts] = useState({});
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const [q, s] = await Promise.all([
        api.request('GET', '/api/admin/churn/queue'),
        api.request('GET', '/api/admin/churn/feedback/summary'),
      ]);
      setQueue(q.items || []);
      setCounts(s.counts || {});
    } catch (ex) {
      setErr(ex.message);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const maxCount = Math.max(1, ...Object.values(counts).map(Number));

  return h('div', null,
    h('h2', { style: styles.h2 }, 'Churn win-back'),
    h('p', { style: styles.muted }, 'Idle tenants past LOB thresholds, outreach status, and feedback reasons.'),
    err && h('div', { style: styles.error }, err),
    h('button', { type: 'button', style: styles.secondaryBtn, onClick: load }, 'Refresh'),
    h('div', { style: { ...styles.panel, marginTop: 16 } },
      h('h3', { style: styles.h3 }, 'Feedback reasons'),
      Object.keys(counts).length === 0 && h('div', { style: styles.muted }, 'No feedback yet'),
      Object.entries(counts).map(([reason, n]) => h('div', {
        key: reason,
        style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
      },
        h('div', { style: { width: 140, fontSize: 12 } }, reason),
        h('div', {
          style: {
            height: 10, borderRadius: 4, background: '#059669',
            width: `${Math.max(8, (n / maxCount) * 240)}px`,
          },
        }),
        h('span', { style: styles.mono }, String(n)),
      )),
    ),
    h('div', { style: { ...styles.tableWrap, marginTop: 16 } },
      h('table', { style: styles.table },
        h('thead', null,
          h('tr', null,
            ['Business', 'LOB', 'Idle', 'Orders', 'Outreach', 'Feedback'].map((c) =>
              h('th', { key: c, style: styles.th }, c)),
          ),
        ),
        h('tbody', null,
          queue.map((row) => h('tr', {
            key: row.tenant_id,
            style: { cursor: 'pointer' },
            onClick: () => onOpenTenant(row.tenant_id),
          },
            h('td', { style: styles.td }, row.name),
            h('td', { style: styles.td }, row.lob_type),
            h('td', { style: styles.td }, `${row.idle_days}d / ${row.idle_threshold_days}d`),
            h('td', { style: styles.td }, row.lifetime_orders),
            h('td', { style: styles.td }, (row.outreach || []).map((o) => o.outreach_type).join(', ') || '—'),
            h('td', { style: styles.td }, (row.feedback || []).map((f) => f.reason).join(', ') || '—'),
          )),
        ),
      ),
    ),
  );
}

function BillingScreen({ api, onOpenTenant }) {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const data = await api.request('GET', '/api/admin/billing/at-risk');
      setItems(data.items || []);
    } catch (ex) {
      setErr(ex.message);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  return h('div', null,
    h('h2', { style: styles.h2 }, 'Billing'),
    h('p', { style: styles.muted }, 'Soft-locked and past_due / overdue subscriptions.'),
    err && h('div', { style: styles.error }, err),
    h('button', { type: 'button', style: styles.secondaryBtn, onClick: load }, 'Refresh'),
    h('div', { style: { ...styles.tableWrap, marginTop: 16 } },
      h('table', { style: styles.table },
        h('thead', null,
          h('tr', null,
            ['Business', 'Status', 'Soft lock', 'Renews / trial', 'MRR'].map((c) =>
              h('th', { key: c, style: styles.th }, c)),
          ),
        ),
        h('tbody', null,
          items.map((row) => h('tr', {
            key: row.tenant_id,
            style: { cursor: 'pointer' },
            onClick: () => onOpenTenant(row.tenant_id),
          },
            h('td', { style: styles.td }, row.name),
            h('td', { style: styles.td }, row.status || '—'),
            h('td', { style: styles.td }, row.soft_locked ? 'yes' : 'no'),
            h('td', { style: styles.td }, fmtDate(row.renews_at || row.trial_ends_at)),
            h('td', { style: styles.td }, row.mrr ? `₹${row.mrr}` : '—'),
          )),
        ),
      ),
    ),
  );
}

function ReferralsScreen({ api }) {
  const [items, setItems] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const [list, tierData] = await Promise.all([
        api.request('GET', '/api/admin/referrals'),
        api.request('GET', '/api/admin/referral-tiers'),
      ]);
      setItems(list.referrals || list.items || []);
      setTiers(tierData.tiers || []);
    } catch (ex) {
      setErr(ex.message);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  return h('div', null,
    h('h2', { style: styles.h2 }, 'Referrals'),
    h('p', { style: styles.muted }, 'Referral ledger and active bonus tiers.'),
    err && h('div', { style: styles.error }, err),
    h('button', { type: 'button', style: styles.secondaryBtn, onClick: load }, 'Refresh'),
    h('div', { style: { ...styles.panel, marginTop: 16 } },
      h('h3', { style: styles.h3 }, 'Tiers'),
      (tiers || []).length === 0 && h('div', { style: styles.muted }, 'No tiers configured'),
      (tiers || []).map((t) => h('div', { key: t.id || t.tier_order, style: { fontSize: 12, marginBottom: 4 } },
        `#${t.tier_order} · ≥${t.min_cumulative_count} · ${t.bonus_days} days`,
      )),
    ),
    h('div', { style: { ...styles.tableWrap, marginTop: 16 } },
      h('table', { style: styles.table },
        h('thead', null,
          h('tr', null,
            ['Created', 'Referrer', 'Referred', 'Status', 'Bonus days'].map((c) =>
              h('th', { key: c, style: styles.th }, c)),
          ),
        ),
        h('tbody', null,
          (items || []).map((r) => h('tr', { key: r.id },
            h('td', { style: styles.td }, fmtDate(r.created_at)),
            h('td', { style: styles.td }, h('span', { style: styles.mono }, (r.referrer_restaurant_id || '').slice(0, 8))),
            h('td', { style: styles.td }, `${r.referred_type || ''} ${(r.referred_id || '').slice(0, 8)}`),
            h('td', { style: styles.td }, r.status || '—'),
            h('td', { style: styles.td }, r.bonus_days_snapshot ?? r.bonus_days ?? '—'),
          )),
        ),
      ),
    ),
  );
}

function WaCostScreen() {
  return h('div', null,
    h('h2', { style: styles.h2 }, 'WhatsApp cost'),
    h('p', { style: styles.muted }, 'Coming soon — Meta usage metrics are not wired yet.'),
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
  const [role, setRole] = useState(() => {
    try { return sessionStorage.getItem(ROLE_KEY) || 'super_admin'; } catch { return 'super_admin'; }
  });
  const [screen, setScreen] = useState('tenants');
  const [tenantId, setTenantId] = useState(null);
  const api = useApi(secret);

  const onLogin = (s, r) => {
    try {
      sessionStorage.setItem(SECRET_KEY, s);
      sessionStorage.setItem(ROLE_KEY, r);
    } catch { /* ignore */ }
    setSecret(s);
    setRole(r);
  };
  const onLogout = () => {
    try {
      sessionStorage.removeItem(SECRET_KEY);
      sessionStorage.removeItem(ROLE_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch { /* ignore */ }
    setSecret('');
    setRole('super_admin');
  };

  const openTenant = (id) => {
    setTenantId(id);
    setScreen('tenant_detail');
  };

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = 'body{margin:0}';
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  if (!secret) return h(Login, { onLogin });

  let body = null;
  if (screen === 'tenants') body = h(TenantsScreen, { api, onOpenTenant: openTenant });
  else if (screen === 'tenant_detail') {
    body = h(TenantDetailScreen, {
      api,
      tenantId,
      role,
      onBack: () => setScreen('tenants'),
    });
  }
  else if (screen === 'churn') body = h(ChurnScreen, { api, onOpenTenant: openTenant });
  else if (screen === 'billing') body = h(BillingScreen, { api, onOpenTenant: openTenant });
  else if (screen === 'referrals') body = h(ReferralsScreen, { api });
  else if (screen === 'failures') body = h(FailuresScreen, { api });
  else if (screen === 'phonepe') body = h(PhonePeScreen, { api });
  else if (screen === 'offers') body = h(OffersScreen, { api });
  else if (screen === 'paid') body = h(PaidFeaturesScreen, { api });
  else if (screen === 'wa_cost') body = h(WaCostScreen);

  return h(Shell, { screen, setScreen, onLogout, role }, body);
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
  h3: { margin: '0 0 10px', fontSize: 15, color: '#cbd5e1' },
  muted: { color: '#94a3b8', fontSize: 13, marginBottom: 16 },
  panel: {
    background: '#020617', border: '1px solid #1e293b', borderRadius: 12, padding: 16, fontSize: 13,
  },
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
