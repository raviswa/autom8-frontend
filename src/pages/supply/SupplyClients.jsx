// src/pages/supply/SupplyClients.jsx
// ============================================================================
// MODULE 2 — Client Management (List View)
//
// Route: /supply/clients
//
// Features:
//   - Paginated, sortable client list
//   - Filter: active/inactive, overdue, credit status
//   - Search by name or phone
//   - Quick actions: View account, Send form link, Record payment (modal)
//   - Add client modal (inline form)
//
// Navigates to /supply/clients/:id for full account view.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

function getToken() { return localStorage.getItem('supply_token'); }

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${getToken()}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function creditPct(balance, limit) {
  if (!limit || limit <= 0) return null;
  return Math.min(100, Math.round((balance / limit) * 100));
}

function creditColor(pct) {
  if (pct === null) return '#94a3b8';
  if (pct >= 100)   return '#ef4444';
  if (pct >= 90)    return '#f59e0b';
  if (pct >= 80)    return '#eab308';
  return '#22c55e';
}

// ── Add Client Modal ──────────────────────────────────────────────────────────

const EMPTY = {
  name: '', phone: '', gstin: '', address: '', city: '', pincode: '',
  credit_limit: '', credit_terms_days: 30, credit_auto_block: true,
  delivery_days: [],
};
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function AddClientModal({ onClose, onSaved }) {
  const [form,    setForm]    = useState(EMPTY);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const set = k => e => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(f => ({ ...f, [k]: v }));
  };

  const toggleDay = d => {
    setForm(f => ({
      ...f,
      delivery_days: f.delivery_days.includes(d)
        ? f.delivery_days.filter(x => x !== d)
        : [...f.delivery_days, d],
    }));
  };

  const save = async () => {
    if (!form.name.trim())  { setError('Business name is required');  return; }
    if (!form.phone.trim()) { setError('WhatsApp phone is required'); return; }
    setSaving(true); setError('');
    try {
      await apiFetch('/api/supply/clients', {
        method: 'POST',
        body:   JSON.stringify({
          ...form,
          credit_limit:       form.credit_limit ? parseFloat(form.credit_limit) : 0,
          credit_terms_days:  parseInt(form.credit_terms_days, 10) || 30,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Add client</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        <div style={s.modalBody}>
          <div style={s.row}>
            <MField label="Business name *" value={form.name}  onChange={set('name')}  placeholder="Hotel Murugan" />
            <MField label="WhatsApp phone *" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" />
          </div>
          <MField label="GSTIN" value={form.gstin} onChange={set('gstin')} placeholder="22AAAAA0000A1Z5" />
          <MField label="Delivery address" value={form.address} onChange={set('address')} placeholder="Street / locality" />
          <div style={s.row}>
            <MField label="City"    value={form.city}    onChange={set('city')}    placeholder="Chennai" />
            <MField label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="600001" />
          </div>

          <div style={s.fieldGroup}>
            <label style={s.label}>Delivery days</label>
            <div style={s.dayChips}>
              {DAYS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  style={{
                    ...s.dayChip,
                    ...(form.delivery_days.includes(d) ? s.dayChipActive : {}),
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div style={s.row}>
            <MField
              label="Credit limit (₹)"
              value={form.credit_limit}
              onChange={set('credit_limit')}
              placeholder="0 = no credit"
              type="number"
            />
            <MField
              label="Credit terms (days)"
              value={form.credit_terms_days}
              onChange={set('credit_terms_days')}
              placeholder="30"
              type="number"
            />
          </div>

          <label style={s.checkRow}>
            <input
              type="checkbox"
              checked={form.credit_auto_block}
              onChange={set('credit_auto_block')}
              style={{ marginRight: 8 }}
            />
            <span style={{ fontSize: 13, color: '#374151' }}>
              Auto-block orders when credit limit reached
            </span>
          </label>
        </div>

        <div style={s.modalFooter}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={s.saveBtn}   onClick={save} disabled={saving}>
            {saving ? 'Adding…' : 'Add client'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={s.label}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={s.input}
      />
    </div>
  );
}

// ── Manual Payment Modal (record payment from list view) ──────────────────────

function RecordPaymentModal({ client, onClose, onSaved }) {
  const [amount,  setAmount]  = useState('');
  const [method,  setMethod]  = useState('upi');
  const [ref,     setRef]     = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const save = async () => {
    if (!amount || isNaN(parseFloat(amount))) { setError('Valid amount required'); return; }
    setSaving(true); setError('');
    try {
      await apiFetch('/api/supply/payment-claims/manual', {
        method: 'POST',
        body: JSON.stringify({
          client_id: client.id,
          amount:    parseFloat(amount),
          method,
          reference: ref || undefined,
          notify_client: true,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...s.modal, maxWidth: 400 }}>
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Record payment — {client.name}</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>
        {error && <div style={s.errorBox}>{error}</div>}
        <div style={s.modalBody}>
          <MField label="Amount (₹)" value={amount} onChange={e => setAmount(e.target.value)} placeholder="5000" type="number" />
          <div style={s.fieldGroup}>
            <label style={s.label}>Payment method</label>
            <select value={method} onChange={e => setMethod(e.target.value)} style={s.input}>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank transfer</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <MField label="Reference / UPI ID" value={ref} onChange={e => setRef(e.target.value)} placeholder="Optional" />
        </div>
        <div style={s.modalFooter}>
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={s.saveBtn}   onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Client row ────────────────────────────────────────────────────────────────

function ClientRow({ client, onRecordPayment }) {
  const navigate   = useNavigate();
  const balance    = parseFloat(client.outstanding_balance || 0);
  const limit      = parseFloat(client.credit_limit || 0);
  const pct        = creditPct(balance, limit);
  const color      = creditColor(pct);
  const isBlocked  = client.credit_auto_block && pct !== null && pct >= 100;
  const isOverdue  = client.is_overdue;

  const [sending, setSending] = useState(false);
  const [sentOk,  setSentOk]  = useState(false);

  const sendFormLink = async e => {
    e.stopPropagation();
    setSending(true);
    try {
      await apiFetch(`/api/supply/clients/${client.id}/send-form-link`, { method: 'POST' });
      setSentOk(true);
      setTimeout(() => setSentOk(false), 3000);
    } catch { /* ignore UI for now */ }
    finally { setSending(false); }
  };

  return (
    <tr
      style={{ cursor: 'pointer' }}
      onClick={() => navigate(`/supply/clients/${client.id}`)}
    >
      <td style={s.td}>
        <div style={s.clientName}>{client.name}</div>
        <div style={s.clientPhone}>{client.phone}</div>
      </td>

      <td style={s.td}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(client.delivery_days || []).map(d => (
            <span key={d} style={s.dayTag}>{d}</span>
          ))}
        </div>
      </td>

      <td style={{ ...s.td, textAlign: 'right' }}>
        <span style={{ fontWeight: 600, color: balance > 0 ? '#0f172a' : '#6b7280' }}>
          {balance > 0 ? `₹${fmt(balance)}` : '—'}
        </span>
      </td>

      <td style={s.td}>
        {pct !== null ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
              <span style={{ color, fontWeight: 700 }}>{pct}%</span>
              <span style={{ color: '#9ca3af' }}>₹{fmt(limit)}</span>
            </div>
            <div style={s.barTrack}>
              <div style={{ ...s.barFill, width: `${pct}%`, background: color }} />
            </div>
          </div>
        ) : (
          <span style={{ color: '#9ca3af', fontSize: 12 }}>No limit</span>
        )}
      </td>

      <td style={s.td}>
        <div style={{ display: 'flex', gap: 4 }}>
          {isBlocked && <span style={s.badgeRed}>Blocked</span>}
          {isOverdue  && <span style={s.badgeAmber}>Overdue</span>}
          {!client.is_active && <span style={s.badgeGray}>Inactive</span>}
          {client.is_active && !isBlocked && !isOverdue && (
            <span style={s.badgeGreen}>Active</span>
          )}
        </div>
      </td>

      <td style={{ ...s.td, whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
        <div style={s.actions}>
          <Link to={`/supply/clients/${client.id}`} style={s.actionBtn}>
            View
          </Link>
          <button
            style={s.actionBtn}
            onClick={sendFormLink}
            disabled={sending}
          >
            {sentOk ? '✓ Sent' : sending ? '…' : 'Send link'}
          </button>
          <button
            style={{ ...s.actionBtn, ...s.actionBtnPrimary }}
            onClick={e => { e.stopPropagation(); onRecordPayment(client); }}
          >
            Payment
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SupplyClients() {
  const [clients,   setClients]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  // Filters / search
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState('all');   // 'all' | 'overdue' | 'blocked' | 'inactive'
  const [sortBy,    setSortBy]    = useState('name');  // 'name' | 'balance' | 'last_order'
  const [page,      setPage]      = useState(1);
  const PAGE_SIZE = 25;

  // Modals
  const [showAdd,     setShowAdd]     = useState(false);
  const [payClient,   setPayClient]   = useState(null);

  const searchRef = useRef(null);

  const fetchClients = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ sort: sortBy, page, limit: PAGE_SIZE });
    if (search)           params.set('search',  search);
    if (filter !== 'all') params.set('filter',  filter);

    apiFetch(`/api/supply/clients?${params}`)
      .then(d => { setClients(d.clients || []); setTotal(d.total || 0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [search, filter, sortBy, page]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Debounced search
  const searchTimer = useRef(null);
  const onSearch = v => {
    setSearch(v);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {}, 0); // fetchClients fires via useEffect
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={s.page}>
      {/* ── Header ── */}
      <div style={s.header}>
        <div>
          <h1 style={s.pageTitle}>Clients</h1>
          <p style={s.pageSubtitle}>{total} restaurant{total !== 1 ? 's' : ''} on your supply network</p>
        </div>
        <button style={s.addBtn} onClick={() => setShowAdd(true)}>
          + Add client
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div style={s.toolbar}>
        <input
          ref={searchRef}
          style={s.searchInput}
          placeholder="Search name or phone…"
          value={search}
          onChange={e => onSearch(e.target.value)}
        />

        <div style={s.filterRow}>
          {['all','overdue','blocked','inactive'].map(f => (
            <button
              key={f}
              style={{ ...s.filterBtn, ...(filter === f ? s.filterBtnActive : {}) }}
              onClick={() => { setFilter(f); setPage(1); }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div style={s.sortRow}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Sort:</span>
          {[['name','Name'],['balance','Balance'],['last_order','Last order']].map(([k, label]) => (
            <button
              key={k}
              style={{ ...s.filterBtn, ...(sortBy === k ? s.filterBtnActive : {}) }}
              onClick={() => { setSortBy(k); setPage(1); }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error ── */}
      {error && <div style={s.errorBox}>{error}</div>}

      {/* ── Table ── */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Client</th>
              <th style={s.th}>Delivery days</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Outstanding</th>
              <th style={s.th}>Credit</th>
              <th style={s.th}>Status</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={s.emptyCell}>Loading…</td></tr>
            )}
            {!loading && clients.length === 0 && (
              <tr>
                <td colSpan={6} style={s.emptyCell}>
                  {search || filter !== 'all'
                    ? 'No clients match your filters.'
                    : 'No clients yet. Add your first one.'}
                </td>
              </tr>
            )}
            {!loading && clients.map(c => (
              <ClientRow
                key={c.id}
                client={c}
                onRecordPayment={setPayClient}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={s.pagination}>
          <button style={s.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: '#6b7280' }}>Page {page} of {totalPages}</span>
          <button style={s.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {/* ── Modals ── */}
      {showAdd   && <AddClientModal onClose={() => setShowAdd(false)} onSaved={fetchClients} />}
      {payClient && <RecordPaymentModal client={payClient} onClose={() => setPayClient(null)} onSaved={fetchClients} />}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page: {
    maxWidth:   1100,
    margin:     '0 auto',
    padding:    '24px 20px',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   20,
  },
  pageTitle: {
    margin:       0,
    fontSize:     26,
    fontWeight:   700,
    color:        '#0f172a',
    letterSpacing:'-0.5px',
  },
  pageSubtitle: {
    margin:   '4px 0 0',
    fontSize: 14,
    color:    '#64748b',
  },
  addBtn: {
    background:   '#0ea5e9',
    color:        '#fff',
    border:       'none',
    borderRadius: 8,
    padding:      '10px 18px',
    fontSize:     14,
    fontWeight:   600,
    cursor:       'pointer',
    whiteSpace:   'nowrap',
  },
  toolbar: {
    display:      'flex',
    flexWrap:     'wrap',
    gap:          10,
    marginBottom: 16,
    alignItems:   'center',
  },
  searchInput: {
    flex:         '1 1 220px',
    padding:      '9px 12px',
    border:       '1.5px solid #e2e8f0',
    borderRadius: 8,
    fontSize:     14,
    color:        '#0f172a',
    outline:      'none',
    background:   '#fff',
  },
  filterRow: {
    display: 'flex',
    gap:     4,
  },
  sortRow: {
    display:    'flex',
    gap:        4,
    alignItems: 'center',
    marginLeft: 'auto',
  },
  filterBtn: {
    padding:      '7px 12px',
    border:       '1.5px solid #e2e8f0',
    borderRadius: 6,
    fontSize:     12,
    fontWeight:   500,
    color:        '#475569',
    background:   '#fff',
    cursor:       'pointer',
    whiteSpace:   'nowrap',
  },
  filterBtnActive: {
    background:   '#0f172a',
    color:        '#fff',
    borderColor:  '#0f172a',
  },
  errorBox: {
    background:   '#fef2f2',
    border:       '1px solid #fecaca',
    borderRadius: 8,
    color:        '#b91c1c',
    fontSize:     13,
    padding:      '10px 14px',
    marginBottom: 12,
  },
  tableWrap: {
    border:       '1px solid #e2e8f0',
    borderRadius: 12,
    overflow:     'hidden',
    background:   '#fff',
  },
  table: {
    width:          '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding:     '12px 14px',
    textAlign:   'left',
    fontSize:    11,
    fontWeight:  700,
    color:       '#6b7280',
    textTransform:'uppercase',
    letterSpacing:'0.5px',
    background:  '#f8fafc',
    borderBottom:'1px solid #e2e8f0',
  },
  td: {
    padding:     '13px 14px',
    fontSize:    13,
    color:       '#374151',
    borderBottom:'1px solid #f1f5f9',
    verticalAlign:'middle',
  },
  clientName: {
    fontWeight: 600,
    color:      '#0f172a',
    fontSize:   14,
  },
  clientPhone: {
    color:    '#9ca3af',
    fontSize: 12,
    marginTop:2,
  },
  dayTag: {
    background:   '#f1f5f9',
    borderRadius: 4,
    padding:      '2px 6px',
    fontSize:     11,
    color:        '#64748b',
    fontWeight:   600,
  },
  barTrack: {
    height:       5,
    background:   '#f1f5f9',
    borderRadius: 99,
    overflow:     'hidden',
  },
  barFill: {
    height:       '100%',
    borderRadius: 99,
    transition:   'width 0.3s',
  },
  badgeGreen: {
    background: '#dcfce7', color: '#16a34a',
    borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 700,
  },
  badgeRed: {
    background: '#fee2e2', color: '#dc2626',
    borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 700,
  },
  badgeAmber: {
    background: '#fef3c7', color: '#d97706',
    borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 700,
  },
  badgeGray: {
    background: '#f1f5f9', color: '#64748b',
    borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 700,
  },
  actions: {
    display: 'flex',
    gap:     6,
  },
  actionBtn: {
    padding:      '5px 10px',
    border:       '1.5px solid #e2e8f0',
    borderRadius: 6,
    fontSize:     12,
    fontWeight:   500,
    color:        '#374151',
    background:   '#fff',
    cursor:       'pointer',
    textDecoration:'none',
    whiteSpace:   'nowrap',
  },
  actionBtnPrimary: {
    background:  '#0ea5e9',
    borderColor: '#0ea5e9',
    color:       '#fff',
  },
  emptyCell: {
    textAlign:  'center',
    padding:    '48px 0',
    color:      '#9ca3af',
    fontSize:   14,
  },
  pagination: {
    display:        'flex',
    justifyContent: 'center',
    alignItems:     'center',
    gap:            12,
    marginTop:      16,
  },
  pageBtn: {
    padding:      '7px 14px',
    border:       '1.5px solid #e2e8f0',
    borderRadius: 7,
    fontSize:     13,
    background:   '#fff',
    cursor:       'pointer',
    color:        '#374151',
  },
  // ── Modal shared ────────────────────────────────────────────────────────────
  overlay: {
    position:        'fixed',
    inset:           0,
    background:      'rgba(0,0,0,0.45)',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    zIndex:          1000,
    padding:         20,
  },
  modal: {
    background:   '#fff',
    borderRadius: 14,
    width:        '100%',
    maxWidth:     600,
    maxHeight:    '90vh',
    overflow:     'auto',
    boxShadow:    '0 20px 60px rgba(0,0,0,0.25)',
  },
  modalHeader: {
    display:         'flex',
    justifyContent:  'space-between',
    alignItems:      'center',
    padding:         '20px 24px 0',
  },
  modalTitle: {
    margin:     0,
    fontSize:   18,
    fontWeight: 700,
    color:      '#0f172a',
  },
  closeBtn: {
    background: 'none',
    border:     'none',
    fontSize:   18,
    cursor:     'pointer',
    color:      '#9ca3af',
    padding:    4,
  },
  modalBody: {
    padding: '16px 24px',
  },
  modalFooter: {
    display:         'flex',
    justifyContent:  'flex-end',
    gap:             10,
    padding:         '0 24px 20px',
  },
  cancelBtn: {
    padding:      '10px 18px',
    border:       '1.5px solid #e2e8f0',
    borderRadius: 8,
    fontSize:     14,
    background:   '#fff',
    cursor:       'pointer',
    color:        '#374151',
    fontWeight:   500,
  },
  saveBtn: {
    padding:      '10px 20px',
    border:       'none',
    borderRadius: 8,
    fontSize:     14,
    background:   '#0ea5e9',
    cursor:       'pointer',
    color:        '#fff',
    fontWeight:   700,
  },
  row: {
    display: 'flex',
    gap:     12,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    display:    'block',
    fontSize:   11,
    fontWeight: 700,
    color:      '#374151',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    marginBottom: 4,
  },
  input: {
    width:        '100%',
    padding:      '9px 12px',
    border:       '1.5px solid #e2e8f0',
    borderRadius: 8,
    fontSize:     14,
    color:        '#0f172a',
    outline:      'none',
    background:   '#f8fafc',
    boxSizing:    'border-box',
  },
  dayChips: {
    display:  'flex',
    gap:      6,
    flexWrap: 'wrap',
  },
  dayChip: {
    padding:      '5px 10px',
    border:       '1.5px solid #e2e8f0',
    borderRadius: 6,
    fontSize:     12,
    fontWeight:   600,
    color:        '#475569',
    background:   '#fff',
    cursor:       'pointer',
  },
  dayChipActive: {
    background:  '#0ea5e9',
    borderColor: '#0ea5e9',
    color:       '#fff',
  },
  checkRow: {
    display:    'flex',
    alignItems: 'center',
    cursor:     'pointer',
    marginTop:  4,
  },
};
