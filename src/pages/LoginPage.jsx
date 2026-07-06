import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { C, FONTS } from '../theme/brand';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithEmail, error } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const successMessage = location.state?.message;

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLoading(true);
    try {
      const user = await loginWithEmail(email, password);
      const roleRoutes = {
        owner: '/dashboard/owner',
        brand_owner: '/dashboard/brand',
        brand_manager: '/dashboard/brand',
        manager: '/dashboard/manager',
        kitchen_staff: '/dashboard/kitchen',
        marketing: '/dashboard/marketing',
        captain: '/dashboard/captain',
        waiter: '/dashboard/kitchen',
      };
      navigate(roleRoutes[user.role] || '/');
    } catch (err) {
      setLocalError(err.message);
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

        {/* Logo + wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: C.gold,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontFamily: FONTS.heading, fontWeight: 600,
            fontSize: 22, color: C.emeraldDark,
          }}>M</div>
          <h1 style={{ fontFamily: FONTS.heading, fontSize: 28, fontWeight: 600, color: '#fff', margin: 0 }}>
            Munafe
          </h1>
          <p style={{ fontSize: 14, color: '#BFE0D6', margin: '4px 0 0' }}>by autom8.works</p>
        </div>

        {/* Card */}
        <div style={{ background: C.cardBg, borderRadius: 16, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
          {successMessage && (
            <div style={{ marginBottom: 20, padding: '12px 14px', background: C.successLight, border: `0.5px solid ${C.successBorder}`, borderRadius: 10 }}>
              <p style={{ fontSize: 13, color: C.successDark, margin: 0, fontWeight: 500 }}>{successMessage}</p>
            </div>
          )}
          {(error || localError) && (
            <div style={{ marginBottom: 20, padding: '12px 14px', background: C.dangerLight, border: `0.5px solid ${C.dangerBorder}`, borderRadius: 10 }}>
              <p style={{ fontSize: 13, color: C.dangerDark, margin: 0, fontWeight: 500 }}>{error || localError}</p>
            </div>
          )}

          <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="email" style={{ fontSize: 12, fontWeight: 600, color: C.textSub, marginBottom: 6, display: 'block' }}>
                Email address
              </label>
              <input
                id="email" type="email" value={email} required
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label htmlFor="password" style={{ fontSize: 12, fontWeight: 600, color: C.textSub }}>Password</label>
                <Link to="/forgot-password" style={{ fontSize: 12, color: C.primary, textDecoration: 'none', fontWeight: 500 }}>
                  Forgot password?
                </Link>
              </div>
              <input
                id="password" type="password" value={password} required
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                style={inputStyle}
              />
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px', borderRadius: 10, border: 'none',
              background: loading ? C.textMuted : C.emerald, color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background .15s', marginTop: 4,
            }}>
              {loading ? (<><Spinner /> Signing in…</>) : 'Sign in'}
            </button>
          </form>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: `0.5px solid ${C.border}`, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: C.textMuted, margin: 0, lineHeight: 1.6 }}>
              Need access? Ask your restaurant administrator or use forgot password above.
            </p>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#8FBFB2', marginTop: 20 }}>
          © 2026 Munafe · autom8.works
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10, boxSizing: 'border-box',
  border: '1px solid #E5E2D8', fontSize: 14, outline: 'none', color: '#161512',
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
