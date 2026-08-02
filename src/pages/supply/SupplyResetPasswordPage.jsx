// ============================================================================
// Munafe Supply — Reset password (invite / forgot-password landing)
// Route: /supply/reset-password
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../contexts/AuthContext';
import { C, FONTS } from '../../theme/brand';

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

  const shell = (children) => (
    <div style={page}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={logoMark}>M</div>
          <h1 style={title}>Set a new password</h1>
          <p style={subtitle}>Munafe Supply · by autom8.works</p>
        </div>
        <div style={card}>{children}</div>
      </div>
    </div>
  );

  if (checking) {
    return shell(<p style={{ margin: 0, fontSize: 14, color: C.textMuted }}>Verifying reset link…</p>);
  }

  if (!ready) {
    return shell(
      <>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: C.textSub, lineHeight: 1.5 }}>
          {error || 'This reset link is invalid or has expired.'}
        </p>
        <Link to="/supply/forgot-password" style={link}>Request a new reset link</Link>
      </>
    );
  }

  return shell(
    <>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: C.textMuted, lineHeight: 1.5 }}>
        Choose a password for your Munafe Supply account.
      </p>
      {error && (
        <div style={alertError}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.dangerDark }}>{error}</p>
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label htmlFor="new-password" style={label}>New password</label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={input}
            minLength={8}
            required
            autoComplete="new-password"
          />
        </div>
        <div>
          <label htmlFor="confirm-password" style={label}>Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={input}
            minLength={8}
            required
            autoComplete="new-password"
          />
        </div>
        <button type="submit" style={btn(loading)} disabled={loading}>
          {loading ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </>
  );
}

const page = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  fontFamily: FONTS.body,
  background: `linear-gradient(160deg, ${C.emeraldDark} 0%, ${C.emerald} 55%, #0A2E27 100%)`,
};
const logoMark = {
  width: 56, height: 56, borderRadius: 14, background: C.gold,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  margin: '0 auto 16px', fontFamily: FONTS.heading, fontWeight: 600,
  fontSize: 22, color: C.emeraldDark,
};
const title = { fontFamily: FONTS.heading, fontSize: 26, fontWeight: 600, color: '#fff', margin: 0 };
const subtitle = { fontSize: 14, color: '#BFE0D6', margin: '4px 0 0' };
const card = {
  background: C.cardBg, borderRadius: 16, padding: 32,
  boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
};
const label = { fontSize: 12, fontWeight: 600, color: C.textSub, marginBottom: 6, display: 'block' };
const input = {
  width: '100%', padding: '11px 14px', borderRadius: 10, boxSizing: 'border-box',
  border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', color: C.text,
  fontFamily: FONTS.body,
};
const alertError = {
  marginBottom: 16, padding: '12px 14px',
  background: C.dangerLight, border: `0.5px solid ${C.dangerBorder}`, borderRadius: 10,
};
const link = { color: C.primary, fontWeight: 600, fontSize: 14, textDecoration: 'none' };
function btn(loading) {
  return {
    width: '100%', padding: '13px', borderRadius: 10, border: 'none',
    background: loading ? C.textMuted : C.emerald, color: '#fff',
    fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
    fontFamily: FONTS.body,
  };
}
