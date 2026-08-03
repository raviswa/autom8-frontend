import { resolveSupplyApiBase } from '../../config/api';
// src/pages/supply/OrderForm.jsx
// ============================================================================
// MODULE 5 — Client-facing Order Form (public, no login required)
//
// Route: /s/:token  or  /s/b/:token  (permanent bookmark)
// Auth:  HMAC-signed token in URL, validated server-side
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { C, FONTS } from '../../theme/brand';

const API = resolveSupplyApiBase();

const STATE = {
  LOADING:    'loading',
  CLOSED:     'closed',
  EXPIRED:    'expired',
  ERROR:      'error',
  READY:      'ready',
  SUBMITTING: 'submitting',
  SUCCESS:    'success',
};

const pageShell = {
  minHeight: '100vh',
  fontFamily: FONTS.body,
  background: C.pageBg,
  color: C.text,
};

const cardShell = {
  background: C.cardBg,
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(15, 91, 76, 0.08)',
  border: `1px solid ${C.border}`,
  padding: 28,
  maxWidth: 384,
  width: '100%',
  textAlign: 'center',
};

function BrandMark({ size = 36 }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 10,
      background: C.gold,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontFamily: FONTS.heading,
      fontWeight: 600,
      fontSize: size * 0.4,
      color: C.emeraldDark,
    }}>
      M
    </div>
  );
}

export default function OrderForm() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();

  const [state, setState] = useState(STATE.LOADING);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState(null);
  const [quantities, setQty] = useState({});
  const [moqErrors, setMoqErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [orderResult, setOrderResult] = useState(null);
  const inputRefs = useRef({});

  useEffect(() => {
    if (!token) { setState(STATE.ERROR); setErrorMsg('No order token found in URL.'); return; }

    let safeToken = token;
    try {
      safeToken = decodeURIComponent(token);
    } catch {
      safeToken = token;
    }

    const prefill = searchParams.get('prefill') || '';

    fetch(`${API}/api/supply/form/${encodeURIComponent(safeToken)}${prefill ? `?prefill=${prefill}` : ''}`)
      .then(async r => {
        const data = await r.json();
        if (r.status === 410) { setState(STATE.EXPIRED); setErrorMsg(data.message || data.error); return; }
        if (r.status === 423) { setState(STATE.CLOSED); setErrorMsg(data.message || data.error); setFormData({ closed: data }); return; }
        if (!r.ok) { setState(STATE.ERROR); setErrorMsg(data.error || 'Failed to load order form.'); return; }

        setFormData(data);

        if (data.last_order_qtys) {
          const prefillQty = {};
          Object.entries(data.last_order_qtys).forEach(([id, q]) => {
            prefillQty[id] = String(q);
          });
          setQty(prefillQty);
        }

        if (data.renewed_token) {
          window.history.replaceState(null, '', `/s/b/${data.renewed_token}`);
        }

        setState(STATE.READY);
      })
      .catch(err => { setState(STATE.ERROR); setErrorMsg(err.message); });
  }, [token, searchParams]);

  const runningTotal = useCallback(() => {
    if (!formData?.categories) return 0;
    let total = 0;
    Object.values(formData.categories).flat().forEach(item => {
      const q = parseFloat(quantities[item.id] || 0);
      if (q > 0) {
        const lineBase = q * item.price;
        const lineGst = lineBase * (item.gst_rate / 100);
        total += lineBase + lineGst;
      }
    });
    return total;
  }, [quantities, formData]);

  const totalAmount = runningTotal();

  const creditAvailable = formData?.client?.credit_available;
  const creditAutoBlock = formData?.client?.credit_auto_block;
  const wouldExceedCredit = creditAvailable !== null && creditAvailable !== undefined
    && totalAmount > creditAvailable;
  const creditPct = creditAvailable != null && formData?.client?.credit_limit > 0
    ? Math.round(((formData.client.credit_limit - creditAvailable) / formData.client.credit_limit) * 100)
    : 0;

  const handleQtyChange = (itemId, value, unitType = 'weight') => {
    if (unitType === 'count') {
      if (value !== '' && !/^\d*$/.test(value)) return;
    } else if (value !== '' && !/^\d*\.?\d*$/.test(value)) {
      return;
    }
    setQty(prev => ({ ...prev, [itemId]: value }));
    setMoqErrors(prev => ({ ...prev, [itemId]: '' }));
  };

  const handleSubmit = async () => {
    setSubmitError('');
    const newMoqErrors = {};
    let valid = true;

    if (!formData?.categories) return;

    const allItems = Object.values(formData.categories).flat();
    const orderItems = [];

    allItems.forEach(item => {
      const raw = quantities[item.id] || 0;
      const qty = item.unit_type === 'count' ? parseInt(raw, 10) : parseFloat(raw);
      if (qty > 0) {
        if (item.unit_type === 'count' && !Number.isInteger(qty)) {
          newMoqErrors[item.id] = 'Whole numbers only';
          valid = false;
        } else if (item.min_order_qty > 0 && qty < item.min_order_qty) {
          newMoqErrors[item.id] = `Min: ${item.min_order_qty} ${item.unit}`;
          valid = false;
        } else {
          orderItems.push({ item_id: item.id, qty });
        }
      }
    });

    setMoqErrors(newMoqErrors);

    if (!valid) {
      setSubmitError('Please fix the highlighted items before placing your order.');
      return;
    }

    if (orderItems.length === 0) {
      setSubmitError('Please enter a quantity for at least one item.');
      return;
    }

    if (creditAutoBlock && wouldExceedCredit) {
      setSubmitError(
        `Order blocked: this order (₹${totalAmount.toFixed(2)}) exceeds your available credit (₹${creditAvailable?.toFixed(2)}). ` +
        `Please contact your supplier to clear your balance first.`,
      );
      return;
    }

    setState(STATE.SUBMITTING);

    try {
      const res = await fetch(`${API}/api/supply/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          form_token: token,
          items: orderItems,
          delivery_date: formData.delivery_date,
        }),
      });

      const data = await res.json();

      if (res.status === 422 && data.code === 'ITEMS_UNAVAILABLE') {
        setState(STATE.READY);
        setSubmitError('Some items are no longer available today. They have been removed — please review and resubmit.');
        const unavailable = new Set(data.unavailable_ids || []);
        setQty(prev => {
          const updated = { ...prev };
          unavailable.forEach(id => delete updated[id]);
          return updated;
        });
        return;
      }

      if (res.status === 402 && data.code === 'CREDIT_LIMIT_EXCEEDED') {
        setState(STATE.READY);
        setSubmitError(data.error);
        return;
      }

      if (!res.ok) {
        setState(STATE.READY);
        setSubmitError(data.error || 'Order submission failed. Please try again.');
        return;
      }

      setOrderResult(data);
      setState(STATE.SUCCESS);
    } catch (err) {
      setState(STATE.READY);
      setSubmitError(`Network error: ${err.message}`);
    }
  };

  const formatCurrency = n => `₹${Number(n).toFixed(2)}`;

  const CreditBadge = () => {
    if (creditAvailable === null || creditAvailable === undefined) return null;
    const pct = creditPct;
    let bg = C.successLight;
    let fg = C.successDark;
    let border = C.successBorder;
    if (pct >= 90) {
      bg = C.dangerLight; fg = C.dangerDark; border = C.dangerBorder;
    } else if (pct >= 70) {
      bg = C.warningLight; fg = C.warningDark; border = C.warningBorder;
    }
    return (
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '4px 10px',
        borderRadius: 999,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        whiteSpace: 'nowrap',
      }}>
        {formatCurrency(creditAvailable)} available
      </span>
    );
  };

  const StatusScreen = ({ title, body, icon }) => (
    <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={cardShell}>
        {icon}
        <h2 style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: 600, color: C.text, margin: '12px 0 8px' }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, color: C.textSub, margin: 0, lineHeight: 1.5 }}>{body}</p>
      </div>
    </div>
  );

  if (state === STATE.LOADING) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%', margin: '0 auto 12px',
            border: `3px solid ${C.emeraldBorder}`,
            borderTopColor: C.emerald,
            animation: 'of-spin .7s linear infinite',
          }} />
          <style>{`@keyframes of-spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>Loading your order form…</p>
        </div>
      </div>
    );
  }

  if (state === STATE.EXPIRED) {
    return (
      <StatusScreen
        title="Order link expired"
        body={errorMsg || 'Your daily order link has expired. Ask your supplier for a new one.'}
        icon={<BrandMark size={48} />}
      />
    );
  }

  if (state === STATE.CLOSED) {
    const d = formData?.closed;
    return (
      <StatusScreen
        title="Ordering is closed"
        body={`Orders can be placed between ${d?.ordering_open_time || '—'} and ${d?.ordering_cutoff_time || '—'} IST.`}
        icon={<BrandMark size={48} />}
      />
    );
  }

  if (state === STATE.ERROR) {
    return (
      <StatusScreen
        title="Something went wrong"
        body={errorMsg}
        icon={<BrandMark size={48} />}
      />
    );
  }

  if (state === STATE.SUCCESS && orderResult) {
    return (
      <div style={{ ...pageShell, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ ...cardShell, textAlign: 'left' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <BrandMark size={48} />
            <h2 style={{ fontFamily: FONTS.heading, fontSize: 20, fontWeight: 600, color: C.text, margin: '12px 0 6px' }}>
              Order submitted
            </h2>
            <p style={{ fontSize: 14, color: C.textSub, margin: 0, lineHeight: 1.5 }}>
              Pending supplier confirmation. You'll receive a WhatsApp update once it's accepted.
            </p>
          </div>

          <div style={{
            background: C.emeraldLight,
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            fontSize: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: C.textSub }}>Order no.</span>
              <span style={{ fontWeight: 600, color: C.text }}>{orderResult.order?.order_number}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ color: C.textSub }}>Delivery</span>
              <span style={{ fontWeight: 600, color: C.text }}>{orderResult.order?.delivery_date}</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              borderTop: `1px solid ${C.emeraldBorder}`, paddingTop: 8, marginTop: 4,
              fontSize: 16, fontWeight: 700, color: C.emeraldDark,
            }}>
              <span>Total</span>
              <span>{formatCurrency(orderResult.order_total)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orderResult.items?.map(item => (
              <div key={item.item_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: C.textSub }}>{item.item_name} × {item.qty_ordered} {item.unit}</span>
                <span style={{ color: C.text, fontWeight: 500 }}>{formatCurrency(item.line_total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { supplier, client, categories, delivery_date } = formData || {};
  const categoryNames = Object.keys(categories || {});
  const allItems = Object.values(categories || {}).flat();
  const orderedItemCount = allItems.filter(i => parseFloat(quantities[i.id] || 0) > 0).length;
  const submitDisabled = state === STATE.SUBMITTING || orderedItemCount === 0;

  return (
    <div style={{ ...pageShell, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: `linear-gradient(160deg, ${C.emeraldDark} 0%, ${C.emerald} 100%)`,
        boxShadow: '0 4px 16px rgba(10, 64, 56, 0.25)',
      }}>
        <div style={{
          maxWidth: 512,
          margin: '0 auto',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          {supplier?.logo_url ? (
            <img
              src={supplier.logo_url}
              alt=""
              style={{
                height: 36, width: 36, borderRadius: 10, objectFit: 'cover',
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            />
          ) : (
            <BrandMark size={36} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              margin: 0, fontFamily: FONTS.heading, fontWeight: 600, fontSize: 15,
              color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {supplier?.business_name}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#BFE0D6' }}>
              {client?.name} · Delivery {delivery_date}
            </p>
          </div>
          <CreditBadge />
        </div>
      </header>

      {wouldExceedCredit && !creditAutoBlock && (
        <div style={{
          background: C.warningLight,
          borderBottom: `1px solid ${C.warningBorder}`,
          padding: '10px 16px',
          maxWidth: 512,
          margin: '0 auto',
          width: '100%',
          boxSizing: 'border-box',
          fontSize: 13,
          color: C.warningDark,
        }}>
          This order will exceed your credit limit. Your supplier will be notified.
        </div>
      )}

      {/* Catalog */}
      <main style={{ flex: 1, maxWidth: 512, margin: '0 auto', width: '100%' }}>
        {categoryNames.map(category => {
          const items = categories[category];
          return (
            <div key={category}>
              <div style={{
                padding: '8px 16px',
                background: C.emeraldLight,
                borderTop: `1px solid ${C.emeraldBorder}`,
                borderBottom: `1px solid ${C.emeraldBorder}`,
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.emerald,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>
                  {category}
                </h3>
              </div>
              {items.map(item => {
                const qty = quantities[item.id] || '';
                const moqErr = moqErrors[item.id];
                const hasQty = parseFloat(qty) > 0;
                return (
                  <div
                    key={item.id}
                    style={{
                      background: moqErr ? C.dangerLight : C.cardBg,
                      borderBottom: `1px solid ${C.border}`,
                      padding: '12px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0,
                          fontSize: 14,
                          fontWeight: 600,
                          color: hasQty ? C.emeraldDark : C.text,
                        }}>
                          {item.name}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: C.textMuted }}>
                          {formatCurrency(item.price)}/{item.unit}
                          {item.gst_rate > 0 && ` + ${item.gst_rate}% GST`}
                        </p>
                        {item.min_order_qty > 0 && (
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>
                            Min: {item.min_order_qty} {item.unit}
                          </p>
                        )}
                        {moqErr && (
                          <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: C.dangerDark }}>
                            {moqErr}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {hasQty && (
                          <button
                            type="button"
                            onClick={() => handleQtyChange(item.id, '', item.unit_type)}
                            aria-label="Clear"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: C.textMuted, fontSize: 18, lineHeight: 1, padding: 4,
                            }}
                          >
                            ×
                          </button>
                        )}
                        <input
                          ref={el => { inputRefs.current[item.id] = el; }}
                          type="number"
                          inputMode={item.unit_type === 'count' ? 'numeric' : 'decimal'}
                          value={qty}
                          onChange={e => handleQtyChange(item.id, e.target.value, item.unit_type)}
                          placeholder="0"
                          min="0"
                          step={item.unit_type === 'count' ? '1' : '0.5'}
                          style={{
                            width: 80,
                            textAlign: 'right',
                            padding: '8px 10px',
                            fontSize: 14,
                            fontFamily: FONTS.body,
                            borderRadius: 10,
                            border: `1px solid ${moqErr ? C.dangerBorder : hasQty ? C.emeraldBorder : C.border}`,
                            background: moqErr ? C.dangerLight : hasQty ? C.emeraldLight : C.cardBg,
                            color: C.text,
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                          onFocus={e => { e.target.style.borderColor = C.emerald; e.target.style.boxShadow = `0 0 0 2px ${C.emeraldLight}`; }}
                          onBlur={e => {
                            e.target.style.borderColor = moqErr ? C.dangerBorder : hasQty ? C.emeraldBorder : C.border;
                            e.target.style.boxShadow = 'none';
                          }}
                        />
                        <span style={{
                          fontSize: 11, color: C.textMuted, width: 28,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {item.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {categoryNames.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: C.textMuted }}>
            <p style={{ fontSize: 14, margin: 0 }}>No items available today.</p>
          </div>
        )}
      </main>

      {/* In-flow sticky footer — no fixed + pb-40 gap */}
      <footer style={{
        position: 'sticky',
        bottom: 0,
        background: C.cardBg,
        borderTop: `1px solid ${C.border}`,
        boxShadow: '0 -8px 24px rgba(15, 91, 76, 0.06)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ maxWidth: 512, margin: '0 auto', padding: '12px 16px' }}>
          {submitError && (
            <p style={{ margin: '0 0 8px', fontSize: 12, color: C.dangerDark, fontWeight: 500 }}>
              {submitError}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 12, color: C.textMuted }}>
                {orderedItemCount} item{orderedItemCount !== 1 ? 's' : ''}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: C.text }}>
                {formatCurrency(totalAmount)}
                {Object.values(categories || {}).flat().some(i => i.gst_rate > 0) && (
                  <span style={{ fontSize: 11, fontWeight: 400, color: C.textMuted, marginLeft: 6 }}>
                    incl. GST
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitDisabled}
              style={{
                border: 'none',
                borderRadius: 12,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: FONTS.body,
                color: '#fff',
                background: submitDisabled ? C.textMuted : C.emerald,
                cursor: submitDisabled ? 'default' : 'pointer',
                opacity: submitDisabled && state !== STATE.SUBMITTING ? 0.7 : 1,
              }}
            >
              {state === STATE.SUBMITTING ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
