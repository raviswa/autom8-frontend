import React from 'react';
import { Link } from 'react-router-dom';
import BrandHeader from './BrandHeader';
import { useAuth } from '../contexts/AuthContext';
import { C, FONTS } from '../theme/brand';

const DEFAULT_SUPPLY_PORTAL = 'https://supply.munafe.in';

/**
 * Shown in the Autom8 tenant portal when lob_type is supply / b2b_supply.
 * Does not SSO or auto-route — separate supply_token auth stays on supply.munafe.in.
 */
export default function SupplySeparatePortalNotice({ businessName }) {
  const { logout } = useAuth();
  const portalUrl = String(import.meta.env.VITE_SUPPLY_PORTAL_URL || DEFAULT_SUPPLY_PORTAL).replace(/\/$/, '');

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg }}>
      <BrandHeader
        brandTo="/account"
        title="Supply account"
        subtitle={businessName || 'Munafe Supply'}
        right={
          <>
            <Link
              to="/account"
              style={{
                fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8,
                border: '0.5px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)',
                color: '#fff', textDecoration: 'none',
              }}
            >
              Account
            </Link>
            <button
              type="button"
              onClick={logout}
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

      <div style={{
        maxWidth: 520, margin: '48px auto', padding: '0 20px',
      }}>
        <div style={{
          background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 14,
          padding: '28px 24px',
        }}>
          <h1 style={{
            fontFamily: FONTS?.heading || 'inherit',
            fontSize: 22, fontWeight: 600, color: C.text, margin: '0 0 10px',
          }}>
            Supply operations live elsewhere
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: C.textSub || C.textMuted, margin: '0 0 18px' }}>
            This login is the Autom8 tenant portal. Catalog, clients, orders, picking, and invoices
            for your supply business are managed separately — sign in at the Supply portal with your
            supply account.
          </p>
          <a
            href={portalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '100%', boxSizing: 'border-box',
              fontSize: 14, fontWeight: 600, padding: '12px 16px', borderRadius: 10,
              background: C.primary || '#0f6b5c', color: '#fff', textDecoration: 'none',
              marginBottom: 12,
            }}
          >
            Open supply portal
          </a>
          <p style={{ fontSize: 12, color: C.textMuted, margin: 0, textAlign: 'center' }}>
            {portalUrl.replace(/^https?:\/\//, '')}
          </p>
        </div>
      </div>
    </div>
  );
}
