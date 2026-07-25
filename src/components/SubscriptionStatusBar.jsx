// ============================================================================
// SCREEN C — slim trial / overdue status bar
// ============================================================================
import React from 'react';
import { Link } from 'react-router-dom';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';

export default function SubscriptionStatusBar() {
  const { subscription, loading } = useSubscription();
  const { user } = useAuth();
  if (loading || !subscription) return null;

  const status = subscription.status;
  const days = subscription.days_until_due;
  const softLocked = subscription.soft_locked;
  if (softLocked) return null; // Screen D replaces the app

  const isBrand = user?.role === 'brand_owner' || user?.role === 'brand_manager';
  const billingHref = '/billing';

  let tone = null;
  let message = null;

  if (status === 'past_due' || (typeof days === 'number' && days < 0 && status !== 'active')) {
    tone = 'bg-red-600 text-white';
    message = 'Payment overdue — Pay now';
  } else if (status === 'trial' && typeof days === 'number' && days >= 0 && days <= 7) {
    tone = 'bg-amber-500 text-white';
    message = `Trial ends in ${days} day${days === 1 ? '' : 's'} — View billing`;
  } else if (status === 'trial' && subscription.trial_ends_at) {
    const ms = new Date(subscription.trial_ends_at).getTime() - Date.now();
    const d = Math.ceil(ms / (24 * 60 * 60 * 1000));
    if (d >= 0 && d <= 7) {
      tone = 'bg-amber-500 text-white';
      message = `Trial ends in ${d} day${d === 1 ? '' : 's'} — View billing`;
    }
  }

  if (!tone || !message) return null;

  return (
    <Link
      to={billingHref}
      className={`block text-center text-sm font-semibold px-4 py-2 ${tone}`}
    >
      {message}{isBrand ? ' (per outlet)' : ''}
    </Link>
  );
}
