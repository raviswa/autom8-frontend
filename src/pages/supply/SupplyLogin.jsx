// ============================================================================
// Munafe Supply — Login / Register (aligned to Autom8 LoginPage brand)
// Route: /supply/login
// ============================================================================

import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { resolveSupplyApiBase } from '../../config/api';
import { C, FONTS } from '../../theme/brand';

const API = resolveSupplyApiBase();

async function apiFetch(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 10,
  boxSizing: 'border-box',
  border: `1px solid ${C.border}`,
  fontSize: 14,
  outline: 'none',
  color: C.text,
  fontFamily: FONTS.body,
  background: C.cardBg,
  transition: 'border-color .15s',
};

function Spinner() {
  return (
    <>
      <span style={{
        width: 15, height: 15, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
        display: 'inline-block', animation: 'spin .7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder, required, autoComplete, id }) {
  const fieldId = id || label.replace(/\s+/g, '-').toLowerCase();
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label htmlFor={fieldId} style={{ fontSize: 12, fontWeight: 600, color: C.textSub, marginBottom: 6, display: 'block' }}>
        {label}{required ? ' *' : ''}
      </label>
      <input
        id={fieldId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        style={inputStyle}
      />
    </div>
  );
}

function BrandHero({ title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14, background: C.gold,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px', fontFamily: FONTS.heading, fontWeight: 600,
        fontSize: 22, color: C.emeraldDark,
      }}>
        M
      </div>
      <h1 style={{ fontFamily: FONTS.heading, fontSize: 26, fontWeight: 600, color: '#fff', margin: 0 }}>
        {title}
      </h1>
      <p style={{ fontSize: 14, color: '#BFE0D6', margin: '4px 0 0' }}>{subtitle}</p>
    </div>
  );
}

function Alert({ kind = 'error', children }) {
  const styles = kind === 'success'
    ? { bg: C.successLight, border: C.successBorder, color: C.successDark }
    : { bg: C.dangerLight, border: C.dangerBorder, color: C.dangerDark };
  return (
    <div style={{
      marginBottom: 16, padding: '12px 14px',
      background: styles.bg, border: `0.5px solid ${styles.border}`, borderRadius: 10,
    }}>
      <p style={{ fontSize: 13, color: styles.color, margin: 0, fontWeight: 500 }}>{children}</p>
    </div>
  );
}

function LoginPanel({ onSwitch }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info] = useState(location.state?.message || '');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
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
    <>
      <BrandHero title="Munafe Supply" subtitle="Supplier portal · by autom8.works" />
      <div style={cardStyle}>
        {info && !error && <Alert kind="success">{info}</Alert>}
        {error && <Alert>{error}</Alert>}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field
            label="Email address"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@business.com"
            required
            autoComplete="username"
            id="supply-email"
          />
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label htmlFor="supply-password" style={{ fontSize: 12, fontWeight: 600, color: C.textSub }}>
                Password
              </label>
              <Link
                to="/supply/forgot-password"
                style={{ fontSize: 12, color: C.primary, textDecoration: 'none', fontWeight: 500 }}
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="supply-password"
              type="password"
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              style={inputStyle}
            />
          </div>

          <button type="submit" disabled={loading} style={submitBtn(loading)}>
            {loading ? (<><Spinner /> Signing in…</>) : 'Sign in'}
          </button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: `0.5px solid ${C.border}`, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
            New supplier?{' '}
            <button type="button" onClick={onSwitch} style={textLink}>
              Create account
            </button>
          </p>
        </div>
      </div>
    </>
  );
}

const EMPTY_REG = {
  name: '', business_name: '', email: '', phone: '',
  password: '', confirm: '',
  gstin: '', address: '', city: '', state: '', pincode: '',
};

function RegisterPanel({ onSwitch }) {
  const [form, setForm] = useState(EMPTY_REG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(form.gstin)) {
      setError('GSTIN format is invalid (15-character alphanumeric)');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/supply/auth/register', {
        name: form.name,
        business_name: form.business_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        gstin: form.gstin || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        pincode: form.pincode || undefined,
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
      <>
        <BrandHero title="Account created" subtitle="You can sign in with your email and password" />
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
            background: C.successLight, color: C.successDark,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 700,
          }}>
            ✓
          </div>
          <button type="button" style={submitBtn(false)} onClick={onSwitch}>
            Go to sign in
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <BrandHero title="Create account" subtitle="Register as a Munafe Supply partner" />
      <div style={{ ...cardStyle, maxWidth: 520 }}>
        {error && <Alert>{error}</Alert>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={row}>
            <Field label="Contact name" value={form.name} onChange={set('name')} placeholder="Ravi Kumar" required />
            <Field label="Business name" value={form.business_name} onChange={set('business_name')} placeholder="Fresh Produce Co" required />
          </div>
          <div style={row}>
            <Field label="Email" type="email" value={form.email} onChange={set('email')} placeholder="you@business.com" required autoComplete="username" />
            <Field label="WhatsApp phone" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" required />
          </div>
          <div style={row}>
            <Field label="Password" type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters" required autoComplete="new-password" />
            <Field label="Confirm password" type="password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" required autoComplete="new-password" />
          </div>

          <p style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '8px 0 0' }}>
            Business details (optional)
          </p>
          <Field label="GSTIN" value={form.gstin} onChange={set('gstin')} placeholder="22AAAAA0000A1Z5" />
          <Field label="Address" value={form.address} onChange={set('address')} placeholder="Street / locality" />
          <div style={row}>
            <Field label="City" value={form.city} onChange={set('city')} placeholder="Chennai" />
            <Field label="State" value={form.state} onChange={set('state')} placeholder="Tamil Nadu" />
            <Field label="Pincode" value={form.pincode} onChange={set('pincode')} placeholder="600001" />
          </div>

          <button type="submit" disabled={loading} style={submitBtn(loading)}>
            {loading ? (<><Spinner /> Creating account…</>) : 'Create account'}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `0.5px solid ${C.border}`, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
            Already have an account?{' '}
            <button type="button" onClick={onSwitch} style={textLink}>Sign in</button>
          </p>
        </div>
      </div>
    </>
  );
}

export default function SupplyLogin() {
  const [panel, setPanel] = useState('login');

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      fontFamily: FONTS.body,
      background: `linear-gradient(160deg, ${C.emeraldDark} 0%, ${C.emerald} 55%, #0A2E27 100%)`,
    }}>
      <div style={{ width: '100%', maxWidth: panel === 'register' ? 520 : 400 }}>
        {panel === 'login'
          ? <LoginPanel onSwitch={() => setPanel('register')} />
          : <RegisterPanel onSwitch={() => setPanel('login')} />}
        <p style={{ textAlign: 'center', fontSize: 11, color: '#8FBFB2', marginTop: 20 }}>
          © 2026 Munafe Supply · autom8.works
        </p>
      </div>
    </div>
  );
}

const cardStyle = {
  background: C.cardBg,
  borderRadius: 16,
  padding: 32,
  boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
};

const row = { display: 'flex', gap: 12, flexWrap: 'wrap' };

const textLink = {
  background: 'none',
  border: 'none',
  color: C.primary,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
  fontFamily: FONTS.body,
};

function submitBtn(loading) {
  return {
    width: '100%',
    padding: '13px',
    borderRadius: 10,
    border: 'none',
    background: loading ? C.textMuted : C.emerald,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: loading ? 'default' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    fontFamily: FONTS.body,
  };
}
