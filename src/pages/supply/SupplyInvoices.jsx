import { resolveSupplyApiBase } from '../../config/api';
// src/pages/supply/SupplyInvoices.jsx
// ============================================================================
// MODULE 9 — Invoice Dashboard
//
// Route: /supply/invoices
// Lists all invoices. Filter by client, date range.
// Actions: view, download PDF, resend to client.
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

// ── Invoice detail drawer ─────────────────────────────────────────────────────

function InvoiceDrawer({ invoiceId, onClose }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [pdfUrl, setPdfUrl]   = useState('');
  const [error, setError]     = useState('');

  useEffect(() => {
    apiFetch(`/api/supply/invoices/${invoiceId}`)
      .then(d => setInvoice(d.invoice))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const downloadPdf = async () => {
    try {
      const data = await apiFetch(`/api/supply/invoices/${invoiceId}/pdf`);
      window.open(data.signed_url, '_blank');
    } catch (e) { setError(e.message); }
  };

  const resend = async () => {
    setResending(true); setError('');
    try {
      await apiFetch(`/api/supply/invoices/${invoiceId}/resend`, { method: 'POST' });
      alert('Invoice resent to client on WhatsApp ✓');
    } catch (e) { setError(e.message); }
    finally { setResending(false); }
  };

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={styles.drawer}>
        <div style={styles.drawerHeader}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {invoice?.invoice_number || 'Invoice'}
          </h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading…</div>
        ) : invoice ? (
          <>
            {/* Meta */}
            <div style={styles.metaGrid}>
              <div><div style={styles.metaLabel}>Invoice Date</div><div style={styles.metaValue}>{invoice.invoice_date}</div></div>
              <div><div style={styles.metaLabel}>Order Ref</div><div style={styles.metaValue}>{invoice.supply_orders?.order_number}</div></div>
              <div><div style={styles.metaLabel}>Client</div><div style={styles.metaValue}>{invoice.supply_clients?.name}</div></div>
              <div><div style={styles.metaLabel}>GSTIN</div><div style={styles.metaValue}>{invoice.supply_clients?.gstin || '—'}</div></div>
            </div>

            {/* Line items */}
            {invoice.supply_orders?.supply_order_items?.length > 0 && (
              <>
                <div style={styles.sectionTitle}>Items Delivered</div>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {['Item', 'HSN', 'Qty', 'Rate', 'Taxable', 'GST%', 'Total'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.supply_orders.supply_order_items.map((li, i) => {
                      const qty      = li.delivered_qty ?? li.ordered_qty;
                      const gstRate  = parseFloat(li.supply_catalog_items?.gst_rate || 0);
                      const taxable  = qty * parseFloat(li.unit_price);
                      const gstAmt   = (taxable * gstRate) / 100;
                      return (
                        <tr key={li.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                          <td style={styles.td}>{li.supply_catalog_items?.name}</td>
                          <td style={styles.td}>{li.supply_catalog_items?.hsn_code || '—'}</td>
                          <td style={styles.td}>{qty} {li.supply_catalog_items?.unit}</td>
                          <td style={styles.td}>₹{parseFloat(li.unit_price).toFixed(2)}</td>
                          <td style={styles.td}>₹{taxable.toFixed(2)}</td>
                          <td style={styles.td}>{gstRate}%</td>
                          <td style={{ ...styles.td, fontWeight: 600 }}>₹{(taxable + gstAmt).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {/* Totals */}
            <div style={styles.totalsBlock}>
              <div style={styles.totalRow}>
                <span>Subtotal (Taxable)</span>
                <span>₹{parseFloat(invoice.taxable_amount).toFixed(2)}</span>
              </div>
              {parseFloat(invoice.cgst_amount) > 0 && (
                <>
                  <div style={styles.totalRow}><span>CGST</span><span>₹{parseFloat(invoice.cgst_amount).toFixed(2)}</span></div>
                  <div style={styles.totalRow}><span>SGST</span><span>₹{parseFloat(invoice.sgst_amount).toFixed(2)}</span></div>
                </>
              )}
              {parseFloat(invoice.igst_amount) > 0 && (
                <div style={styles.totalRow}><span>IGST</span><span>₹{parseFloat(invoice.igst_amount).toFixed(2)}</span></div>
              )}
              <div style={{ ...styles.totalRow, fontWeight: 700, fontSize: 16, borderTop: '2px solid #1a56db', paddingTop: 8, marginTop: 4 }}>
                <span>Invoice Total</span>
                <span>₹{parseFloat(invoice.total_amount).toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={styles.drawerActions}>
              <button style={styles.primaryBtn} onClick={downloadPdf}>↓ Download PDF</button>
              <button style={styles.secondaryBtn} disabled={resending} onClick={resend}>
                {resending ? 'Sending…' : '📱 Resend to Client'}
              </button>
            </div>

            {invoice.sent_at && (
              <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 10 }}>
                Last sent {new Date(invoice.sent_at).toLocaleString('en-IN')}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SupplyInvoices() {
  const [invoices, setInvoices]   = useState([]);
  const [clients, setClients]     = useState([]);
  const [page, setPage]           = useState(1);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [selected, setSelected]   = useState(null);

  // Filters
  const [clientId, setClientId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');
  const PER_PAGE = 25;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page, per_page: PER_PAGE });
      if (clientId) params.set('client_id', clientId);
      if (fromDate) params.set('from', fromDate);
      if (toDate)   params.set('to', toDate);
      const data = await apiFetch(`/api/supply/invoices?${params}`);
      setInvoices(data.invoices || []);
      setTotal(data.pagination?.total || 0);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, clientId, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch('/api/supply/clients?per_page=200')
      .then(d => setClients(d.clients || []))
      .catch(() => {});
  }, []);

  const totalPages = Math.ceil(total / PER_PAGE);
  const totalAmount = invoices.reduce((s, i) => s + parseFloat(i.total_amount || 0), 0);

  return (
    <div style={styles.page}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.h1}>Invoices</h1>
          <p style={styles.subtitle}>{total} invoices{clientId ? ' for selected client' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <select style={styles.filterSelect} value={clientId} onChange={e => { setClientId(e.target.value); setPage(1); }}>
          <option value="">All clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" style={styles.filterInput} value={fromDate}
          onChange={e => { setFromDate(e.target.value); setPage(1); }} />
        <span style={{ color: '#9ca3af', fontSize: 13 }}>to</span>
        <input type="date" style={styles.filterInput} value={toDate}
          onChange={e => { setToDate(e.target.value); setPage(1); }} />
        <button style={styles.clearBtn}
          onClick={() => { setClientId(''); setFromDate(''); setToDate(''); setPage(1); }}>
          Clear
        </button>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Summary row */}
      {invoices.length > 0 && (
        <div style={styles.summaryRow}>
          <span style={{ color: '#6b7280', fontSize: 13 }}>
            Showing {invoices.length} invoices
          </span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            Page total: ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>Loading…</div>
      ) : invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          No invoices yet — they're generated automatically on delivery
        </div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              {['Invoice #', 'Date', 'Client', 'Order', 'Total', 'Sent', ''].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => (
              <tr key={inv.id} style={{ ...styles.tr, background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ ...styles.td, fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                  {inv.invoice_number}
                </td>
                <td style={styles.td}>{inv.invoice_date}</td>
                <td style={styles.td}>
                  <Link to={`/supply/clients/${inv.supply_clients?.id}`} style={styles.clientLink}>
                    {inv.supply_clients?.name}
                  </Link>
                </td>
                <td style={{ ...styles.td, color: '#6b7280', fontSize: 12 }}>
                  {inv.supply_orders?.order_number}
                </td>
                <td style={{ ...styles.td, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  ₹{parseFloat(inv.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td style={styles.td}>
                  {inv.sent_at
                    ? <span style={styles.sentBadge}>✓ Sent</span>
                    : <span style={styles.pendingBadge}>Not sent</span>
                  }
                </td>
                <td style={styles.td}>
                  <button style={styles.viewBtn} onClick={() => setSelected(inv.id)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button style={styles.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
          <span style={{ fontSize: 13, color: '#374151' }}>Page {page} of {totalPages}</span>
          <button style={styles.pageBtn} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
        </div>
      )}

      {selected && (
        <InvoiceDrawer invoiceId={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '24px 16px', fontFamily: 'Inter, system-ui, sans-serif' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  h1: { fontSize: 24, fontWeight: 700, color: '#111827', margin: '0 0 4px' },
  subtitle: { fontSize: 14, color: '#6b7280', margin: 0 },

  filterBar: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' },
  filterSelect: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', minWidth: 160 },
  filterInput:  { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff' },
  clearBtn: { padding: '7px 14px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13, color: '#6b7280' },

  summaryRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '8px 0' },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { background: '#f9fafb', padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb', fontSize: 12 },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: '11px 12px', verticalAlign: 'middle', color: '#111827' },
  clientLink: { color: '#1a56db', textDecoration: 'none', fontWeight: 500 },
  sentBadge:    { background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
  pendingBadge: { background: '#f3f4f6', color: '#6b7280',  padding: '2px 8px', borderRadius: 12, fontSize: 11 },
  viewBtn: { padding: '5px 12px', border: '1px solid #1a56db', borderRadius: 6, background: '#fff', color: '#1a56db', cursor: 'pointer', fontSize: 12 },

  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
  pageBtn: { padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 },

  errorBox: { background: '#fee2e2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: 13 },

  // Drawer
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 },
  drawer: { background: '#fff', width: '100%', maxWidth: 560, padding: 24, overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' },
  drawerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280' },

  metaGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 20 },
  metaLabel: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 },
  metaValue: { fontSize: 14, fontWeight: 600, color: '#111827' },

  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px' },

  totalsBlock: { background: '#f8fafc', borderRadius: 8, padding: '14px 16px', marginTop: 16 },
  totalRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14, color: '#374151' },

  drawerActions: { display: 'flex', gap: 10, marginTop: 20 },
  primaryBtn:   { flex: 1, padding: '10px 0', background: '#1a56db', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  secondaryBtn: { flex: 1, padding: '10px 0', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', fontSize: 14 },
};
