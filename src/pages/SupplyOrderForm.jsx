// Munafe Supply — B2B order form (signed URL, no login)
// Route: /supply/order?t=<token>

import React, { useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SupplyOrderForm() {
  const token = new URLSearchParams(window.location.search).get('t') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);
  const [qty, setQty] = useState({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    if (!token) {
      setError('Invalid order link — ask your supplier for a fresh link.');
      setLoading(false);
      return;
    }
    const prefill = new URLSearchParams(window.location.search).get('prefill');
    fetch(`${API_BASE}/api/supply/form/resolve?t=${encodeURIComponent(token)}${prefill ? '&prefill=last' : ''}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Could not load form');
        setPayload(data);
        const initial = {};
        (data.items || []).forEach((item) => {
          initial[item.id] = data.prefill?.[item.id] ?? '';
        });
        setQty(initial);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const totals = useMemo(() => {
    if (!payload?.items) return { subtotal: 0, gst: 0, total: 0, count: 0 };
    let subtotal = 0;
    let gst = 0;
    let count = 0;
    for (const item of payload.items) {
      const q = Number(qty[item.id]);
      if (!q || q <= 0) continue;
      const line = item.price * q;
      const lineGst = line * (Number(item.gst_rate) / 100);
      subtotal += line;
      gst += lineGst;
      count += 1;
    }
    return { subtotal, gst, total: subtotal + gst, count };
  }, [payload, qty]);

  const submit = async () => {
    if (!payload?.is_ordering_open) {
      setError('Ordering window is closed. Try again when ordering opens.');
      return;
    }
    const items = Object.entries(qty)
      .filter(([, v]) => Number(v) > 0)
      .map(([item_id, v]) => ({ item_id, qty: Number(v) }));
    if (!items.length) {
      setError('Add at least one item quantity.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/supply/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          items,
          delivery_date: payload.context?.next_delivery_iso,
          special_notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submit failed');
      setDone(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading your order form…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-semibold text-slate-900">Order confirmed</h1>
          <p className="mt-2 text-slate-600">#{done.order_number}</p>
          <p className="mt-4 text-lg font-medium">{formatMoney(done.total_amount)}</p>
          <p className="mt-2 text-sm text-slate-500">
            Outstanding after order: {formatMoney(done.new_outstanding)}
          </p>
        </div>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
        <p className="text-red-800 text-center max-w-sm">{error}</p>
      </div>
    );
  }

  const ctx = payload?.context || {};
  const grouped = (payload?.items || []).reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="bg-white border-b border-slate-200 px-4 py-5 sticky top-0 z-10">
        <p className="text-xs uppercase tracking-wide text-slate-500">{payload?.supplier?.name}</p>
        <h1 className="text-xl font-semibold text-slate-900">{payload?.client?.name}</h1>
        <p className="text-sm text-slate-600 mt-1">
          Delivery: {ctx.next_delivery_date} · Closes {ctx.ordering_cutoff}
        </p>
        {!payload?.is_ordering_open && (
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Ordering is currently closed. You can browse items but submission may fail until the window opens.
          </p>
        )}
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {error && (
          <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {Object.entries(grouped).map(([category, items]) => (
          <section key={category}>
            <h2 className="text-sm font-semibold text-slate-500 uppercase mb-3">{category}</h2>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 flex gap-3 items-center">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <p className="text-sm text-slate-500">
                      {formatMoney(item.price)} / {item.unit}
                    </p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={qty[item.id] ?? ''}
                    onChange={(e) => setQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="w-20 border border-slate-300 rounded-lg px-2 py-2 text-right text-slate-900"
                  />
                </div>
              ))}
            </div>
          </section>
        ))}

        <section>
          <label className="block text-sm font-medium text-slate-700 mb-2">Special notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-slate-900"
            placeholder="Delivery instructions, substitutions…"
          />
        </section>
      </main>

      <footer className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">{totals.count} line items</p>
            <p className="text-lg font-semibold text-slate-900">{formatMoney(totals.total)}</p>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || totals.count === 0}
            className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit order'}
          </button>
        </div>
      </footer>
    </div>
  );
}
