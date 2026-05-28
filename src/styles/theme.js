// ─── Autom8 Unified Design System ────────────────────────────────────────────
// Import this in all three portals for a consistent visual language.

export const C = {
  // Brand
  primary:       "#378ADD",
  primaryDark:   "#185FA5",
  primaryLight:  "#E6F1FB",
  primaryBorder: "#B5D4F4",

  // Semantic — success
  success:       "#1D9E75",
  successLight:  "#E1F5EE",
  successBorder: "#9FE1CB",
  successDark:   "#085041",

  // Semantic — warning
  warning:       "#BA7517",
  warningLight:  "#FAEEDA",
  warningBorder: "#FAC775",
  warningDark:   "#633806",

  // Semantic — danger
  danger:        "#A32D2D",
  dangerLight:   "#FCEBEB",
  dangerBorder:  "#F7C1C1",
  dangerDark:    "#791F1F",

  // Accent (Claude / AI)
  accent:        "#7B61FF",
  accentLight:   "#EEEDFE",
  accentBorder:  "#CECBF6",
  accentDark:    "#3C3489",

  // Surfaces
  pageBg:        "#F5F5F3",
  cardBg:        "#ffffff",
  surfaceBg:     "#F5F5F3",
  border:        "#E8E8E5",
  borderStrong:  "#D0D0CC",

  // Text
  text:          "#111111",
  textSub:       "#555555",
  textMuted:     "#999999",
  textFaint:     "#C0C0BC",
};

export const PILL_VARIANTS = {
  blue:   { color: C.primaryDark,  bg: C.primaryLight,  border: C.primaryBorder  },
  teal:   { color: C.successDark,  bg: C.successLight,  border: C.successBorder  },
  green:  { color: "#27500A",      bg: "#EAF3DE",       border: "#C0DD97"        },
  amber:  { color: C.warningDark,  bg: C.warningLight,  border: C.warningBorder  },
  red:    { color: C.dangerDark,   bg: C.dangerLight,   border: C.dangerBorder   },
  gray:   { color: "#444441",      bg: "#F1EFE8",       border: "#D3D1C7"        },
  purple: { color: C.accentDark,   bg: C.accentLight,   border: C.accentBorder   },
};

export const ALERT_VARIANTS = {
  info:  { bg: C.primaryLight,  border: C.primaryBorder,  color: C.primaryDark  },
  good:  { bg: C.successLight,  border: C.successBorder,  color: C.successDark  },
  warn:  { bg: C.warningLight,  border: C.warningBorder,  color: C.warningDark  },
  error: { bg: C.dangerLight,   border: C.dangerBorder,   color: C.dangerDark   },
};

// Shared component styles (use as style={...CARD} or spread)
export const CARD = {
  background:   C.cardBg,
  border:       `0.5px solid ${C.border}`,
  borderRadius: 12,
  padding:      "16px 20px",
};

export const SECTION_LABEL = {
  fontSize:      11,
  fontWeight:    500,
  color:         C.textMuted,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom:  10,
};
