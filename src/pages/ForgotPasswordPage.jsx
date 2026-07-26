import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { C, FONTS } from '../theme/brand';

/**
 * Forgot password — email reset link (default) or WhatsApp OTP alternative.
 * OTP verify returns Supabase recovery token_hash → ResetPasswordPage.
 */
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { requestPasswordReset, requestWhatsAppOtp, verifyWhatsAppOtp, supabaseClient } = useAuth();

  const [mode, setMode] = useState('email'); // 'email' | 'whatsapp' | 'whatsapp_code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState(null);

  const handleEmailSubmit = async (e) => {
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

  const handleWhatsAppRequest = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await requestWhatsAppOtp(email, 'password_reset');
      setMaskedPhone(data?.masked_phone || null);
      setMode('whatsapp_code');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsAppVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await verifyWhatsAppOtp(email, code, 'password_reset');
      const tokenHash = data?.token_hash;
      if (!tokenHash) {
        throw new Error('Could not start password reset. Try the email link instead.');
      }

      const { error: otpErr } = await supabaseClient.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });
      if (otpErr) throw new Error(otpErr.message || 'Invalid or expired code');

      navigate('/reset-password', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === 'whatsapp_code' ? 'Enter WhatsApp code'
      : mode === 'whatsapp' ? 'Reset via WhatsApp'
        : 'Reset your password';

  const subtitle =
    mode === 'whatsapp_code'
      ? (maskedPhone
        ? `We sent a 6-digit code to the WhatsApp number ${maskedPhone}. Valid for 10 minutes.`
        : 'Enter the 6-digit code we sent on WhatsApp. Valid for 10 minutes.')
      : mode === 'whatsapp'
        ? 'We will text a code to the WhatsApp number on your owner/staff account.'
        : "Enter your login email and we'll send a reset link.";

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, fontFamily: FONTS.body,
      background: `linear-gradient(160deg, ${C.emeraldDark} 0%, ${C.emerald} 55%, #0A2E27 100%)`,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{ fontFamily: FONTS.heading, fontSize: 24, fontWeight: 600, color: '#fff', margin: 0 }}>
            {title}
          </h1>
          <p style={{ fontSize: 13, color: '#BFE0D6', margin: '6px 0 0' }}>
            {subtitle}
          </p>
        </div>

        <div style={{ background: C.cardBg, borderRadius: 16, padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
          {error && (
            <div style={{ marginBottom: 20, padding: '12px 14px', background: C.dangerLight, border: `0.5px solid ${C.dangerBorder}`, borderRadius: 10 }}>
              <p style={{ fontSize: 13, color: C.dangerDark, margin: 0, fontWeight: 500 }}>{error}</p>
            </div>
          )}

          {sent && mode === 'email' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 20, padding: 16, background: C.successLight, border: `0.5px solid ${C.successBorder}`, borderRadius: 10 }}>
                <p style={{ fontSize: 13, color: C.successDark, margin: 0, lineHeight: 1.6 }}>
                  If an account exists for <strong>{email}</strong>, a password reset link has been sent.
                  Check your inbox and spam folder. If nothing arrives, use WhatsApp OTP below.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSent(false); setMode('whatsapp'); setError(''); }}
                style={{
                  display: 'block', width: '100%', marginBottom: 12, padding: '11px',
                  borderRadius: 10, border: `1px solid ${C.emerald}`, background: 'transparent',
                  color: C.emerald, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Get a code on WhatsApp instead
              </button>
              <Link to="/login" style={{ fontSize: 13, color: C.primary, fontWeight: 500, textDecoration: 'none' }}>
                ← Back to sign in
              </Link>
            </div>
          ) : mode === 'whatsapp_code' ? (
            <form onSubmit={handleWhatsAppVerify} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="otp" style={{ fontSize: 12, fontWeight: 600, color: C.textSub, marginBottom: 6, display: 'block' }}>
                  Verification code
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  required
                  maxLength={8}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  style={{ width: '100%', padding: '11px 14px', borderRadius: 10, boxSizing: 'border-box', border: '1px solid #E5E2D8', fontSize: 18, letterSpacing: 4, outline: 'none', textAlign: 'center' }}
                />
              </div>
              <button type="submit" disabled={loading || code.length < 6} style={{
                width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                background: loading ? C.textMuted : C.emerald, color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
              }}>
                {loading ? 'Verifying…' : 'Verify and set new password'}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleWhatsAppRequest}
                style={{
                  background: 'none', border: 'none', color: C.primary, fontSize: 12,
                  cursor: 'pointer', padding: 0, fontWeight: 500,
                }}
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => { setMode('email'); setCode(''); setError(''); }}
                style={{
                  background: 'none', border: 'none', color: C.textMuted, fontSize: 12,
                  cursor: 'pointer', padding: 0,
                }}
              >
                Use email reset link instead
              </button>
            </form>
          ) : mode === 'whatsapp' ? (
            <form onSubmit={handleWhatsAppRequest} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="email-wa" style={{ fontSize: 12, fontWeight: 600, color: C.textSub, marginBottom: 6, display: 'block' }}>
                  Email address
                </label>
                <input
                  id="email-wa" type="email" value={email} required
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
                {loading ? 'Sending…' : 'Send WhatsApp code'}
              </button>
              <button
                type="button"
                onClick={() => { setMode('email'); setError(''); }}
                style={{
                  background: 'none', border: 'none', color: C.textMuted, fontSize: 12,
                  cursor: 'pointer', padding: 0,
                }}
              >
                Use email reset link instead
              </button>
              <Link to="/login" style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', textDecoration: 'none' }}>
                Back to sign in
              </Link>
            </form>
          ) : (
            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              <button
                type="button"
                onClick={() => { setMode('whatsapp'); setError(''); setSent(false); }}
                style={{
                  width: '100%', padding: '11px', borderRadius: 10,
                  border: `1px solid ${C.emerald}`, background: 'transparent',
                  color: C.emerald, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Get a code on WhatsApp instead
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
