// ─── Autom8 Unified Design System ────────────────────────────────────────────
// Surfaces / pills used by denser Supply screens (Catalog, Ratecard).
// Brand colors come from theme/brand.js (Munafe emerald/gold) — keep in sync.

import { C as BrandC } from '../theme/brand';

export const C = {
  // Brand core (Munafe — same as theme/brand)
  primary:       BrandC.primary,
  primaryDark:   BrandC.primaryDark,
  primaryLight:  BrandC.primaryLight,
  primaryBorder: BrandC.primaryBorder,

  emerald:       BrandC.emerald,
  emeraldDark:   BrandC.emeraldDark,
  emeraldLight:  BrandC.emeraldLight,
  emeraldBorder: BrandC.emeraldBorder,
  gold:          BrandC.gold,

  // Semantic
  success:       BrandC.success,
  successLight:  BrandC.successLight,
  successBorder: BrandC.successBorder,
  successDark:   BrandC.successDark,

  warning:       BrandC.warning,
  warningLight:  BrandC.warningLight,
  warningBorder: BrandC.warningBorder,
  warningDark:   BrandC.warningDark,

  danger:        BrandC.danger,
  dangerLight:   BrandC.dangerLight,
  dangerBorder:  BrandC.dangerBorder,
  dangerDark:    BrandC.dangerDark,

  accent:        BrandC.accent,
  accentLight:   BrandC.accentLight,
  accentBorder:  BrandC.accentBorder,
  accentDark:    BrandC.accentDark,

  // Surfaces
  pageBg:        BrandC.pageBg,
  cardBg:        BrandC.cardBg,
  surfaceBg:     BrandC.surfaceBg,
  border:        BrandC.border,
  borderStrong:  BrandC.borderStrong,

  // Text
  text:          BrandC.text,
  textSub:       BrandC.textSub,
  textMuted:     BrandC.textMuted,
  textFaint:     '#C0C0BC',
};

export const PILL_VARIANTS = {
  blue:   { color: C.primaryDark,  bg: C.primaryLight,  border: C.primaryBorder  },
  teal:   { color: C.successDark,  bg: C.successLight,  border: C.successBorder  },
  green:  { color: '#27500A',      bg: '#EAF3DE',       border: '#C0DD97'        },
  amber:  { color: C.warningDark,  bg: C.warningLight,  border: C.warningBorder  },
  red:    { color: C.dangerDark,   bg: C.dangerLight,   border: C.dangerBorder   },
  gray:   { color: '#444441',      bg: '#F1EFE8',       border: '#D3D1C7'        },
  purple: { color: C.accentDark,   bg: C.accentLight,   border: C.accentBorder   },
};

export const ALERT_VARIANTS = {
  info:  { bg: C.primaryLight,  border: C.primaryBorder,  color: C.primaryDark  },
  good:  { bg: C.successLight,  border: C.successBorder,  color: C.successDark  },
  warn:  { bg: C.warningLight,  border: C.warningBorder,  color: C.warningDark  },
  error: { bg: C.dangerLight,   border: C.dangerBorder,   color: C.dangerDark   },
};

export const CARD = {
  background:   C.cardBg,
  border:       `0.5px solid ${C.border}`,
  borderRadius: 12,
  padding:      '16px 20px',
};

export const SECTION_LABEL = {
  fontSize:      11,
  fontWeight:    500,
  color:         C.textMuted,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom:  10,
};
