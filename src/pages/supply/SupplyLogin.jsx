// src/pages/supply/SupplyLogin.jsx
// ============================================================================
// MODULE 1 — Supplier Login / Register
//
// Route: /supply/login
//
// Two panels: Login (default) and Register (toggle).
// On successful login: stores supply_token + supply_user in localStorage,
// then redirects to /supply/dashboard.
//
// Token storage keys are prefixed 'supply_' to coexist with the restaurant
// session that may be active in the same browser tab.
// ============================================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(path, body) {
  const res = await fetch(`${API}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Sub-component: field ──────────────────────────────────────────────────────

function Field({ label, type = 'text', value, onChange, placeholder, required, autoComplete }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}{required && <span style={s.req}> *</span>}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={s.input}
      />
    </div>
  );
}

// ── Login panel ───────────────────────────────────────────────────────────────

function LoginPanel({ onSwitch }) {
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const submit = async e => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await apiFetch('/api/supply/auth/login', { email, password });
      localStorage.setItem('supply_token', data.token);
      localStorage.setItem('supply_refresh_token', data.refreshToken);
      localStorage.setItem('supply_user', JSON.stringify(data.user));
      navigate('/supply/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} style={s.form}>
      <div style={s.formHeader}>
        <div style={s.logoMark}>M</div>
        <h1 style={s.title}>Munafe Supply</h1>
        <p style={s.subtitle}>Supplier portal</p>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        placeholder="you@business.com"
        required
        autoComplete="username"
      />
      <Field
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="••••••••"
        required
        autoComplete="current-password"
      />

      <button type="submit" style={s.submitBtn} disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <div style={s.switchRow}>
        <span style={s.switchText}>New supplier?</span>
        <button type="button" onClick={onSwitch} style={s.linkBtn}>
          Create account
        </button>
      </div>
    </form>
  );
}

// ── Register panel ────────────────────────────────────────────────────────────

const EMPTY_REG = {
  name: '', business_name: '', email: '', phone: '',
  password: '', confirm: '',
  gstin: '', address: '', city: '', state: '', pincode: '',
};

function RegisterPanel({ onSwitch }) {
  const [form,    setForm]    = useState(EMPTY_REG);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match'); return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters'); return;
    }
    if (form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstin)) {
      setError('GSTIN format is invalid (15-character alphanumeric)'); return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/supply/auth/register', {
        name:          form.name,
        business_name: form.business_name,
        email:         form.email,
        phone:         form.phone,
        password:      form.password,
        gstin:         form.gstin   || undefined,
        address:       form.address || undefined,
        city:          form.city    || undefined,
        state:         form.state   || undefined,
        pincode:       form.pincode || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={{ ...s.form, textAlign: 'center' }}>
        <div style={s.successIcon}>✓</div>
        <h2 style={{ ...s.title, fontSize: 20, marginBottom: 8 }}>Account created</h2>
        <p style={{ color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
          You can now sign in with your email and password.
        </p>
        <button style={s.submitBtn} onClick={onSwitch}>Go to sign in</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={s.form}>
      <div style={s.formHeader}>
        <div style={s.logoMark}>M</div>
        <h1 style={s.title}>Create account</h1>
        <p style={s.subtitle}>Register as a Munafe Supply partner</p>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      <div style={s.row}>
        <Field label="Contact name"   value={form.name}          onChange={set('name')}          placeholder="Ravi Kumar"         required />
        <Field label="Business name"  value={form.business_name} onChange={set('business_name')} placeholder="Ravi Fresh Produce" required />
      </div>
      <div style={s.row}>
        <Field label="Email"          value={form.email}    onChange={set('email')}    placeholder="ravi@business.com" required type="email" autoComplete="username" />
        <Field label="WhatsApp phone" value={form.phone}    onChange={set('phone')}    placeholder="+91 98765 43210"   required />
      </div>
      <div style={s.row}>
        <Field label="Password"       value={form.password} onChange={set('password')} placeholder="Min. 8 characters" required type="password" autoComplete="new-password" />
        <Field label="Confirm password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat password"  required type="password" autoComplete="new-password" />
      </div>

      <div style={s.sectionDivider}>Business details <span style={s.optional}>(optional)</span></div>

      <Field label="GSTIN" value={form.gstin} onChange={set('gstin')} placeholder="22AAAAA0000A1Z5" />
      <Field label="Address" value={form.address} onChange={set('address')} placeholder="Street / locality" />
      <div style={s.row}>
        <Field label="City"    value={form.city}    onChange={set('city')}    placeholder="Chennai" />
        <Field label="State"   value={form.state}   onChange={set('state')}   placeholder="Tamil Nadu" />
        <Field label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="600001" />
      </div>

      <button type="submit" style={s.submitBtn} disabled={loading}>
        {loading ? 'Creating account…' : 'Create account'}
      </button>

      <div style={s.switchRow}>
        <span style={s.switchText}>Already have an account?</span>
        <button type="button" onClick={onSwitch} style={s.linkBtn}>Sign in</button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SupplyLogin() {
  const [panel, setPanel] = useState('login'); // 'login' | 'register'

  return (
    <div style={s.page}>
      <div style={s.card}>
        {panel === 'login'
          ? <LoginPanel    onSwitch={() => setPanel('register')} />
          : <RegisterPanel onSwitch={() => setPanel('login')} />
        }
      </div>

      {/* Subtle brand footer */}
      <p style={s.footer}>Munafe Supply · autom8 works</p>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page: {
    minHeight:       '100vh',
    background:      'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)',
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         '24px 16px',
    fontFamily:      "'Inter', system-ui, sans-serif",
  },
  card: {
    width:        '100%',
    maxWidth:     520,
    background:   '#ffffff',
    borderRadius: 16,
    boxShadow:    '0 24px 64px rgba(0,0,0,0.35)',
    overflow:     'hidden',
  },
  form: {
    padding: '40px 40px 32px',
  },
  formHeader: {
    textAlign:    'center',
    marginBottom: 28,
  },
  logoMark: {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          48,
    height:         48,
    borderRadius:   12,
    background:     '#0ea5e9',
    color:          '#fff',
    fontSize:       22,
    fontWeight:     800,
    marginBottom:   12,
    letterSpacing:  '-0.5px',
  },
  title: {
    margin:      '0 0 4px',
    fontSize:    24,
    fontWeight:  700,
    color:       '#0f172a',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    margin:    0,
    fontSize:  14,
    color:     '#64748b',
  },
  errorBox: {
    background:   '#fef2f2',
    border:       '1px solid #fecaca',
    borderRadius: 8,
    color:        '#b91c1c',
    fontSize:     13,
    padding:      '10px 14px',
    marginBottom: 16,
  },
  field: {
    display:      'flex',
    flexDirection:'column',
    gap:          4,
    marginBottom: 14,
    flex:         1,
  },
  label: {
    fontSize:   12,
    fontWeight: 600,
    color:      '#374151',
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
  },
  req: {
    color: '#ef4444',
  },
  input: {
    padding:      '10px 12px',
    border:       '1.5px solid #e2e8f0',
    borderRadius: 8,
    fontSize:     14,
    color:        '#0f172a',
    background:   '#f8fafc',
    outline:      'none',
    width:        '100%',
    boxSizing:    'border-box',
    transition:   'border-color 0.15s',
  },
  row: {
    display: 'flex',
    gap:     12,
  },
  sectionDivider: {
    fontSize:     11,
    fontWeight:   700,
    color:        '#94a3b8',
    textTransform:'uppercase',
    letterSpacing:'0.8px',
    borderTop:    '1px solid #f1f5f9',
    paddingTop:   16,
    marginBottom: 14,
    marginTop:    4,
  },
  optional: {
    fontWeight: 400,
    textTransform: 'none',
    letterSpacing: 0,
  },
  submitBtn: {
    width:        '100%',
    padding:      '13px 0',
    background:   '#0ea5e9',
    color:        '#fff',
    border:       'none',
    borderRadius: 10,
    fontSize:     15,
    fontWeight:   700,
    cursor:       'pointer',
    marginTop:    8,
    marginBottom: 16,
    letterSpacing:'-0.2px',
    transition:   'background 0.15s',
  },
  switchRow: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            6,
  },
  switchText: {
    fontSize: 13,
    color:    '#64748b',
  },
  linkBtn: {
    background:  'none',
    border:      'none',
    color:       '#0ea5e9',
    fontSize:    13,
    fontWeight:  600,
    cursor:      'pointer',
    padding:     0,
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  },
  successIcon: {
    display:        'inline-flex',
    alignItems:     'center',
    justifyContent: 'center',
    width:          56,
    height:         56,
    borderRadius:   '50%',
    background:     '#dcfce7',
    color:          '#16a34a',
    fontSize:       26,
    marginBottom:   16,
  },
  footer: {
    marginTop: 20,
    fontSize:  12,
    color:     'rgba(255,255,255,0.3)',
    letterSpacing: '0.3px',
  },
};
