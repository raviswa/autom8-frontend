import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { C } from '../theme/brand';

const CATEGORIES = [
  { id: 'catalog_sync', label: 'Catalog / menu sync' },
  { id: 'payment_failure', label: 'Payment failure' },
  { id: 'kds_printer', label: 'KDS / printer' },
  { id: 'subscription_billing', label: 'Subscription / billing' },
  { id: 'menu_setup', label: 'Menu setup' },
  { id: 'other', label: 'Other' },
];

const chipStyle = {
  fontSize: 12,
  fontWeight: 500,
  padding: '6px 12px',
  borderRadius: 8,
  border: '0.5px solid rgba(255,255,255,0.35)',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

/**
 * Support ticket chip for BrandHeader right slot.
 * Posts to autom8-support (VITE_SUPPORT_API_URL), not autom8-backend.
 */
export default function SupportChip() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('other');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const supportBase = String(import.meta.env.VITE_SUPPORT_API_URL || '').replace(/\/$/, '');

  const restaurantId = user?.restaurant_id
    || user?.outlets?.[0]?.id
    || null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!supportBase) {
      setError('Support API is not configured (VITE_SUPPORT_API_URL).');
      return;
    }
    if (!message.trim()) {
      setError('Please describe the issue.');
      return;
    }
    if (!restaurantId) {
      setError('No outlet linked to this account.');
      return;
    }
    setBusy(true);
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${supportBase}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-restaurant-id': restaurantId,
        },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          message: message.trim(),
          category,
          source: 'dashboard',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setResult({
        resolution: data.ticket?.resolution_type,
        text: data.confirmation || data.ticket?.ai_response
          || "We've got it — you'll hear back shortly.",
      });
      setMessage('');
    } catch (err) {
      setError(err.message || 'Could not submit ticket');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" style={chipStyle} onClick={() => { setOpen(true); setResult(null); setError(''); }}>
        Support
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={(ev) => { if (ev.target === ev.currentTarget) setOpen(false); }}
        >
          <div style={{
            width: '100%', maxWidth: 420, background: C.cardBg || '#fff',
            borderRadius: 14, padding: 20, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 15, color: C.text || '#111' }}>Contact support</strong>
              <button type="button" onClick={() => setOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>

            {result ? (
              <div>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: C.text || '#111', margin: '0 0 14px' }}>
                  {result.text}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    ...chipStyle,
                    background: C.primary || '#0f6b5c',
                    border: 'none',
                    width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <label style={{ fontSize: 12, color: C.textMuted || '#888', display: 'block', marginBottom: 4 }}>Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    width: '100%', marginBottom: 12, padding: '8px 10px',
                    borderRadius: 8, border: `1px solid ${C.border || '#e8e8e5'}`, fontSize: 13,
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>

                <label style={{ fontSize: 12, color: C.textMuted || '#888', display: 'block', marginBottom: 4 }}>How can we help?</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Describe the issue…"
                  style={{
                    width: '100%', marginBottom: 10, padding: '8px 10px',
                    borderRadius: 8, border: `1px solid ${C.border || '#e8e8e5'}`,
                    fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
                  }}
                />

                {error && (
                  <div style={{ fontSize: 12, color: C.danger || '#a32d2d', marginBottom: 10 }}>{error}</div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    ...chipStyle,
                    background: C.primary || '#0f6b5c',
                    border: 'none',
                    width: '100%',
                    justifyContent: 'center',
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  {busy ? 'Sending…' : 'Submit ticket'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
