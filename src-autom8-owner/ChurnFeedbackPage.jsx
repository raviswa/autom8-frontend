import React, { useEffect, useMemo, useState } from 'react';
import { resolveApiBase } from '../src/config/api';

/**
 * Public page for miss-you email tap-a-reason links.
 * Route: /churn-feedback?token=…&reason=…
 */
export default function ChurnFeedbackPage() {
  const [status, setStatus] = useState('submitting');
  const [message, setMessage] = useState('Recording your feedback…');

  const params = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search);
    } catch {
      return new URLSearchParams();
    }
  }, []);

  useEffect(() => {
    const token = params.get('token');
    const reason = params.get('reason');
    if (!token || !reason) {
      setStatus('error');
      setMessage('This feedback link is missing information.');
      return;
    }

    let base;
    try {
      base = String(resolveApiBase() || '').replace(/\/$/, '') || 'https://api.autom8.works';
    } catch {
      base = 'https://api.autom8.works';
    }

    fetch(`${base}/api/public/churn-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, reason }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setStatus('ok');
        setMessage(data.message || 'Thanks — we recorded your feedback.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Could not record feedback.');
      });
  }, [params]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'DM Sans, system-ui, sans-serif',
      padding: 24,
    }}>
      <div style={{
        maxWidth: 420,
        width: '100%',
        background: '#020617',
        border: '1px solid #1e293b',
        borderRadius: 16,
        padding: 28,
      }}>
        <div style={{ color: '#34d399', fontWeight: 700, marginBottom: 8 }}>Autom8 Works</div>
        <h1 style={{ margin: '0 0 12px', fontSize: 22 }}>
          {status === 'ok' ? 'Thank you' : status === 'error' ? 'Something went wrong' : 'One moment…'}
        </h1>
        <p style={{ color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>{message}</p>
      </div>
    </div>
  );
}
