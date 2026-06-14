// ============================================================================
// SUBSCRIPTION CONTEXT
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

  const [features, setFeatures]         = useState([]);
  const [paidFeatures, setPaidFeatures] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading]           = useState(true);

  // ── KEY FIX ──────────────────────────────────────────────────────────────
  // Reset loading=true SYNCHRONOUSLY whenever user changes.
  // This runs before the fetch effect, closing the window where:
  //   user=null  → setLoading(false) [no user, stop loading]
  //   user=X     → React renders AppRoutes with loading=false, features=[]
  //              → hasAnyOf()=false → FeatureWall flashes ❌
  //
  // With this effect, the moment user changes the loading flag goes back to
  // true before AppRoutes ever sees the new user value, so AppRoutes always
  // renders a spinner during the transition, never FeatureWall.
  useEffect(() => {
    if (user) {
      // User just logged in (or page refreshed with existing session).
      // Force loading=true immediately so no render sees user+empty features.
      setLoading(true);
    }
  }, [user]);
  // ─────────────────────────────────────────────────────────────────────────

  const fetchSubscription = useCallback(async () => {
    if (!user) {
      setFeatures([]);
      setPaidFeatures([]);
      setSubscription(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const res = await apiClient.get('/api/subscription');
      const enabled = res.data.enabled_features
        || res.data.features
        || res.data.subscribed_features
        || [];
      const paid = res.data.paid_features || enabled;
      setFeatures(enabled.length > 0 ? enabled : Object.values(FEATURES));
      setPaidFeatures(paid.length > 0 ? paid : Object.values(FEATURES));
      setSubscription(res.data.subscription || res.data || null);
    } catch {
      // Network/auth error: assume all features so no one gets locked out.
      setFeatures(Object.values(FEATURES));
      setPaidFeatures(Object.values(FEATURES));
    } finally {
      setLoading(false);
    }
  }, [user, apiClient]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const hasFeature = (feature) => features.includes(feature);
  const hasPaidFeature = (feature) => paidFeatures.includes(feature);
  const hasAnyOf   = (...featureList) => featureList.some(f => features.includes(f));

  return (
    <SubscriptionContext.Provider value={{
      features, paidFeatures, subscription, loading, hasFeature, hasPaidFeature, hasAnyOf,
      refresh: fetchSubscription,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = React.useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
