// ============================================================================
// Munafe Supply — Forgot password (Autom8 brand)
// ============================================================================

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveSupplyApiBase } from '../../config/api';
import { C, FONTS } from '../../theme/brand';

const API = resolveSupplyApiBase();

export default function SupplyForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/supply/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={page}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={logoMark}>M</div>
          <h1 style={title}>Reset password</h1>
          <p style={subtitle}>Munafe Supply · by autom8.works</p>
        </div>

        <div style={card}>
          {error && (
            <div style={alertError}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.dangerDark }}>{error}</p>
            </div>
          )}
          {done ? (
            <p style={{ margin: 0, fontSize: 14, color: C.successDark, lineHeight: 1.5 }}>
              If an account exists for that email, a password reset link has been sent.
            </p>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="email" style={label}>Email address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  style={input}
                />
              </div>
              <button type="submit" disabled={loading} style={btn(loading)}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
          <p style={{ margin: '20px 0 0', fontSize: 13, textAlign: 'center' }}>
            <Link to="/supply/login" style={{ color: C.primary, fontWeight: 600, textDecoration: 'none' }}>
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
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
function btn(loading) {
  return {
    width: '100%', padding: '13px', borderRadius: 10, border: 'none',
    background: loading ? C.textMuted : C.emerald, color: '#fff',
    fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
    fontFamily: FONTS.body,
  };
}
