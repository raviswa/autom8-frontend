// ============================================================================
// Munafe Supply — Forgot password
// Route: /supply/forgot-password
// ============================================================================

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveSupplyApiBase } from '../../config/api';

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
    <main style={s.page}>
      <div style={s.card}>
        <h1 style={s.title}>Reset password</h1>
        <p style={s.muted}>Enter your Munafe Supply email. We’ll send a reset link if an account exists.</p>
        {error && <div style={s.error}>{error}</div>}
        {done ? (
          <p style={s.success}>If an account exists for that email, a password reset link has been sent.</p>
        ) : (
          <form onSubmit={submit} style={s.form}>
            <label style={s.label}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={s.input}
                required
                autoComplete="username"
              />
            </label>
            <button type="submit" style={s.button} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
        <p style={s.footer}>
          <Link to="/supply/login" style={s.link}>Back to sign in</Link>
        </p>
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
  error: {
    marginTop: 12,
    padding: 10,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    color: '#b91c1c',
    fontSize: 13,
  },
  success: { marginTop: 16, color: '#166534', fontSize: 14 },
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
  footer: { marginTop: 18, fontSize: 14 },
  link: { color: '#2563eb', fontWeight: 600 },
};
