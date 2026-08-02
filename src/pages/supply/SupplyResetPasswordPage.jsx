// ============================================================================
// Munafe Supply — Reset password (invite / forgot-password landing)
// Route: /supply/reset-password
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../contexts/AuthContext';

export default function SupplyResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    const establishRecoverySession = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const tokenHash = searchParams.get('token_hash');
      const queryType = searchParams.get('type');

      if (tokenHash && queryType === 'recovery') {
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (!otpErr) {
          window.history.replaceState(null, '', window.location.pathname);
          if (mounted) {
            setReady(true);
            setChecking(false);
          }
          return true;
        }
        if (mounted) setError(otpErr.message || 'Invalid or expired reset link.');
      }

      const hash = window.location.hash?.startsWith('#')
        ? window.location.hash.slice(1)
        : '';
      const hashParams = new URLSearchParams(hash);
      const isRecovery = hashParams.get('type') === 'recovery' || hashParams.has('access_token');

      if (isRecovery && hashParams.has('access_token')) {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: hashParams.get('access_token'),
          refresh_token: hashParams.get('refresh_token') || '',
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

      const { data: { session } } = await supabase.auth.getSession();
      if (mounted && session) {
        setReady(true);
        setChecking(false);
        return true;
      }
      return false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
  }, []);

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
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      await supabase.auth.signOut().catch(() => {});
      navigate('/supply/login', { state: { message: 'Password updated. You can sign in now.' } });
    } catch (err) {
      setError(err.message || 'Could not update password.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <main style={s.page}>
        <p style={s.muted}>Verifying reset link…</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main style={s.page}>
        <div style={s.card}>
          <p style={s.body}>{error || 'This reset link is invalid or has expired.'}</p>
          <Link to="/supply/forgot-password" style={s.link}>Request a new reset link</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Set a new password</h1>
        <p style={s.muted}>Choose a password for your Munafe Supply account.</p>
        {error && <div style={s.error}>{error}</div>}
        <form onSubmit={handleSubmit} style={s.form}>
          <label style={s.label}>
            New password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={s.input}
              minLength={8}
              required
            />
          </label>
          <label style={s.label}>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={s.input}
              minLength={8}
              required
            />
          </label>
          <button type="submit" style={s.button} disabled={loading}>
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </main>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: '#0f172a',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: '#fff',
    borderRadius: 12,
    padding: 28,
  },
  title: { margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#0f172a' },
  muted: { margin: 0, color: '#64748b', fontSize: 14 },
  body: { color: '#334155', marginBottom: 12 },
  error: {
    marginTop: 12,
    padding: 10,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    color: '#b91c1c',
    fontSize: 13,
  },
  form: { display: 'grid', gap: 14, marginTop: 16 },
  label: { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, color: '#334155' },
  input: {
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    fontSize: 14,
  },
  button: {
    marginTop: 4,
    padding: '12px 14px',
    border: 'none',
    borderRadius: 8,
    background: '#2563eb',
    color: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  link: { color: '#2563eb', fontWeight: 600, fontSize: 14 },
};
