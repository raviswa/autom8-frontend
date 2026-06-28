import { resolveSupplyApiBase } from '../../config/api';
// src/pages/supply/SupplyPaymentClaims.jsx
// ============================================================================
// MODULE 8 — Payment Claims Dashboard
//
// Route: /supply/payment-claims
// Shows all pending + recent claims across all clients.
// Supplier can: confirm, reject, or manually add a payment.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

const API_BASE = resolveSupplyApiBase();

function getToken() {
  return localStorage.getItem('supply_token');
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ── Manual payment modal ──────────────────────────────────────────────────────

function ManualPaymentModal({ clients, onClose, onSaved }) {
  const [form, setForm] = useState({ client_id: '', amount: '', method: 'upi', reference: '', note: '', notify: true });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.client_id || !form.amount) { setError('Client and amount are required'); return; }
    setSaving(true); setError('');
    try {
      await apiFetch('/api/supply/payment-claims/manual', {
        method: 'POST',
        body: JSON.stringify({
          client_id:    form.client_id,
          amount:       parseFloat(form.amount),
          method:       form.method,
          reference:    form.reference || undefined,
          note:         form.note || undefined,
          notify_client: form.notify,
        }),
      });
      onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Record Payment</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <label style={styles.label}>Client</label>
        <select style={styles.select} value={form.client_id} onChange={set('client_id')}>
          <option value="">— Select client —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
        </select>

        <label style={styles.label}>Amount (₹)</label>
        <input style={styles.input} type="number" min="1" step="0.01"
          value={form.amount} onChange={set('amount')} placeholder="e.g. 5000" />

        <label style={styles.label}>Payment Method</label>
        <select style={styles.select} value={form.method} onChange={set('method')}>
          <option value="upi">UPI</option>
          <option value="cash">Cash</option>
          <option value="bank">Bank Transfer</option>
          <option value="cheque">Cheque</option>
        </select>

        <label style={styles.label}>Reference (optional)</label>
        <input style={styles.input} value={form.reference} onChange={set('reference')}
          placeholder="UPI txn ID, cheque number…" />

        <label style={styles.label}>Note (optional)</label>
        <input style={styles.input} value={form.note} onChange={set('note')}
          placeholder="Internal note" />

        <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.notify}
            onChange={e => setForm(f => ({ ...f, notify: e.target.checked }))} />
          Notify client on WhatsApp
        </label>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button style={styles.primaryBtn} disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Record Payment'}
          </button>
          <button style={styles.secondaryBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Claim card ────────────────────────────────────────────────────────────────

function ClaimCard({ claim, onResolved }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const resolve = async (action) => {
    setLoading(true); setError('');
    try {
      await apiFetch(`/api/supply/payment-claims/${claim.id}/${action}`, {
        method: 'PUT',
        body: JSON.stringify({ supplier_note: note }),
      });
      onResolved();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const statusColor = {
    pending:   { bg: '#fef3c7', text: '#92400e' },
    confirmed: { bg: '#dcfce7', text: '#15803d' },
    rejected:  { bg: '#fee2e2', text: '#b91c1c' },
  }[claim.status] || { bg: '#f3f4f6', text: '#374151' };

  return (
    <div style={styles.card}>
      <div style={styles.cardRow}>
        <div style={{ flex: 1 }}>
          <Link to={`/supply/clients/${claim.supply_clients?.id}`} style={styles.clientLink}>
            {claim.supply_clients?.name}
          </Link>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{claim.supply_clients?.phone}</div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            ₹{parseFloat(claim.claimed_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            {claim.method?.toUpperCase() || '—'} {claim.reference ? `· ${claim.reference}` : ''}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{ ...styles.badge, background: statusColor.bg, color: statusColor.text }}>
            {claim.status}
          </span>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            {new Date(claim.claimed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>

      {claim.raw_message && (
        <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', margin: '8px 0 0' }}>
          "{claim.raw_message}"
        </div>
      )}

      {claim.status === 'pending' && (
        <>
          {!expanded ? (
            <button style={styles.reviewBtn} onClick={() => setExpanded(true)}>Review →</button>
          ) : (
            <div style={styles.resolveBox}>
              {error && <div style={styles.errorBox}>{error}</div>}
              <input style={styles.input} placeholder="Note (optional)"
                value={note} onChange={e => setNote(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={styles.confirmBtn} disabled={loading} onClick={() => resolve('confirm')}>
                  ✓ Confirm
                </button>
                <button style={styles.rejectBtn} disabled={loading} onClick={() => resolve('reject')}>
                  ✗ Reject
                </button>
                <button style={styles.secondaryBtn} onClick={() => setExpanded(false)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      {claim.supplier_note && claim.status !== 'pending' && (
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
          {claim.status === 'rejected' ? '✗' : '✓'} {claim.supplier_note}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SupplyPaymentClaims() {
  const [claims, setClaims]     = useState([]);
  const [clients, setClients]   = useState([]);
  const [pending, setPending]   = useState(0);
  const [filter, setFilter]     = useState('pending');
  const [page, setPage]         = useState(1);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [error, setError]       = useState('');
  const PER_PAGE = 25;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page, per_page: PER_PAGE });
      if (filter) params.set('status', filter);
      const data = await apiFetch(`/api/supply/payment-claims?${params}`);
      setClaims(data.claims || []);
      setPending(data.pending_count || 0);
      setTotal(data.pagination?.total || 0);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [filter, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch('/api/supply/clients?per_page=200')
      .then(d => setClients(d.clients || []))
      .catch(() => {});
  }, []);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.h1}>
            Payment Claims
            {pending > 0 && <span style={styles.pendingBadge}>{pending} pending</span>}
          </h1>
          <p style={styles.subtitle}>Review payments clients have notified you about</p>
        </div>
        <button style={styles.primaryBtn} onClick={() => setShowManual(true)}>
          + Record Payment
        </button>
      </div>

      {/* Filter tabs */}
      <div style={styles.tabs}>
        {[['pending', 'Pending'], ['confirmed', 'Confirmed'], ['rejected', 'Rejected'], ['', 'All']].map(([k, l]) => (
          <button key={k} style={{ ...styles.tabBtn, ...(filter === k ? styles.tabActive : {}) }}
            onClick={() => { setFilter(k); setPage(1); }}>
            {l}
          </button>
        ))}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>Loading…</div>
      ) : claims.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          {filter === 'pending' ? 'No pending claims — you\'re all caught up ✓' : 'No claims in this category'}
        </div>
      ) : (
        <div>
          {claims.map(c => (
            <ClaimCard key={c.id} claim={c} onResolved={load} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button style={styles.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
          <span style={{ fontSize: 13, color: '#374151' }}>Page {page} of {totalPages}</span>
          <button style={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
        </div>
      )}

      {showManual && (
        <ManualPaymentModal
          clients={clients}
          onClose={() => setShowManual(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: { maxWidth: 800, margin: '0 auto', padding: '24px 16px', fontFamily: 'Inter, system-ui, sans-serif' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  h1: { fontSize: 24, fontWeight: 700, color: '#111827', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 },
  subtitle: { fontSize: 14, color: '#6b7280', margin: 0 },
  pendingBadge: {
    background: '#f59e0b', color: '#fff', fontSize: 13, fontWeight: 700,
    padding: '2px 8px', borderRadius: 12,
  },

  tabs: { display: 'flex', gap: 2, borderBottom: '1px solid #e5e7eb', marginBottom: 20 },
  tabBtn: {
    padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 14, color: '#6b7280', fontWeight: 500, borderBottom: '2px solid transparent',
  },
  tabActive: { color: '#1a56db', borderBottomColor: '#1a56db' },

  card: {
    border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px', marginBottom: 12,
    background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  cardRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  clientLink: { fontWeight: 700, color: '#1a56db', textDecoration: 'none', fontSize: 15 },
  badge: { padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  reviewBtn: {
    marginTop: 12, padding: '6px 14px', border: '1px solid #1a56db',
    borderRadius: 6, background: '#fff', color: '#1a56db', cursor: 'pointer', fontSize: 13,
  },
  resolveBox: { marginTop: 12, padding: '12px', background: '#f9fafb', borderRadius: 8 },

  primaryBtn: {
    padding: '9px 18px', background: '#1a56db', color: '#fff', border: 'none',
    borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 14,
  },
  confirmBtn: { padding: '7px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  rejectBtn:  { padding: '7px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  secondaryBtn: { padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 },

  input: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' },
  select: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', background: '#fff' },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', margin: '12px 0 4px' },

  errorBox: { background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: 13 },

  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
  pageBtn: { padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280' },
};
