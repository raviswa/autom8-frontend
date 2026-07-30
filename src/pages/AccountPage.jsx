// ============================================================================
// MY ACCOUNT — profile, plan, business links, logout, delete account
// ============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import BrandHeader from '../components/BrandHeader';
import { C, FONTS } from '../theme/brand';
import { requestStepUpToken, stepUpHeaders } from '../components/StepUpOtpModal';

const ROLE_LABEL = {
  owner: 'Owner',
  manager: 'Manager',
  brand_owner: 'Brand owner',
  brand_manager: 'Brand manager',
  kitchen_staff: 'Kitchen',
  packing_staff: 'Packing',
  dispatch_staff: 'Dispatch',
  sales_staff: 'Sales',
  captain: 'Captain',
  marketing: 'Marketing',
};

const EXIT_REASON_LABEL = {
  too_expensive: 'Too expensive',
  too_complex: 'Too complex',
  found_alternative: 'Found an alternative',
  seasonal_pause: 'Seasonal pause',
  technical_issues: 'Technical issues',
  other: 'Other',
};

const DEFAULT_EXIT_REASONS = Object.keys(EXIT_REASON_LABEL);

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return null;
  }
}

function planSummary(subscription) {
  if (!subscription) return { title: '—', detail: 'Loading…' };
  if (subscription.is_brand) {
    return { title: 'Brand account', detail: 'See Billing for per-outlet plans' };
  }
  if (subscription.fail_open) {
    return { title: 'Unavailable', detail: 'Could not load plan — open Billing' };
  }
  const status = String(subscription.status || 'trial').replace(/_/g, ' ');
  const plan = subscription.plan || status;
  const renew = formatDate(subscription.renews_at);
  const trialEnd = formatDate(subscription.trial_ends_at);
  let detail = status.charAt(0).toUpperCase() + status.slice(1);
  if (subscription.soft_locked) detail += ' · locked';
  if (renew) detail += ` · renews ${renew}`;
  else if (trialEnd && status === 'trial') detail += ` · trial ends ${trialEnd}`;
  return { title: String(plan).replace(/_/g, ' '), detail };
}

const card = {
  background: C.cardBg,
  border: `0.5px solid ${C.border}`,
  borderRadius: 12,
  padding: '18px 20px',
};

const linkChip = {
  display: 'inline-block',
  fontSize: 13,
  fontWeight: 500,
  color: C.primaryDark,
  textDecoration: 'none',
  padding: '8px 14px',
  borderRadius: 8,
  border: `0.5px solid ${C.primaryBorder}`,
  background: C.primaryLight,
};

export default function AccountPage() {
  const { user, apiClient, logout } = useAuth();
  const { subscription } = useSubscription();
  const navigate = useNavigate();

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmName, setConfirmName] = useState('');
  /** null | 'warn' | 'reason' | 'confirm' */
  const [deleteStep, setDeleteStep] = useState(null);
  const [exitReason, setExitReason] = useState('');
  const [exitNote, setExitNote] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/api/account');
      setAccount(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Failed to load account');
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  const profile = account?.user || user;
  const restaurant = account?.restaurant;
  const canDelete = Boolean(account?.can_delete_account);
  const exitReasons = Array.isArray(account?.exit_reasons) && account.exit_reasons.length
    ? account.exit_reasons
    : DEFAULT_EXIT_REASONS;
  const roleLabel = ROLE_LABEL[profile?.role] || profile?.role || '—';
  const plan = planSummary(subscription);
  const businessName = restaurant?.display_name || restaurant?.name || 'your business';

  const resetDeleteFlow = () => {
    setDeleteStep(null);
    setConfirmName('');
    setExitReason('');
    setExitNote('');
    setDeleteError('');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const token = await requestStepUpToken({ purpose: 'delete_account', title: 'Verify to delete account' });
      if (!token) {
        setDeleting(false);
        return;
      }
      await apiClient.post('/api/account/delete', {
        confirm_name: confirmName.trim(),
        reason: exitReason || 'other',
        note: exitNote.trim() || undefined,
      }, { headers: stepUpHeaders(token) });
      await logout();
      navigate('/login', {
        replace: true,
        state: {
          message:
            'Your account is deleted. WhatsApp is released for another Autom8 account. Contact support only if you need order history.',
        },
      });
    } catch (e) {
      setDeleteError(e.response?.data?.error || e.message || 'Could not close account');
      setDeleting(false);
    }
  };

  const homePath =
    user?.role === 'brand_owner' || user?.role === 'brand_manager'
      ? '/dashboard/brand'
      : user?.role === 'manager'
        ? '/dashboard/manager'
        : '/dashboard/owner';

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONTS.body }}>
      <BrandHeader
        title="My Account"
        subtitle={businessName !== 'your business' ? businessName : (profile?.email || '')}
        right={
          <>
            <Link to={homePath} style={linkChip}>← Dashboard</Link>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8,
                border: `0.5px solid ${C.dangerBorder}`, background: C.dangerLight,
                color: C.dangerDark, cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </>
        }
      />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && (
          <p style={{ color: C.textMuted, fontSize: 14 }}>Loading account…</p>
        )}
        {error && (
          <div style={{ ...card, borderColor: C.dangerBorder, background: C.dangerLight, color: C.dangerDark, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Profile */}
        <section style={card}>
          <h2 style={{ margin: 0, fontFamily: FONTS.heading, fontSize: 18, color: C.text, fontWeight: 600 }}>
            Profile
          </h2>
          <p style={{ margin: '6px 0 14px', fontSize: 13, color: C.textMuted }}>
            Signed-in user (read-only for now)
          </p>
          <dl style={{ margin: 0, display: 'grid', gap: 10, fontSize: 14 }}>
            <div>
              <dt style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>Name</dt>
              <dd style={{ margin: 0, color: C.text, fontWeight: 500 }}>{profile?.full_name || '—'}</dd>
            </div>
            <div>
              <dt style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>Email</dt>
              <dd style={{ margin: 0, color: C.text, fontWeight: 500 }}>{profile?.email || '—'}</dd>
            </div>
            {profile?.phone && (
              <div>
                <dt style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>Phone</dt>
                <dd style={{ margin: 0, color: C.text, fontWeight: 500 }}>{profile.phone}</dd>
              </div>
            )}
            <div>
              <dt style={{ fontSize: 11, color: C.textMuted, marginBottom: 2 }}>Role</dt>
              <dd style={{ margin: 0, color: C.text, fontWeight: 500 }}>{roleLabel}</dd>
            </div>
          </dl>
        </section>

        {/* Plan */}
        <section style={card}>
          <h2 style={{ margin: 0, fontFamily: FONTS.heading, fontSize: 18, color: C.text, fontWeight: 600 }}>
            Current plan
          </h2>
          <p style={{ margin: '10px 0 4px', fontSize: 16, fontWeight: 600, color: C.primaryDark, textTransform: 'capitalize' }}>
            {plan.title}
          </p>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: C.textMuted }}>{plan.detail}</p>
          <Link to="/billing" style={linkChip}>Plan & billing →</Link>
        </section>

        {/* Business & settings */}
        <section style={card}>
          <h2 style={{ margin: 0, fontFamily: FONTS.heading, fontSize: 18, color: C.text, fontWeight: 600 }}>
            Business
          </h2>
          <p style={{ margin: '6px 0 14px', fontSize: 13, color: C.textMuted }}>
            Outlet details, WhatsApp, team, and kitchen settings live in Settings.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Link to="/settings?tab=restaurant" style={linkChip}>Business details</Link>
            <Link to="/settings" style={linkChip}>Business settings</Link>
            <Link to="/settings?tab=staff" style={linkChip}>Team</Link>
          </div>
        </section>

        {/* Help */}
        <section style={card}>
          <h2 style={{ margin: 0, fontFamily: FONTS.heading, fontSize: 18, color: C.text, fontWeight: 600 }}>
            Help
          </h2>
          <p style={{ margin: '6px 0 12px', fontSize: 13, color: C.textMuted }}>
            Policies and support for Autom8.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <a href="https://autom8.works" target="_blank" rel="noopener noreferrer" style={linkChip}>
              autom8.works
            </a>
          </div>
        </section>

        {/* Danger zone — decided soft-close flow */}
        {canDelete && (
          <section style={{
            ...card,
            borderColor: C.dangerBorder,
            background: '#FDF8F8',
          }}>
            <h2 style={{ margin: 0, fontFamily: FONTS.heading, fontSize: 18, color: C.dangerDark, fontWeight: 600 }}>
              Delete account
            </h2>
            <p style={{ margin: '8px 0 12px', fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
              Voluntarily leave Autom8 for <strong style={{ color: C.text }}>{businessName}</strong>.
              This is different from an unpaid pause: delete <strong style={{ color: C.text }}>releases your WhatsApp number</strong>
              so it can be linked to another Autom8 account. Order history stays on file.
            </p>

            {!deleteStep && (
              <button
                type="button"
                onClick={() => { setDeleteStep('warn'); setDeleteError(''); }}
                style={{
                  fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8,
                  border: `0.5px solid ${C.dangerBorder}`, background: C.dangerLight,
                  color: C.dangerDark, cursor: 'pointer',
                }}
              >
                Delete account…
              </button>
            )}

            {deleteStep === 'warn' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.55, fontWeight: 500 }}>
                  Deleting your account will:
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>
                  <li>
                    <strong style={{ color: C.text }}>Release WhatsApp</strong> — disconnect WABA and free this number
                    so another Autom8 business can connect it
                  </li>
                  <li>Cancel your Autom8 subscription (no further renewals)</li>
                  <li>Close this outlet and disable all team logins</li>
                  <li>Stop miss-you / win-back emails for this outlet</li>
                </ul>
                <p style={{ margin: 0, fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
                  Unpaid / grace lock is different: that only pauses ordering and keeps your WhatsApp linked
                  so you can renew. Delete permanently frees the number.
                  This cannot be undone from the app — reopen needs Autom8 support.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setDeleteStep('reason')}
                    style={{
                      fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8,
                      border: 'none', background: C.danger, color: '#fff', cursor: 'pointer',
                    }}
                  >
                    I understand — continue
                  </button>
                  <button
                    type="button"
                    onClick={resetDeleteFlow}
                    style={{
                      fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 8,
                      border: `0.5px solid ${C.border}`, background: C.cardBg,
                      color: C.textMuted, cursor: 'pointer',
                    }}
                  >
                    Keep account
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 'reason' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 13, color: C.text, fontWeight: 500 }}>
                  Why are you leaving? (optional but helps us)
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {exitReasons.map((r) => (
                    <label
                      key={r}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                        color: C.text, cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="exitReason"
                        value={r}
                        checked={exitReason === r}
                        onChange={() => setExitReason(r)}
                      />
                      {EXIT_REASON_LABEL[r] || r}
                    </label>
                  ))}
                </div>
                <textarea
                  value={exitNote}
                  onChange={(e) => setExitNote(e.target.value.slice(0, 1000))}
                  placeholder="Anything else we should know? (optional)"
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: `0.5px solid ${C.border}`, fontSize: 13,
                    boxSizing: 'border-box', fontFamily: FONTS.body, resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setDeleteStep('confirm')}
                    style={{
                      fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8,
                      border: 'none', background: C.danger, color: '#fff', cursor: 'pointer',
                    }}
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteStep('warn')}
                    style={{
                      fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 8,
                      border: `0.5px solid ${C.border}`, background: C.cardBg,
                      color: C.textMuted, cursor: 'pointer',
                    }}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}

            {deleteStep === 'confirm' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: 13, color: C.text }}>
                  Type <strong>{businessName}</strong> to confirm and release WhatsApp
                  <input
                    type="text"
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                    autoComplete="off"
                    placeholder={businessName}
                    style={{
                      display: 'block', width: '100%', marginTop: 6, padding: '10px 12px',
                      borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 14,
                      boxSizing: 'border-box', fontFamily: FONTS.body,
                    }}
                  />
                </label>
                {deleteError && (
                  <p style={{ margin: 0, fontSize: 13, color: C.dangerDark }}>{deleteError}</p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={deleting || !confirmName.trim()}
                    onClick={handleDelete}
                    style={{
                      fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8,
                      border: 'none', background: C.danger, color: '#fff',
                      cursor: deleting || !confirmName.trim() ? 'not-allowed' : 'pointer',
                      opacity: deleting || !confirmName.trim() ? 0.6 : 1,
                    }}
                  >
                    {deleting ? 'Releasing WhatsApp…' : 'Delete account & release WhatsApp'}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setDeleteStep('reason')}
                    style={{
                      fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 8,
                      border: `0.5px solid ${C.border}`, background: C.cardBg,
                      color: C.textMuted, cursor: 'pointer',
                    }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={resetDeleteFlow}
                    style={{
                      fontSize: 13, fontWeight: 500, padding: '8px 14px', borderRadius: 8,
                      border: `0.5px solid ${C.border}`, background: C.cardBg,
                      color: C.textMuted, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {!canDelete && profile?.role === 'brand_owner' && (
          <section style={card}>
            <p style={{ margin: 0, fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
              To close a brand or outlet, deactivate outlets from Brand settings or contact Autom8 support.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
