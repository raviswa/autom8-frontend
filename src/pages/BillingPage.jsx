// ============================================================================
// SCREEN B / B2 — Subscription & Offers (flat ₹1000/number, PhonePe checkout)
// ============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';

const SOURCE_LABEL = {
  phonepe: 'PhonePe',
  razorpay: 'Razorpay',
  referral_credit: 'Referral bonus',
  manual_adjustment: 'Manual adjustment',
};

function money(amount, currency = 'INR') {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `₹${n}`;
  }
}

export default function BillingPage() {
  const { apiClient, user } = useAuth();
  const { refresh } = useSubscription();
  const [params] = useSearchParams();
  const isBrand = user?.role === 'brand_owner' || user?.role === 'brand_manager';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [single, setSingle] = useState(null);
  const [brand, setBrand] = useState(null);
  const [offerCode, setOfferCode] = useState('');
  const [offerMsg, setOfferMsg] = useState('');
  const [payingId, setPayingId] = useState(null);
  const [midForm, setMidForm] = useState({ merchant_id: '', merchant_name: '', partner_referral_code: '' });
  const [midMsg, setMidMsg] = useState('');
  const [midSaving, setMidSaving] = useState(false);
  const [referralUrl, setReferralUrl] = useState(null);
  const [referralBusy, setReferralBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isBrand) {
        const res = await apiClient.get('/api/subscription/brand');
        setBrand(res.data);
        setSingle(null);
      } else {
        const res = await apiClient.get('/api/subscription');
        setSingle(res.data);
        setBrand(null);
        const g = res.data.phonepe_merchant;
        setMidForm({
          merchant_id: g?.merchant_id || '',
          merchant_name: g?.merchant_name || '',
          partner_referral_code: g?.partner_referral_code || '',
        });
        try {
          const gw = await apiClient.get('/api/subscription/payment-gateway');
          setReferralUrl(gw.data?.referral_url || null);
          const row = gw.data?.gateway;
          if (row) {
            setMidForm({
              merchant_id: row.merchant_id || '',
              merchant_name: row.merchant_name || '',
              partner_referral_code: row.partner_referral_code || '',
            });
            setSingle((prev) => (prev ? { ...prev, phonepe_merchant: row } : prev));
          }
        } catch {
          setReferralUrl(null);
        }
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load billing');
    } finally {
      setLoading(false);
    }
  }, [apiClient, isBrand]);

  useEffect(() => { load(); }, [load]);

  // After PhonePe redirect, confirm payment status
  useEffect(() => {
    const txn = params.get('txn');
    if (!txn || params.get('payment') !== 'return') return;
    (async () => {
      try {
        await apiClient.get(`/api/subscription/phonepe/status/${encodeURIComponent(txn)}`);
        await refresh?.();
        await load();
      } catch { /* ignore — callback may still complete */ }
    })();
  }, [params, apiClient, load, refresh]);

  const applyOffer = async (restaurantId) => {
    setOfferMsg('');
    try {
      const res = await apiClient.post('/api/subscription/apply-offer', {
        code: offerCode,
        restaurant_id: restaurantId || undefined,
      });
      setOfferMsg(`Applied ${res.data.code}: now ${money(res.data.final_price)}`);
      await load();
    } catch (e) {
      setOfferMsg(e.response?.data?.error || e.message || 'Could not apply offer');
    }
  };

  const saveMid = async (restaurantId) => {
    setMidSaving(true);
    setMidMsg('');
    try {
      const res = await apiClient.put('/api/subscription/payment-gateway', {
        restaurant_id: restaurantId || undefined,
        merchant_id: midForm.merchant_id,
        merchant_name: midForm.merchant_name || null,
        partner_referral_code: midForm.partner_referral_code || null,
      });
      setMidMsg(`Saved · status ${res.data.gateway?.status || 'pending'}`);
      await load();
    } catch (e) {
      setMidMsg(e.response?.data?.error || e.message || 'Could not save PhonePe merchant ID');
    } finally {
      setMidSaving(false);
    }
  };

  const startPhonePeReferral = async () => {
    if (!referralUrl) return;
    setReferralBusy(true);
    setMidMsg('');
    try {
      window.open(referralUrl, '_blank', 'noopener,noreferrer');
      await apiClient.post('/api/subscription/payment-gateway/referral-intent');
      await load();
    } catch (e) {
      setMidMsg(e.response?.data?.error || e.message || 'Could not record PhonePe signup intent');
    } finally {
      setReferralBusy(false);
    }
  };

  const checkout = async (restaurantId) => {
    setPayingId(restaurantId || 'self');
    setError('');
    try {
      const res = await apiClient.post('/api/subscription/checkout', {
        restaurant_id: restaurantId || undefined,
      });
      const url = res.data.redirect_url;
      if (!url) throw new Error('No payment URL returned');
      window.location.href = url;
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Checkout failed');
      setPayingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Subscription & billing</h1>
            <p className="text-sm text-slate-500 mt-1">₹1000 / month per WhatsApp number</p>
          </div>
          <div className="flex items-center gap-4">
            <Link to={isBrand ? '/dashboard/brand' : '/dashboard/owner'} className="text-sm text-emerald-800 font-semibold">
              ← Dashboard
            </Link>
            <Link to="/account" className="text-sm text-emerald-800 font-semibold">
              My Account
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
        )}

        {isBrand && brand && (
          <>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="text-sm text-slate-500">Brand total</div>
              <div className="text-2xl font-semibold text-slate-900 mt-1">
                {brand.outlet_count} numbers × {money(brand.per_outlet_price)} = {money(brand.total_monthly)}
                <span className="text-base font-normal text-slate-500"> / month</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">Pay per outlet below — each number is billed separately.</p>
            </div>

            <div className="space-y-3">
              {(brand.outlets || []).map((o) => (
                <div key={o.restaurant_id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{o.name}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {o.whatsapp_number ? `+${o.whatsapp_number}` : 'No number'} · {o.status}
                      {o.soft_locked ? ' · soft-locked' : ''}
                      {o.phonepe_merchant?.merchant_id
                        ? ` · PhonePe MID ${o.phonepe_merchant.merchant_id} (${o.phonepe_merchant.status})`
                        : ' · PhonePe MID not set'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{money(o.price)}/mo</span>
                    <button
                      type="button"
                      disabled={payingId === o.restaurant_id}
                      onClick={() => checkout(o.restaurant_id)}
                      className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                    >
                      {payingId === o.restaurant_id ? 'Opening…' : 'Pay now'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Link to="/dashboard/brand" className="inline-block text-sm font-semibold text-emerald-800 underline">
              Add outlet
            </Link>
          </>
        )}

        {!isBrand && single && (
          <>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-500">Current plan</div>
                  <div className="text-2xl font-semibold text-slate-900 mt-1">
                    {money(single.price ?? single.base_price ?? 1000)}
                    <span className="text-base font-normal text-slate-500"> / month</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    Status: <span className="font-semibold uppercase">{single.status}</span>
                    {single.trial_ends_at && single.status === 'trial' && (
                      <> · Trial ends {new Date(single.trial_ends_at).toLocaleDateString()}</>
                    )}
                    {single.renews_at && single.status === 'active' && (
                      <> · Renews {new Date(single.renews_at).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!!payingId}
                  onClick={() => checkout()}
                  className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
                >
                  {payingId ? 'Opening PhonePe…' : 'Pay now'}
                </button>
              </div>
              {!single.phonepe_configured && (
                <p className="text-xs text-amber-700 mt-3">PhonePe is not configured on the server yet.</p>
              )}
            </div>

            {(single.referral_bonus_days > 0) && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-900">
                You&apos;ve earned <strong>{single.referral_bonus_days}</strong> bonus days from referrals
                (credited automatically — not an offer code).
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-800 mb-2">Have an offer code?</div>
              <div className="flex gap-2">
                <input
                  value={offerCode}
                  onChange={(e) => setOfferCode(e.target.value.toUpperCase())}
                  placeholder="LAUNCH20"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => applyOffer()}
                  className="bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                >
                  Apply
                </button>
              </div>
              {offerMsg && <p className="text-xs text-slate-600 mt-2">{offerMsg}</p>}
              <p className="text-xs text-slate-400 mt-2">
                Offer codes are separate from referral bonus days.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-800 mb-1">Your PhonePe merchant ID</div>
              <p className="text-xs text-slate-500 mb-3">
                For partnership tracking only — we never ask for your PhonePe salt key or customer payment details.
              </p>
              {referralUrl && !String(single.phonepe_merchant?.merchant_id || midForm.merchant_id || '').trim() ? (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs text-emerald-900 mb-2">
                    New to PhonePe? Start partner onboarding, then paste your merchant ID below when you have it.
                  </p>
                  <button
                    type="button"
                    disabled={referralBusy}
                    onClick={startPhonePeReferral}
                    className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                  >
                    {referralBusy ? 'Opening…' : 'Get started →'}
                  </button>
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={midForm.merchant_id}
                  onChange={(e) => setMidForm((f) => ({ ...f, merchant_id: e.target.value }))}
                  placeholder="PhonePe Merchant ID (MID)"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm sm:col-span-2"
                />
                <input
                  value={midForm.merchant_name}
                  onChange={(e) => setMidForm((f) => ({ ...f, merchant_name: e.target.value }))}
                  placeholder="Account / trade name (optional)"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  value={midForm.partner_referral_code}
                  onChange={(e) => setMidForm((f) => ({ ...f, partner_referral_code: e.target.value }))}
                  placeholder="Partner / referral code (optional)"
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  disabled={midSaving || !midForm.merchant_id.trim()}
                  onClick={() => saveMid()}
                  className="bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {midSaving ? 'Saving…' : 'Save MID'}
                </button>
                {single.phonepe_merchant?.status && (
                  <span className="text-xs text-slate-500 uppercase">
                    Status: {single.phonepe_merchant.status}
                    {single.phonepe_merchant.linked_at
                      ? ` · linked ${new Date(single.phonepe_merchant.linked_at).toLocaleDateString()}`
                      : ''}
                  </span>
                )}
              </div>
              {midMsg && <p className="text-xs text-slate-600 mt-2">{midMsg}</p>}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="text-sm font-semibold text-slate-800 mb-3">Payment history</div>
              {(single.payments || []).length === 0 && (
                <p className="text-sm text-slate-500">No payments yet.</p>
              )}
              <div className="divide-y divide-slate-100">
                {(single.payments || []).map((p) => (
                  <div key={p.id} className="py-2.5 flex justify-between gap-3 text-sm">
                    <div>
                      <div className="font-medium text-slate-800">
                        {SOURCE_LABEL[p.source] || p.source}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.created_at ? new Date(p.created_at).toLocaleString() : '—'} · {p.status}
                      </div>
                    </div>
                    <div className="font-semibold text-slate-900">{money(p.amount, p.currency || 'INR')}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
