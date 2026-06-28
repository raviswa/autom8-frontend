import { resolveSupplyApiBase } from '../../config/api';
// src/pages/supply/SupplyClientAccount.jsx
// ============================================================================
// MODULE 7 + 8 — Client Account Page
//
// Shows: credit summary, ledger timeline, payment claims tab
// Routes: /supply/clients/:id
//
// Design: clean financial ledger aesthetic — monochrome base, accent on balance
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';

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

// ── Sub-components ────────────────────────────────────────────────────────────

function CreditSummaryBar({ balance, limit, isBlocked }) {
  const pct    = limit > 0 ? Math.min(100, (balance / limit) * 100) : 0;
  const avail  = limit > 0 ? Math.max(0, limit - balance) : null;
  const color  = pct >= 100 ? '#ef4444' : pct >= 90 ? '#f59e0b' : pct >= 80 ? '#eab308' : '#22c55e';

  return (
    <div style={styles.creditCard}>
      <div style={styles.creditRow}>
        <div>
          <div style={styles.balanceLabel}>Outstanding Balance</div>
          <div style={styles.balanceAmount}>₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
        {limit > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={styles.balanceLabel}>Credit Available</div>
            <div style={{ ...styles.balanceAmount, color: avail === 0 ? '#ef4444' : '#16a34a' }}>
              ₹{avail.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        )}
      </div>

      {limit > 0 && (
        <>
          <div style={styles.barTrack}>
            <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            <span>₹0</span>
            <span style={{ fontWeight: 600, color }}>{Math.round(pct)}% used</span>
            <span>₹{limit.toLocaleString('en-IN')}</span>
          </div>
        </>
      )}

      {isBlocked && (
        <div style={styles.blockedBadge}>⛔ Orders blocked — credit limit reached</div>
      )}
    </div>
  );
}

function LedgerTable({ clientId }) {
  const [entries, setEntries]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [filter, setFilter]     = useState('');  // '' | 'debit' | 'credit'
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const PER_PAGE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page, per_page: PER_PAGE });
      if (filter) params.set('type', filter);
      const data = await apiFetch(`/api/supply/ledger/${clientId}?${params}`);
      setEntries(data.entries || []);
      setTotal(data.pagination?.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [clientId, page, filter]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / PER_PAGE);

  const handleExport = async () => {
    const res = await fetch(`${API_BASE}/api/supply/ledger/${clientId}/export`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `ledger_${clientId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={styles.tableToolbar}>
        <div style={styles.filterPills}>
          {['', 'debit', 'credit'].map(f => (
            <button key={f} style={{ ...styles.pill, ...(filter === f ? styles.pillActive : {}) }}
              onClick={() => { setFilter(f); setPage(1); }}>
              {f === '' ? 'All' : f === 'debit' ? 'Debits' : 'Credits'}
            </button>
          ))}
        </div>
        <button style={styles.exportBtn} onClick={handleExport}>↓ CSV</button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <table style={styles.table}>
        <thead>
          <tr>
            {['Date', 'Type', 'Reference', 'Amount', 'Balance After', 'Note'].map(h => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={styles.emptyCell}>Loading…</td></tr>
          ) : entries.length === 0 ? (
            <tr><td colSpan={6} style={styles.emptyCell}>No transactions yet</td></tr>
          ) : entries.map(e => {
            const ref = e.supply_orders?.order_number || e.supply_payment_claims?.reference || '—';
            return (
              <tr key={e.id} style={styles.tr}>
                <td style={styles.td}>{e.entry_date}</td>
                <td style={styles.td}>
                  <span style={e.type === 'debit' ? styles.debitTag : styles.creditTag}>
                    {e.type === 'debit' ? '▲ Debit' : '▼ Credit'}
                  </span>
                </td>
                <td style={styles.td}>{ref}</td>
                <td style={{ ...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: e.type === 'debit' ? '#ef4444' : '#16a34a' }}>
                    {e.type === 'debit' ? '+' : '−'}₹{parseFloat(e.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </td>
                <td style={{ ...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  ₹{parseFloat(e.balance_after).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td style={{ ...styles.td, color: '#6b7280', fontSize: 12 }}>{e.note || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button style={styles.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
          <span style={{ fontSize: 13, color: '#374151' }}>Page {page} of {totalPages}</span>
          <button style={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
        </div>
      )}
    </div>
  );
}

function PaymentClaimsTab({ clientId, onClaimResolved }) {
  const [claims, setClaims]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [actionId, setActionId]   = useState(null);
  const [note, setNote]           = useState('');
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/supply/payment-claims?client_id=${clientId}`);
      setClaims(data.claims || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id, action) => {
    try {
      await apiFetch(`/api/supply/payment-claims/${id}/${action}`, {
        method: 'PUT',
        body: JSON.stringify({ supplier_note: note }),
      });
      await load();
      onClaimResolved?.();
      setActionId(null);
      setNote('');
    } catch (e) { setError(e.message); }
  };

  if (loading) return <div style={styles.emptyCell}>Loading claims…</div>;

  return (
    <div>
      {error && <div style={styles.errorBox}>{error}</div>}
      {claims.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
          No payment claims for this client
        </div>
      ) : claims.map(c => (
        <div key={c.id} style={styles.claimCard}>
          <div style={styles.claimRow}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                ₹{parseFloat(c.claimed_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {c.method?.toUpperCase() || 'Unknown'} {c.reference ? `· Ref: ${c.reference}` : ''}
              </div>
              {c.raw_message && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' }}>
                  "{c.raw_message}"
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                ...styles.statusBadge,
                background: c.status === 'confirmed' ? '#dcfce7' : c.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                color: c.status === 'confirmed' ? '#15803d' : c.status === 'rejected' ? '#b91c1c' : '#92400e',
              }}>
                {c.status}
              </span>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                {new Date(c.claimed_at).toLocaleDateString('en-IN')}
              </div>
            </div>
          </div>

          {c.status === 'pending' && (
            actionId === c.id ? (
              <div style={{ marginTop: 12 }}>
                <input
                  style={styles.noteInput}
                  placeholder="Optional note (reason for rejection, etc.)"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={styles.confirmBtn} onClick={() => resolve(c.id, 'confirm')}>✓ Confirm Payment</button>
                  <button style={styles.rejectBtn}  onClick={() => resolve(c.id, 'reject')}>✗ Reject</button>
                  <button style={styles.cancelBtn}  onClick={() => setActionId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button style={styles.reviewBtn} onClick={() => setActionId(c.id)}>
                Review claim →
              </button>
            )
          )}

          {c.supplier_note && (
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
              Note: {c.supplier_note}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SupplyClientAccount() {
  const { id }              = useParams();
  const [client, setClient] = useState(null);
  const [balance, setBalance] = useState(null);
  const [tab, setTab]       = useState('ledger');  // 'ledger' | 'claims' | 'orders'
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const loadBalance = useCallback(async () => {
    const data = await apiFetch(`/api/supply/ledger/${id}/balance`);
    setBalance(data);
  }, [id]);

  useEffect(() => {
    async function init() {
      try {
        const [clientData] = await Promise.all([
          apiFetch(`/api/supply/clients/${id}`),
        ]);
        setClient(clientData.client);
        await loadBalance();
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id, loadBalance]);

  if (loading) return <div style={styles.page}><div style={styles.emptyCell}>Loading account…</div></div>;
  if (error)   return <div style={styles.page}><div style={styles.errorBox}>{error}</div></div>;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <Link to="/supply/clients" style={styles.breadcrumb}>← Clients</Link>
          <h1 style={styles.clientName}>{client?.name}</h1>
          <div style={styles.clientMeta}>
            {client?.phone} {client?.city ? `· ${client.city}` : ''} {client?.gstin ? `· GSTIN: ${client.gstin}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/supply/clients/${id}/ratecard`} style={styles.headerBtn}>Ratecard</Link>
          <Link to={`/supply/clients/${id}/edit`}     style={styles.headerBtn}>Edit</Link>
        </div>
      </div>

      {/* Credit summary */}
      {balance && (
        <CreditSummaryBar
          balance={balance.current_balance}
          limit={balance.credit_limit}
          isBlocked={balance.is_blocked}
        />
      )}

      {/* Tabs */}
      <div style={styles.tabs}>
        {[['ledger', 'Ledger'], ['claims', 'Payment Claims'], ['orders', 'Orders']].map(([key, label]) => (
          <button key={key} style={{ ...styles.tabBtn, ...(tab === key ? styles.tabActive : {}) }}
            onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={styles.tabContent}>
        {tab === 'ledger' && <LedgerTable clientId={id} />}
        {tab === 'claims' && <PaymentClaimsTab clientId={id} onClaimResolved={loadBalance} />}
        {tab === 'orders' && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
            Orders view — rendered by Module 6 (SupplyOrders.jsx)
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: { maxWidth: 960, margin: '0 auto', padding: '24px 16px', fontFamily: 'Inter, system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  breadcrumb: { fontSize: 13, color: '#6b7280', textDecoration: 'none', display: 'block', marginBottom: 6 },
  clientName: { fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 },
  clientMeta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  headerBtn: {
    padding: '7px 14px', borderRadius: 6, border: '1px solid #d1d5db',
    background: '#fff', fontSize: 13, cursor: 'pointer', textDecoration: 'none',
    color: '#374151', fontWeight: 500,
  },

  creditCard: {
    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
    padding: '16px 20px', marginBottom: 20,
  },
  creditRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 12 },
  balanceLabel: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
  balanceAmount: { fontSize: 24, fontWeight: 700, color: '#111827', marginTop: 2, fontVariantNumeric: 'tabular-nums' },
  barTrack: { height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 4, transition: 'width 0.4s ease' },
  blockedBadge: {
    marginTop: 10, padding: '6px 12px', background: '#fee2e2', borderRadius: 6,
    color: '#b91c1c', fontSize: 13, fontWeight: 600,
  },

  tabs: { display: 'flex', gap: 2, borderBottom: '1px solid #e5e7eb', marginBottom: 20 },
  tabBtn: {
    padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 14, color: '#6b7280', fontWeight: 500, borderBottom: '2px solid transparent',
  },
  tabActive: { color: '#1a56db', borderBottomColor: '#1a56db' },
  tabContent: {},

  tableToolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  filterPills: { display: 'flex', gap: 6 },
  pill: {
    padding: '5px 12px', borderRadius: 20, border: '1px solid #e5e7eb',
    background: '#fff', cursor: 'pointer', fontSize: 12, color: '#374151',
  },
  pillActive: { background: '#1a56db', borderColor: '#1a56db', color: '#fff' },
  exportBtn: {
    padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: 6,
    background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151',
  },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { background: '#f9fafb', padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151',
        borderBottom: '1px solid #e5e7eb', fontSize: 12 },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: '10px 12px', verticalAlign: 'middle', color: '#111827' },
  emptyCell: { padding: '40px 0', textAlign: 'center', color: '#9ca3af' },
  debitTag:  { background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
  creditTag: { background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 },

  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16 },
  pageBtn: { padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 },

  errorBox: { background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 6, padding: '10px 14px', marginBottom: 12 },

  claimCard: { border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px', marginBottom: 12, background: '#fff' },
  claimRow:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  statusBadge: { padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 },
  noteInput: {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6,
    fontSize: 13, boxSizing: 'border-box',
  },
  reviewBtn: { marginTop: 10, padding: '6px 14px', border: '1px solid #1a56db', borderRadius: 6, background: '#fff', color: '#1a56db', cursor: 'pointer', fontSize: 13 },
  confirmBtn: { padding: '7px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  rejectBtn:  { padding: '7px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  cancelBtn:  { padding: '7px 14px', background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
};
