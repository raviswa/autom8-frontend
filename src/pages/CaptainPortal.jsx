// src/pages/CaptainPortal.jsx 
// ============================================================================
// Captain / Steward portal — Takeaway QR fulfillment.
// The captain scans the customer's QR code to mark their takeaway order
// as collected. Calls POST /api/v1/takeaway/scan.
//
// Two input modes:
//   1. Camera scan — uses BarcodeDetector API (Chrome/Android)
//   2. Manual entry — large input that accepts keyboard/scanner wedge input
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import BrandHeader from '../components/BrandHeader';
import { C } from '../theme/brand';

const CARD = {
  background: C.cardBg,
  border: `0.5px solid ${C.border}`,
  borderRadius: 14,
  padding: '20px 24px',
};

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

// ── Result display ────────────────────────────────────────────────────────────
function ScanResult({ result, onDismiss }) {
  if (!result) return null;

  const isSuccess  = result.code === 'COLLECTED';
  const isWarn     = result.code === 'ALREADY_COLLECTED';
  const isError    = result.code === 'ORDER_NOT_FOUND' || result.code === 'SECTION_NOT_IN_ORDER' || result.code === 'LOCK_CONTENTION';

  const bgColor = isSuccess ? 'rgba(29,158,117,.08)' : isWarn ? 'rgba(186,117,23,.08)' : 'rgba(163,45,45,.08)';
  const bdColor = isSuccess ? C.success : isWarn ? C.warning : C.danger;
  const icon    = isSuccess ? '✅' : isWarn ? '⚠️' : '❌';

  return (
    <div style={{ border: `1.5px solid ${bdColor}`, background: bgColor, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px', color: C.text }}>
          {icon} {isSuccess ? 'Order collected!' : isWarn ? 'Already collected' : result.message ?? 'Error'}
        </p>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.textMuted }}>×</button>
      </div>

      {isSuccess && result.order && (
        <div style={{ fontSize: 13, color: C.text, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <span><span style={{ color: C.textMuted }}>Order</span> <strong>{result.order.order_number}</strong></span>
          <span><span style={{ color: C.textMuted }}>Total</span> <strong>₹{result.order.total_amount}</strong></span>
          <span><span style={{ color: C.textMuted }}>At</span> <strong>{fmtTime(result.order.collected_at)}</strong></span>
        </div>
      )}

      {isSuccess && result.group && (
        <div style={{ fontSize: 13, color: C.text, marginTop: 6 }}>
          <strong>{result.group.section_name}</strong> section collected ({result.group.item_count} item{result.group.item_count !== 1 ? 's' : ''})
          {!result.order_complete && result.other_sections?.some(s => s.status === 'pending') && (
            <div style={{ marginTop: 6, fontSize: 12, color: C.warning }}>
              Pending sections: {result.other_sections.filter(s => s.status === 'pending').map(s => s.section_name).join(', ')}
            </div>
          )}
        </div>
      )}

      {isWarn && result.alert && (
        <div style={{ fontSize: 13, color: C.text, marginTop: 6 }}>
          Collected {result.alert.time_ago} ago by {result.alert.collected_by ?? 'staff'} at counter {result.alert.collected_counter ?? '—'}.
        </div>
      )}
    </div>
  );
}

// ── Camera scanner ────────────────────────────────────────────────────────────
function CameraScanner({ onDetect }) {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);
  const [error, setError] = useState(null);

  const supported = typeof BarcodeDetector !== 'undefined';

  useEffect(() => {
    if (!supported) return;
    let detector;
    async function start() {
      try {
        detector = new BarcodeDetector({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        scan();
      } catch (err) {
        setError(err.message);
      }
    }

    async function scan() {
      if (!videoRef.current || !detector) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          onDetect(codes[0].rawValue);
          return; // parent will call dismiss which unmounts this
        }
      } catch (_) {}
      rafRef.current = requestAnimationFrame(scan);
    }

    start();
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  if (!supported) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {error ? (
        <p style={{ fontSize: 13, color: C.danger }}>{error}</p>
      ) : (
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'cover' }} />
          {/* Targeting overlay */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ width: 180, height: 180, border: `2px solid ${C.primary}`, borderRadius: 12, boxShadow: '0 0 0 2000px rgba(0,0,0,.35)' }} />
          </div>
          <p style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', fontSize: 12, color: '#ccc', margin: 0 }}>
            Point camera at customer's QR code
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main CaptainPortal ────────────────────────────────────────────────────────
export default function CaptainPortal() {
  const { user, logout, apiClient } = useAuth();

  const [inputVal,  setInputVal]  = useState('');
  const [scanning,  setScanning]  = useState(false);
  const [useCamera, setUseCamera] = useState(false);
  const [result,    setResult]    = useState(null);
  const [history,   setHistory]   = useState([]); // last 10 scans
  const inputRef = useRef(null);
  const scanLock = useRef(false);

  const restaurantId = user?.restaurant_id;

  const processToken = useCallback(async (raw) => {
    const token = raw.trim();
    if (!token || scanLock.current) return;

    scanLock.current = true;
    setScanning(true);
    setResult(null);
    setInputVal('');

    try {
      const { data } = await apiClient.post('/api/v1/takeaway/scan', {
        qr_token:      token,
        restaurant_id: restaurantId,
        staff_id:      user?.id,
        counter_id:    user?.full_name ?? 'Captain',
      });

      setResult(data);
      setUseCamera(false);

      // Add to history
      setHistory(prev => [{
        token,
        code:    data.code,
        order:   data.order?.order_number ?? data.group?.section_name ?? token,
        time:    new Date().toISOString(),
      }, ...prev.slice(0, 9)]);

    } catch (err) {
      setResult({
        code:    'ERROR',
        message: err.response?.data?.error ?? err.message,
      });
    } finally {
      scanLock.current = false;
      setScanning(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [apiClient, restaurantId, user]);

  // Auto-submit on Enter or when input length looks like a scanned QR (>10 chars, no spaces)
  function handleKeyDown(e) {
    if (e.key === 'Enter') processToken(inputVal);
  }

  // Scanner wedge devices fire input rapidly then Enter — auto-submit feels instant
  function handleChange(e) {
    setInputVal(e.target.value);
  }

  const hasCameraApi = typeof BarcodeDetector !== 'undefined';

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg }}>
      <BrandHeader
        title="Captain portal"
        subtitle={user?.full_name || 'Takeaway fulfillment'}
        right={
          <button
            onClick={logout}
            style={{
              fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8,
              border: `0.5px solid ${C.dangerBorder}`, background: C.dangerLight,
              color: C.dangerDark, cursor: 'pointer',
            }}
          >
            Logout
          </button>
        }
      />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>

        {/* Scan result */}
        <ScanResult result={result} onDismiss={() => setResult(null)} />

        {/* Scan input card */}
        <div style={{ ...CARD, marginBottom: 16 }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: C.text }}>Scan Customer QR Code</p>
          <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 16px' }}>
            {useCamera ? 'Point camera at the QR code' : 'Scan with a barcode reader or type the token and press Enter'}
          </p>

          {/* Camera scanner */}
          {useCamera && <CameraScanner onDetect={processToken} />}

          {/* Manual / wedge input */}
          {!useCamera && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                autoFocus
                value={inputVal}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="T-001 or scan QR…"
                disabled={scanning}
                style={{
                  flex: 1, padding: '12px 14px', border: `1.5px solid ${C.primary}`,
                  borderRadius: 10, fontSize: 16, letterSpacing: '.05em',
                  outline: 'none', background: scanning ? C.surfaceBg : C.cardBg,
                }}
              />
              <button
                onClick={() => processToken(inputVal)}
                disabled={scanning || !inputVal.trim()}
                style={{
                  padding: '12px 20px', background: scanning ? C.textMuted : C.primary,
                  color: '#fff', border: 'none', borderRadius: 10, fontSize: 14,
                  fontWeight: 600, cursor: scanning ? 'default' : 'pointer', minWidth: 80,
                }}>
                {scanning ? '…' : '✓ OK'}
              </button>
            </div>
          )}

          {/* Camera toggle */}
          {hasCameraApi && (
            <button
              onClick={() => { setUseCamera(p => !p); setResult(null); }}
              style={{ marginTop: 12, padding: '7px 14px', background: C.surfaceBg, border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer', color: C.textMuted }}>
              {useCamera ? '⌨ Switch to manual entry' : '📷 Use camera scanner'}
            </button>
          )}
        </div>

        {/* Scan history */}
        {history.length > 0 && (
          <div style={CARD}>
            <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px', color: C.text }}>Recent Scans</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < history.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{h.order}</span>
                    <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>{h.token}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: C.textMuted }}>{fmtTime(h.time)}</span>
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 500,
                      background: h.code === 'COLLECTED' ? C.successLight : h.code === 'ALREADY_COLLECTED' ? C.warningLight : C.dangerLight,
                      color: h.code === 'COLLECTED' ? C.successDark : h.code === 'ALREADY_COLLECTED' ? C.warningDark : C.danger,
                    }}>
                      {h.code === 'COLLECTED' ? 'Collected' : h.code === 'ALREADY_COLLECTED' ? 'Duplicate' : 'Error'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {history.length === 0 && !result && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.textMuted }}>
            <p style={{ fontSize: 40, marginBottom: 8 }}>📦</p>
            <p style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 4 }}>Ready to fulfil orders</p>
            <p style={{ fontSize: 13 }}>Scan a customer's takeaway QR code above to mark it as collected.</p>
          </div>
        )}

      </div>
    </div>
  );
}
