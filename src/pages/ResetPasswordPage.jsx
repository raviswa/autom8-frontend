// ============================================================================
// AUTOM8 FRONTEND - RESET PASSWORD PAGE
// src/pages/ResetPasswordPage.jsx
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { completePasswordReset, supabaseClient } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const establishRecoverySession = async () => {
      const hash = window.location.hash?.startsWith('#')
        ? window.location.hash.slice(1)
        : '';
      const hashParams = new URLSearchParams(hash);
      const isRecovery = hashParams.get('type') === 'recovery'
        || hashParams.has('access_token');

      if (isRecovery && hashParams.has('access_token')) {
        const access_token = hashParams.get('access_token');
        const refresh_token = hashParams.get('refresh_token') || '';
        const { error: sessionErr } = await supabaseClient.auth.setSession({
          access_token,
          refresh_token,
        });
        if (!sessionErr) {
          window.history.replaceState(null, '', window.location.pathname);
          if (mounted) {
            setReady(true);
            setChecking(false);
          }
          return true;
        }
      }

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (mounted && session) {
        setReady(true);
        setChecking(false);
        return true;
      }
      return false;
    };

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setReady(true);
        setChecking(false);
      }
    });

    establishRecoverySession().then((ok) => {
      if (mounted && !ok) setChecking(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabaseClient]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await completePasswordReset(password);
      navigate('/login', { state: { message: 'Password updated. You can sign in now.' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-teal-900 flex items-center justify-center">
        <p className="text-white">Verifying reset link…</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-teal-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <p className="text-gray-700 mb-4">
            This reset link is invalid or has expired.
          </p>
          <Link to="/forgot-password" className="text-blue-600 hover:text-blue-800 font-medium">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-teal-900 flex items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Set a new password</h1>
          <p className="text-blue-200">Choose a password for your Autom8 account.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                New password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                minLength={8}
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                minLength={8}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
