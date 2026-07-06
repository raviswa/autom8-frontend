import { useEffect, useState, useCallback, useRef, Fragment } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
import { C } from '../theme/brand';

const CARD = { background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "16px 20px" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " +
    d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function normalizeTemplateName(raw) {
  return raw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function charCountColor(len, max = 1024) {
  if (len >= 950) return C.danger;
  if (len >= 800) return C.warning;
  return C.textMuted;
}

function Tooltip({ text, children, style }) {
  return (
    <span title={text} style={{ cursor: "help", display: "inline-flex", alignItems: "center", ...style }}>
      {children}
    </span>
  );
}

function resolvePreviewText(text, previewName, restaurantName) {
  if (!text) return "";
  return text
    .replace(/\{\{name\}\}/gi, previewName || "Ravi")
    .replace(/\{\{restaurant\}\}/gi, restaurantName || "Hotel Munafe")
    .replace(/\{\{date\}\}/gi, new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))
    .replace(/\{\{token\}\}/gi, "T-042")
    .replace(/\{\{order\}\}/gi, "ORD-001")
    .replace(/\*([^*]+)\*/g, (_, t) => t)
    .replace(/_([^_]+)_/g, (_, t) => t);
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return <div style={{ ...CARD, ...style }}>{children}</div>;
}

function CardHeader({ title, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{title}</span>
      {right}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </div>
  );
}

const PILL_VARIANTS = {
  blue:   { color: C.primaryDark,  background: C.primaryLight  },
  teal:   { color: C.successDark,  background: C.successLight  },
  green:  { color: "#27500A",      background: "#EAF3DE"       },
  amber:  { color: C.warningDark,  background: C.warningLight  },
  red:    { color: C.dangerDark,   background: C.dangerLight   },
  gray:   { color: "#444441",      background: "#F1EFE8"       },
  purple: { color: C.accentDark,   background: C.accentLight   },
};

function Pill({ label, variant = "blue" }) {
  const v = PILL_VARIANTS[variant] ?? PILL_VARIANTS.blue;
  return (
    <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 20, letterSpacing: "0.03em", ...v }}>
      {label}
    </span>
  );
}

const BTN_VARIANTS = {
  primary:   { background: C.primary,      color: "#fff",         border: `0.5px solid ${C.primaryDark}` },
  secondary: { background: C.surfaceBg,    color: C.text,         border: `0.5px solid ${C.border}`      },
  danger:    { background: C.dangerLight,  color: C.danger,       border: `0.5px solid ${C.dangerBorder}`},
  green:     { background: C.successLight, color: C.successDark,  border: `0.5px solid ${C.successBorder}`},
  ghost:     { background: "transparent",  color: C.textMuted,    border: `0.5px solid ${C.border}`      },
};

function Btn({ children, onClick, variant = "primary", disabled, style }) {
  const v = BTN_VARIANTS[variant] ?? BTN_VARIANTS.primary;
  return (
    <button
      style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, fontWeight: 500, transition: "opacity .15s", ...v, ...style }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function Spinner({ size = 18 }) {
  return (
    <div style={{ width: size, height: size, border: `2px solid ${C.border}`, borderTop: `2px solid ${C.primary}`, borderRadius: "50%", animation: "spin .7s linear infinite", display: "inline-block" }} />
  );
}

function AlertBanner({ type = "warn", children }) {
  const variants = {
    info:  { bg: C.primaryLight,  border: C.primaryBorder,  color: C.primaryDark  },
    good:  { bg: C.successLight,  border: C.successBorder,  color: C.successDark  },
    warn:  { bg: C.warningLight,  border: C.warningBorder,  color: C.warningDark  },
    error: { bg: C.dangerLight,   border: C.dangerBorder,   color: C.dangerDark   },
  };
  const s = variants[type];
  return (
    <div style={{ fontSize: 12, background: s.bg, border: `0.5px solid ${s.border}`, borderRadius: 8, padding: "8px 12px", color: s.color, lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function MetricTile({ label, value, color }) {
  return (
    <div style={{ background: C.surfaceBg, borderRadius: 10, padding: "10px 12px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: color ?? C.text }}>{value}</div>
    </div>
  );
}

// ─── Segment definitions ──────────────────────────────────────────────────────
const SEGMENTS = [
  { key: "all",            label: "All customers",     icon: "👥", desc: "Everyone who has ever ordered",              pillVariant: "blue"   },
  { key: "recent",         label: "Recent visitors",   icon: "🕐", desc: "Ordered in the last 7 days",                 pillVariant: "teal"   },
  { key: "lapsed",         label: "Lapsed customers",  icon: "💤", desc: "Ordered 14–30 days ago, not since",          pillVariant: "amber"  },
  { key: "takeaway",       label: "Takeaway regulars", icon: "🥡", desc: "3+ takeaway orders",                         pillVariant: "purple" },
  { key: "high_value",     label: "High value",        icon: "⭐", desc: "Total spend above ₹500",                     pillVariant: "red"    },
  { key: "never_returned", label: "One-time visitors", icon: "🔁", desc: "Ordered exactly once, more than 7 days ago", pillVariant: "gray"   },
];

const SEG_ACCENTS = {
  all:            { color: C.primary,    bg: C.primaryLight  },
  recent:         { color: C.success,    bg: C.successLight  },
  lapsed:         { color: C.warning,    bg: C.warningLight  },
  takeaway:       { color: C.accent,     bg: C.accentLight   },
  high_value:     { color: "#C0392B",    bg: "#FFF0EE"       },
  never_returned: { color: "#5F6368",    bg: "#F7F7F5"       },
};

// ─── AI Segment Suggester ─────────────────────────────────────────────────────
function AISegmentSuggester({ apiClient, onSegmentSelected, onMessageDrafted, onCreateTemplate }) {
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const suggest = async () => {
    if (!goal.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await apiClient.post("/api/marketing/ai-suggest", { goal });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const apply = () => {
    if (!result) return;
    onSegmentSelected(result.segment);
    if (result.suggested_message) onMessageDrafted(result.suggested_message);
  };

  return (
    <Card style={{ background: C.surfaceBg, border: `0.5px solid ${C.accentBorder}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 15 }}>✦</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>AI segment suggester</span>
        <Pill label="Powered by Claude" variant="purple" />
      </div>
      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12, lineHeight: 1.6 }}>
        Describe your goal in plain English — Claude will suggest the right segment and draft a message.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={goal}
          onChange={e => setGoal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && suggest()}
          placeholder="e.g. Bring back customers who haven't visited in 2 weeks"
          style={{ flex: 1, fontSize: 12, padding: "8px 12px", borderRadius: 8, border: `0.5px solid ${C.accentBorder}`, background: C.cardBg, outline: "none", color: C.text }}
        />
        <Btn onClick={suggest} disabled={loading || !goal.trim()}>
          {loading ? <Spinner size={14} /> : "Suggest →"}
        </Btn>
      </div>

      {error && <AlertBanner type="error" style={{ marginTop: 10 }}>{error}</AlertBanner>}

      {result && (() => {
        const seg = SEGMENTS.find(s => s.key === result.segment);
        return (
          <div style={{ marginTop: 12, background: C.cardBg, borderRadius: 10, padding: "12px 14px", border: `0.5px solid ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 3 }}>Suggested segment</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{seg?.icon} {seg?.label ?? result.segment}</div>
                <div style={{ fontSize: 11, color: C.textSub, marginTop: 2, lineHeight: 1.5 }}>{result.reasoning}</div>
              </div>
              {result.estimated_count != null && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 24, fontWeight: 500, color: C.primary }}>{result.estimated_count}</div>
                  <div style={{ fontSize: 10, color: C.textMuted }}>est. recipients</div>
                </div>
              )}
            </div>
            {result.suggested_message && (
              <div style={{ background: C.surfaceBg, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.textSub, lineHeight: 1.7, marginBottom: 10, whiteSpace: "pre-wrap" }}>
                {result.suggested_message}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn onClick={apply} variant="green">Use this segment →</Btn>
              {result.suggested_message && onCreateTemplate && (
                <Btn variant="secondary" onClick={() => onCreateTemplate({ goal: goal || result.reasoning, message: result.suggested_message, segment: result.segment })}>
                  I need a template for this →
                </Btn>
              )}
            </div>
          </div>
        );
      })()}
    </Card>
  );
}

// ─── Subscriber Stats ─────────────────────────────────────────────────────────
function SubscriberStats({ stats, loading }) {
  return (
    <Card>
      <CardHeader
        title="Subscriber overview"
        right={<Pill label="Live from DB" variant="teal" />}
      />
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}><Spinner /></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          <MetricTile label="Total subscribers" value={stats?.total ?? "—"} />
          <MetricTile label="New this week"      value={stats?.new_this_week ?? "—"} color={C.success}  />
          <MetricTile label="Active (30d)"       value={stats?.active_30d ?? "—"}    color={C.primary}  />
          <MetricTile label="Opted out"          value={stats?.opted_out ?? "—"}     color={C.warning}  />
        </div>
      )}
    </Card>
  );
}

// ─── Segment Cards ────────────────────────────────────────────────────────────
function SegmentCards({ counts, loading, selected, onSelect }) {
  return (
    <div>
      <SectionLabel>Customer segments</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {SEGMENTS.map(seg => {
          const acc     = SEG_ACCENTS[seg.key];
          const isActive = selected === seg.key;
          return (
            <div
              key={seg.key}
              onClick={() => onSelect(seg.key)}
              style={{
                background:   isActive ? acc.bg : C.cardBg,
                border:       `0.5px solid ${isActive ? acc.color + "55" : C.border}`,
                borderRadius: 10,
                padding:      "12px 14px",
                cursor:       "pointer",
                transition:   "all .15s",
                boxShadow:    isActive ? `0 0 0 2px ${acc.color}22` : "none",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: 18 }}>{seg.icon}</span>
                <span style={{ fontSize: 18, fontWeight: 500, color: acc.color }}>
                  {loading ? "—" : (counts?.[seg.key] ?? "—")}
                </span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginTop: 6 }}>{seg.label}</div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, lineHeight: 1.5 }}>{seg.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Broadcast Composer ───────────────────────────────────────────────────────
function BroadcastComposer({ apiClient, selectedSegment, draftMessage, segmentCounts, onSent, cloneFrom, previewName, restaurantName }) {
  const [segment,       setSegment]       = useState(selectedSegment || "recent");
  const [templates,     setTemplates]     = useState([]);
  const [templateName,  setTemplateName]  = useState("");
  const [customMessage, setCustomMessage] = useState(draftMessage || "");
  const [useTemplate,   setUseTemplate]   = useState(false);
  const [campaignName,  setCampaignName]  = useState("");
  const [sendMode,      setSendMode]      = useState("now");
  const [scheduledAt,   setScheduledAt]   = useState("");
  const [sending,       setSending]       = useState(false);
  const [sent,          setSent]          = useState(null);
  const [error,         setError]         = useState(null);
  const [loadingTpls,   setLoadingTpls]   = useState(false);

  useEffect(() => { if (selectedSegment) setSegment(selectedSegment); }, [selectedSegment]);
  useEffect(() => { if (draftMessage)    setCustomMessage(draftMessage); }, [draftMessage]);
  useEffect(() => {
    if (!cloneFrom) return;
    setCampaignName(cloneFrom.name ? `${cloneFrom.name} (copy)` : "");
    setSegment(cloneFrom.segment_type || cloneFrom.segment || "recent");
    if (cloneFrom.template_name) {
      setUseTemplate(true);
      setTemplateName(cloneFrom.template_name);
      setCustomMessage("");
    } else if (cloneFrom.custom_message) {
      setUseTemplate(false);
      setCustomMessage(cloneFrom.custom_message);
      setTemplateName("");
    }
    setSent(null);
    setError(null);
  }, [cloneFrom]);

  useEffect(() => {
    setLoadingTpls(true);
    apiClient.get("/api/marketing/templates")
      .then(res => setTemplates(res.data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTpls(false));
  }, [apiClient]);

  const recipientCount = segmentCounts?.[segment] ?? "?";
  const segInfo = SEGMENTS.find(s => s.key === segment);
  const acc = SEG_ACCENTS[segment] ?? SEG_ACCENTS.all;

  const send = async () => {
    if (!campaignName.trim()) { setError("Campaign name is required"); return; }
    if (!useTemplate && !customMessage.trim()) { setError("Message is required"); return; }
    if (useTemplate && !templateName) { setError("Select a template"); return; }
    if (sendMode === "later" && !scheduledAt) { setError("Pick a date and time to schedule"); return; }
    if (sendMode === "later" && new Date(scheduledAt).getTime() <= Date.now() + 60_000) {
      setError("Scheduled time must be at least 1 minute in the future"); return;
    }
    setSending(true); setError(null); setSent(null);
    try {
      const res = await apiClient.post("/api/marketing/broadcast", {
        name: campaignName, segment, template_name: useTemplate ? templateName : null,
        custom_message: useTemplate ? null : customMessage,
        scheduled_at: sendMode === "later" ? new Date(scheduledAt).toISOString() : null,
      });
      setSent(res.data); onSent?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setSending(false);
  };

  const inputStyle = { width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.text, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 5, display: "block" };
  const toggleBtnStyle = (active) => ({
    flex: 1, fontSize: 12, padding: "7px", borderRadius: 8, cursor: "pointer", fontWeight: active ? 500 : 400,
    border: `0.5px solid ${active ? C.primary : C.border}`,
    background: active ? C.primaryLight : C.cardBg,
    color: active ? C.primaryDark : C.textMuted,
  });

  return (
    <Card>
      <CardHeader
        title="Broadcast composer"
        right={segInfo ? <Pill label={`${segInfo.icon} ${segInfo.label}`} variant={segInfo.pillVariant} /> : null}
      />

      {sent ? (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>{sent.scheduled ? "📅" : "✅"}</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 4 }}>
            {sent.scheduled ? "Campaign scheduled" : "Campaign sent"}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted }}>
            {sent.scheduled
              ? `${sent.recipient_count} messages queued for ${fmtDateTime(sent.scheduled_at)}`
              : `${sent.sent_count ?? sent.recipient_count} messages dispatched`}
          </div>
          {!sent.scheduled && (
            <div style={{ marginTop: 14, background: C.successLight, border: `0.5px solid ${C.successBorder}`, borderRadius: 10, padding: "12px 16px", textAlign: "left" }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: C.successDark, marginBottom: 6 }}>Campaign ROI (updates within 48h)</div>
              <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.7 }}>
                You sent to <strong>{sent.recipient_count ?? sent.sent_count}</strong> customers.
                Check History for orders and revenue attributed within 48 hours.
              </div>
            </div>
          )}
          <Btn variant="secondary" style={{ marginTop: 14 }} onClick={() => { setSent(null); setCampaignName(""); setCustomMessage(""); setSendMode("now"); setScheduledAt(""); }}>
            {sent.scheduled ? "Schedule another" : "Send another"}
          </Btn>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          <div>
            <label style={labelStyle}>Campaign name</label>
            <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. May re-engagement, Lunch special" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Target segment</label>
            <select value={segment} onChange={e => setSegment(e.target.value)} style={{ ...inputStyle, appearance: "auto" }}>
              {SEGMENTS.map(s => (
                <option key={s.key} value={s.key}>{s.icon} {s.label} ({segmentCounts?.[s.key] ?? "?"} customers)</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Message type</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={toggleBtnStyle(!useTemplate)} onClick={() => setUseTemplate(false)}>Free-form message</button>
              <button style={toggleBtnStyle(useTemplate)}  onClick={() => setUseTemplate(true)}>Approved template</button>
            </div>
            {!useTemplate && (
              <div style={{ marginTop: 6 }}>
                <AlertBanner type="warn">Free-form messages only work within the 24h conversation window. Use a template for inactive customers.</AlertBanner>
              </div>
            )}
          </div>

          {!useTemplate ? (
            <div>
              <label style={labelStyle}>Message <span style={{ color: C.textMuted, fontWeight: 400 }}>(use {"{{name}}"} for customer name)</span></label>
              <textarea
                value={customMessage} onChange={e => setCustomMessage(e.target.value)} rows={4}
                placeholder={"Hi {{name}}, we missed you at Hotel Munafe! 🍽️ Come visit us today."}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }}
              />
              <div style={{ fontSize: 10, color: C.textMuted, textAlign: "right", marginTop: 3 }}>{customMessage.length} chars</div>
              {customMessage.trim() && (
                <div style={{ marginTop: 8, background: C.surfaceBg, borderRadius: 8, padding: "8px 10px", fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
                  <span style={{ fontSize: 10, color: C.textMuted }}>Preview: </span>
                  {resolvePreviewText(customMessage, previewName, restaurantName)}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Select approved template</label>
              {loadingTpls ? (
                <div style={{ fontSize: 12, color: C.textMuted }}>Loading templates…</div>
              ) : templates.length === 0 ? (
                <AlertBanner type="warn">No approved templates found. Create and get them approved in Meta Business Suite first.</AlertBanner>
              ) : (
                <select value={templateName} onChange={e => setTemplateName(e.target.value)} style={{ ...inputStyle, appearance: "auto" }}>
                  <option value="">— Choose a template —</option>
                  {templates.map(t => <option key={t.name} value={t.name}>{t.name} ({t.category})</option>)}
                </select>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, background: C.surfaceBg, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>Recipients</div>
              <div style={{ fontSize: 20, fontWeight: 500, color: C.text }}>{recipientCount}</div>
            </div>
            {useTemplate && (
              <div style={{ flex: 1, background: C.warningLight, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: C.warningDark, marginBottom: 2 }}>Est. cost (₹0.58/msg)</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: C.warning }}>
                  {typeof recipientCount === "number" ? `₹${(recipientCount * 0.58).toFixed(2)}` : "—"}
                </div>
              </div>
            )}
          </div>

          {error && <AlertBanner type="error">{error}</AlertBanner>}

          <div>
            <label style={labelStyle}>When to send</label>
            <div style={{ display: "flex", gap: 8, marginBottom: sendMode === "later" ? 10 : 0 }}>
              <button style={toggleBtnStyle(sendMode === "now")} onClick={() => setSendMode("now")}>Send now</button>
              <button style={toggleBtnStyle(sendMode === "later")} onClick={() => setSendMode("later")}>
                Schedule for later <Pill label="Pro" variant="purple" />
              </button>
            </div>
            {sendMode === "later" && (
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                min={new Date(Date.now() + 120_000).toISOString().slice(0, 16)}
                style={inputStyle}
              />
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignSelf: "flex-end", flexWrap: "wrap" }}>
            <Btn onClick={send} disabled={sending} style={{ padding: "8px 20px" }}>
              {sending ? <><Spinner size={14} /> &nbsp;{sendMode === "later" ? "Scheduling…" : "Sending…"}</>
                : sendMode === "later" ? `Schedule for ${recipientCount} customers` : `Send to ${recipientCount} customers`}
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Template Create Modal ────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en",    label: "English"     },
  { code: "en_US", label: "English (US)"},
  { code: "ta",    label: "Tamil"       },
  { code: "hi",    label: "Hindi"       },
];

const RESTAURANT_VARIABLES = [
  { label: "Customer name",   insert: "{{name}}",       preview: "Ravi"         },
  { label: "Restaurant name", insert: "{{restaurant}}", preview: "Hotel Munafe" },
  { label: "Date",            insert: "{{date}}",       preview: "20 May 2026"  },
  { label: "Token number",    insert: "{{token}}",      preview: "T-042"        },
  { label: "Order number",    insert: "{{order}}",      preview: "ORD-001"      },
];

const BUTTON_TYPES = {
  QUICK_REPLY:  { label: "Quick reply",       icon: "↩" },
  URL:          { label: "Visit website",     icon: "🔗" },
  PHONE_NUMBER: { label: "Call phone number", icon: "📞" },
  COPY_CODE:    { label: "Copy offer code",   icon: "🎟" },
};

function TemplateCreateModal({ apiClient, onClose, onCreated, initialContext, previewName, restaurantName }) {
  const [form, setForm] = useState({
    name: "", category: "MARKETING", language: "en", headerType: "NONE",
    headerText: "", mediaFile: null, mediaPreviewUrl: null,
    body: initialContext?.message || "",
    footer: "Reply STOP to opt out",
    buttons: [],
  });
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showVarMenu, setShowVarMenu] = useState(false);
  const [showBtnMenu, setShowBtnMenu] = useState(false);
  const [aiRewriting, setAiRewriting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [aiGoal, setAiGoal] = useState(initialContext?.goal_key || "win_back");
  const bodyRef = useRef(null);

  const previewVars = RESTAURANT_VARIABLES.map(v =>
    v.insert === "{{name}}" ? { ...v, preview: previewName || v.preview } : v
  );

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const onNameChange = (raw) => set("name", normalizeTemplateName(raw));
  const nameValid = !form.name || /^[a-z0-9_]+$/.test(form.name);

  const insertVariable = (token) => {
    const el = bodyRef.current;
    if (!el) { set("body", form.body + token); setShowVarMenu(false); return; }
    const start = el.selectionStart, end = el.selectionEnd;
    set("body", form.body.slice(0, start) + token + form.body.slice(end));
    setShowVarMenu(false);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); }, 0);
  };

  const addButton = (type) => {
    setShowBtnMenu(false);
    const counts = form.buttons.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
    if (type === "URL"          && (counts.URL || 0) >= 2) return;
    if (type === "PHONE_NUMBER" && (counts.PHONE_NUMBER || 0) >= 1) return;
    if (type === "COPY_CODE"    && (counts.COPY_CODE || 0) >= 1) return;
    if (form.buttons.length >= 3) return;
    setForm(f => ({ ...f, buttons: [...f.buttons, { type, text: "", url: "", phone_number: "", code: "" }] }));
  };
  const updateBtn = (i, key, val) => {
    const btns = [...form.buttons]; btns[i] = { ...btns[i], [key]: val };
    setForm(f => ({ ...f, buttons: btns }));
  };
  const removeBtn = (i) => setForm(f => ({ ...f, buttons: f.buttons.filter((_, idx) => idx !== i) }));

  const handleMediaSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, mediaFile: file, mediaPreviewUrl: URL.createObjectURL(file) }));
  };

  const aiRewrite = async () => {
    if (!form.body.trim()) return;
    setAiRewriting(true);
    try {
      const res = await apiClient.post("/api/marketing/ai-rewrite", { text: form.body, category: form.category });
      set("body", res.data.rewritten);
    } catch (err) { console.error("AI rewrite failed:", err.message); }
    setAiRewriting(false);
  };

  const aiGenerate = async () => {
    setAiGenerating(true); setError(null);
    try {
      const res = await apiClient.post("/api/marketing/ai-generate", {
        goal_key: aiGoal,
        goal_text: initialContext?.goal,
        language: form.language,
        category: form.category,
        restaurant_name: restaurantName,
      });
      set("name", res.data.template_name || form.name);
      set("body", res.data.body || form.body);
      set("footer", res.data.footer || form.footer);
      if (res.data.category) set("category", res.data.category);
      setShowAiGenerate(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setAiGenerating(false);
  };

  const saveDraft = async () => {
    setSavingDraft(true); setError(null);
    try {
      const res = await apiClient.post("/api/marketing/template-drafts", {
        id: draftId,
        name: form.name || "untitled_draft",
        payload: { ...form, mediaFile: null, mediaPreviewUrl: null },
      });
      setDraftId(res.data.draft?.id);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setSavingDraft(false);
  };

  const previewText = (text) => resolvePreviewText(text, previewName, restaurantName);

  const submit = async () => {
    if (!form.name.trim()) { setError("Template name is required"); return; }
    if (!form.body.trim()) { setError("Message body is required"); return; }
    if (!/^[a-z0-9_]+$/.test(form.name)) { setError("Name must be lowercase letters, numbers and underscores only"); return; }
    setSaving(true); setError(null);
    try {
      let mediaHandle = null;
      if (form.mediaFile && ["IMAGE","VIDEO","DOCUMENT"].includes(form.headerType)) {
        setUploading(true);
        const formData = new FormData();
        formData.append("file", form.mediaFile); formData.append("type", form.headerType.toLowerCase());
        try {
          const r = await apiClient.post("/api/marketing/media/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
          mediaHandle = r.data.handle;
        } catch (e) { console.warn("Media upload failed:", e.message); }
        setUploading(false);
      }
      const components = [
        ...(form.headerType !== "NONE" ? [{
          type: "HEADER", format: form.headerType,
          ...(form.headerType === "TEXT" ? { text: form.headerText } : {}),
          ...(mediaHandle ? { example: { header_handle: [mediaHandle] } } : {}),
        }] : []),
        {
          type: "BODY", text: form.body,
            ...(form.body.match(/\{\{[^}]+\}\}/g) ? {
            example: { body_text: [(form.body.match(/\{\{[^}]+\}\}/g) || []).map(v => previewVars.find(r => r.insert === v)?.preview || "sample")] }
          } : {}),
        },
        ...(form.footer.trim() ? [{ type: "FOOTER", text: form.footer }] : []),
        ...(form.buttons.filter(b => b.text).length > 0 ? [{
          type: "BUTTONS",
          buttons: form.buttons.filter(b => b.text).map(b => ({
            type: b.type, text: b.text,
            ...(b.type === "URL"          ? { url: b.url } : {}),
            ...(b.type === "PHONE_NUMBER" ? { phone_number: b.phone_number } : {}),
            ...(b.type === "COPY_CODE"    ? { example: [b.code || "OFFER10"] } : {}),
          })),
        }] : []),
      ];
      await apiClient.post("/api/marketing/templates/create", { name: form.name, category: form.category, language: form.language, components });
      setSuccess(true);
      setTimeout(() => { onCreated(); onClose(); }, 2000);
    } catch (err) { setError(err.response?.data?.error || err.message); }
    setSaving(false);
  };

  const inputStyle = { width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.border}`, boxSizing: "border-box", background: C.cardBg, color: C.text, outline: "none" };
  const labelStyle = { fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 5, display: "block" };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, backdropFilter: "blur(4px)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: "min(1160px,95vw)", maxHeight: "92vh",
        background: C.cardBg, borderRadius: 16,
        boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
        zIndex: 201, display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Modal header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", borderBottom: `0.5px solid ${C.border}` }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: C.text }}>Message template</span>
          <button onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: C.textMuted, lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* ── Left: form ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>

            {success && (
              <div style={{ background: C.successLight, border: `0.5px solid ${C.successBorder}`, borderRadius: 10, padding: 16, textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.successDark }}>Template submitted for approval</div>
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>Meta typically approves within 24–48 hours.</div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Template name *</label>
                <input
                  value={form.name}
                  onChange={e => onNameChange(e.target.value)}
                  placeholder="vada_pav_offer_june"
                  style={{
                    ...inputStyle,
                    borderColor: form.name && !nameValid ? C.danger : C.border,
                  }}
                />
                {form.name && !nameValid ? (
                  <div style={{ fontSize: 10, color: C.danger, marginTop: 3 }}>Use lowercase letters, numbers, and underscores only</div>
                ) : (
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>Spaces auto-convert to underscores · lowercase only</div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Locale *</label>
                <select value={form.language} onChange={e => set("language", e.target.value)} style={{ ...inputStyle, appearance: "auto" }}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>
                  Category *{" "}
                  <Tooltip text="Use Utility for order confirmations and transactional updates (lower cost, no marketing frequency limits). Use Marketing for promotions and re-engagement.">
                    <span style={{ fontSize: 10, color: C.textMuted }}>ⓘ</span>
                  </Tooltip>
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["UTILITY","MARKETING"].map(cat => (
                    <button key={cat} onClick={() => set("category", cat)} style={{
                      flex: 1, fontSize: 12, padding: "8px", borderRadius: 8, cursor: "pointer",
                      border: `0.5px solid ${form.category === cat ? C.primary : C.border}`,
                      background: form.category === cat ? C.primaryLight : C.cardBg,
                      color: form.category === cat ? C.primaryDark : C.textMuted,
                      fontWeight: form.category === cat ? 500 : 400,
                    }}>
                      {cat.charAt(0) + cat.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>
                  Utility = confirmations · Marketing = promos &amp; win-back
                </div>
              </div>
              <div>
                <label style={labelStyle}>Header type *</label>
                <select value={form.headerType} onChange={e => { set("headerType", e.target.value); set("mediaFile", null); set("mediaPreviewUrl", null); }} style={{ ...inputStyle, appearance: "auto" }}>
                  <option value="NONE">No header</option>
                  <option value="TEXT">Text</option>
                  <option value="IMAGE">Image</option>
                  <option value="VIDEO">Video</option>
                  <option value="DOCUMENT">Document</option>
                </select>
              </div>
            </div>

            {form.headerType === "TEXT" && (
              <div>
                <label style={labelStyle}>Header text</label>
                <input value={form.headerText} onChange={e => set("headerText", e.target.value)} placeholder="Header text (60 chars max)" maxLength={60} style={inputStyle} />
              </div>
            )}
            {["IMAGE","VIDEO","DOCUMENT"].includes(form.headerType) && (
              <div>
                <label style={labelStyle}>{form.headerType.charAt(0) + form.headerType.slice(1).toLowerCase()} upload</label>
                <div onClick={() => document.getElementById("media-upload-input").click()} style={{
                  border: `1px dashed ${C.border}`, borderRadius: 10, padding: "20px",
                  textAlign: "center", cursor: "pointer", background: C.surfaceBg,
                }}>
                  {form.mediaPreviewUrl ? (
                    <div>
                      {form.headerType === "IMAGE" && <img src={form.mediaPreviewUrl} alt="preview" style={{ maxHeight: 100, maxWidth: "100%", borderRadius: 6, marginBottom: 8 }} />}
                      {form.headerType === "VIDEO" && <video src={form.mediaPreviewUrl} style={{ maxHeight: 100, maxWidth: "100%", borderRadius: 6, marginBottom: 8 }} controls />}
                      {form.headerType === "DOCUMENT" && <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>}
                      <div style={{ fontSize: 11, color: C.textSub }}>{form.mediaFile?.name}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>Click to change</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{form.headerType === "IMAGE" ? "🖼" : form.headerType === "VIDEO" ? "🎬" : "📄"}</div>
                      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 4 }}>Click to upload {form.headerType.toLowerCase()}</div>
                      <div style={{ fontSize: 10, color: C.textMuted }}>
                        {form.headerType === "IMAGE" ? "JPG, PNG · up to 5 MB" : form.headerType === "VIDEO" ? "MP4 · up to 16 MB" : "PDF · up to 100 MB"}
                      </div>
                    </div>
                  )}
                </div>
                <input id="media-upload-input" type="file" style={{ display: "none" }}
                  accept={form.headerType === "IMAGE" ? "image/*" : form.headerType === "VIDEO" ? "video/*" : ".pdf,.doc,.docx"}
                  onChange={handleMediaSelect} />
              </div>
            )}

            {/* Body */}
            <div>
              <label style={labelStyle}>Message body (1024) *</label>
              <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                <div style={{ position: "relative" }}>
                  <button onClick={() => { setShowVarMenu(v => !v); setShowBtnMenu(false); }}
                    style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${C.border}`, background: C.cardBg, cursor: "pointer" }}>
                    Variables ▾
                  </button>
                  {showVarMenu && (
                    <div style={{ position: "absolute", top: "110%", left: 0, background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.1)", zIndex: 10, minWidth: 180, overflow: "hidden" }}>
                      {previewVars.map(v => (
                        <div key={v.insert} onClick={() => insertVariable(v.insert)}
                          style={{ padding: "9px 14px", fontSize: 12, cursor: "pointer", color: C.textSub, borderBottom: `0.5px solid ${C.border}` }}
                          onMouseEnter={e => e.target.style.background = C.surfaceBg}
                          onMouseLeave={e => e.target.style.background = ""}>
                          {v.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => insertVariable("{{name}}")}
                  style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${C.border}`, background: C.cardBg, cursor: "pointer", color: C.accent, fontWeight: 500 }}>
                  Name
                </button>
                <Tooltip text="AI will improve your message for higher engagement while keeping it WhatsApp-compliant. Requires a draft first.">
                  <button onClick={aiRewrite} disabled={aiRewriting || !form.body.trim()}
                    style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${C.border}`, background: C.cardBg, cursor: "pointer", color: C.primary, display: "flex", alignItems: "center", gap: 4, opacity: !form.body.trim() ? 0.4 : 1 }}>
                    {aiRewriting ? <><Spinner size={12} /> Rewriting…</> : "✦ AI rewrite"}
                  </button>
                </Tooltip>
                <button onClick={() => setShowAiGenerate(v => !v)}
                  style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: `0.5px solid ${C.accentBorder}`, background: C.accentLight, cursor: "pointer", color: C.accentDark, fontWeight: 500 }}>
                  ✦ Generate with AI
                </button>
              </div>
              {showAiGenerate && (
                <div style={{ background: C.accentLight, border: `0.5px solid ${C.accentBorder}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: C.textSub, marginBottom: 8 }}>What&apos;s the goal of this message?</div>
                  <select value={aiGoal} onChange={e => setAiGoal(e.target.value)} style={{ ...inputStyle, marginBottom: 8, appearance: "auto" }}>
                    <option value="win_back">Bring back lapsed customers</option>
                    <option value="special">Announce a special</option>
                    <option value="loyalty">Reward loyal customers</option>
                    <option value="welcome">Welcome first-time customers</option>
                  </select>
                  <Btn onClick={aiGenerate} disabled={aiGenerating} style={{ fontSize: 11, padding: "6px 12px" }}>
                    {aiGenerating ? <><Spinner size={12} /> Generating…</> : "Generate template"}
                  </Btn>
                </div>
              )}
              <textarea ref={bodyRef} value={form.body} onChange={e => set("body", e.target.value)} rows={6} maxLength={1024}
                placeholder="Type your message. Use *bold* or _italic_ for formatting."
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }} />
              <div style={{ fontSize: 10, color: charCountColor(form.body.length), textAlign: "right", marginTop: 3, fontWeight: form.body.length >= 800 ? 500 : 400 }}>
                {form.body.length} / 1024
              </div>
            </div>

            <div>
              <label style={labelStyle}>Footer text <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional)</span></label>
              <input value={form.footer} onChange={e => set("footer", e.target.value)} placeholder="e.g. Reply STOP to unsubscribe" maxLength={60} style={inputStyle} />
            </div>

            {/* Buttons */}
            <div>
              {form.buttons.map((btn, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start", background: C.surfaceBg, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ flex: "none", minWidth: 90 }}>
                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Type</div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: C.textSub }}>{BUTTON_TYPES[btn.type]?.icon} {BUTTON_TYPES[btn.type]?.label}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Button text</div>
                    <input value={btn.text} onChange={e => updateBtn(i, "text", e.target.value)} placeholder="Button label" style={{ ...inputStyle, padding: "6px 8px" }} />
                  </div>
                  {btn.type === "URL" && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>URL</div>
                      <input value={btn.url} onChange={e => updateBtn(i, "url", e.target.value)} placeholder="https://…" style={{ ...inputStyle, padding: "6px 8px" }} />
                    </div>
                  )}
                  {btn.type === "PHONE_NUMBER" && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Phone</div>
                      <input value={btn.phone_number} onChange={e => updateBtn(i, "phone_number", e.target.value)} placeholder="+91 9500996033" style={{ ...inputStyle, padding: "6px 8px" }} />
                    </div>
                  )}
                  {btn.type === "COPY_CODE" && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Offer code</div>
                      <input value={btn.code} onChange={e => updateBtn(i, "code", e.target.value)} placeholder="MUNAFE10" style={{ ...inputStyle, padding: "6px 8px" }} />
                    </div>
                  )}
                  <button onClick={() => removeBtn(i)} style={{ fontSize: 16, color: C.textMuted, background: "none", border: "none", cursor: "pointer", paddingTop: 18 }}>✕</button>
                </div>
              ))}
              <div style={{ position: "relative" }}>
                <button onClick={() => { setShowBtnMenu(v => !v); setShowVarMenu(false); }}
                  style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.border}`, background: C.cardBg, cursor: "pointer" }}>
                  + Add button
                </button>
                {showBtnMenu && (
                  <div style={{ position: "absolute", top: "110%", left: 0, background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,.1)", zIndex: 10, minWidth: 260, overflow: "hidden" }}>
                    <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 500, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Quick reply</div>
                    <div onClick={() => addButton("QUICK_REPLY")} style={{ padding: "9px 14px", fontSize: 12, cursor: "pointer", color: C.textSub, borderBottom: `0.5px solid ${C.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surfaceBg} onMouseLeave={e => e.currentTarget.style.background = ""}>
                      ↩ Custom
                    </div>
                    <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 500, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Call to action</div>
                    {[
                      { type: "URL",          label: "Visit website",     note: "2 max" },
                      { type: "PHONE_NUMBER", label: "Call phone number", note: "1 max" },
                      { type: "COPY_CODE",    label: "Copy offer code",   note: "1 max" },
                    ].map(b => (
                      <div key={b.type} onClick={() => addButton(b.type)}
                        style={{ padding: "9px 14px", fontSize: 12, cursor: "pointer", color: C.textSub, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `0.5px solid ${C.border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surfaceBg} onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <span>{b.label}</span>
                        <span style={{ fontSize: 10, color: C.textMuted }}>{b.note}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && <AlertBanner type="error">{error}</AlertBanner>}

            <div style={{ display: "flex", gap: 10, paddingBottom: 8 }}>
              <Btn variant="secondary" onClick={onClose} style={{ minWidth: 80 }}>Cancel</Btn>
              <Btn variant="secondary" onClick={saveDraft} disabled={savingDraft || success} style={{ minWidth: 100 }}>
                {savingDraft ? <><Spinner size={14} /> Saving…</> : draftId ? "Update draft" : "Save draft"}
              </Btn>
              <Btn onClick={submit} disabled={saving || success} style={{ flex: 1, padding: "10px", fontSize: 13 }}>
                {uploading ? <><Spinner size={14} /> Uploading media…</> : saving ? <><Spinner size={14} /> Submitting…</> : "Save template"}
              </Btn>
            </div>
          </div>

          {/* ── Right: phone preview ── */}
          <div style={{ width: 320, background: C.surfaceBg, borderLeft: `0.5px solid ${C.border}`, padding: "24px 20px", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, alignSelf: "flex-start" }}>Preview</div>
            <div style={{ width: 250, background: "#1a1a2e", borderRadius: 34, padding: "8px 5px", boxShadow: "0 12px 40px rgba(0,0,0,.25)" }}>
              <div style={{ background: "#fff", borderRadius: 27, overflow: "hidden" }}>
                <div style={{ background: "#075E54", padding: "10px 12px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#fff", fontSize: 14 }}>←</span>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🏨</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#fff" }}>Business</div>
                    <div style={{ fontSize: 9, color: "#B2DFDB" }}>online</div>
                  </div>
                </div>
                <div style={{ background: "#ECE5DD", minHeight: 300, padding: "10px 8px" }}>
                  <div style={{ textAlign: "center", marginBottom: 8 }}>
                    <span style={{ background: "rgba(0,0,0,.15)", color: "#fff", fontSize: 9, padding: "2px 8px", borderRadius: 8 }}>
                      {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                  <div style={{ maxWidth: "90%", marginLeft: "auto" }}>
                    <div style={{ background: "#fff", borderRadius: "10px 0 10px 10px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
                      {form.headerType === "TEXT" && form.headerText && (
                        <div style={{ padding: "8px 10px 0", fontSize: 11, fontWeight: 500, color: "#111" }}>{previewText(form.headerText)}</div>
                      )}
                      {form.headerType === "IMAGE" && (
                        form.mediaPreviewUrl
                          ? <img src={form.mediaPreviewUrl} alt="" style={{ width: "100%", maxHeight: 110, objectFit: "cover", display: "block" }} />
                          : <div style={{ background: "#e0e0e0", height: 90, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🖼</div>
                      )}
                      {form.headerType === "DOCUMENT" && (
                        <div style={{ background: C.surfaceBg, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 16 }}>📄</span>
                          <span style={{ fontSize: 10, color: C.textSub }}>{form.mediaFile?.name || "Document"}</span>
                        </div>
                      )}
                      <div style={{ padding: "8px 10px 4px" }}>
                        {form.body
                          ? <div style={{ fontSize: 11, color: "#111", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{previewText(form.body)}</div>
                          : <div style={{ fontSize: 11, color: "#aaa", fontStyle: "italic" }}>Enter message body…</div>}
                      </div>
                      {form.footer && <div style={{ padding: "0 10px 5px", fontSize: 9, color: "#888" }}>{form.footer}</div>}
                      <div style={{ padding: "0 10px 7px", fontSize: 8, color: "#aaa", textAlign: "right" }}>
                        {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })} ✓✓
                      </div>
                    </div>
                    {form.buttons.filter(b => b.text).map((btn, i) => (
                      <div key={i} style={{ background: "#fff", borderRadius: 7, padding: "6px 10px", marginTop: 3, textAlign: "center", fontSize: 10, color: "#075E54", fontWeight: 500, boxShadow: "0 1px 2px rgba(0,0,0,.08)" }}>
                        {BUTTON_TYPES[btn.type]?.icon} {btn.text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 10, color: C.textMuted, textAlign: "center", lineHeight: 1.7, maxWidth: 220 }}>
              Templates are reviewed by Meta before use. Approval typically takes 24–48 hours.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Template Viewer ──────────────────────────────────────────────────────────
function TemplateViewer({ apiClient, previewName, restaurantName, templateModalContext, onClearTemplateContext }) {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalContext, setModalContext] = useState(null);

  useEffect(() => {
    if (templateModalContext) {
      setModalContext(templateModalContext);
      setShowModal(true);
      onClearTemplateContext?.();
    }
  }, [templateModalContext, onClearTemplateContext]);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get("/api/marketing/templates")
      .then(res => setTemplates(res.data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  const statusVariant = s => s === "APPROVED" ? "green" : s === "PENDING" ? "amber" : "red";
  const marketing = templates.filter(t => t.category === "MARKETING");
  const utility   = templates.filter(t => t.category === "UTILITY");

  const TemplateRow = ({ t }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: C.surfaceBg, borderRadius: 8, marginBottom: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 1 }}>{t.name}</div>
        <div style={{ fontSize: 10, color: C.textMuted }}>{t.language}</div>
        {t.components?.find(c => c.type === "BODY")?.text && (
          <div style={{ fontSize: 11, color: C.textSub, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>
            {t.components.find(c => c.type === "BODY").text}
          </div>
        )}
      </div>
      <Pill label={t.status} variant={statusVariant(t.status)} />
    </div>
  );

  return (
    <>
      {showModal && (
        <TemplateCreateModal
          apiClient={apiClient}
          previewName={previewName}
          restaurantName={restaurantName}
          initialContext={modalContext}
          onClose={() => { setShowModal(false); setModalContext(null); }}
          onCreated={() => { setShowModal(false); setModalContext(null); setTimeout(load, 1000); }}
        />
      )}
      <Card>
        <CardHeader
          title={<>Message templates <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400, marginLeft: 6 }}>{templates.length} total</span></>}
          right={
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="ghost" onClick={load} style={{ fontSize: 11, padding: "4px 10px" }}>Sync</Btn>
              <Btn onClick={() => { setModalContext(null); setShowModal(true); }} style={{ padding: "5px 12px" }}>+ New template</Btn>
            </div>
          }
        />
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}><Spinner /></div>
        ) : templates.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: "32px 0", background: C.surfaceBg, borderRadius: 10 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
            <div style={{ fontWeight: 500, marginBottom: 6, color: C.text }}>No templates yet</div>
            <div style={{ marginBottom: 16 }}>Create your first template to start sending campaigns.</div>
            <Btn onClick={() => { setModalContext(null); setShowModal(true); }}>+ Create template</Btn>
          </div>
        ) : (
          <div>
            {marketing.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SectionLabel>Marketing ({marketing.length})</SectionLabel>
                {marketing.map((t, i) => <TemplateRow key={i} t={t} />)}
              </div>
            )}
            {utility.length > 0 && (
              <div>
                <SectionLabel>Utility ({utility.length})</SectionLabel>
                {utility.map((t, i) => <TemplateRow key={i} t={t} />)}
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Campaign History ─────────────────────────────────────────────────────────
function CampaignHistory({ apiClient, refreshTrigger, onCloneCampaign, onResendCampaign }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get("/api/marketing/campaigns")
      .then(res => setCampaigns(res.data.campaigns || []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, [apiClient]);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const statusVariant = s => ({ completed: "green", sending: "blue", failed: "red", draft: "gray", scheduled: "purple" })[s] ?? "gray";

  return (
    <Card>
      <CardHeader
        title="Campaign history"
        right={<Btn variant="ghost" onClick={load} style={{ fontSize: 11, padding: "4px 10px" }}>Refresh</Btn>}
      />
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}><Spinner /></div>
      ) : campaigns.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: "24px 0", background: C.surfaceBg, borderRadius: 8 }}>
          No campaigns yet. Send your first broadcast above.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `0.5px solid ${C.border}` }}>
                {["Campaign","Segment","Sent","Status","Date","Actions"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: C.textMuted, fontWeight: 400, fontSize: 11, paddingBottom: 8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => {
                const seg = SEGMENTS.find(s => s.key === c.segment_type);
                const roi = c.roi || {};
                const isOpen = expanded === c.id;
                return (
                  <Fragment key={c.id || i}>
                    <tr style={{ borderBottom: `0.5px solid ${C.border}` }}>
                      <td style={{ padding: "8px 0", color: C.text, fontWeight: 500 }}>
                        <button onClick={() => setExpanded(isOpen ? null : c.id)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 500, color: C.text, fontSize: 12, textAlign: "left", padding: 0 }}>
                          {c.name} {c.status === "completed" && roi.orders_48h != null ? <span style={{ color: C.textMuted, fontWeight: 400 }}>· ₹{roi.revenue_48h ?? 0}</span> : null}
                        </button>
                      </td>
                      <td style={{ padding: "8px 0", color: C.textSub }}>{seg?.icon} {seg?.label ?? c.segment_type}</td>
                      <td style={{ padding: "8px 0", color: C.text }}>{c.sent_count ?? 0} / {c.recipient_count ?? 0}</td>
                      <td style={{ padding: "8px 0" }}><Pill label={c.status} variant={statusVariant(c.status)} /></td>
                      <td style={{ padding: "8px 0", color: C.textMuted }}>{fmtDateTime(c.scheduled_at || c.sent_at || c.created_at)}</td>
                      <td style={{ padding: "8px 0" }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Btn variant="ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => onCloneCampaign?.(c)}>Clone</Btn>
                          <Btn variant="ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => onResendCampaign?.(c)}>Resend segment</Btn>
                        </div>
                      </td>
                    </tr>
                    {isOpen && c.status === "completed" && (
                      <tr>
                        <td colSpan={6} style={{ padding: "0 0 12px" }}>
                          <div style={{ background: C.successLight, border: `0.5px solid ${C.successBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.textSub, lineHeight: 1.7 }}>
                            <strong style={{ color: C.successDark }}>Campaign ROI</strong> — You sent to {roi.sent_to ?? c.sent_count ?? 0} customers.
                            {" "}{roi.orders_48h ?? 0} placed orders within 48h.
                            {" "}Estimated revenue attributed: <strong>₹{roi.revenue_48h ?? 0}</strong>.
                            <span style={{ fontSize: 10, color: C.textMuted, display: "block", marginTop: 4 }}>Attribution is approximate — counts first completed order per recipient in the 48h window.</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Marketing Automations ────────────────────────────────────────────────────
const AUTOMATION_PRESETS = [
  { key: "lapsed_14d",        label: "14-day lapsed",     desc: "Customer hasn't ordered in 14 days → re-engagement", icon: "💤" },
  { key: "loyalty_5th_order", label: "5th order loyalty", desc: "5th order completed → loyalty reward",             icon: "⭐" },
  { key: "first_order",       label: "First order welcome", desc: "First order → welcome + what to try next",       icon: "👋" },
];

function AutomationsPanel({ apiClient, templates, onCreated }) {
  const [automations, setAutomations] = useState([]);
  const [triggers, setTriggers] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", trigger_type: "lapsed_14d", template_name: "", custom_message: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get("/api/marketing/automations")
      .then(res => { setAutomations(res.data.automations || []); setTriggers(res.data.triggers || {}); })
      .catch(() => setAutomations([]))
      .finally(() => setLoading(false));
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  const openPreset = (key) => {
    const preset = AUTOMATION_PRESETS.find(p => p.key === key);
    const trig = triggers[key];
    setForm({
      name: preset?.label || key,
      trigger_type: key,
      template_name: "",
      custom_message: trig?.defaultMessage || "",
    });
    setShowCreate(true);
    setError(null);
  };

  const create = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.template_name && !form.custom_message.trim()) { setError("Select a template or enter a message"); return; }
    setSaving(true); setError(null);
    try {
      await apiClient.post("/api/marketing/automations", form);
      setShowCreate(false);
      load();
      onCreated?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setSaving(false);
  };

  const toggle = async (id, is_active) => {
    try {
      await apiClient.patch(`/api/marketing/automations/${id}`, { is_active: !is_active });
      load();
    } catch (_) {}
  };

  const inputStyle = { width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.text, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 5, display: "block" };

  return (
    <Card>
      <CardHeader
        title="Automated triggers"
        right={<Btn onClick={() => openPreset("lapsed_14d")} style={{ padding: "5px 12px" }}>+ Create automation</Btn>}
      />
      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 14, lineHeight: 1.6 }}>
        Event-triggered messages run automatically — no manual broadcast needed. Checked every 5 minutes.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        {AUTOMATION_PRESETS.map(p => (
          <div key={p.key} onClick={() => openPreset(p.key)} style={{
            background: C.surfaceBg, borderRadius: 10, padding: "12px 14px", cursor: "pointer",
            border: `0.5px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>{p.icon}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{p.label}</div>
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>{p.desc}</div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div style={{ background: C.surfaceBg, borderRadius: 10, padding: "14px 16px", marginBottom: 14, border: `0.5px solid ${C.border}` }}>
          <SectionLabel>New automation</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Trigger</label>
              <select value={form.trigger_type} onChange={e => openPreset(e.target.value)} style={{ ...inputStyle, appearance: "auto" }}>
                {AUTOMATION_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Approved template (optional)</label>
              <select value={form.template_name} onChange={e => setForm(f => ({ ...f, template_name: e.target.value }))} style={{ ...inputStyle, appearance: "auto" }}>
                <option value="">— Free-form message below —</option>
                {(templates || []).filter(t => t.status === "APPROVED").map(t => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
            </div>
            {!form.template_name && (
              <div>
                <label style={labelStyle}>Message</label>
                <textarea value={form.custom_message} onChange={e => setForm(f => ({ ...f, custom_message: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            )}
            {error && <AlertBanner type="error">{error}</AlertBanner>}
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Btn>
              <Btn onClick={create} disabled={saving}>{saving ? <><Spinner size={14} /> Creating…</> : "Activate automation"}</Btn>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}><Spinner /></div>
      ) : automations.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: "20px 0" }}>No automations yet. Create one above.</div>
      ) : (
        automations.map(a => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: C.surfaceBg, borderRadius: 8, marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{a.name}</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>{AUTOMATION_PRESETS.find(p => p.key === a.trigger_type)?.desc ?? a.trigger_type}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Pill label={a.is_active ? "Active" : "Paused"} variant={a.is_active ? "green" : "gray"} />
              <Btn variant="ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => toggle(a.id, a.is_active)}>
                {a.is_active ? "Pause" : "Resume"}
              </Btn>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

// ─── WABA Strip ───────────────────────────────────────────────────────────────
function WABAStrip({ apiClient, restaurantId }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!restaurantId || !apiClient) return;
    apiClient.get(`/api/restaurants/${restaurantId}/waba`).then(res => setInfo(res.data)).catch(() => {});
  }, [restaurantId, apiClient]);

  if (!info?.waba_id) return null;
  return (
    <div style={{ display: "flex", gap: 10, padding: "8px 14px", background: C.successLight, border: `0.5px solid ${C.successBorder}`, borderRadius: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: C.successDark, fontWeight: 600 }}>● Connected</span>
      <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>{info.whatsapp_display_name ?? info.name}</span>
      <span style={{ fontSize: 11, color: C.textSub }}>+{info.whatsapp_phone_number}</span>
      <span style={{ fontSize: 11, color: C.textMuted }}>WABA {info.waba_id}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MarketingDashboard({ restaurantId, restaurantName, onLogout, apiClient }) {
  const [stats,         setStats]         = useState(null);
  const [segmentCounts, setSegmentCounts] = useState(null);
  const [previewName,   setPreviewName]   = useState("Ravi");
  const [templates,     setTemplates]     = useState([]);
  const [statsLoading,  setStatsLoading]  = useState(true);
  const [selectedSeg,   setSelectedSeg]   = useState("recent");
  const [draftMsg,      setDraftMsg]      = useState("");
  const [cloneCampaign, setCloneCampaign] = useState(null);
  const [templateContext, setTemplateContext] = useState(null);
  const [refreshCamps,  setRefreshCamps]  = useState(0);
  const [activeTab,     setActiveTab]     = useState("compose");

  useEffect(() => {
    if (!apiClient || !restaurantId) return;
    apiClient.get("/api/marketing/subscribers")
      .then(res => {
        setStats(res.data.stats);
        setSegmentCounts(res.data.segments);
        if (res.data.preview_name) setPreviewName(res.data.preview_name);
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
    apiClient.get("/api/marketing/templates")
      .then(res => setTemplates(res.data.templates || []))
      .catch(() => {});
  }, [apiClient, restaurantId]);

  const handleClone = (c) => {
    setCloneCampaign({ ...c, segment: c.segment_type });
    setActiveTab("compose");
  };

  const handleResend = (c) => {
    setCloneCampaign({
      ...c,
      segment: c.segment_type,
      name: `${c.name} — ${new Date().toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`,
    });
    setActiveTab("compose");
  };

  const handleCreateTemplate = (ctx) => {
    const goalMap = { lapsed: "win_back", recent: "loyalty", never_returned: "welcome", high_value: "loyalty" };
    setTemplateContext({ ...ctx, goal_key: goalMap[ctx.segment] || "win_back" });
    setActiveTab("templates");
  };

  const tabs = [
    { key: "compose",     label: "Compose"     },
    { key: "automations", label: "Automations" },
    { key: "templates",   label: "Templates"   },
    { key: "history",     label: "History"     },
  ];

  const tabStyle = (key) => ({
    fontSize: 12, padding: "5px 14px", borderRadius: 7, border: "0.5px solid", cursor: "pointer",
    fontWeight: activeTab === key ? 500 : 400,
    background:   activeTab === key ? C.cardBg      : "transparent",
    color:        activeTab === key ? C.text        : C.textMuted,
    borderColor:  activeTab === key ? C.borderStrong : "transparent",
  });

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, padding: "24px" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 500, color: C.text, margin: 0 }}>Marketing &amp; CRM</h1>
            <p style={{ fontSize: 13, color: C.textMuted, margin: "2px 0 0" }}>
              {restaurantName} · {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 3, background: C.surfaceBg, borderRadius: 9, padding: 3 }}>
              {tabs.map(t => <button key={t.key} style={tabStyle(t.key)} onClick={() => setActiveTab(t.key)}>{t.label}</button>)}
            </div>
            <div style={{ width: 1, height: 18, background: C.border }} />
            <Btn variant="danger" onClick={onLogout}>Logout</Btn>
          </div>
        </div>

        <WABAStrip apiClient={apiClient} restaurantId={restaurantId} />

        <div style={{ marginBottom: 14 }}>
          <SubscriberStats stats={stats} loading={statsLoading} />
        </div>

        {activeTab === "compose" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <AISegmentSuggester
                apiClient={apiClient}
                onSegmentSelected={seg => { setSelectedSeg(seg); setActiveTab("compose"); }}
                onMessageDrafted={msg => setDraftMsg(msg)}
                onCreateTemplate={handleCreateTemplate}
              />
              <SegmentCards counts={segmentCounts} loading={statsLoading} selected={selectedSeg} onSelect={setSelectedSeg} />
            </div>
            <BroadcastComposer
              apiClient={apiClient} selectedSegment={selectedSeg} draftMessage={draftMsg}
              segmentCounts={segmentCounts} cloneFrom={cloneCampaign}
              previewName={previewName} restaurantName={restaurantName}
              onSent={() => { setRefreshCamps(r => r + 1); setCloneCampaign(null); setActiveTab("history"); }}
            />
          </div>
        )}

        {activeTab === "automations" && (
          <AutomationsPanel apiClient={apiClient} templates={templates} onCreated={() => setRefreshCamps(r => r + 1)} />
        )}

        {activeTab === "templates" && (
          <TemplateViewer
            apiClient={apiClient}
            previewName={previewName}
            restaurantName={restaurantName}
            templateModalContext={templateContext}
            onClearTemplateContext={() => setTemplateContext(null)}
          />
        )}

        {activeTab === "history" && (
          <CampaignHistory
            apiClient={apiClient}
            refreshTrigger={refreshCamps}
            onCloneCampaign={handleClone}
            onResendCampaign={handleResend}
          />
        )}

      </div>
    </div>
  );
}
