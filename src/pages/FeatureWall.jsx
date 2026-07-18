// ============================================================================
// FEATURE WALL — shown when a route requires a feature the restaurant hasn't
// subscribed to. Never crashes the app; always actionable for the owner.
// ============================================================================
import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const FEATURE_META = {
  token_management: {
    icon: '🎫',
    label: 'Token / Queue',
    desc:  'Walk-in queue tokens via WhatsApp — the default offering across restaurants, retail, jewellery, and cloud kitchens.',
  },
  dine_in: {
    icon: '🍽️',
    label: 'Dine-in ordering',
    desc:  'Full table service: allocate a table, order via WhatsApp, pay, and get a receipt.',
  },
  takeaway: {
    icon: '🛍️',
    label: 'Takeaway ordering',
    desc:  'Counter pickup orders with token notifications.',
  },
  delivery: {
    icon: '🛵',
    label: 'Door delivery',
    desc:  'Address capture, delivery charge management, and dispatch.',
  },
  reserve_table: {
    icon: '📅',
    label: 'Table reservations',
    desc:  'Future bookings, advance payment, and automated reminders.',
  },
};

export default function FeatureWall({ feature }) {
  const { user } = useAuth();
  const meta     = FEATURE_META[feature] || { icon: '🔒', label: feature, desc: '' };
  const isOwner  = user?.role === 'owner';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm max-w-md w-full p-10 text-center">

        <div className="text-5xl mb-4">{meta.icon}</div>

        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          {meta.label} isn't enabled
        </h1>

        <p className="text-gray-500 text-sm leading-relaxed mb-8">
          {meta.desc}
          {' '}This feature isn't part of your restaurant's current subscription.
        </p>

        {isOwner ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 mb-4">
              As the owner, you can update your plan from the dashboard.
            </p>
            <button
              onClick={() => window.location.href = '/dashboard/owner'}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition text-sm"
            >
              Go to owner dashboard
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Please ask your restaurant owner to enable this feature.
          </p>
        )}

      </div>
    </div>
  );
}
