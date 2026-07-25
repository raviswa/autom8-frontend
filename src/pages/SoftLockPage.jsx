// ============================================================================
// SCREEN D — Grace-period / soft-lock (subscription lapsed)
// ============================================================================
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';

export default function SoftLockPage() {
  const { apiClient, user } = useAuth();
  const { subscription } = useSubscription();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const isBrand = user?.role === 'brand_owner' || user?.role === 'brand_manager';

  const payNow = async () => {
    setPaying(true);
    setError('');
    try {
      if (isBrand) {
        window.location.href = '/billing';
        return;
      }
      const res = await apiClient.post('/api/subscription/checkout');
      if (res.data.redirect_url) {
        window.location.href = res.data.redirect_url;
        return;
      }
      window.location.href = '/billing';
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Could not start payment');
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white max-w-md w-full rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Subscription paused</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          Your trial or billing period ended and the grace window is over.
          Renew for ₹1000/month per WhatsApp number to take orders again.
          You can still open Settings and export data.
        </p>
        {subscription?.days_until_due != null && (
          <p className="text-xs text-slate-400 mb-4">
            Status: {subscription.status || 'past_due'}
          </p>
        )}
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button
          type="button"
          disabled={paying}
          onClick={payNow}
          className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold py-3 rounded-xl mb-3"
        >
          {paying ? 'Opening PhonePe…' : 'Pay now'}
        </button>
        <Link to="/billing" className="block text-sm font-semibold text-emerald-800 mb-2">
          Open billing details
        </Link>
        <Link to="/settings" className="block text-sm text-slate-500">
          Settings (read-only access)
        </Link>
      </div>
    </div>
  );
}
