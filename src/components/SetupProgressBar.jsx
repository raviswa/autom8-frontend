// ============================================================================
// Persistent link back to /setup when activation checklist is incomplete
// ============================================================================
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function SetupProgressBar() {
  const { apiClient, user } = useAuth();
  const [incomplete, setIncomplete] = useState(null);

  useEffect(() => {
    if (!user || !apiClient) return undefined;
    if (!['owner', 'brand_owner', 'brand_manager'].includes(user.role)) {
      setIncomplete(false);
      return undefined;
    }
    let cancelled = false;
    apiClient.get('/api/onboarding/status')
      .then((res) => {
        if (cancelled) return;
        setIncomplete(res.data?.setup_complete === false);
      })
      .catch(() => {
        if (!cancelled) setIncomplete(null);
      });
    return () => { cancelled = true; };
  }, [apiClient, user]);

  if (!incomplete) return null;

  return (
    <Link
      to="/setup"
      className="block text-center text-sm font-semibold px-4 py-2 bg-slate-800 text-white hover:bg-slate-900"
    >
      Setup progress — see what&apos;s done and what&apos;s pending
    </Link>
  );
}
