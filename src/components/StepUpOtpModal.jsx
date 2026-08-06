// Step-up WhatsApp OTP modal — returns a purpose-bound step_up_token.
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { C, FONTS } from '../theme/brand';

const PURPOSE_COPY = {
  delete_account: 'Confirm with a WhatsApp code before deleting your account.',
  whatsapp_bind: 'Confirm with a WhatsApp code before connecting or changing WhatsApp.',
  instagram_bind: 'Confirm with a WhatsApp code before saving or exchanging the Instagram publish token.',
  change_owner_phone_old: 'We will send a code to your current personal WhatsApp.',
  change_owner_phone_new: 'We will send a code to the new WhatsApp number.',
  change_owner_email: 'Confirm with a WhatsApp code before changing the owner login email.',
  change_manager_phone: 'Confirm with a WhatsApp code before changing the manager alert phone.',
  staff_terminate: 'Confirm with a WhatsApp code before removing this team member.',
  staff_elevate: 'Confirm with a WhatsApp code before promoting this person.',
  staff_password_reset: 'Confirm with a WhatsApp code before sending a password reset.',
};

/**
 * Imperative helper: open step-up OTP, resolve with token string or null if cancelled.
 * Usage: const token = await requestStepUpToken({ purpose, phone?, title? });
 */
let _openStepUp = null;

export function registerStepUpOpener(fn) {
  _openStepUp = fn;
  return () => { if (_openStepUp === fn) _openStepUp = null; };
}

export function requestStepUpToken(opts) {
  if (!_openStepUp) {
    return Promise.reject(new Error('Step-up OTP UI is not mounted'));
  }
  return _openStepUp(opts);
}

/** Dual old→new phone challenge for owner personal phone change. */
export async function requestOwnerPhoneStepUpTokens(newPhone) {
  const oldTok = await requestStepUpToken({
    purpose: 'change_owner_phone_old',
    title: 'Verify current phone',
  });
  if (!oldTok) return null;
  const newTok = await requestStepUpToken({
    purpose: 'change_owner_phone_new',
    phone: newPhone,
    title: 'Verify new phone',
  });
  if (!newTok) return null;
  return { old: oldTok, new: newTok };
}

export function stepUpHeaders(token) {
  return token ? { 'X-Step-Up-Token': token } : {};
}

export function stepUpDualHeaders(oldTok, newTok) {
  return {
    'X-Step-Up-Token-Old': oldTok,
    'X-Step-Up-Token-New': newTok,
  };
}

/** Mount once near app root or inside Settings/Account trees. */
export function StepUpOtpHost() {
  const { requestStepUpOtp, verifyStepUpOtp } = useAuth();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState(null);
  const [resolver, setResolver] = useState(null);
  const [code, setCode] = useState('');
  const [masked, setMasked] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return registerStepUpOpener(({ purpose, phone, title } = {}) => new Promise((resolve) => {
      setOpts({ purpose, phone, title });
      setCode('');
      setMasked(null);
      setSent(false);
      setError('');
      setBusy(false);
      setResolver(() => resolve);
      setOpen(true);
    }));
  }, []);

  const close = (token) => {
    setOpen(false);
    const r = resolver;
    setResolver(null);
    if (r) r(token || null);
  };

  const send = async () => {
    if (!opts?.purpose) return;
    setBusy(true);
    setError('');
    try {
      const res = await requestStepUpOtp(opts.purpose, opts.phone || undefined);
      setMasked(res.masked_phone || null);
      setSent(true);
    } catch (e) {
      setError(e.message || 'Could not send code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!opts?.purpose || code.trim().length < 4) return;
    setBusy(true);
    setError('');
    try {
      const res = await verifyStepUpOtp(opts.purpose, code.trim(), opts.phone || undefined);
      close(res.step_up_token);
    } catch (e) {
      setError(e.message || 'Invalid code');
      setBusy(false);
    }
  };

  if (!open || !opts) return null;

  const copy = PURPOSE_COPY[opts.purpose] || 'Confirm this action with a WhatsApp verification code.';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(22,21,18,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: FONTS.body,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) close(null); }}
    >
      <div
        style={{
          width: '100%', maxWidth: 400, background: C.cardBg,
          borderRadius: 14, border: `0.5px solid ${C.border}`, padding: 22,
        }}
      >
        <h2 style={{
          margin: 0, fontFamily: FONTS.heading, fontSize: 18,
          color: C.text, fontWeight: 600,
        }}>
          {opts.title || 'WhatsApp verification'}
        </h2>
        <p style={{ margin: '8px 0 14px', fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
          {copy}
        </p>
        {masked && (
          <p style={{ margin: '0 0 12px', fontSize: 12, color: C.primaryDark }}>
            Code sent to {masked}
          </p>
        )}
        {!sent ? (
          <button
            type="button"
            disabled={busy}
            onClick={send}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none',
              background: C.primary, color: '#fff', fontWeight: 600, fontSize: 13,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Sending…' : 'Send WhatsApp code'}
          </button>
        ) : (
          <>
            <label style={{ fontSize: 12, color: C.textMuted, display: 'block', marginBottom: 6 }}>
              6-digit code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 16,
                letterSpacing: 4, fontFamily: FONTS.mono, marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={busy || code.length < 6}
                onClick={verify}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
                  background: C.primary, color: '#fff', fontWeight: 600, fontSize: 13,
                  cursor: busy || code.length < 6 ? 'not-allowed' : 'pointer',
                  opacity: busy || code.length < 6 ? 0.6 : 1,
                }}
              >
                {busy ? 'Verifying…' : 'Verify'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={send}
                style={{
                  padding: '10px 12px', borderRadius: 8,
                  border: `0.5px solid ${C.border}`, background: C.cardBg,
                  color: C.textMuted, fontSize: 12, cursor: 'pointer',
                }}
              >
                Resend
              </button>
            </div>
          </>
        )}
        {error && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: C.dangerDark }}>{error}</p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => close(null)}
          style={{
            marginTop: 14, width: '100%', padding: '8px', border: 'none',
            background: 'transparent', color: C.textMuted, fontSize: 12, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default StepUpOtpHost;
