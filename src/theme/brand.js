// src/theme/brand.js
// Single source of truth for Autom8 brand — matches autom8.works marketing site.
// Import this everywhere instead of declaring a local `const C = {...}`.

export const FONTS = {
  heading: "'Fraunces', Georgia, serif",
  body:    "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono:    "'JetBrains Mono', ui-monospace, monospace",
};

// Light-mode (used in Manager/Owner/Marketing/Brand portals — data-dense screens
// stay light for readability; brand identity comes through in accents, not bg)
export const C = {
  // Brand core
  emerald:       "#0F5B4C",
  emeraldDark:   "#0A4038",
  emeraldLight:  "#E4F2EE",
  emeraldBorder: "#B8DED4",
  gold:          "#B8860B",
  goldDark:      "#8C6508",
  goldLight:     "#FBF1DC",
  goldBorder:    "#E8D19B",

  // Semantic (derived from brand core — 3-state system per screen)
  primary:       "#0F5B4C",   // was #378ADD
  primaryDark:   "#0A4038",
  primaryLight:  "#E4F2EE",
  primaryBorder: "#B8DED4",

  success:       "#1D9E75",
  successLight:  "#E1F5EE",
  successBorder: "#9FE1CB",
  successDark:   "#085041",

  warning:       "#B8860B",   // aligned to gold instead of generic amber
  warningLight:  "#FBF1DC",
  warningBorder: "#E8D19B",
  warningDark:   "#6B4E06",

  danger:        "#A32D2D",
  dangerLight:   "#FCEBEB",
  dangerBorder:  "#F7C1C1",
  dangerDark:    "#791F1F",

  accent:        "#7B61FF",
  accentLight:   "#EEEDFE",
  accentBorder:  "#CECBF6",
  accentDark:    "#3C3489",

  pageBg:        "#F6F5F1",   // warm off-white, not cold gray
  cardBg:        "#FFFFFF",
  surfaceBg:     "#F1EFE6",
  border:        "#E5E2D8",
  borderStrong:  "#D2CEBF",
  text:          "#161512",
  textSub:       "#55524A",
  textMuted:     "#948F80",
};

// Dark mode (KDS — kitchen display, brand-dark instead of pure black)
export const CD = {
  bg:            "#0B1A16",   // emerald-black, not #0d0d0d
  bgElevated:    "#122822",
  border:        "#1E3A32",
  text:          "#F0EEE6",
  textMuted:     "#7A9089",
  emerald:       "#1D9E75",
  gold:          "#D4AF37",
  danger:        "#EF4444",
  warning:       "#F59E0B",
};

export const LOGO_MARK = (size = 28) => `
  <svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="10" fill="${C.emerald}"/>
    <path d="M11 27V13h4l5 8 5-8h4v14h-3.5v-9l-4 6.5h-3L14.5 18v9H11z" fill="${C.gold}"/>
  </svg>
`;
