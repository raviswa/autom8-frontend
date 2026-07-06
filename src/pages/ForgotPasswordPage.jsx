import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { C, FONTS } from '../theme/brand';

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, fontFamily: FONTS.body,
      background: `linear-gradient(160deg, ${C.emeraldDark} 0%, ${C.emerald} 55%, #0A2E27 100%)`,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontFamily: FONTS.heading, fontSize: 24, fontWeight: 600, color: '#fff', margin: 0 }}>
            Reset your password
          </h1>
          <p style={{ fontSize: 13, color: '#BFE0D6', margin: '6px 0 0' }}>
            Enter your work email and we&apos;ll send a reset link.
          </p>
        </div>

        <div style={{ background: C.cardBg, borderRadius: 16, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
          {error && (
            <div style={{ marginBottom: 20, padding: '12px 14px', background: C.dangerLight, border: `0.5px solid ${C.dangerBorder}`, borderRadius: 10 }}>
              <p style={{ fontSize: 13, color: C.dangerDark, margin: 0, fontWeight: 500 }}>{error}</p>
            </div>
          )}

          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 20, padding: 16, background: C.successLight, border: `0.5px solid ${C.successBorder}`, borderRadius: 10 }}>
                <p style={{ fontSize: 13, color: C.successDark, margin: 0, lineHeight: 1.6 }}>
                  If an account exists for <strong>{email}</strong>, a password reset has been sent.
                  Check your inbox and spam folder. If nothing arrives, ask your manager to resend from Settings → Staff.
                </p>
              </div>
              <Link to="/login" style={{ fontSize: 13, color: C.primary, fontWeight: 500, textDecoration: 'none' }}>
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="email" style={{ fontSize: 12, fontWeight: 600, color: C.textSub, marginBottom: 6, display: 'block' }}>
                  Email address
                </label>
                <input
                  id="email" type="email" value={email} required
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, boxSizing: 'border-box', border: '1px solid #E5E2D8', fontSize: 14, outline: 'none' }}
                />
              </div>
              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                background: loading ? C.textMuted : C.emerald, color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
              }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <Link to="/login" style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', textDecoration: 'none' }}>
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
