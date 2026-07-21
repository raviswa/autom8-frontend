import React from 'react';
import { C, FONTS } from '../theme/brand';

export default function BrandHeader({ title, subtitle, right, logoUrl, logoAlt }) {
  return (
    <div style={{
      background: C.emeraldDark,
      padding: '14px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Business logo, with the Autom8 mark as fallback */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={logoAlt || title || 'Business logo'}
            style={{
              width: 34, height: 34, borderRadius: 8, objectFit: 'cover',
              background: '#fff', border: `1px solid ${C.goldBorder}`, flexShrink: 0,
            }}
            onError={(event) => {
              event.currentTarget.style.display = 'none';
              event.currentTarget.nextElementSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div style={{
          width: 34, height: 34, borderRadius: 8, background: C.gold,
          display: logoUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONTS.heading, fontWeight: 600, fontSize: 15,
          color: C.emeraldDark, flexShrink: 0,
        }}>M</div>
        <div>
          <h1 style={{
            fontFamily: FONTS.heading, fontSize: 17, fontWeight: 600,
            color: '#fff', margin: 0, lineHeight: 1.2,
          }}>{title}</h1>
          {subtitle && (
            <p style={{ fontSize: 12, color: '#BFE0D6', margin: '2px 0 0' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{right}</div>}
    </div>
  );
}
