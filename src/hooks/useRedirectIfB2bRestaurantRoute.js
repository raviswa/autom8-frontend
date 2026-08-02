import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isB2bLob, isSupplyPortalLob } from '../config/dashboardProfiles';
import { SUPPLY_INFO_PATH } from '../helpers/employeeHomePath';

/**
 * Soft-block restaurant-only screens for B2B / supply tenants.
 * Supply portal lob → informational landing (no SSO).
 * Other B2B → owner/manager home.
 *
 * @param {{ enabled?: boolean }} [opts] — set enabled=false to skip (e.g. packing station on KDS).
 */
export function useRedirectIfB2bRestaurantRoute(opts = {}) {
  const enabled = opts.enabled !== false;
  const { apiClient, user } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setChecking(false);
      return undefined;
    }
    // Prefer lob_type from login payload when present
    if (isSupplyPortalLob(user?.lob_type)) {
      navigate(SUPPLY_INFO_PATH, { replace: true });
      setChecking(false);
      return undefined;
    }
    if (isB2bLob(user?.lob_type)) {
      const dest = user?.role === 'manager' || user?.role === 'sales_staff'
        ? '/dashboard/manager'
        : '/dashboard/owner';
      navigate(dest, { replace: true });
      setChecking(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/api/dashboard/waba');
        if (cancelled) return;
        const lob = String(data?.lob_type || '').toLowerCase();
        if (isSupplyPortalLob(lob)) {
          navigate(SUPPLY_INFO_PATH, { replace: true });
          return;
        }
        if (isB2bLob(lob)) {
          const dest = user?.role === 'manager' || user?.role === 'sales_staff'
            ? '/dashboard/manager'
            : '/dashboard/owner';
          navigate(dest, { replace: true });
        }
      } catch (_) {
        // If lob cannot be resolved, leave the page (avoid trapping restaurant staff).
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiClient, navigate, user?.role, user?.lob_type, enabled]);

  return checking;
}
