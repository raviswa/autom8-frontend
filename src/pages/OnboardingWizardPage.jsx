import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LOB_FAMILIES,
  verticalsForFamily,
  resolveBusinessTaxonomy,
} from '../config/lobTaxonomy';
import { C, FONTS } from '../theme/brand';

const STEPS = [
  { id: 1, label: 'Business' },
  { id: 2, label: 'Product' },
  { id: 3, label: 'Delivery' },
  { id: 4, label: 'Payment' },
  { id: 5, label: 'Ready' },
];

/** Bump when disclosure wording changes — must match backend META_UTILITY_DISCLOSURE_VERSION */
const META_UTILITY_DISCLOSURE_VERSION = '2026-08-07';

const META_UTILITY_DISCLAIMER =
  'WhatsApp (Meta) charges Autom8 Works for utility messages sent to your customers (order confirmations, shipping updates, etc). To offset this, Autom8 Works adds a small platform charge to the buyer: ₹1 for minimal/utility-only conversations, and ₹2 per order for restaurant/cloud-kitchen type businesses. You can choose whether this charge is shown to your customers at checkout.';

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8, boxSizing: 'border-box',
  border: `1px solid ${C.border}`, fontSize: 14, outline: 'none', fontFamily: 'inherit',
};

const labelStyle = {
  fontSize: 12, fontWeight: 600, color: C.textSub, display: 'block', marginBottom: 6,
};

export default function OnboardingWizardPage() {
  const { apiClient, user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState(null);
  const [step, setStep] = useState(1);

  // Step 1
  const [businessName, setBusinessName] = useState('');
  const [family, setFamily] = useState('retail');
  const [vertical, setVertical] = useState('');
  const [verticalOther, setVerticalOther] = useState('');
  const [city, setCity] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [supplyEnabled, setSupplyEnabled] = useState(false);

  // Step 2
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemImage, setItemImage] = useState('');

  // Step 3
  const [takeaway, setTakeaway] = useState(true);
  const [delivery, setDelivery] = useState(true);
  const [inHouse, setInHouse] = useState(false);
  const [shipEmail, setShipEmail] = useState('');
  const [shipPassword, setShipPassword] = useState('');
  const [shippingProvider, setShippingProvider] = useState('shiprocket');

  // Step 4
  const [phonepeMid, setPhonepeMid] = useState('');

  // Step 5 — Meta utility disclosure
  const [platformChargeEnabled, setPlatformChargeEnabled] = useState(false);
  const [disclosureAccepted, setDisclosureAccepted] = useState(false);

  const refreshUserLifecycle = useCallback((patch) => {
    if (typeof updateUser === 'function') updateUser(patch);
  }, [updateUser]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/api/onboarding/wizard');
      const data = res.data;
      setWizard(data);
      const t = data.tenant || {};
      setBusinessName(t.display_name || t.name || '');
      setFamily(t.business_family || 'retail');
      setVertical(t.business_vertical || '');
      setVerticalOther(t.business_vertical_other || '');
      setCity(t.city || '');
      setWhatsapp(t.whatsapp_number || '');
      setSupplyEnabled(!!t.supply_enabled);
      const feats = t.subscribed_features || [];
      setTakeaway(feats.length ? feats.includes('takeaway') : true);
      setDelivery(feats.length ? feats.includes('delivery') : true);
      setInHouse(!!t.delivery_distance_tiers_enabled);
      setShipEmail(t.shiprocket_email || '');
      setShippingProvider(t.shipping_provider || 'shiprocket');
      if (data.phonepe?.merchant_id) setPhonepeMid(data.phonepe.merchant_id);

      if (data.lifecycle_status === 'active') {
        setStep(5);
      } else {
        setStep(Number(data.current_step || 1));
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load onboarding');
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  const putStep = async (n, body) => {
    setSaving(true);
    setError('');
    try {
      await apiClient.put(`/api/onboarding/wizard/${n}`, body);
      await load();
      setStep(Math.min(n + 1, 5));
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const skipStep = async (n) => putStep(n, { skip: true });

  const complete = async () => {
    if (!disclosureAccepted) {
      setError('Please confirm you have read the Meta utility-messaging cost disclosure.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiClient.post('/api/onboarding/wizard/complete', {
        disclosure_accepted: true,
        disclosure_version: META_UTILITY_DISCLOSURE_VERSION,
        disclosure_accepted_at: new Date().toISOString(),
        platform_charge_enabled: !!platformChargeEnabled,
      });
      refreshUserLifecycle({ lifecycle_status: 'active', onboarding_step: 5 });
      setWizard((w) => ({ ...w, ...res.data, lifecycle_status: 'active' }));
      setStep(5);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Could not finish setup');
    } finally {
      setSaving(false);
    }
  };

  const goDashboard = () => {
    refreshUserLifecycle({ lifecycle_status: 'active', onboarding_step: 5 });
    navigate('/dashboard/owner', { replace: true });
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.body }}>
        Loading setup…
      </div>
    );
  }

  const verticals = verticalsForFamily(family);

  return (
    <div style={{
      minHeight: '100vh', fontFamily: FONTS.body,
      background: `linear-gradient(160deg, ${C.emeraldDark} 0%, #0F3D34 40%, #F7F5F0 40%)`,
      padding: '32px 16px 48px',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ color: '#fff', marginBottom: 20 }}>
          <div style={{ fontFamily: FONTS.heading, fontSize: 24, fontWeight: 600 }}>Set up your store</div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>Steps 2–4 are optional — you can finish them later in Settings.</div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {STEPS.map((s) => (
            <div key={s.id} style={{
              flex: 1, minWidth: 70, textAlign: 'center', padding: '8px 4px', borderRadius: 8,
              background: step === s.id ? C.gold : (step > s.id ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)'),
              color: step === s.id ? C.emeraldDark : '#fff',
              fontSize: 11, fontWeight: 600,
            }}>
              {s.id}. {s.label}
            </div>
          ))}
        </div>

        <div style={{ background: C.cardBg, borderRadius: 16, padding: 24, boxShadow: '0 16px 40px rgba(0,0,0,0.12)' }}>
          {error && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: C.dangerLight, color: C.dangerDark, fontSize: 13 }}>
              {error}
            </div>
          )}

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: FONTS.heading }}>Business basics</h2>
              <div>
                <label style={labelStyle}>Business name</label>
                <input style={inputStyle} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Enzyme Planet" />
              </div>
              <div>
                <label style={labelStyle}>Business type</label>
                <select style={inputStyle} value={family} onChange={(e) => { setFamily(e.target.value); setVertical(''); }}>
                  {LOB_FAMILIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Vertical</label>
                <select style={inputStyle} value={vertical} onChange={(e) => setVertical(e.target.value)}>
                  <option value="">Select…</option>
                  {verticals.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              {verticals.find((v) => v.id === vertical)?.custom && (
                <div>
                  <label style={labelStyle}>Describe your business</label>
                  <input style={inputStyle} value={verticalOther} onChange={(e) => setVerticalOther(e.target.value)} />
                </div>
              )}
              <div>
                <label style={labelStyle}>City</label>
                <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Chennai" />
              </div>
              <div>
                <label style={labelStyle}>WhatsApp number (business)</label>
                <input style={inputStyle} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="91XXXXXXXXXX" />
              </div>
              {String(resolveBusinessTaxonomy({
                business_family: family,
                business_vertical: vertical || undefined,
              }).lob_type || '').toLowerCase() !== 'b2b' && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45 }}>
                  <input
                    type="checkbox"
                    checked={supplyEnabled}
                    onChange={(e) => setSupplyEnabled(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    Also enable <strong>Autom8 Supply</strong> (B2B) on this same WhatsApp number
                    (+₹500/mo). Buyer phones use the supplier portal; other customers keep your storefront.
                  </span>
                </label>
              )}
              <button
                type="button"
                disabled={saving || !businessName.trim()}
                onClick={() => {
                  const tax = resolveBusinessTaxonomy({
                    business_family: family,
                    business_vertical: vertical || undefined,
                    business_vertical_other: verticalOther,
                  });
                  putStep(1, {
                    business_name: businessName.trim(),
                    city: city.trim(),
                    whatsapp_number: whatsapp,
                    business_family: tax.business_family,
                    business_vertical: tax.business_vertical,
                    business_vertical_other: tax.business_vertical_other,
                    lob_type: tax.lob_type,
                    supply_enabled: supplyEnabled,
                  });
                }}
                style={primaryBtn(saving)}
              >
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: FONTS.heading }}>Add your first product</h2>
              <p style={{ margin: 0, fontSize: 13, color: C.textMuted }}>Optional — skip and upload a full catalog later.</p>
              <div>
                <label style={labelStyle}>Product name</label>
                <input style={inputStyle} value={itemName} onChange={(e) => setItemName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Price (₹)</label>
                <input style={inputStyle} type="number" min="0" step="0.01" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Photo URL (optional)</label>
                <input style={inputStyle} value={itemImage} onChange={(e) => setItemImage(e.target.value)} placeholder="https://…" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={saving} onClick={() => skipStep(2)} style={secondaryBtn}>Skip for now</button>
                <button
                  type="button"
                  disabled={saving || !itemName.trim()}
                  onClick={() => putStep(2, {
                    item_name: itemName.trim(),
                    price: itemPrice,
                    image_url: itemImage.trim() || undefined,
                  })}
                  style={{ ...primaryBtn(saving), flex: 1 }}
                >
                  {saving ? 'Saving…' : 'Save & continue'}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: FONTS.heading }}>Delivery & fulfillment</h2>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <input type="checkbox" checked={takeaway} onChange={(e) => setTakeaway(e.target.checked)} /> Store pickup / takeaway
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                <input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} /> Door delivery
              </label>
              {delivery && (
                <>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                    <input type="checkbox" checked={inHouse} onChange={(e) => setInHouse(e.target.checked)} /> In-house / local delivery (distance tiers)
                  </label>
                  {inHouse && (
                    <p style={{ margin: 0, fontSize: 12, color: C.textMuted }}>
                      Default distance tiers will be enabled. Fine-tune rates anytime in Settings → Orders.
                    </p>
                  )}
                  <div>
                    <label style={labelStyle}>Outstation courier</label>
                    <select style={inputStyle} value={shippingProvider} onChange={(e) => setShippingProvider(e.target.value)}>
                      <option value="shiprocket">Shiprocket</option>
                      <option value="custom">My courier / set up later</option>
                    </select>
                  </div>
                  {shippingProvider === 'shiprocket' && (
                    <>
                      <div>
                        <label style={labelStyle}>Shiprocket API email</label>
                        <input style={inputStyle} value={shipEmail} onChange={(e) => setShipEmail(e.target.value)} />
                      </div>
                      <div>
                        <label style={labelStyle}>Shiprocket API password</label>
                        <input style={inputStyle} type="password" value={shipPassword} onChange={(e) => setShipPassword(e.target.value)} placeholder="Optional now" />
                      </div>
                    </>
                  )}
                </>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={saving} onClick={() => skipStep(3)} style={secondaryBtn}>Skip for now</button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => putStep(3, {
                    takeaway,
                    delivery,
                    in_house_delivery: inHouse,
                    delivery_distance_tiers_enabled: inHouse,
                    shipping_provider: shippingProvider,
                    shiprocket_email: shipEmail || undefined,
                    shiprocket_api_key: shipPassword || undefined,
                  })}
                  style={{ ...primaryBtn(saving), flex: 1 }}
                >
                  {saving ? 'Saving…' : 'Save & continue'}
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: FONTS.heading }}>Payments</h2>
              <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
                PhonePe is the default for new stores. Paste your Merchant ID when ready, or skip and configure under Billing later.
              </p>
              {wizard?.phonepe_partner_url && (
                <a href={wizard.phonepe_partner_url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 13, color: C.primary, fontWeight: 600 }}>
                  Get started with PhonePe →
                </a>
              )}
              <div>
                <label style={labelStyle}>PhonePe Merchant ID (optional)</label>
                <input style={inputStyle} value={phonepeMid} onChange={(e) => setPhonepeMid(e.target.value)} placeholder="MID" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={saving} onClick={() => skipStep(4)} style={secondaryBtn}>Skip for now</button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => putStep(4, {
                    payment_provider: 'phonepe',
                    phonepe_merchant_id: phonepeMid.trim() || undefined,
                  })}
                  style={{ ...primaryBtn(saving), flex: 1 }}
                >
                  {saving ? 'Saving…' : 'Save & continue'}
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontFamily: FONTS.heading }}>
                {wizard?.lifecycle_status === 'active' ? 'Your store is ready' : 'Almost there'}
              </h2>
              {wizard?.lifecycle_status !== 'active' && (
                <>
                  <div style={{
                    padding: '14px 16px', borderRadius: 10,
                    background: '#E8F5F0', border: '1px solid #b8e0d0',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.primary || '#1B7A5A', marginBottom: 8 }}>
                      Meta utility messaging — cost disclosure
                    </div>
                    <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.55, color: C.textSub || '#374151' }}>
                      {META_UTILITY_DISCLAIMER}
                    </p>
                    <label style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, fontSize: 13, marginBottom: 12, cursor: 'pointer',
                    }}>
                      <span>Add platform charge at customer checkout</span>
                      <input
                        type="checkbox"
                        checked={platformChargeEnabled}
                        onChange={(e) => setPlatformChargeEnabled(e.target.checked)}
                      />
                    </label>
                    <label style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      fontSize: 13, lineHeight: 1.45, cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        checked={disclosureAccepted}
                        onChange={(e) => setDisclosureAccepted(e.target.checked)}
                        style={{ marginTop: 2 }}
                      />
                      <span>I have read and understand the Meta utility-messaging cost disclosure above.</span>
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={saving || !disclosureAccepted}
                    onClick={complete}
                    style={primaryBtn(saving || !disclosureAccepted)}
                  >
                    {saving ? 'Finishing…' : 'Finish setup'}
                  </button>
                </>
              )}
              {(wizard?.webcart_url || wizard?.lifecycle_status === 'active') && (
                <>
                  <div>
                    <div style={labelStyle}>Webcart link</div>
                    <a href={wizard.webcart_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: 'break-all', color: C.primary }}>
                      {wizard.webcart_url}
                    </a>
                  </div>
                  {wizard.qr_url && (
                    <div style={{ textAlign: 'center' }}>
                      <img src={wizard.qr_url} alt="Webcart QR" width={180} height={180} style={{ borderRadius: 12, border: `1px solid ${C.border}` }} />
                      <div>
                        <a href={wizard.qr_url} download="munafe-webcart-qr.png" style={{ fontSize: 12, color: C.primary }}>Download QR</a>
                      </div>
                    </div>
                  )}
                  {wizard.demo_whatsapp_number && (
                    <p style={{ margin: 0, fontSize: 13, color: C.textMuted }}>
                      Demo WhatsApp for testing: <strong>{wizard.demo_whatsapp_number}</strong>
                      {' '}(connect your own number anytime from Account / Setup).
                    </p>
                  )}
                  <button type="button" onClick={goDashboard} style={primaryBtn(false)}>
                    Go to dashboard
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function primaryBtn(disabled) {
  return {
    width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
    background: disabled ? C.textMuted : C.emerald, color: '#fff',
    fontSize: 14, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
  };
}

const secondaryBtn = {
  padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.border}`,
  background: C.surfaceBg, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
