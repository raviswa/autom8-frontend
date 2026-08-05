import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { C, FONTS } from '../theme/brand';

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10, boxSizing: 'border-box',
  border: '1px solid #E5E2D8', fontSize: 14, outline: 'none', color: '#161512',
};

export default function SignupPage() {
  const navigate = useNavigate();
  const { registerOwner, error } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await registerOwner({ email, password, full_name: fullName });
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setLocalError(err.message || 'Could not create account');
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
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: C.gold,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontFamily: FONTS.heading, fontWeight: 600,
            fontSize: 22, color: C.emeraldDark,
          }}>M</div>
          <h1 style={{ fontFamily: FONTS.heading, fontSize: 28, fontWeight: 600, color: '#fff', margin: 0 }}>
            Create your account
          </h1>
          <p style={{ fontSize: 14, color: '#BFE0D6', margin: '6px 0 0' }}>
            Email first — set up your store after you sign in
          </p>
        </div>

        <div style={{ background: C.cardBg, borderRadius: 16, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
          {(error || localError) && (
            <div style={{ marginBottom: 16, padding: '12px 14px', background: C.dangerLight, border: `0.5px solid ${C.dangerBorder}`, borderRadius: 10 }}>
              <p style={{ fontSize: 13, color: C.dangerDark, margin: 0 }}>{error || localError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.textSub, display: 'block', marginBottom: 6 }}>Full name</label>
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.textSub, display: 'block', marginBottom: 6 }}>Email</label>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.textSub, display: 'block', marginBottom: 6 }}>Password</label>
              <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} minLength={8} />
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px', borderRadius: 10, border: 'none', marginTop: 6,
              background: loading ? C.textMuted : C.emerald, color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            }}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p style={{ marginTop: 22, textAlign: 'center', fontSize: 13, color: C.textMuted }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: C.primary, fontWeight: 600, textDecoration: 'none' }}>Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
