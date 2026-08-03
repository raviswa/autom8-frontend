// ============================================================================
// MUNAFE SUPPLY — RATECARD MANAGEMENT (Per-Client Pricing)
// src/pages/supply/SupplyRatecard.jsx
//
// Route: /supply/clients/:id/ratecard
//
// Features:
//  - Show all catalog items with default price vs client override side-by-side
//  - Discount % between Default and Client Price (bidirectional with price)
//  - Inline click-to-edit price / discount per item
//  - Save all changes in one shot (bulk PUT) — persists absolute client price only
//  - Reset single item to default (DELETE override)
//  - Copy ratecard from another client
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { C, CARD, SECTION_LABEL } from '../../styles/theme';
import { resolveSupplyApiBase } from '../../config/api';

const API = resolveSupplyApiBase();

const CATEGORIES = [
  'Vegetables', 'Fruits', 'Dairy', 'Eggs & Poultry',
  'Meat & Seafood', 'Dry Goods', 'Oils & Fats', 'Spices', 'Packaging', 'Other',
];

const GRID_COLS = '1fr 100px 90px 120px 80px';

function supplyToken() { return localStorage.getItem('supply_token') || ''; }

function Spinner({ size = 18 }) {
  return (
    <div style={{
      width: size, height: size, border: `2px solid ${C.primaryLight}`,
      borderTop: `2px solid ${C.primary}`, borderRadius: '50%',
      animation: 'spin 0.7s linear infinite', display: 'inline-block',
    }} />
  );
}

/** discount % from default vs client price; null when not meaningful */
function discountFromPrices(defaultPrice, clientPrice) {
  const d = Number(defaultPrice);
  const c = Number(clientPrice);
  if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(c)) return null;
  const pct = (1 - c / d) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 100) / 100;
}

/** client price from default and discount % */
function priceFromDiscount(defaultPrice, discountPct) {
  const d = Number(defaultPrice);
  const pct = Number(discountPct);
  if (!Number.isFinite(d) || !Number.isFinite(pct)) return null;
  const clamped = Math.min(100, Math.max(0, pct));
  return Math.round(d * (1 - clamped / 100) * 100) / 100;
}

function formatDiscount(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return '';
  const n = Number(pct);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '') || '0';
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SupplyRatecard({ onLogout }) {
  const { id: clientId } = useParams();
  const navigate = useNavigate();

  const [client,       setClient]       = useState(null);
  const [ratecard,     setRatecard]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [toast,        setToast]        = useState(null);

  // Pending local edits: { [item_id]: string (price) | null (reset) }
  const [edits,          setEdits]          = useState({});
  // Draft discount strings while typing: { [item_id]: string }
  const [discountDrafts, setDiscountDrafts] = useState({});
  // { id, field: 'price' | 'discount' } | null
  const [activeEdit,     setActiveEdit]     = useState(null);

  const [copyOpen,     setCopyOpen]     = useState(false);
  const [clients,      setClients]      = useState([]);
  const [copyFrom,     setCopyFrom]     = useState('');
  const [copying,      setCopying]      = useState(false);

  const fetchRatecard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/supply/ratecards/${clientId}`, {
        headers: { Authorization: `Bearer ${supplyToken()}` },
      });
      if (res.status === 401) { onLogout?.(); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load ratecard');
      setClient(json.client);
      setRatecard(json.ratecard || []);
      setEdits({});
      setDiscountDrafts({});
      setActiveEdit(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [clientId, onLogout]);

  useEffect(() => { fetchRatecard(); }, [fetchRatecard]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }

  function clearDiscountDraft(itemId) {
    setDiscountDrafts(prev => {
      if (!(itemId in prev)) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  function startPriceEdit(itemId, currentEffective) {
    setActiveEdit({ id: itemId, field: 'price' });
    clearDiscountDraft(itemId);
    if (!(itemId in edits)) {
      setEdits(prev => ({ ...prev, [itemId]: String(currentEffective) }));
    }
  }

  function startDiscountEdit(itemId, defaultPrice, displayPrice, isOverridden) {
    if (!(Number(defaultPrice) > 0)) return;
    setActiveEdit({ id: itemId, field: 'discount' });
    if (!(itemId in discountDrafts)) {
      const derived = isOverridden
        ? discountFromPrices(defaultPrice, displayPrice)
        : null;
      setDiscountDrafts(prev => ({
        ...prev,
        [itemId]: derived === null ? '' : formatDiscount(derived),
      }));
    }
    if (!(itemId in edits)) {
      setEdits(prev => ({
        ...prev,
        [itemId]: isOverridden ? String(displayPrice) : String(defaultPrice),
      }));
    }
  }

  function onPriceChange(itemId, raw) {
    setEdits(prev => ({ ...prev, [itemId]: raw }));
    clearDiscountDraft(itemId);
  }

  function onDiscountChange(itemId, defaultPrice, raw) {
    setDiscountDrafts(prev => ({ ...prev, [itemId]: raw }));
    if (raw === '' || raw === '-') {
      // Keep edits marked but don't force a price until blur
      if (!(itemId in edits)) {
        setEdits(prev => ({ ...prev, [itemId]: String(defaultPrice) }));
      }
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const price = priceFromDiscount(defaultPrice, n);
    if (price === null) return;
    setEdits(prev => ({ ...prev, [itemId]: String(price) }));
  }

  function commitPriceEdit(itemId) {
    setActiveEdit(null);
    const val = edits[itemId];
    const item = ratecard.find(r => r.id === itemId);
    if (item && (val === null || Number(val) === Number(item.default_price))) {
      setEdits(prev => ({ ...prev, [itemId]: null }));
    }
    clearDiscountDraft(itemId);
  }

  function commitDiscountEdit(itemId) {
    setActiveEdit(null);
    const item = ratecard.find(r => r.id === itemId);
    if (!item) return;
    const raw = discountDrafts[itemId];
    if (raw === undefined || raw === '' || raw === '-') {
      // Empty discount → reset to default
      setEdits(prev => ({ ...prev, [itemId]: null }));
      clearDiscountDraft(itemId);
      return;
    }
    let n = Number(raw);
    if (!Number.isFinite(n)) {
      showToast('Invalid discount %', 'error');
      clearDiscountDraft(itemId);
      return;
    }
    if (n < 0 || n > 100) {
      n = Math.min(100, Math.max(0, n));
      showToast('Discount clamped to 0–100%', 'error');
    }
    const price = priceFromDiscount(item.default_price, n);
    if (price === null) {
      clearDiscountDraft(itemId);
      return;
    }
    if (Number(price) === Number(item.default_price)) {
      setEdits(prev => ({ ...prev, [itemId]: null }));
    } else {
      setEdits(prev => ({ ...prev, [itemId]: String(price) }));
    }
    clearDiscountDraft(itemId);
  }

  function resetItem(itemId) {
    setEdits(prev => ({ ...prev, [itemId]: null }));
    clearDiscountDraft(itemId);
    setActiveEdit(null);
  }

  function discardEdits() {
    setEdits({});
    setDiscountDrafts({});
    setActiveEdit(null);
  }

  function hasChanges() {
    return Object.keys(edits).length > 0;
  }

  async function handleSaveAll() {
    const items = Object.entries(edits).map(([item_id, price]) => ({
      item_id,
      price: price === null ? null : Number(price),
    }));

    if (!items.length) return;

    const invalid = items.filter(i => i.price !== null && (isNaN(i.price) || i.price < 0));
    if (invalid.length) {
      showToast('Some prices are invalid', 'error'); return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/supply/ratecards/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supplyToken()}` },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      showToast(`Saved — ${json.upserted} override(s), ${json.removed} reset(s)`);
      fetchRatecard();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function openCopyModal() {
    try {
      const res = await fetch(`${API}/api/supply/clients`, {
        headers: { Authorization: `Bearer ${supplyToken()}` },
      });
      const json = await res.json();
      setClients((json.clients || []).filter(c => c.id !== clientId));
    } catch (_) {}
    setCopyOpen(true);
  }

  async function handleCopy() {
    if (!copyFrom) { showToast('Select a client to copy from', 'error'); return; }
    setCopying(true);
    try {
      const res = await fetch(`${API}/api/supply/ratecards/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supplyToken()}` },
        body: JSON.stringify({ from_client_id: copyFrom, to_client_id: clientId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(`Copied ${json.copied} override(s) from ${json.from_client}`);
      setCopyOpen(false);
      setCopyFrom('');
      fetchRatecard();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCopying(false);
    }
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const catItems = ratecard.filter(i => i.category === cat);
    if (catItems.length) acc[cat] = catItems;
    return acc;
  }, {});

  const pendingCount = Object.keys(edits).length;
  const overrideCount = ratecard.filter(i => i.has_override).length;

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, paddingBottom: 80 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{
        background: C.cardBg, borderBottom: `1px solid ${C.border}`,
        padding: '16px 24px', display: 'flex', alignItems: 'center',
        gap: 16, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button
          onClick={() => navigate(`/supply/clients/${clientId}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.textSub }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
            Ratecard — {client?.name || '…'}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            {overrideCount} override{overrideCount !== 1 ? 's' : ''} · edit discount % or client price
          </div>
        </div>
        <button
          onClick={openCopyModal}
          style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: C.surfaceBg, border: `1px solid ${C.border}`, color: C.textSub,
          }}
        >
          Copy from client
        </button>
        {hasChanges() && (
          <button
            onClick={handleSaveAll}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: C.primary, border: 'none', color: '#fff',
              opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {saving && <Spinner size={14} />}
            Save {pendingCount} change{pendingCount !== 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div style={{
        background: C.primaryLight, borderBottom: `1px solid ${C.primaryBorder}`,
        padding: '8px 24px', display: 'flex', gap: 24, flexWrap: 'wrap',
      }}>
        <LegendItem color={C.textMuted} label="Default price" />
        <LegendItem color={C.primary} label="Client override (highlighted)" />
        <LegendItem color={C.warning} label="Unsaved change" />
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 24px' }}>
        {error && (
          <div style={{
            padding: '12px 16px', background: C.dangerLight,
            border: `1px solid ${C.dangerBorder}`, borderRadius: 8,
            color: C.dangerDark, fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spinner size={32} /></div>
        ) : ratecard.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No catalog items yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Add items to the catalog first</div>
          </div>
        ) : (
          Object.entries(grouped).map(([category, catItems]) => (
            <div key={category} style={{ marginBottom: 28 }}>
              <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>
                {category} · {catItems.length}
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: GRID_COLS,
                padding: '6px 16px', gap: 8,
              }}>
                {['Item', 'Default', 'Discount %', 'Client Price', ''].map(h => (
                  <div key={h || 'actions'} style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                ))}
              </div>
              <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
                {catItems.map((item, idx) => {
                  const hasPendingEdit  = item.id in edits;
                  const pendingVal      = edits[item.id];
                  const isEditingPrice  = activeEdit?.id === item.id && activeEdit?.field === 'price';
                  const isEditingDisc   = activeEdit?.id === item.id && activeEdit?.field === 'discount';
                  const displayPrice    = hasPendingEdit
                    ? (pendingVal === null ? item.default_price : pendingVal)
                    : item.effective_price;
                  const isOverridden    = hasPendingEdit
                    ? (pendingVal !== null && Number(pendingVal) !== Number(item.default_price))
                    : item.has_override;
                  const isChanged       = hasPendingEdit;
                  const canDiscount     = Number(item.default_price) > 0;
                  const derivedDisc     = isOverridden
                    ? discountFromPrices(item.default_price, displayPrice)
                    : null;
                  const discountDisplay = isEditingDisc && (item.id in discountDrafts)
                    ? discountDrafts[item.id]
                    : (derivedDisc === null ? '' : formatDiscount(derivedDisc));

                  return (
                    <div key={item.id} style={{
                      display: 'grid', gridTemplateColumns: GRID_COLS,
                      alignItems: 'center', gap: 8,
                      padding: '11px 16px',
                      borderBottom: idx === catItems.length - 1 ? 'none' : `1px solid ${C.border}`,
                      background: isChanged ? C.warningLight : C.cardBg,
                      transition: 'background 0.15s',
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                          {item.unit}
                          {!item.is_available && (
                            <span style={{ marginLeft: 6, color: C.danger, fontWeight: 700 }}>· Unavailable today</span>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: 13, color: C.textSub }}>
                        ₹{Number(item.default_price).toFixed(2)}
                      </div>

                      {/* Discount % */}
                      <div
                        onClick={() => canDiscount && startDiscountEdit(
                          item.id,
                          item.default_price,
                          displayPrice,
                          isOverridden,
                        )}
                        title={canDiscount ? 'Click to edit discount %' : 'Default price is 0 — discount unavailable'}
                        style={{
                          cursor: canDiscount ? 'pointer' : 'not-allowed',
                          borderRadius: 6,
                          border: isEditingDisc
                            ? `2px solid ${C.primary}`
                            : isOverridden
                              ? `1.5px solid ${C.primaryBorder}`
                              : `1px dashed ${C.borderStrong}`,
                          background: isEditingDisc
                            ? C.cardBg
                            : isOverridden ? C.primaryLight : 'transparent',
                          padding: '3px 8px',
                          minHeight: 32,
                          display: 'flex', alignItems: 'center',
                          opacity: canDiscount ? 1 : 0.45,
                        }}
                      >
                        {isEditingDisc ? (
                          <input
                            autoFocus
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={discountDisplay}
                            onChange={e => onDiscountChange(item.id, item.default_price, e.target.value)}
                            onBlur={() => commitDiscountEdit(item.id)}
                            onKeyDown={e => { if (e.key === 'Enter') commitDiscountEdit(item.id); }}
                            onClick={e => e.stopPropagation()}
                            style={{
                              width: '100%', border: 'none', outline: 'none',
                              background: 'transparent', fontSize: 13,
                              fontWeight: 700, color: C.text,
                            }}
                          />
                        ) : (
                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: isOverridden ? C.primaryDark : C.textFaint,
                          }}>
                            {isOverridden && derivedDisc !== null
                              ? `${formatDiscount(derivedDisc)}%`
                              : '+ %'
                            }
                          </span>
                        )}
                      </div>

                      {/* Client price */}
                      <div
                        onClick={() => startPriceEdit(item.id, item.effective_price)}
                        title="Click to edit client price"
                        style={{
                          cursor: 'pointer',
                          borderRadius: 6,
                          border: isEditingPrice
                            ? `2px solid ${C.primary}`
                            : isOverridden
                              ? `1.5px solid ${C.primaryBorder}`
                              : `1px dashed ${C.borderStrong}`,
                          background: isEditingPrice
                            ? C.cardBg
                            : isOverridden ? C.primaryLight : 'transparent',
                          padding: '3px 8px',
                          minHeight: 32,
                          display: 'flex', alignItems: 'center',
                        }}
                      >
                        {isEditingPrice ? (
                          <input
                            autoFocus
                            type="number" min="0" step="0.01"
                            value={edits[item.id] ?? item.effective_price}
                            onChange={e => onPriceChange(item.id, e.target.value)}
                            onBlur={() => commitPriceEdit(item.id)}
                            onKeyDown={e => { if (e.key === 'Enter') commitPriceEdit(item.id); }}
                            onClick={e => e.stopPropagation()}
                            style={{
                              width: '100%', border: 'none', outline: 'none',
                              background: 'transparent', fontSize: 13,
                              fontWeight: 700, color: C.text,
                            }}
                          />
                        ) : (
                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: isOverridden ? C.primaryDark : C.textFaint,
                          }}>
                            {isOverridden || (hasPendingEdit && pendingVal !== null)
                              ? `₹${Number(displayPrice).toFixed(2)}`
                              : '+ set price'
                            }
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {(item.has_override || (hasPendingEdit && pendingVal !== null)) && (
                          <button
                            onClick={() => resetItem(item.id)}
                            title="Reset to default price"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 12, color: C.textMuted, padding: '4px 6px',
                              borderRadius: 6,
                            }}
                          >
                            ↺ reset
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {hasChanges() && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: C.cardBg, borderTop: `1px solid ${C.border}`,
          padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, color: C.textSub }}>
            {pendingCount} unsaved change{pendingCount !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={discardEdits}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: C.surfaceBg, border: `1px solid ${C.border}`, color: C.textSub }}
            >
              Discard
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', background: C.primary, border: 'none', color: '#fff',
                opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {saving && <Spinner size={14} />}
              Save changes
            </button>
          </div>
        </div>
      )}

      {copyOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: C.cardBg, borderRadius: 12, padding: 28,
            width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              Copy Ratecard
            </div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>
              Copy all price overrides from another client as a starting point. Existing overrides for <strong>{client?.name}</strong> will be replaced.
            </div>
            <select
              value={copyFrom}
              onChange={e => setCopyFrom(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
                border: `1px solid ${C.border}`, marginBottom: 16, color: C.text,
                background: C.cardBg, boxSizing: 'border-box',
              }}
            >
              <option value="">Select source client…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCopy}
                disabled={copying || !copyFrom}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13,
                  fontWeight: 700, cursor: 'pointer',
                  background: copyFrom ? C.primary : C.borderStrong, border: 'none', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {copying && <Spinner size={14} />}
                Copy Ratecard
              </button>
              <button
                onClick={() => { setCopyOpen(false); setCopyFrom(''); }}
                style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: C.surfaceBg, border: `1px solid ${C.border}`, color: C.textSub }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24, zIndex: 9999,
          padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: toast.type === 'error' ? C.danger : C.success,
          color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 11, color: C.textSub }}>{label}</span>
    </div>
  );
}
