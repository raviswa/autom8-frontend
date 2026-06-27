// src/pages/supply/OrderForm.jsx
// ============================================================================
// MODULE 5 — Client-facing Order Form (public, no login required)
//
// Route: /s/:token  or  /s/b/:token  (permanent bookmark)
// Auth:  HMAC-signed token in URL, validated server-side
//
// Responsibilities:
//   - Load form (supplier header + catalog + client credit status)
//   - Group items by category, qty inputs with MOQ hints
//   - Live running total
//   - Credit check + MOQ validation before submit
//   - Confirmation screen on success
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

// ── Form states ───────────────────────────────────────────────────────────────
const STATE = {
  LOADING:   'loading',
  CLOSED:    'closed',    // ordering window not open
  EXPIRED:   'expired',   // token expired
  ERROR:     'error',
  READY:     'ready',
  SUBMITTING:'submitting',
  SUCCESS:   'success',
};

export default function OrderForm() {
  const { token }              = useParams();  // /s/:token or /s/b/:token
  const [searchParams]         = useSearchParams();
  const isPermanent            = window.location.pathname.includes('/s/b/');

  const [state, setState]      = useState(STATE.LOADING);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState(null);   // { supplier, client, categories, delivery_date }
  const [quantities, setQty]   = useState({});       // item_id → qty string
  const [moqErrors, setMoqErrors] = useState({});    // item_id → error string
  const [submitError, setSubmitError] = useState('');
  const [orderResult, setOrderResult] = useState(null);
  const inputRefs = useRef({});

  // ── Load form ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setState(STATE.ERROR); setErrorMsg('No order token found in URL.'); return; }

    const prefill = searchParams.get('prefill') || '';

    fetch(`${API}/api/supply/form/${token}${prefill ? `?prefill=${prefill}` : ''}`)
      .then(async r => {
        const data = await r.json();
        if (r.status === 410) { setState(STATE.EXPIRED); setErrorMsg(data.message || data.error); return; }
        if (r.status === 423) { setState(STATE.CLOSED); setErrorMsg(data.message || data.error); setFormData({ closed: data }); return; }
        if (!r.ok)            { setState(STATE.ERROR);  setErrorMsg(data.error || 'Failed to load order form.'); return; }

        setFormData(data);

        // Pre-fill quantities if last order data exists
        if (data.last_order_qtys) {
          const prefillQty = {};
          Object.entries(data.last_order_qtys).forEach(([id, q]) => {
            prefillQty[id] = String(q);
          });
          setQty(prefillQty);
        }

        // If permanent token was renewed, update URL silently
        if (data.renewed_token) {
          const newPath = `/s/b/${data.renewed_token}`;
          window.history.replaceState(null, '', newPath);
        }

        setState(STATE.READY);
      })
      .catch(err => { setState(STATE.ERROR); setErrorMsg(err.message); });
  }, [token]);

  // ── Compute running total ──────────────────────────────────────────────────
  const runningTotal = useCallback(() => {
    if (!formData?.categories) return 0;
    let total = 0;
    Object.values(formData.categories).flat().forEach(item => {
      const q = parseFloat(quantities[item.id] || 0);
      if (q > 0) {
        const lineBase = q * item.price;
        const lineGst  = lineBase * (item.gst_rate / 100);
        total += lineBase + lineGst;
      }
    });
    return total;
  }, [quantities, formData]);

  const totalAmount = runningTotal();

  // ── Credit state ───────────────────────────────────────────────────────────
  const creditAvailable = formData?.client?.credit_available;
  const creditAutoBlock = formData?.client?.credit_auto_block;
  const wouldExceedCredit = creditAvailable !== null && creditAvailable !== undefined
    && totalAmount > creditAvailable;
  const creditPct = creditAvailable != null && formData?.client?.credit_limit > 0
    ? Math.round(((formData.client.credit_limit - creditAvailable) / formData.client.credit_limit) * 100)
    : 0;

  // ── Qty change ─────────────────────────────────────────────────────────────
  const handleQtyChange = (itemId, value) => {
    // Allow empty, numbers and decimals only
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    setQty(prev => ({ ...prev, [itemId]: value }));
    setMoqErrors(prev => ({ ...prev, [itemId]: '' }));
  };

  // ── Validate + submit ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitError('');
    const newMoqErrors = {};
    let valid = true;

    if (!formData?.categories) return;

    const allItems = Object.values(formData.categories).flat();
    const orderItems = [];

    allItems.forEach(item => {
      const qty = parseFloat(quantities[item.id] || 0);
      if (qty > 0) {
        // MOQ check
        if (item.min_order_qty > 0 && qty < item.min_order_qty) {
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

    // Credit auto-block warning
    if (creditAutoBlock && wouldExceedCredit) {
      setSubmitError(
        `Order blocked: this order (₹${totalAmount.toFixed(2)}) exceeds your available credit (₹${creditAvailable?.toFixed(2)}). ` +
        `Please contact your supplier to clear your balance first.`
      );
      return;
    }

    setState(STATE.SUBMITTING);

    try {
      const res = await fetch(`${API}/api/supply/orders`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          form_token:    token,
          items:         orderItems,
          delivery_date: formData.delivery_date,
        }),
      });

      const data = await res.json();

      if (res.status === 422 && data.code === 'ITEMS_UNAVAILABLE') {
        // Some items went unavailable between form load and submit
        setState(STATE.READY);
        setSubmitError('Some items are no longer available today. They have been removed — please review and resubmit.');
        // Remove unavailable items from quantities
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

  // ── Render helpers ─────────────────────────────────────────────────────────
  const formatCurrency = n => `₹${Number(n).toFixed(2)}`;

  const CreditBadge = () => {
    if (creditAvailable === null) return null;  // unlimited
    const pct = creditPct;
    let color = 'bg-green-100 text-green-800';
    if (pct >= 90) color = 'bg-red-100 text-red-800';
    else if (pct >= 70) color = 'bg-yellow-100 text-yellow-800';
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
        {formatCurrency(creditAvailable)} available
      </span>
    );
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Loading
  if (state === STATE.LOADING) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading your order form…</p>
        </div>
      </div>
    );
  }

  // Expired
  if (state === STATE.EXPIRED) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">⏰</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Order link expired</h2>
          <p className="text-gray-500 text-sm">{errorMsg || 'Your daily order link has expired. Ask your supplier for a new one.'}</p>
        </div>
      </div>
    );
  }

  // Ordering window closed
  if (state === STATE.CLOSED) {
    const d = formData?.closed;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">🕐</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Ordering is closed</h2>
          <p className="text-gray-500 text-sm">
            Orders can be placed between <strong>{d?.ordering_open_time}</strong> and <strong>{d?.ordering_cutoff_time}</strong> IST.
          </p>
        </div>
      </div>
    );
  }

  // Error
  if (state === STATE.ERROR) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-500 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  // Success
  if (state === STATE.SUCCESS && orderResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow p-6 max-w-sm w-full">
          <div className="text-center mb-5">
            <div className="text-4xl mb-2">✅</div>
            <h2 className="text-lg font-semibold text-gray-900">Order placed!</h2>
            <p className="text-gray-500 text-sm mt-1">
              You'll receive a WhatsApp confirmation shortly.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Order no.</span>
              <span className="font-medium">{orderResult.order?.order_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Delivery</span>
              <span className="font-medium">{orderResult.order?.delivery_date}</span>
            </div>
            <div className="flex justify-between text-base font-semibold border-t pt-2 mt-2">
              <span>Total</span>
              <span>{formatCurrency(orderResult.order_total)}</span>
            </div>
          </div>

          <div className="space-y-2">
            {orderResult.items?.map(item => (
              <div key={item.item_id} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.item_name} × {item.qty_ordered} {item.unit}</span>
                <span className="text-gray-600">{formatCurrency(item.line_total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Ready / Submitting
  const { supplier, client, categories, delivery_date } = formData || {};
  const categoryNames = Object.keys(categories || {});
  const allItems = Object.values(categories || {}).flat();
  const orderedItemCount = allItems.filter(i => parseFloat(quantities[i.id] || 0) > 0).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          {supplier?.logo_url && (
            <img src={supplier.logo_url} alt="" className="h-9 w-9 rounded-full object-cover border border-gray-200" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{supplier?.business_name}</p>
            <p className="text-xs text-gray-500">
              {client?.name} · Delivery {delivery_date}
            </p>
          </div>
          <CreditBadge />
        </div>
      </div>

      {/* Credit warning banner */}
      {wouldExceedCredit && !creditAutoBlock && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 max-w-lg mx-auto text-sm text-yellow-800">
          ⚠️ This order will exceed your credit limit. Your supplier will be notified.
        </div>
      )}

      <div className="max-w-lg mx-auto pb-40">
        {categoryNames.map(category => {
          const items = categories[category];
          return (
            <div key={category}>
              <div className="px-4 py-2 bg-gray-100 border-y border-gray-200">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{category}</h3>
              </div>
              {items.map(item => {
                const qty   = quantities[item.id] || '';
                const moqErr = moqErrors[item.id];
                const hasQty = parseFloat(qty) > 0;
                return (
                  <div
                    key={item.id}
                    className={`bg-white border-b border-gray-100 px-4 py-3 ${moqErr ? 'bg-red-50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${hasQty ? 'text-indigo-700' : 'text-gray-900'}`}>
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatCurrency(item.price)}/{item.unit}
                          {item.gst_rate > 0 && ` + ${item.gst_rate}% GST`}
                        </p>
                        {item.min_order_qty > 0 && (
                          <p className="text-xs text-gray-400">Min: {item.min_order_qty} {item.unit}</p>
                        )}
                        {moqErr && (
                          <p className="text-xs text-red-600 font-medium mt-0.5">{moqErr}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasQty && (
                          <button
                            onClick={() => handleQtyChange(item.id, '')}
                            className="text-gray-300 hover:text-red-400 text-lg leading-none"
                            aria-label="Clear"
                          >×</button>
                        )}
                        <input
                          ref={el => { inputRefs.current[item.id] = el; }}
                          type="number"
                          inputMode="decimal"
                          value={qty}
                          onChange={e => handleQtyChange(item.id, e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.5"
                          className={`w-20 text-right border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400
                            ${moqErr ? 'border-red-400 bg-red-50' : hasQty ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200'}
                          `}
                        />
                        <span className="text-xs text-gray-400 w-8 truncate">{item.unit}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {categoryNames.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-2xl mb-2">📦</p>
            <p className="text-sm">No items available today.</p>
          </div>
        )}
      </div>

      {/* ── Sticky footer ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-xl">
        <div className="max-w-lg mx-auto px-4 py-3">
          {submitError && (
            <p className="text-xs text-red-600 mb-2">{submitError}</p>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-gray-400">
                {orderedItemCount} item{orderedItemCount !== 1 ? 's' : ''}
              </p>
              <p className="text-lg font-bold text-gray-900">
                {formatCurrency(totalAmount)}
                {Object.values(categories || {}).flat().some(i => i.gst_rate > 0) && (
                  <span className="text-xs font-normal text-gray-400 ml-1">incl. GST</span>
                )}
              </p>
            </div>
            <button
              onClick={handleSubmit}
              disabled={state === STATE.SUBMITTING || orderedItemCount === 0}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors disabled:cursor-not-allowed"
            >
              {state === STATE.SUBMITTING ? 'Placing…' : 'Place Order →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
