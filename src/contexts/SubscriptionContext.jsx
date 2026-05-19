// ============================================================================
// SUBSCRIPTION CONTEXT
// Fetches the restaurant's subscribed features once on login and makes them
// available everywhere. Every component that needs to conditionally render
// based on features uses useSubscription() instead of hardcoding routes.
// ============================================================================

import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

export const FEATURES = {
  TOKEN_MANAGEMENT: 'token_management',
  DINE_IN:          'dine_in',
  TAKEAWAY:         'takeaway',
  DELIVERY:         'delivery',
  RESERVE_TABLE:    'reserve_table',
};

const SubscriptionContext = createContext();

export function SubscriptionProvider({ children }) {
  const { user, apiClient } = useAuth();
  const [features, setFeatures]       = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading]           = useState(true);

  const fetchSubscription = useCallback(async () => {
    if (!user) { setFeatures([]); setSubscription(null); setLoading(false); return; }
    try {
      const res = await apiClient.get('/api/subscription');
      setFeatures(res.data.subscribed_features || []);
      setSubscription(res.data.subscription || null);
    } catch {
      // Graceful fallback: if subscription endpoint unreachable, assume all features
      // so existing restaurants never get locked out unexpectedly.
      setFeatures(Object.values(FEATURES));
    } finally {
      setLoading(false);
    }
  }, [user, apiClient]);

  useEffect(() => { fetchSubscription(); }, [fetchSubscription]);

  const hasFeature = (feature) => features.includes(feature);

  const hasAnyOf = (...featureList) => featureList.some(f => features.includes(f));

  const value = {
    features,
    subscription,
    loading,
    hasFeature,
    hasAnyOf,
    refresh: fetchSubscription,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = React.useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
