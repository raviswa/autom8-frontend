// ============================================================================
// SCREEN A — Setup Status / Welcome (post-login activation checklist)
// ============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { loadFacebookSdk, launchWhatsAppEmbeddedSignup } from '../helpers/metaEmbeddedSignup';
import { formatBusinessLabel } from '../config/lobTaxonomy';

function CheckRow({ ok, warn, label, detail, action }) {
  const icon = ok ? '✓' : warn ? '⚠' : '○';
  const color = ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : warn ? 'text-amber-800 bg-amber-50 border-amber-200'
    : 'text-gray-600 bg-gray-50 border-gray-200';
  return (
    <div className={`rounded-xl border px-4 py-3 ${color}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg font-bold w-6 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{label}</div>
          {detail && <div className="text-xs mt-1 opacity-80 leading-relaxed">{detail}</div>}
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

function PathCard({ title, desc, onClick, disabled, primary }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-4 py-3 mb-2 transition ${
        primary
          ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      } disabled:opacity-50`}
    >
      <div className="font-semibold text-sm text-slate-900">{title}</div>
      <div className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</div>
    </button>
  );
}

export default function SetupStatusPage() {
  const { apiClient, user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinMsg, setPinMsg] = useState('');
  const [showWaPaths, setShowWaPaths] = useState(false);
  const [waPath, setWaPath] = useState(null); // 'new' | 'existing' | 'advanced'

  const restaurantId = user?.restaurant_id || user?.outlets?.[0]?.id || 'unknown';
  const seenKey = `autom8_setup_seen_${restaurantId}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/api/onboarding/status');
      setStatus(res.data);
      if (res.data?.setup_complete) {
        try { sessionStorage.setItem(seenKey, '1'); } catch { /* ignore */ }
      }
    } catch (e) {
      const code = e.response?.data?.code;
      setError(
        code === 'tenant_missing'
          ? (e.response?.data?.error || 'Business record missing — contact Autom8 support.')
          : (e.response?.data?.error || e.message || 'Could not load setup status'),
      );
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [apiClient, seenKey]);

  useEffect(() => { load(); }, [load]);

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7380/ingest/982e28a2-86ba-4a90-a485-a232585f9d4f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c76584'},body:JSON.stringify({sessionId:'c76584',runId:'pre-deploy',hypothesisId:'C',location:'SetupStatusPage.jsx',message:'SetupStatusPage mounted (activation checklist)',data:{hasThreePathsUi:true,restaurantId,loading,hasStatus:Boolean(status),setupComplete:status?.setup_complete??null},timestamp:Date.now()})}).catch(()=>{});
  }, [restaurantId, loading, status]);
  // #endregion

  const connectWhatsApp = async (existingPin) => {
    setConnecting(true);
    setError('');
    try {
      const cfgRes = await apiClient.get('/api/whatsapp/embedded-signup/config');
      const cfg = cfgRes.data;
      if (!cfg?.enabled) throw new Error('WhatsApp connect is not enabled on the server yet');
      await loadFacebookSdk(cfg.appId, cfg.graphVersion);
      const session = await launchWhatsAppEmbeddedSignup({
        configId: cfg.configId,
        solutionId: cfg.solutionId || undefined,
      });
      const complete = await apiClient.post('/api/whatsapp/embedded-signup/complete', {
        code: session.code,
        waba_id: session.waba_id,
        phone_number_id: session.phone_number_id,
        display_phone_number: session.display_phone_number || null,
        existing_pin: existingPin || pin || undefined,
      });
      if (complete.data?.whatsapp_needs_existing_pin) {
        setPinMsg('WhatsApp linked — enter the existing 2FA PIN to finish.');
        setWaPath('existing');
      }
      await load();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Connect WhatsApp failed');
    } finally {
      setConnecting(false);
    }
  };

  const submitPin = async () => {
    setPinBusy(true);
    setPinMsg('');
    try {
      await apiClient.post('/api/whatsapp/embedded-signup/register-pin', { pin });
      setPinMsg('PIN accepted — WhatsApp registration finished.');
      setPin('');
      await load();
    } catch (e) {
      setPinMsg(e.response?.data?.error || e.message || 'PIN was rejected');
    } finally {
      setPinBusy(false);
    }
  };

  const goDashboard = (forceDismiss = false) => {
    if (forceDismiss || status?.setup_complete) {
      try { sessionStorage.setItem(seenKey, '1'); } catch { /* ignore */ }
    }
    const role = user?.role;
    if (role === 'brand_owner' || role === 'brand_manager') navigate('/dashboard/brand');
    else navigate('/dashboard/owner');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" />
      </div>
    );
  }

  const sub = status?.subscription || {};
  const needsPin = Boolean(status?.whatsapp_needs_existing_pin);
  const waOk = Boolean(status?.whatsapp_connected) && !needsPin;
  const onlyWaGap = status && !waOk && status?.catalog_uploaded && status?.fulfillment_configured;
  const isPackaged = ['food_products', 'retail', 'psl', 'b2b', 'jewellery'].includes(
    String(status?.lob_type || '').toLowerCase(),
  );
  const businessLabel = status
    ? (status.business_label || formatBusinessLabel({
      business_family: status.business_family,
      business_vertical: status.business_vertical,
      business_vertical_other: status.business_vertical_other,
      lob_type: status.lob_type,
    }))
    : '';
  const fulfillmentDetail = status?.fulfillment_configured
    ? 'At least one service enabled'
    : (status?.fulfillment_hint
      || (isPackaged ? 'Enable pickup or delivery in Settings' : 'Enable dine-in, takeaway, or delivery in Settings'));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="text-sm font-semibold tracking-wide text-emerald-800 uppercase mb-2">Welcome to Munafe</div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {status?.business_name || 'Your business'} activation
          </h1>
          {businessLabel ? (
            <div className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 mt-3 text-xs font-semibold text-emerald-800">
              {businessLabel}
            </div>
          ) : null}
          <p className="text-sm text-slate-500 mt-2">
            Finish these steps so customers can reach you on WhatsApp.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-8">
          <CheckRow
            ok={Boolean(status)}
            warn={!status}
            label="Business details"
            detail={status ? 'Saved at registration' : 'Business record incomplete'}
          />
          <CheckRow
            ok={waOk}
            warn={needsPin || (status?.whatsapp_connected === false)}
            label="WhatsApp connected"
            detail={
              needsPin
                ? 'Needs your existing WhatsApp PIN to finish'
                : status?.whatsapp_connected
                  ? 'Active Meta WhatsApp integration'
                  : 'Not connected yet — choose a connect path below'
            }
            action={
              needsPin ? (
                <div className="space-y-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit PIN"
                    className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={pinBusy || pin.length !== 6}
                    onClick={submitPin}
                    className="w-full bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg"
                  >
                    {pinBusy ? 'Submitting…' : 'Submit PIN'}
                  </button>
                  {pinMsg && <div className="text-xs">{pinMsg}</div>}
                </div>
              ) : !status?.whatsapp_connected ? (
                <div>
                  {!showWaPaths ? (
                    <button
                      type="button"
                      onClick={() => setShowWaPaths(true)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                    >
                      Choose WhatsApp connect path
                    </button>
                  ) : (
                    <div>
                      <PathCard
                        primary
                        title="1. New WhatsApp number"
                        desc="Fresh Cloud API number via Meta Embedded Signup."
                        disabled={connecting}
                        onClick={() => { setWaPath('new'); connectWhatsApp(); }}
                      />
                      <PathCard
                        title="2. Existing WhatsApp number"
                        desc="Migrate a number that already has WhatsApp — you will enter the 2FA PIN after connect."
                        disabled={connecting}
                        onClick={() => { setWaPath('existing'); connectWhatsApp(); }}
                      />
                      <PathCard
                        title="3. Advanced — paste credentials"
                        desc="Manually enter WABA ID, Phone Number ID, and access token in Settings."
                        onClick={() => navigate('/settings?tab=whatsapp&path=advanced')}
                      />
                      {connecting && <div className="text-xs text-slate-500 mt-2">Connecting…</div>}
                      {waPath === 'existing' && pinMsg && <div className="text-xs mt-2">{pinMsg}</div>}
                    </div>
                  )}
                </div>
              ) : (
                <Link to="/settings?tab=whatsapp" className="text-sm font-semibold text-emerald-800 underline">
                  View WhatsApp account status
                </Link>
              )
            }
          />
          <CheckRow
            ok={Boolean(status?.catalog_uploaded)}
            warn={status && !status?.catalog_uploaded}
            label={isPackaged ? 'Product catalog uploaded' : 'Menu catalog uploaded'}
            detail={status?.catalog_uploaded ? 'At least one catalog item found' : 'Upload items so customers can order'}
            action={!status?.catalog_uploaded ? (
              <Link to="/dashboard/menu" className="text-sm font-semibold text-emerald-800 underline">
                Open product catalog
              </Link>
            ) : null}
          />
          <CheckRow
            ok={Boolean(status?.fulfillment_configured)}
            warn={status && !status?.fulfillment_configured}
            label="Fulfillment modes configured"
            detail={fulfillmentDetail}
            action={!status?.fulfillment_configured ? (
              <Link to="/settings" className="text-sm font-semibold text-emerald-800 underline">
                Open Settings
              </Link>
            ) : null}
          />
          <CheckRow
            ok={sub.status === 'active'}
            warn={sub.status === 'trial' || sub.status === 'past_due' || !sub.status}
            label="Subscription"
            detail={
              `₹${sub.price ?? 1000}/month · ${
                sub.status === 'trial'
                  ? `Trial${sub.trial_ends_at ? ` ends ${new Date(sub.trial_ends_at).toLocaleDateString()}` : ''}`
                  : (sub.status || 'unknown')
              }`
            }
            action={(sub.status === 'trial' || sub.status === 'past_due') ? (
              <Link to="/billing" className="text-sm font-semibold text-emerald-800 underline">
                View billing
              </Link>
            ) : null}
          />
        </div>

        <div className="flex flex-col gap-3">
          {status?.setup_complete ? (
            <button
              type="button"
              onClick={() => goDashboard(true)}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3 rounded-xl"
            >
              Go to Dashboard
            </button>
          ) : onlyWaGap ? (
            <button
              type="button"
              disabled={connecting}
              onClick={() => { setShowWaPaths(true); }}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3 rounded-xl"
            >
              {connecting ? 'Connecting…' : 'Finish WhatsApp setup'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={load}
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3 rounded-xl"
              >
                Refresh activation status
              </button>
              <button
                type="button"
                onClick={() => goDashboard(true)}
                className="w-full border border-slate-300 text-slate-700 font-semibold py-3 rounded-xl bg-white"
              >
                Continue to dashboard anyway
              </button>
            </>
          )}
          <Link to="/billing" className="text-center text-sm text-slate-500 hover:text-slate-800">
            Subscription & offers
          </Link>
        </div>
      </div>
    </div>
  );
}
