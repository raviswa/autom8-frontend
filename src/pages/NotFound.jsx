import React from 'react';
import { useNavigate } from 'react-router-dom';
import { C, FONTS } from '../theme/brand';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONTS.body, textAlign: 'center', color: '#fff',
      background: `linear-gradient(160deg, ${C.emeraldDark} 0%, ${C.emerald} 55%, #0A2E27 100%)`,
    }}>
      <div>
        <div style={{ fontFamily: FONTS.heading, fontSize: 96, fontWeight: 600, opacity: 0.25, marginBottom: 8 }}>404</div>
        <h1 style={{ fontFamily: FONTS.heading, fontSize: 28, fontWeight: 600, margin: '0 0 10px' }}>Page not found</h1>
        <p style={{ fontSize: 14, color: '#BFE0D6', marginBottom: 28 }}>The page you're looking for doesn't exist.</p>
        <button
          onClick={() => navigate('/login')}
          style={{
            background: C.gold, color: C.emeraldDark, border: 'none', fontWeight: 600,
            padding: '12px 28px', borderRadius: 10, fontSize: 14, cursor: 'pointer',
          }}
        >
          Back to login
        </button>
      </div>
    </div>
  );
}
