// src/pages/BrandDashboard.jsx 
// ============================================================================
// Brand Owner / Brand Manager dashboard.
// Shows aggregate KPIs across all outlets + per-outlet cards.
// Clicking an outlet navigates to /dashboard/brand/outlet/:id
// which renders the full OwnerDashboard scoped to that outlet.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import BrandHeader from '../components/BrandHeader';
import { C } from '../theme/brand';

const CARD = {
  background: C.cardBgBg,
  border: `0.5px solid ${C.border}`,
  borderRadius: 12,
  padding: '16px 20px',
};

function fmtINR(n = 0) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
  if (n >= 1000)   return '₹' + (n / 1000).toFixed(1) + 'k';
  return '₹' + Math.round(n);
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color = C.primary }) {
  return (
    <div style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ fontSize: 11, color: C.textMuted, margin: 0, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 600, color, margin: 0 }}>{value ?? '—'}</p>
      {sub && <p style={{ fontSize: 11, color: C.textMuted, margin: 0 }}>{sub}</p>}
    </div>
  );
}

// ── Outlet card ───────────────────────────────────────────────────────────────
function OutletCard({ outlet, onClick }) {
  const pct = outlet.today_revenue > 0 && outlet._maxRevenue > 0
    ? Math.round((outlet.today_revenue / outlet._maxRevenue) * 100)
    : 0;

  return (
    <div
      onClick={onClick}
      style={{
        ...CARD, cursor: 'pointer', transition: 'box-shadow .15s, transform .15s',
        userSelect: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>{outlet.name}</p>
          {outlet.outlet_code && (
            <span style={{ fontSize: 10, color: C.textMuted, background: C.surfaceBg, padding: '1px 6px', borderRadius: 4 }}>
              {outlet.outlet_code}
            </span>
          )}
        </div>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 20,
          background: outlet.is_active ? 'rgba(29,158,117,.12)' : '#f5f5f3',
          color: outlet.is_active ? C.success : C.textMuted,
        }}>
          {outlet.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Revenue + orders */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 10, color: C.textMuted, margin: '0 0 2px' }}>Today's revenue</p>
          <p style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0 }}>{fmtINR(outlet.today_revenue)}</p>
        </div>
        <div>
          <p style={{ fontSize: 10, color: C.textMuted, margin: '0 0 2px' }}>Orders</p>
          <p style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0 }}>{outlet.today_orders ?? 0}</p>
        </div>
      </div>

      {/* Revenue bar */}
      <div style={{ background: C.surfaceBg, borderRadius: 4, height: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: C.primary, borderRadius: 4, transition: 'width .4s' }} />
      </div>
      {outlet.city && <p style={{ fontSize: 11, color: C.textMuted, margin: '8px 0 0' }}>📍 {outlet.city}</p>}

      <p style={{ fontSize: 11, color: C.primary, margin: '10px 0 0', fontWeight: 500 }}>View outlet →</p>
    </div>
  );
}

// ── Campaign modal ────────────────────────────────────────────────────────────
function CampaignModal({ brandId, outlets, apiClient, onClose }) {
  const [name,    setName]    = useState('');
  const [message, setMessage] = useState('');
  const [segment, setSegment] = useState('all');
  const [targets, setTargets] = useState('all');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);

  async function send() {
    if (!name.trim() || !message.trim()) return;
    setLoading(true);
    try {
      const { data } = await apiClient.post(`/api/brands/${brandId}/campaigns/send`, {
        name, message, segment,
        outlet_ids: targets === 'all' ? 'all' : [targets],
      });
      setResult(data);
    } catch (err) {
      setResult({ error: err.response?.data?.error ?? err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...CARD, width: 480, maxWidth: '92vw', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Cross-Outlet Campaign</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.textMuted }}>×</button>
        </div>

        {result ? (
          <div>
            {result.error
              ? <p style={{ color: C.danger, fontSize: 13 }}>❌ {result.error}</p>
              : <p style={{ color: C.success, fontSize: 13 }}>✅ {result.message}</p>
            }
            <button onClick={onClose} style={{ marginTop: 12, padding: '8px 20px', background: C.primary, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 4 }}>Campaign name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Weekend special offer"
                style={{ width: '100%', padding: '8px 10px', border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 13 }} />
            </div>

            <div>
              <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 4 }}>Segment</label>
              <select value={segment} onChange={e => setSegment(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 13 }}>
                <option value="all">All customers</option>
                <option value="champions">Champions (frequent visitors)</option>
                <option value="at_risk">At-risk (inactive 14+ days)</option>
                <option value="new">New customers</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 4 }}>Target outlets</label>
              <select value={targets} onChange={e => setTargets(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 13 }}>
                <option value="all">All outlets</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 4 }}>Message *</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
                placeholder="Hi! Enjoy 20% off your next visit this weekend…"
                style={{ width: '100%', padding: '8px 10px', border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, resize: 'vertical' }} />
            </div>

            <button onClick={send} disabled={loading || !name.trim() || !message.trim()}
              style={{ padding: '10px', background: loading ? '#aaa' : C.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: loading ? 'default' : 'pointer' }}>
              {loading ? 'Sending…' : '📣 Send Campaign'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Menu push panel ───────────────────────────────────────────────────────────
function MenuPushPanel({ brandId, outlets, apiClient }) {
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [pushing,  setPushing]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [newItem,  setNewItem]  = useState({ name: '', category: '', base_price: '', time_slot: 'all' });
  const [showAdd,  setShowAdd]  = useState(false);

  useEffect(() => {
    if (!brandId) return;
    apiClient.get(`/api/brands/${brandId}/menu-items`).then(r => setItems(r.data.items ?? [])).catch(() => {});
  }, [brandId]);

  async function push() {
    setPushing(true); setResult(null);
    try {
      const { data } = await apiClient.post(`/api/brands/${brandId}/menu/push`, { outlet_ids: 'all' });
      setResult(data);
    } catch (err) {
      setResult({ error: err.response?.data?.error ?? err.message });
    } finally {
      setPushing(false);
    }
  }

  async function addItem() {
    if (!newItem.name || !newItem.base_price) return;
    setLoading(true);
    try {
      await apiClient.post(`/api/brands/${brandId}/menu-items`, newItem);
      const r = await apiClient.get(`/api/brands/${brandId}/menu-items`);
      setItems(r.data.items ?? []);
      setNewItem({ name: '', category: '', base_price: '', time_slot: 'all' });
      setShowAdd(false);
    } catch (_) {}
    setLoading(false);
  }

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Master Menu</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>{items.length} items · push to all outlets</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowAdd(!showAdd)}
            style={{ padding: '6px 14px', background: C.surfaceBg, border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
            + Add item
          </button>
          <button onClick={push} disabled={pushing}
            style={{ padding: '6px 14px', background: pushing ? '#aaa' : C.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: pushing ? 'default' : 'pointer' }}>
            {pushing ? 'Pushing…' : '⬆ Push to all outlets'}
          </button>
        </div>
      </div>

      {result && (
        <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 12,
          background: result.error ? 'rgba(163,45,45,.08)' : 'rgba(29,158,117,.08)',
          color: result.error ? C.danger : C.success }}>
          {result.error ? `❌ ${result.error}` : `✅ Pushed to ${result.pushed_to_outlets} outlet(s) — ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped (local overrides)`}
        </div>
      )}

      {showAdd && (
        <div style={{ background: C.surfaceBg, padding: 14, borderRadius: 10, marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 160px' }}>
            <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Item name *</label>
            <input value={newItem.name} onChange={e => setNewItem(p => ({...p, name: e.target.value}))}
              style={{ width: '100%', padding: '7px 10px', border: `0.5px solid ${C.border}`, borderRadius: 7, fontSize: 13 }} />
          </div>
          <div style={{ flex: '1 1 100px' }}>
            <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Category</label>
            <input value={newItem.category} onChange={e => setNewItem(p => ({...p, category: e.target.value}))}
              style={{ width: '100%', padding: '7px 10px', border: `0.5px solid ${C.border}`, borderRadius: 7, fontSize: 13 }} />
          </div>
          <div style={{ flex: '1 1 80px' }}>
            <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Base price ₹ *</label>
            <input value={newItem.base_price} onChange={e => setNewItem(p => ({...p, base_price: e.target.value}))} type="number"
              style={{ width: '100%', padding: '7px 10px', border: `0.5px solid ${C.border}`, borderRadius: 7, fontSize: 13 }} />
          </div>
          <div style={{ flex: '1 1 100px' }}>
            <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>Slot</label>
            <select value={newItem.time_slot} onChange={e => setNewItem(p => ({...p, time_slot: e.target.value}))}
              style={{ width: '100%', padding: '7px 10px', border: `0.5px solid ${C.border}`, borderRadius: 7, fontSize: 13 }}>
              <option value="all">All day</option>
              <option value="morning_tiffin">Morning</option>
              <option value="lunch">Lunch</option>
              <option value="snacks">Snacks</option>
              <option value="dinner">Dinner</option>
            </select>
          </div>
          <button onClick={addItem} disabled={loading}
            style={{ padding: '7px 16px', background: C.success, color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>
            Add
          </button>
        </div>
      )}

      {items.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `0.5px solid ${C.border}` }}>
              {['Item', 'Category', 'Price', 'Slot'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '6px 0', fontSize: 11, color: C.textMuted, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                <td style={{ padding: '8px 0' }}>{item.name}</td>
                <td style={{ padding: '8px 0', color: C.textMuted }}>{item.category ?? '—'}</td>
                <td style={{ padding: '8px 0' }}>₹{item.base_price}</td>
                <td style={{ padding: '8px 0', color: C.textMuted }}>{item.time_slot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: '20px 0' }}>
          No brand menu items yet. Add items above and push to all outlets.
        </p>
      )}
    </div>
  );
}

// ── Main BrandDashboard ───────────────────────────────────────────────────────
export default function BrandDashboard() {
  const { user, logout, apiClient } = useAuth();
  const navigate = useNavigate();

  const brandId = user?.brand_id ?? user?.brand?.id ?? null;

  const [outlets,  setOutlets]  = useState(user?.outlets ?? []);
  const [summary,  setSummary]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [showCamp, setShowCamp] = useState(false);
  const [activeTab, setActiveTab] = useState('outlets'); // 'outlets' | 'menu'

  const load = useCallback(async () => {
    if (!brandId) return;
    setLoading(true);
    try {
      const [outletRes, dashRes] = await Promise.all([
        apiClient.get(`/api/brands/${brandId}/outlets`),
        apiClient.get(`/api/brands/${brandId}/dashboard`),
      ]);
      setOutlets(outletRes.data.outlets ?? []);
      setSummary(dashRes.data.summary ?? null);
    } catch (err) {
      console.error('[BrandDashboard] load failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [brandId, apiClient]);

  useEffect(() => { load(); }, [load]);

  // Enrich outlets with maxRevenue so bars scale correctly
  const maxRevenue = Math.max(...outlets.map(o => o.today_revenue ?? 0), 1);
  const enriched   = outlets.map(o => ({ ...o, _maxRevenue: maxRevenue }));

  const totalOrders = outlets.reduce((s, o) => s + (o.today_orders ?? 0), 0);

  if (!brandId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.pageBg }}>
        <p style={{ color: C.textMuted }}>No brand assigned to this account.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg }}>
      <BrandHeader
        title={user?.brand?.name ?? 'Brand dashboard'}
        subtitle={user?.role === 'brand_owner' ? 'Brand Owner' : 'Brand Manager'}
        right={
          <>
            <button
              onClick={() => navigate('/settings')}
              style={{
                fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8,
                border: `0.5px solid ${C.primaryBorder}`, background: C.primaryLight,
                color: C.primaryDark, cursor: 'pointer',
              }}
            >
              Settings
            </button>
            <button
              onClick={logout}
              style={{
                fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8,
                border: `0.5px solid ${C.dangerBorder}`, background: C.dangerLight,
                color: C.dangerDark, cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </>
        }
      />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>

        {/* Aggregate KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KPICard label="Today's Revenue"    value={loading ? '…' : fmtINR(summary?.total_revenue ?? 0)} color={C.primary} />
          <KPICard label="Total Orders"       value={loading ? '…' : totalOrders} />
          <KPICard label="Top Outlet"         value={loading ? '…' : (summary?.top_outlet_name ?? '—')} sub={summary?.top_outlet_revenue ? fmtINR(summary.top_outlet_revenue) : undefined} />
          <KPICard label="Top Item"           value={loading ? '…' : (summary?.top_item ?? '—')} />
          <KPICard label="At-Risk Customers"  value={loading ? '…' : (summary?.rfm_at_risk_count ?? 0)} color={summary?.rfm_at_risk_count > 0 ? C.warning : C.success} />
          <KPICard label="Active Outlets"     value={loading ? '…' : outlets.filter(o => o.is_active).length} />
        </div>

        {/* Section tab bar + actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 10, padding: 4, gap: 3 }}>
            {[{ id: 'outlets', label: '🏪 Outlets' }, { id: 'menu', label: '📋 Brand Menu' }].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontWeight: activeTab === t.id ? 500 : 400,
                background: activeTab === t.id ? C.primary : 'transparent',
                color: activeTab === t.id ? '#fff' : C.textMuted,
                border: activeTab === t.id ? `0.5px solid ${C.primaryDark}` : '0.5px solid transparent',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {user?.role === 'brand_owner' && (
              <button onClick={() => navigate('/settings')}
                style={{ padding: '7px 14px', background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
                ➕ Add Outlet
              </button>
            )}
            <button onClick={() => setShowCamp(true)}
              style={{ padding: '7px 14px', background: C.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              📣 Campaign
            </button>
            <button onClick={load}
              style={{ padding: '7px 14px', background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Outlet grid */}
        {activeTab === 'outlets' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: C.textMuted }}>Loading outlets…</div>
          ) : enriched.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {enriched.map(outlet => (
                <OutletCard
                  key={outlet.id}
                  outlet={outlet}
                  onClick={() => navigate(`/dashboard/brand/outlet/${outlet.id}`)}
                />
              ))}
            </div>
          ) : (
            <div style={{ ...CARD, textAlign: 'center', padding: 48 }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>🏪</p>
              <p style={{ color: C.text, fontWeight: 500, marginBottom: 4 }}>No outlets yet</p>
              <p style={{ color: C.textMuted, fontSize: 13 }}>Add your first outlet from Settings → Brand → Outlets.</p>
            </div>
          )
        )}

        {/* Brand menu manager */}
        {activeTab === 'menu' && (
          <MenuPushPanel brandId={brandId} outlets={outlets} apiClient={apiClient} />
        )}

      </div>

      {/* Campaign modal */}
      {showCamp && (
        <CampaignModal
          brandId={brandId}
          outlets={outlets}
          apiClient={apiClient}
          onClose={() => setShowCamp(false)}
        />
      )}
    </div>
  );
}
