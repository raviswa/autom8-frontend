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

  useEffect(() => {
    if (user) {
      setLoading(true);
    }
  }, [user]);

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
      // Brand roles may lack a single outlet — brand billing is separate
      if (user.role === 'brand_owner' || user.role === 'brand_manager') {
        setFeatures(Object.values(FEATURES));
        setPaidFeatures(Object.values(FEATURES));
        setSubscription({
          status: 'active',
          soft_locked: false,
          is_brand: true,
        });
        return;
      }

      const res = await apiClient.get('/api/subscription');
      const enabled = res.data.enabled_features
        || res.data.features
        || res.data.subscribed_features
        || [];
      const paid = res.data.paid_features || enabled;
      setFeatures(enabled.length > 0 ? enabled : Object.values(FEATURES));
      setPaidFeatures(paid.length > 0 ? paid : Object.values(FEATURES));
      setSubscription(res.data);
    } catch {
      // Network/auth error: assume all features so no one gets locked out.
      // Do NOT invent soft_locked=true on errors.
      setFeatures(Object.values(FEATURES));
      setPaidFeatures(Object.values(FEATURES));
      setSubscription({ status: 'trial', soft_locked: false, fail_open: true });
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
      softLocked: Boolean(subscription?.soft_locked),
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
