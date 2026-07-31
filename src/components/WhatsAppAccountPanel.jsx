import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { C } from '../theme/brand';
import { loadFacebookSdk, launchWhatsAppEmbeddedSignup } from '../helpers/metaEmbeddedSignup';
import { requestStepUpToken, stepUpHeaders } from './StepUpOtpModal';

const CARD = {
  background: C.cardBg,
  border: `0.5px solid ${C.border}`,
  borderRadius: 12,
  padding: '24px',
};

function Spinner({ size = 18 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2px solid ${C.border}`, borderTop: `2px solid ${C.primary}`,
      animation: 'spin .7s linear infinite', display: 'inline-block',
    }} />
  );
}

function Toast({ msg, type = 'success' }) {
  if (!msg) return null;
  const bg = type === 'error' ? '#7F1D1D' : type === 'warning' ? '#92400E' : '#1A1A18';
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 100,
      background: bg, color: '#fff', fontSize: 12, fontWeight: 500,
      padding: '10px 16px', borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,.25)',
    }}>
      {msg}
    </div>
  );
}

function Label({ children, required }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
      {children}{required && <span style={{ color: C.danger, marginLeft: 2 }}>*</span>}
    </label>
  );
}

const inputStyle = {
  width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8,
  border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.text,
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

function Input({ value, onChange, placeholder, type = 'text', disabled }) {
  return (
    <input
      type={type} value={value ?? ''} placeholder={placeholder}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
    />
  );
}

function Select({ value, onChange, options, disabled }) {
  return (
    <select
      value={value ?? ''} disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

function Btn({ children, onClick, variant = 'primary', disabled, style: s, loading }) {
  const variants = {
    primary:   { background: C.primary,      color: '#fff',        border: `0.5px solid ${C.primaryDark}`  },
    secondary: { background: C.surfaceBg,    color: C.text,        border: `0.5px solid ${C.border}`       },
    danger:    { background: C.dangerLight,  color: C.danger,      border: `0.5px solid ${C.dangerBorder}` },
    ghost:     { background: 'transparent',  color: C.textMuted,   border: `0.5px solid ${C.border}`       },
    success:   { background: C.successLight, color: C.successDark, border: `0.5px solid ${C.successBorder}`},
  };
  const v = variants[variant] ?? variants.primary;
  return (
    <button
      onClick={onClick} disabled={disabled || loading}
      style={{
        fontSize: 12, padding: '7px 14px', borderRadius: 8, fontWeight: 500,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        opacity: (disabled || loading) ? 0.55 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        ...v, ...s,
      }}
    >
      {loading && <Spinner size={12} />}
      {children}
    </button>
  );
}

function SectionTitle({ children, id }) {
  return (
    <div id={id} style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, marginTop: 20, paddingTop: 16, borderTop: `0.5px solid ${C.border}` }}>
      {children}
    </div>
  );
}

function SaveBar({ onSave, loading, saved }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10,
      marginTop: 24, padding: '12px 0', borderTop: `0.5px solid ${C.border}`,
      position: 'sticky', bottom: 0, zIndex: 5,
      background: `linear-gradient(to top, ${C.cardBg} 85%, transparent)`,
    }}>
      {saved && <span style={{ fontSize: 11, color: C.success }}>✓ Saved</span>}
      <Btn onClick={onSave} loading={loading}>Save changes</Btn>
    </div>
  );
}

export default function WhatsAppAccountPanel({ apiClient, showToast, initialPath = null }) {
  const [form,   setForm]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(initialPath === 'advanced');
  const [connectPath, setConnectPath] = useState(initialPath || null); // 'new' | 'existing' | 'advanced'
  const [esConfig, setEsConfig] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [pin, setPin] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [accountStatus, setAccountStatus] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [templatesErr, setTemplatesErr] = useState('');
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const loadForm = useCallback(() => {
    return Promise.all([
      apiClient.get('/api/dashboard/waba'),
      apiClient.get('/api/restaurants/integration').catch(() => ({ data: {} })),
      apiClient.get('/api/whatsapp/embedded-signup/status').catch(() => ({ data: null })),
    ]).then(([wabaRes, intRes, statusRes]) => {
      const d   = wabaRes.data.restaurant ?? {};
      const int = intRes.data.integration ?? {};
      setForm({
        whatsapp_number:  d.whatsapp_number  ?? '',
        waba_id:          d.waba_id          ?? '',
        phone_number_id:  int.phone_number_id ?? '',
        manager_phone:    d.manager_phone    ?? '',
        sweets_counter_phone: d.sweets_counter_phone ?? '',
        access_token:     int.access_token   ?? '',
        webhook_secret:   int.webhook_secret ?? '',
        lob_type:         d.lob_type || 'restaurant',
        whatsapp_needs_existing_pin: Boolean(d.whatsapp_needs_existing_pin || statusRes.data?.whatsapp_needs_existing_pin),
        _loaded_wa:       d.whatsapp_number  ?? '',
        _loaded_waba:     d.waba_id          ?? '',
        _loaded_mgr:      d.manager_phone    ?? '',
        _loaded_pnid:     int.phone_number_id ?? '',
        _loaded_token:    int.access_token   ?? '',
      });
      if (statusRes.data) setAccountStatus(statusRes.data);
      if (int.phone_number_id && int.access_token && initialPath !== 'advanced') setShowAdvanced(false);
    });
  }, [apiClient, initialPath]);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesErr('');
    try {
      const r = await apiClient.get('/api/whatsapp/embedded-signup/templates');
      setTemplates(r.data?.templates || []);
    } catch (e) {
      setTemplates([]);
      setTemplatesErr(e.response?.data?.error || e.message || 'Could not load templates');
    } finally {
      setTemplatesLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    loadForm().catch(() => showToast('Failed to load WhatsApp config', 'error'));
  }, [loadForm, showToast]);

  useEffect(() => {
    apiClient.get('/api/whatsapp/embedded-signup/config')
      .then((r) => setEsConfig(r.data))
      .catch(() => setEsConfig({ enabled: false }));
  }, [apiClient]);

  useEffect(() => {
    if (initialPath === 'advanced') {
      setConnectPath('advanced');
      setShowAdvanced(true);
    }
  }, [initialPath]);

  const set = (k, v) => { setSaved(false); setForm(p => ({ ...p, [k]: v })); };

  const connectEmbeddedSignup = async (withExistingPinFlow = false) => {
    if (!esConfig?.enabled || !esConfig.appId || !esConfig.configId) {
      return showToast('Embedded Signup is not enabled on this server', 'error');
    }
    setConnecting(true);
    try {
      await loadFacebookSdk(esConfig.appId, esConfig.graphVersion);
      const session = await launchWhatsAppEmbeddedSignup({
        configId: esConfig.configId,
        solutionId: esConfig.solutionId || undefined,
      });
      if (!session.waba_id || !session.phone_number_id) {
        throw new Error('Signup finished but WABA / Phone Number ID was missing. Try again or use Advanced fields.');
      }
      const stepTok = await requestStepUpToken({ purpose: 'whatsapp_bind', title: 'Verify to connect WhatsApp' });
      if (!stepTok) {
        setConnecting(false);
        return;
      }
      const r = await apiClient.post('/api/whatsapp/embedded-signup/complete', {
        code: session.code,
        waba_id: session.waba_id,
        phone_number_id: session.phone_number_id,
        display_phone_number: session.display_phone_number || null,
        existing_pin: withExistingPinFlow && pin.length === 6 ? pin : undefined,
      }, { headers: stepUpHeaders(stepTok) });
      await loadForm();
      setSaved(true);
      if (r.data?.whatsapp_needs_existing_pin) {
        setConnectPath('existing');
        showToast('Enter the existing WhatsApp 2FA PIN to finish');
      } else {
        showToast(r.data?.next_step || 'WhatsApp connected successfully');
        loadTemplates().catch(() => {});
      }
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Connect WhatsApp failed';
      showToast(msg, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const submitExistingPin = async () => {
    if (pin.length !== 6) return showToast('Enter the 6-digit WhatsApp PIN', 'error');
    setPinBusy(true);
    try {
      const stepTok = await requestStepUpToken({ purpose: 'whatsapp_bind', title: 'Verify to finish WhatsApp PIN' });
      if (!stepTok) { setPinBusy(false); return; }
      await apiClient.post('/api/whatsapp/embedded-signup/register-pin', { pin }, { headers: stepUpHeaders(stepTok) });
      setPin('');
      await loadForm();
      showToast('PIN accepted — WhatsApp registration finished');
      loadTemplates().catch(() => {});
    } catch (e) {
      showToast(e.response?.data?.error || e.message || 'PIN was rejected', 'error');
    } finally {
      setPinBusy(false);
    }
  };

  const save = async () => {
    if (!form.whatsapp_number) return showToast('WhatsApp number is required', 'error');
    setSaving(true);
    try {
      const waFieldsChanged = String(form.whatsapp_number || '') !== String(form._loaded_wa || '')
        || String(form.waba_id || '') !== String(form._loaded_waba || '');
      const credsChanged = String(form.phone_number_id || '') !== String(form._loaded_pnid || '')
        || (form.access_token && form.access_token !== form._loaded_token);
      const mgrChanged = String(form.manager_phone || '').replace(/\D/g, '')
        !== String(form._loaded_mgr || '').replace(/\D/g, '');

      let meHeaders = {};
      if (waFieldsChanged) {
        const tok = await requestStepUpToken({ purpose: 'whatsapp_bind', title: 'Verify to update WhatsApp' });
        if (!tok) { setSaving(false); return; }
        meHeaders = stepUpHeaders(tok);
      } else if (mgrChanged) {
        const tok = await requestStepUpToken({ purpose: 'change_manager_phone', title: 'Verify manager phone change' });
        if (!tok) { setSaving(false); return; }
        meHeaders = stepUpHeaders(tok);
      }

      await apiClient.put('/api/restaurants/me', {
        whatsapp_number: form.whatsapp_number,
        waba_id:         form.waba_id        || null,
        manager_phone:   form.manager_phone  || null,
        sweets_counter_phone: form.sweets_counter_phone || null,
      }, { headers: meHeaders });

      if (credsChanged) {
        const tok = await requestStepUpToken({ purpose: 'whatsapp_bind', title: 'Verify integration credentials' });
        if (!tok) { setSaving(false); return; }
        await apiClient.put('/api/restaurants/integration', {
          provider:       'meta',
          channel:        'whatsapp',
          phone_number_id: form.phone_number_id || null,
          access_token:   form.access_token    || null,
          webhook_secret:  form.webhook_secret  || null,
        }, { headers: stepUpHeaders(tok) });
      }
      setSaved(true);
      showToast('WhatsApp settings saved');
      await loadForm();
      loadTemplates().catch(() => {});
    } catch (e) { showToast(e.response?.data?.error ?? 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  if (!form) return <div style={{ padding: 32, textAlign: 'center' }}><Spinner size={28} /></div>;

  const hint = (text) => <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>{text}</div>;
  const isConnected = Boolean(form.waba_id && form.phone_number_id && form.access_token);
  const needsPin = Boolean(form.whatsapp_needs_existing_pin || accountStatus?.whatsapp_needs_existing_pin);

  const pathCard = (id, title, desc) => {
    const active = connectPath === id;
    return (
      <button
        type="button"
        key={id}
        onClick={() => {
          setConnectPath(id);
          if (id === 'advanced') setShowAdvanced(true);
        }}
        style={{
          textAlign: 'left',
          padding: '14px 16px',
          borderRadius: 10,
          border: `1px solid ${active ? C.primary : C.border}`,
          background: active ? C.successLight : C.cardBg,
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.5 }}>{desc}</div>
      </button>
    );
  };

  const statusColor = (s) => {
    const u = String(s || '').toUpperCase();
    if (u === 'APPROVED') return C.successDark;
    if (u === 'PENDING' || u === 'IN_APPEAL') return '#BA7517';
    if (u === 'REJECTED' || u === 'DISABLED') return C.danger;
    return C.textMuted;
  };

  return (
    <div>
      <div style={{ background: '#EAF3DE', border: '0.5px solid #A7E3C0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#3B6D11', marginBottom: 20, lineHeight: 1.7 }}>
        Choose how to connect WhatsApp. Changes take effect on the next incoming message — no restart needed.
      </div>

      {/* Account Status */}
      <div style={{ ...CARD, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>WhatsApp Account Status</div>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 6,
            background: isConnected && !needsPin ? C.successLight : C.dangerLight,
            color: isConnected && !needsPin ? C.successDark : C.danger,
          }}>
            {needsPin ? 'Needs PIN' : isConnected ? '● Connected' : 'Not connected'}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
          <div><span style={{ color: C.textMuted }}>Number</span><div style={{ fontWeight: 500 }}>{form.whatsapp_number ? `+${form.whatsapp_number}` : '—'}</div></div>
          <div><span style={{ color: C.textMuted }}>WABA ID</span><div style={{ fontWeight: 500, wordBreak: 'break-all' }}>{form.waba_id || '—'}</div></div>
          <div><span style={{ color: C.textMuted }}>Phone Number ID</span><div style={{ fontWeight: 500, wordBreak: 'break-all' }}>{form.phone_number_id || '—'}</div></div>
          <div><span style={{ color: C.textMuted }}>Billing</span><div><Link to="/billing" style={{ color: C.primary, fontWeight: 600 }}>₹1000 / number →</Link></div></div>
        </div>
      </div>

      {(() => {
        const digits = String(form.whatsapp_number || '').replace(/\D/g, '');
        if (!digits) return null;
        // No ?text= prefill — customer types their own greeting so we can detect language.
        const waUrl = `https://wa.me/${digits}`;
        const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(waUrl)}`;
        const downloadQr = async () => {
          try {
            const resp = await fetch(qr);
            const blob = await resp.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `whatsapp-checkin-qr-${digits}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(blobUrl);
          } catch (_err) {
            window.open(qr, '_blank', 'noopener');
          }
        };
        return (
          <div style={{ ...CARD, marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>Customer check-in QR</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              Print this QR at the counter or table. It opens WhatsApp with an empty chat so the customer can type
              Hi / வணக்கம் / नमस्ते / … — we detect their language from that greeting and keep using it.
            </div>
            <img
              src={qr}
              alt="WhatsApp check-in QR"
              width={180}
              height={180}
              style={{ display: 'block', borderRadius: 8, border: `0.5px solid ${C.border}` }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={downloadQr}
                style={{
                  fontSize: 12, color: C.gold, background: 'none', border: 'none',
                  textDecoration: 'underline', cursor: 'pointer', fontWeight: 500, padding: 0,
                }}
              >
                Download QR
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(waUrl);
                  showToast('WhatsApp link copied');
                }}
                style={{
                  fontSize: 12, color: C.primary, background: 'none', border: 'none',
                  textDecoration: 'underline', cursor: 'pointer', fontWeight: 500, padding: 0,
                }}
              >
                Copy WhatsApp link
              </button>
            </div>
          </div>
        );
      })()}

      {/* Three paths */}
      {!isConnected || needsPin ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>Connect WhatsApp</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 14 }}>
            {pathCard('new', '1. New WhatsApp number', 'Fresh Cloud API number via Meta Embedded Signup (no Developer Console).')}
            {pathCard('existing', '2. Existing WhatsApp number', 'Migrate a number that already uses WhatsApp — enter the 2FA PIN after linking.')}
            {pathCard('advanced', '3. Advanced — paste credentials', 'Manually enter WABA ID, Phone Number ID, and system user token.')}
          </div>

          {(connectPath === 'new' || connectPath === 'existing') && esConfig?.enabled && (
            <div style={{ ...CARD, marginBottom: 12 }}>
              {connectPath === 'existing' && (
                <div style={{ marginBottom: 12 }}>
                  <Label>Existing WhatsApp 2FA PIN (optional before connect)</Label>
                  <Input value={pin} onChange={v => setPin(String(v).replace(/\D/g, '').slice(0, 6))} placeholder="6-digit PIN" />
                  {hint('If Meta asks for the PIN after connect, enter it below and submit.')}
                </div>
              )}
              <button
                type="button"
                onClick={() => connectEmbeddedSignup(connectPath === 'existing')}
                disabled={connecting}
                style={{
                  background: C.primary, color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 18px', fontSize: 13, fontWeight: 600,
                  cursor: connecting ? 'wait' : 'pointer', opacity: connecting ? 0.7 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                {connecting ? <Spinner size={16} /> : null}
                {connecting ? 'Connecting…' : (connectPath === 'existing' ? 'Connect existing number' : 'Connect new number')}
              </button>
              {needsPin && (
                <div style={{ marginTop: 14 }}>
                  <Label required>Enter existing WhatsApp PIN</Label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input value={pin} onChange={v => setPin(String(v).replace(/\D/g, '').slice(0, 6))} placeholder="6-digit PIN" />
                    <button
                      type="button"
                      disabled={pinBusy || pin.length !== 6}
                      onClick={submitExistingPin}
                      style={{
                        background: '#BA7517', color: '#fff', border: 'none', borderRadius: 8,
                        padding: '0 14px', fontWeight: 600, cursor: 'pointer', opacity: pinBusy || pin.length !== 6 ? 0.5 : 1,
                      }}
                    >
                      {pinBusy ? '…' : 'Submit PIN'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!esConfig?.enabled && (connectPath === 'new' || connectPath === 'existing') && (
            <div style={{ fontSize: 12, color: C.danger, marginBottom: 12 }}>
              Embedded Signup is not enabled on this server — use Advanced credentials or ask Autom8 ops.
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...CARD, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: C.textMuted }}>Need to link a different number?</div>
          <button
            type="button"
            onClick={() => { setConnectPath('new'); connectEmbeddedSignup(false); }}
            disabled={connecting}
            style={{
              background: 'transparent', border: `1px solid ${C.primary}`, color: C.primary,
              borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {connecting ? 'Connecting…' : 'Reconnect WhatsApp'}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <Label required>WhatsApp number</Label>
          <Input value={form.whatsapp_number} onChange={v => set('whatsapp_number', v)} placeholder="919444000000" />
          {hint('Country code + number, no + or spaces. This is the business WABA number — not the owner OTP phone.')}
        </div>
        <div>
          <Label>Manager phone</Label>
          <Input value={form.manager_phone} onChange={v => set('manager_phone', v)} placeholder="919876543210" />
          {hint('Primary on-call number. All active managers/owners in Team with WhatsApp also receive ops alerts.')}
        </div>
        <div>
          <Label>Sweets / packing phone (optional)</Label>
          <Input value={form.sweets_counter_phone || ''} onChange={v => set('sweets_counter_phone', v)} placeholder="919876543210" />
          {hint('Packing-ticket WhatsApp alerts. If blank, falls back to Manager phone.')}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced(p => !p)}
        style={{
          marginTop: 20, marginBottom: 8, background: 'none', border: 'none',
          color: C.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
        }}
      >
        {showAdvanced ? 'Hide advanced credentials' : 'Show advanced credentials (manual)'}
      </button>

      {showAdvanced && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
            <div>
              <Label>WABA ID</Label>
              <Input value={form.waba_id} onChange={v => set('waba_id', v)} placeholder="1234567890" />
              {hint('Business Manager → Accounts → WhatsApp Accounts → ID.')}
            </div>
            <div>
              <Label>Phone Number ID</Label>
              <Input value={form.phone_number_id} onChange={v => set('phone_number_id', v)} placeholder="1234567890" />
              {hint('Filled automatically by Connect WhatsApp, or from Meta API Setup.')}
            </div>
          </div>

          <SectionTitle>API credentials</SectionTitle>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <Label>Meta System Access Token</Label>
              <button onClick={() => setShowToken(p => !p)} style={{ fontSize: 11, color: C.primary, background: 'none', border: 'none', cursor: 'pointer' }}>
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showToken ? 'text' : 'password'}
              value={form.access_token}
              onChange={e => set('access_token', e.target.value)}
              placeholder="EAAxxxxxx…"
              style={inputStyle}
            />
            {hint('Filled by Connect WhatsApp, or paste a system user token from Business Manager.')}
          </div>
          <div>
            <Label>Webhook verify token</Label>
            <Input value={form.webhook_secret} onChange={v => set('webhook_secret', v)} placeholder="your_webhook_secret" />
            {hint('Optional per-outlet; platform webhook verify token is set on the Autom8 Meta app.')}
          </div>
        </>
      )}

      <SaveBar onSave={save} loading={saving} saved={saved} />

      {/* Message template library (read-only) */}
      <div style={{ ...CARD, marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Message template library</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>Approved Meta templates for this WABA (read-only)</div>
          </div>
          <button
            type="button"
            onClick={loadTemplates}
            disabled={!isConnected || templatesLoading}
            style={{
              fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.surfaceBg, color: C.text,
              cursor: !isConnected || templatesLoading ? 'default' : 'pointer',
              opacity: !isConnected ? 0.5 : 1,
            }}
          >
            {templatesLoading ? 'Loading…' : (templates ? 'Refresh' : 'Load templates')}
          </button>
        </div>
        {!isConnected && (
          <div style={{ fontSize: 12, color: C.textMuted }}>Connect WhatsApp to view templates.</div>
        )}
        {templatesErr && <div style={{ fontSize: 12, color: C.danger, marginBottom: 8 }}>{templatesErr}</div>}
        {templates && templates.length === 0 && !templatesErr && (
          <div style={{ fontSize: 12, color: C.textMuted }}>No templates found on this WABA yet.</div>
        )}
        {templates && templates.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: C.textMuted, borderBottom: `0.5px solid ${C.border}` }}>
                  <th style={{ padding: '8px 6px' }}>Name</th>
                  <th style={{ padding: '8px 6px' }}>Language</th>
                  <th style={{ padding: '8px 6px' }}>Category</th>
                  <th style={{ padding: '8px 6px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id || `${t.name}-${t.language}`} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                    <td style={{ padding: '8px 6px', fontWeight: 500 }}>{t.name}</td>
                    <td style={{ padding: '8px 6px' }}>{t.language || '—'}</td>
                    <td style={{ padding: '8px 6px' }}>{t.category || '—'}</td>
                    <td style={{ padding: '8px 6px', color: statusColor(t.status), fontWeight: 600 }}>{t.status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

