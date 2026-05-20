import { useEffect, useState, useCallback, useMemo, useRef } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtINRFull(n) {
  if (!n) return "₹0.00";
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
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

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "16px 20px", ...style }}>
      {children}
    </div>
  );
}
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "#aaa", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </div>
  );
}
function Pill({ label, color = "#378ADD", bg = "#F0F7FF" }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: bg, color, textTransform: "uppercase", letterSpacing: 0.3 }}>
      {label}
    </span>
  );
}
function Btn({ children, onClick, variant = "primary", disabled, style }) {
  const base = { fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, fontWeight: 500, transition: "opacity 0.15s", ...style };
  const variants = {
    primary:   { background: "#378ADD", color: "#fff" },
    secondary: { background: "#F0F0EE", color: "#333" },
    danger:    { background: "#FFEBEB", color: "#A32D2D" },
    green:     { background: "#E8F5E9", color: "#2E7D32" },
  };
  return <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Spinner({ size = 20 }) {
  return (
    <div style={{ width: size, height: size, border: `2px solid #E0E0DC`, borderTop: `2px solid #378ADD`, borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
  );
}

// ─── Segment definitions ──────────────────────────────────────────────────────
const SEGMENTS = [
  { key: "all",            label: "All customers",        icon: "👥", desc: "Everyone who has ever ordered",            color: "#378ADD", bg: "#F0F7FF" },
  { key: "recent",         label: "Recent visitors",      icon: "🕐", desc: "Ordered in the last 7 days",               color: "#1D9E75", bg: "#F0FBF6" },
  { key: "lapsed",         label: "Lapsed customers",     icon: "💤", desc: "Ordered 14–30 days ago, not since",        color: "#BA7517", bg: "#FFF8EE" },
  { key: "takeaway",       label: "Takeaway regulars",    icon: "🥡", desc: "3+ takeaway orders",                       color: "#7B61FF", bg: "#F5F3FF" },
  { key: "high_value",     label: "High value",           icon: "⭐", desc: "Total spend above ₹500",                   color: "#C0392B", bg: "#FFF0EE" },
  { key: "never_returned", label: "One-time visitors",    icon: "🔁", desc: "Ordered exactly once, more than 7 days ago", color: "#5F6368", bg: "#F7F7F5" },
];

// ─── AI Segment Suggester ─────────────────────────────────────────────────────
function AISegmentSuggester({ apiClient, onSegmentSelected, onMessageDrafted }) {
  const [goal,     setGoal]     = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);

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
    <Card style={{ background: "linear-gradient(135deg, #F0F7FF 0%, #F5F3FF 100%)", border: "0.5px solid #C5DDF6" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>🤖</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>AI Segment Suggester</span>
        <Pill label="Powered by Claude" color="#7B61FF" bg="#F5F3FF" />
      </div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
        Describe your goal in plain English — Claude will suggest the right customer segment and draft a message.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={goal}
          onChange={e => setGoal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && suggest()}
          placeholder="e.g. Bring back customers who have not visited in 2 weeks"
          style={{ flex: 1, fontSize: 12, padding: "8px 12px", borderRadius: 8, border: "0.5px solid #C5DDF6", background: "#fff", outline: "none" }}
        />
        <Btn onClick={suggest} disabled={loading || !goal.trim()}>
          {loading ? <Spinner size={14} /> : "Suggest →"}
        </Btn>
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#A32D2D", background: "#FFEBEB", padding: "8px 10px", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12, background: "#fff", borderRadius: 10, padding: "12px 14px", border: "0.5px solid #C5DDF6" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "#aaa", marginBottom: 3 }}>Suggested segment</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>
                {SEGMENTS.find(s => s.key === result.segment)?.icon} {SEGMENTS.find(s => s.key === result.segment)?.label ?? result.segment}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{result.reasoning}</div>
            </div>
            {result.estimated_count != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 500, color: "#378ADD" }}>{result.estimated_count}</div>
                <div style={{ fontSize: 10, color: "#aaa" }}>est. recipients</div>
              </div>
            )}
          </div>
          {result.suggested_message && (
            <div style={{ background: "#F7F7F5", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#333", lineHeight: 1.6, marginBottom: 10, whiteSpace: "pre-wrap" }}>
              {result.suggested_message}
            </div>
          )}
          <Btn onClick={apply} variant="green">Use this segment →</Btn>
        </div>
      )}
    </Card>
  );
}

// ─── Subscriber Stats ─────────────────────────────────────────────────────────
function SubscriberStats({ stats, loading }) {
  if (loading) return (
    <Card>
      <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}><Spinner /></div>
    </Card>
  );
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Subscriber overview</span>
        <Pill label="Live from chat DB" color="#1D9E75" bg="#F0FBF6" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[
          { label: "Total subscribers", value: stats?.total ?? "—",       color: "#111" },
          { label: "New this week",      value: stats?.new_this_week ?? "—", color: "#1D9E75" },
          { label: "Active (30d)",       value: stats?.active_30d ?? "—",   color: "#378ADD" },
          { label: "Opted out",          value: stats?.opted_out ?? "—",    color: "#BA7517" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "#F7F7F5", borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#aaa", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color }}>{value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Segment Cards ────────────────────────────────────────────────────────────
function SegmentCards({ counts, loading, selected, onSelect }) {
  return (
    <div>
      <SectionLabel>Customer segments</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {SEGMENTS.map(seg => (
          <div
            key={seg.key}
            onClick={() => onSelect(seg.key)}
            style={{
              background: selected === seg.key ? seg.bg : "#F7F7F5",
              border: `0.5px solid ${selected === seg.key ? seg.color + "66" : "#E8E8E5"}`,
              borderRadius: 10, padding: "12px 14px", cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: selected === seg.key ? `0 0 0 2px ${seg.color}33` : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 18 }}>{seg.icon}</span>
              <span style={{ fontSize: 18, fontWeight: 600, color: seg.color }}>
                {loading ? "…" : (counts?.[seg.key] ?? "—")}
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#111", marginTop: 6 }}>{seg.label}</div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{seg.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Broadcast Composer ───────────────────────────────────────────────────────
function BroadcastComposer({ apiClient, selectedSegment, draftMessage, segmentCounts, onSent }) {
  const [segment,       setSegment]       = useState(selectedSegment || "recent");
  const [templates,     setTemplates]     = useState([]);
  const [templateName,  setTemplateName]  = useState("");
  const [customMessage, setCustomMessage] = useState(draftMessage || "");
  const [useTemplate,   setUseTemplate]   = useState(false);
  const [campaignName,  setCampaignName]  = useState("");
  const [sending,       setSending]       = useState(false);
  const [sent,          setSent]          = useState(null);
  const [error,         setError]         = useState(null);
  const [loadingTpls,   setLoadingTpls]   = useState(false);

  // Sync prop changes from AI suggester
  useEffect(() => { if (selectedSegment) setSegment(selectedSegment); }, [selectedSegment]);
  useEffect(() => { if (draftMessage)    setCustomMessage(draftMessage); }, [draftMessage]);

  useEffect(() => {
    setLoadingTpls(true);
    apiClient.get("/api/marketing/templates")
      .then(res => setTemplates(res.data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTpls(false));
  }, [apiClient]);

  const recipientCount = segmentCounts?.[segment] ?? "?";
  const segInfo = SEGMENTS.find(s => s.key === segment);

  const send = async () => {
    if (!campaignName.trim()) { setError("Campaign name is required"); return; }
    if (!useTemplate && !customMessage.trim()) { setError("Message is required"); return; }
    if (useTemplate && !templateName) { setError("Select a template"); return; }
    setSending(true); setError(null); setSent(null);
    try {
      const res = await apiClient.post("/api/marketing/broadcast", {
        name:           campaignName,
        segment:        segment,
        template_name:  useTemplate ? templateName : null,
        custom_message: useTemplate ? null : customMessage,
      });
      setSent(res.data);
      onSent?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setSending(false);
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Broadcast composer</span>
        {segInfo && <Pill label={`${segInfo.icon} ${segInfo.label}`} color={segInfo.color} bg={segInfo.bg} />}
      </div>

      {sent ? (
        <div style={{ textAlign: "center", padding: "24px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "#111", marginBottom: 4 }}>Campaign sent!</div>
          <div style={{ fontSize: 12, color: "#888" }}>{sent.sent_count} messages dispatched</div>
          <Btn variant="secondary" style={{ marginTop: 14 }} onClick={() => { setSent(null); setCampaignName(""); setCustomMessage(""); }}>
            Send another
          </Btn>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Campaign name */}
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>Campaign name</div>
            <input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="e.g. May re-engagement, Lunch special"
              style={{ width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: "0.5px solid #E0E0DC", boxSizing: "border-box" }}
            />
          </div>

          {/* Segment selector */}
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>Target segment</div>
            <select
              value={segment}
              onChange={e => setSegment(e.target.value)}
              style={{ width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: "0.5px solid #E0E0DC", background: "#fff" }}
            >
              {SEGMENTS.map(s => (
                <option key={s.key} value={s.key}>{s.icon} {s.label} ({segmentCounts?.[s.key] ?? "?"} customers)</option>
              ))}
            </select>
          </div>

          {/* Message type toggle */}
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>Message type</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setUseTemplate(false)}
                style={{ flex: 1, fontSize: 12, padding: "7px", borderRadius: 8, border: `0.5px solid ${!useTemplate ? "#378ADD" : "#E0E0DC"}`, background: !useTemplate ? "#F0F7FF" : "#fff", color: !useTemplate ? "#185FA5" : "#888", cursor: "pointer", fontWeight: !useTemplate ? 600 : 400 }}
              >
                Free-form message
              </button>
              <button
                onClick={() => setUseTemplate(true)}
                style={{ flex: 1, fontSize: 12, padding: "7px", borderRadius: 8, border: `0.5px solid ${useTemplate ? "#378ADD" : "#E0E0DC"}`, background: useTemplate ? "#F0F7FF" : "#fff", color: useTemplate ? "#185FA5" : "#888", cursor: "pointer", fontWeight: useTemplate ? 600 : 400 }}
              >
                Approved template
              </button>
            </div>
            {!useTemplate && (
              <div style={{ marginTop: 6, fontSize: 10, color: "#BA7517", background: "#FFF8EE", padding: "6px 10px", borderRadius: 6 }}>
                ⚠️ Free-form messages only work within the 24h conversation window. Use a template for inactive customers.
              </div>
            )}
          </div>

          {/* Message input */}
          {!useTemplate ? (
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>Message <span style={{ color: "#aaa" }}>(use {"{{name}}"} for customer name)</span></div>
              <textarea
                value={customMessage}
                onChange={e => setCustomMessage(e.target.value)}
                rows={4}
                placeholder={"Hi {{name}}, we missed you at Hotel Munafe! 🍽️ Come visit us today."}
                style={{ width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: "0.5px solid #E0E0DC", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }}
              />
              <div style={{ fontSize: 10, color: "#aaa", textAlign: "right", marginTop: 3 }}>{customMessage.length} chars</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 5 }}>Select approved template</div>
              {loadingTpls ? (
                <div style={{ fontSize: 12, color: "#aaa" }}>Loading templates…</div>
              ) : templates.length === 0 ? (
                <div style={{ fontSize: 12, color: "#aaa", background: "#F7F7F5", padding: "10px", borderRadius: 8 }}>
                  No approved templates found. Create and get them approved in Meta Business Suite first.
                </div>
              ) : (
                <select
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  style={{ width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8, border: "0.5px solid #E0E0DC", background: "#fff" }}
                >
                  <option value="">— Choose a template —</option>
                  {templates.map(t => (
                    <option key={t.name} value={t.name}>{t.name} ({t.category})</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Recipient count + cost estimate */}
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, background: "#F7F7F5", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#aaa", marginBottom: 2 }}>Recipients</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: "#111" }}>{recipientCount}</div>
            </div>
            {useTemplate && (
              <div style={{ flex: 1, background: "#FFF8EE", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "#aaa", marginBottom: 2 }}>Est. cost (₹0.58/msg)</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: "#BA7517" }}>
                  {typeof recipientCount === "number" ? `₹${(recipientCount * 0.58).toFixed(2)}` : "—"}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#A32D2D", background: "#FFEBEB", padding: "8px 10px", borderRadius: 8 }}>{error}</div>
          )}

          <Btn onClick={send} disabled={sending} style={{ alignSelf: "flex-end", padding: "8px 20px" }}>
            {sending ? <><Spinner size={14} /> &nbsp;Sending…</> : `📤 Send to ${recipientCount} customers`}
          </Btn>
        </div>
      )}
    </Card>
  );
}

// ─── Template Modal Constants ─────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en",    label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "ta",    label: "Tamil" },
  { code: "hi",    label: "Hindi" },
];

// Restaurant-specific variables (replaces Botbiz's eCommerce system fields)
const RESTAURANT_VARIABLES = [
  { label: "Customer name",   insert: "{{name}}",       preview: "Ravi" },
  { label: "Restaurant name", insert: "{{restaurant}}", preview: "Hotel Munafe" },
  { label: "Date",            insert: "{{date}}",       preview: "20 May 2026" },
  { label: "Token number",    insert: "{{token}}",      preview: "T-042" },
  { label: "Order number",    insert: "{{order}}",      preview: "ORD-001" },
];

const BUTTON_TYPES = {
  QUICK_REPLY:  { label: "Quick reply",      icon: "↩",  group: "Quick reply buttons" },
  URL:          { label: "Visit website",    icon: "🔗", group: "Call to action buttons", note: "2 max" },
  PHONE_NUMBER: { label: "Call phone number",icon: "📞", group: "Call to action buttons", note: "1 max" },
  COPY_CODE:    { label: "Copy offer code",  icon: "🎟",  group: "Call to action buttons", note: "1 max" },
};

// ─── Template Create Modal ────────────────────────────────────────────────────
function TemplateCreateModal({ apiClient, onClose, onCreated }) {
  const [form, setForm] = useState({
    name:       "",
    category:   "MARKETING",
    language:   "en",
    headerType: "NONE",
    headerText: "",
    mediaFile:  null,
    mediaPreviewUrl: null,
    body:       "",
    footer:     "",
    buttons:    [],
  });
  const [saving,        setSaving]        = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [error,         setError]         = useState(null);
  const [success,       setSuccess]       = useState(false);
  const [showVarMenu,   setShowVarMenu]   = useState(false);
  const [showBtnMenu,   setShowBtnMenu]   = useState(false);
  const [aiRewriting,   setAiRewriting]   = useState(false);
  const bodyRef = useRef(null);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // ── Insert variable at cursor position ──
  const insertVariable = (token) => {
    const el = bodyRef.current;
    if (!el) { set("body", form.body + token); setShowVarMenu(false); return; }
    const start = el.selectionStart, end = el.selectionEnd;
    const newVal = form.body.slice(0, start) + token + form.body.slice(end);
    set("body", newVal);
    setShowVarMenu(false);
    setTimeout(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); }, 0);
  };

  // ── Add button ──
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

  // ── Media upload ──
  const handleMediaSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setForm(f => ({ ...f, mediaFile: file, mediaPreviewUrl: previewUrl }));
  };

  // ── AI rewrite ──
  const aiRewrite = async () => {
    if (!form.body.trim()) return;
    setAiRewriting(true);
    try {
      const res = await apiClient.post("/api/marketing/ai-rewrite", {
        text:     form.body,
        category: form.category,
      });
      set("body", res.data.rewritten);
    } catch (err) {
      console.error("AI rewrite failed:", err.message);
    }
    setAiRewriting(false);
  };

  // ── Live preview helpers ──
  const previewText = (text) => {
    if (!text) return "";
    return text
      .replace(/\{\{name\}\}/gi,       RESTAURANT_VARIABLES[0].preview)
      .replace(/\{\{restaurant\}\}/gi,  RESTAURANT_VARIABLES[1].preview)
      .replace(/\{\{date\}\}/gi,        RESTAURANT_VARIABLES[2].preview)
      .replace(/\{\{token\}\}/gi,       RESTAURANT_VARIABLES[3].preview)
      .replace(/\{\{order\}\}/gi,       RESTAURANT_VARIABLES[4].preview)
      .replace(/\*([^*]+)\*/g,          (_, t) => t)   // bold (strip markers for simplicity)
      .replace(/_([^_]+)_/g,            (_, t) => t);  // italic
  };

  // ── Submit ──
  const submit = async () => {
    if (!form.name.trim()) { setError("Template name is required"); return; }
    if (!form.body.trim()) { setError("Message body is required"); return; }
    if (!/^[a-z0-9_]+$/.test(form.name)) { setError("Name must be lowercase letters, numbers and underscores only"); return; }

    setSaving(true); setError(null);
    try {
      let mediaHandle = null;

      // Upload media if selected
      if (form.mediaFile && ["IMAGE","VIDEO","DOCUMENT"].includes(form.headerType)) {
        setUploading(true);
        const formData = new FormData();
        formData.append("file", form.mediaFile);
        formData.append("type", form.headerType.toLowerCase());
        try {
          const uploadRes = await apiClient.post("/api/marketing/media/upload", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          mediaHandle = uploadRes.data.handle;
        } catch (uploadErr) {
          console.warn("Media upload failed, submitting without media handle:", uploadErr.message);
        }
        setUploading(false);
      }

      const components = [
        ...(form.headerType !== "NONE" ? [{
          type:   "HEADER",
          format: form.headerType,
          ...(form.headerType === "TEXT" ? { text: form.headerText } : {}),
          ...(mediaHandle ? { example: { header_handle: [mediaHandle] } } : {}),
        }] : []),
        {
          type: "BODY",
          text: form.body,
          // Extract variable positions for Meta's example object
          ...(form.body.match(/\{\{[^}]+\}\}/g) ? {
            example: {
              body_text: [
                (form.body.match(/\{\{[^}]+\}\}/g) || []).map(v =>
                  RESTAURANT_VARIABLES.find(r => r.insert === v)?.preview || "sample"
                )
              ]
            }
          } : {}),
        },
        ...(form.footer.trim() ? [{ type: "FOOTER", text: form.footer }] : []),
        ...(form.buttons.filter(b => b.text).length > 0 ? [{
          type: "BUTTONS",
          buttons: form.buttons.filter(b => b.text).map(b => ({
            type: b.type,
            text: b.text,
            ...(b.type === "URL"          ? { url: b.url } : {}),
            ...(b.type === "PHONE_NUMBER" ? { phone_number: b.phone_number } : {}),
            ...(b.type === "COPY_CODE"    ? { example: [b.code || "OFFER10"] } : {}),
          })),
        }] : []),
      ];

      await apiClient.post("/api/marketing/templates/create", {
        name:       form.name,
        category:   form.category,
        language:   form.language,
        components,
      });

      setSuccess(true);
      setTimeout(() => { onCreated(); onClose(); }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setSaving(false);
  };

  const inputStyle = { width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 6, border: "0.5px solid #ddd", boxSizing: "border-box", background: "#fff", outline: "none" };
  const labelStyle = { fontSize: 11, fontWeight: 500, color: "#555", marginBottom: 5, display: "block" };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, backdropFilter: "blur(3px)" }} />

      {/* Modal — matches Botbiz layout exactly */}
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: "min(1200px, 95vw)", maxHeight: "92vh",
        background: "#fff", borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        zIndex: 201, display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Modal header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid #f0f0f0" }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>Message Template</span>
          <button onClick={onClose} style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "#888", lineHeight: 1, padding: "0 4px" }}>✕</button>
        </div>

        {/* Body: form + phone preview side by side */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── Left: Form ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

            {success && (
              <div style={{ background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: 10, padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#2E7D32" }}>Template submitted for approval!</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Meta typically approves within 24–48 hours.</div>
              </div>
            )}

            {/* Row 1: Template name + Locale */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>TEMPLATE NAME *</label>
                <input
                  value={form.name}
                  onChange={e => set("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="Put a name to track it later"
                  style={inputStyle}
                />
                <div style={{ fontSize: 10, color: "#aaa", marginTop: 3 }}>Lowercase letters, numbers, underscores only</div>
              </div>
              <div>
                <label style={labelStyle}>LOCALE *</label>
                <select value={form.language} onChange={e => set("language", e.target.value)} style={{ ...inputStyle, appearance: "auto" }}>
                  {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Category + Header type */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>TEMPLATE CATEGORY *</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["UTILITY", "MARKETING"].map(cat => (
                    <button key={cat} onClick={() => set("category", cat)} style={{
                      flex: 1, fontSize: 12, padding: "8px", borderRadius: 8, cursor: "pointer",
                      border: `1.5px solid ${form.category === cat ? "#5B4BFA" : "#ddd"}`,
                      background: form.category === cat ? "#5B4BFA" : "#fff",
                      color: form.category === cat ? "#fff" : "#666",
                      fontWeight: form.category === cat ? 600 : 400,
                    }}>
                      {cat.charAt(0) + cat.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>HEADER TYPE *</label>
                <div style={{ position: "relative" }}>
                  <select
                    value={form.headerType}
                    onChange={e => { set("headerType", e.target.value); set("mediaFile", null); set("mediaPreviewUrl", null); }}
                    style={{ ...inputStyle, appearance: "auto" }}
                  >
                    <option value="NONE">No Header</option>
                    <option value="TEXT">Text</option>
                    <option value="IMAGE">Image</option>
                    <option value="VIDEO">Video</option>
                    <option value="DOCUMENT">Document</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Header content area */}
            {form.headerType === "TEXT" && (
              <div>
                <label style={labelStyle}>HEADER TEXT</label>
                <input value={form.headerText} onChange={e => set("headerText", e.target.value)} placeholder="Header text (60 chars max)" maxLength={60} style={inputStyle} />
              </div>
            )}
            {["IMAGE","VIDEO","DOCUMENT"].includes(form.headerType) && (
              <div>
                <label style={labelStyle}>{form.headerType} UPLOAD</label>
                <div
                  onClick={() => document.getElementById("media-upload-input").click()}
                  style={{
                    border: "2px dashed #ddd", borderRadius: 10, padding: "24px",
                    textAlign: "center", cursor: "pointer", background: "#fafafa",
                    transition: "border-color 0.2s",
                  }}
                >
                  {form.mediaPreviewUrl ? (
                    <div>
                      {form.headerType === "IMAGE" && (
                        <img src={form.mediaPreviewUrl} alt="preview" style={{ maxHeight: 120, maxWidth: "100%", borderRadius: 8, marginBottom: 8 }} />
                      )}
                      {form.headerType === "VIDEO" && (
                        <video src={form.mediaPreviewUrl} style={{ maxHeight: 120, maxWidth: "100%", borderRadius: 8, marginBottom: 8 }} controls />
                      )}
                      {form.headerType === "DOCUMENT" && (
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                      )}
                      <div style={{ fontSize: 11, color: "#666" }}>{form.mediaFile?.name}</div>
                      <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>Click to change</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>
                        {form.headerType === "IMAGE" ? "🖼" : form.headerType === "VIDEO" ? "🎬" : "📄"}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                        Click to upload {form.headerType.toLowerCase()}
                      </div>
                      <div style={{ fontSize: 10, color: "#aaa" }}>
                        {form.headerType === "IMAGE" ? "JPG, PNG up to 5MB" : form.headerType === "VIDEO" ? "MP4 up to 16MB" : "PDF up to 100MB"}
                      </div>
                    </div>
                  )}
                </div>
                <input
                  id="media-upload-input"
                  type="file"
                  style={{ display: "none" }}
                  accept={form.headerType === "IMAGE" ? "image/*" : form.headerType === "VIDEO" ? "video/*" : ".pdf,.doc,.docx"}
                  onChange={handleMediaSelect}
                />
              </div>
            )}

            {/* Message body */}
            <div>
              <label style={labelStyle}>MESSAGE BODY (1024) *</label>

              {/* Toolbar — matches Botbiz exactly */}
              <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>

                {/* Variables dropdown */}
                <div style={{ position: "relative" }}>
                  <button
                    onClick={() => { setShowVarMenu(v => !v); setShowBtnMenu(false); }}
                    style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                  >
                    📋 Variables ▾
                  </button>
                  {showVarMenu && (
                    <div style={{ position: "absolute", top: "110%", left: 0, background: "#fff", border: "1px solid #eee", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 10, minWidth: 180, overflow: "hidden" }}>
                      {RESTAURANT_VARIABLES.map(v => (
                        <div key={v.insert} onClick={() => insertVariable(v.insert)}
                          style={{ padding: "9px 14px", fontSize: 12, cursor: "pointer", color: "#333", borderBottom: "0.5px solid #f5f5f5" }}
                          onMouseEnter={e => e.target.style.background = "#f5f5f5"}
                          onMouseLeave={e => e.target.style.background = ""}
                        >
                          {v.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Name shortcut */}
                <button
                  onClick={() => insertVariable("{{name}}")}
                  style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", color: "#5B4BFA", fontWeight: 500 }}
                >
                  👤 Name
                </button>

                {/* AI Re-write */}
                <button
                  onClick={aiRewrite}
                  disabled={aiRewriting || !form.body.trim()}
                  style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid #ddd", background: aiRewriting ? "#f0f0f0" : "#fff", cursor: "pointer", color: "#0891b2", display: "flex", alignItems: "center", gap: 4, opacity: (!form.body.trim()) ? 0.4 : 1 }}
                >
                  {aiRewriting ? <><Spinner size={12} /> Rewriting…</> : "🤖 AI Re-write"}
                </button>
              </div>

              <div style={{ position: "relative" }}>
                <textarea
                  ref={bodyRef}
                  value={form.body}
                  onChange={e => set("body", e.target.value)}
                  rows={6}
                  maxLength={1024}
                  placeholder="Type # for custom fields and name. Use *bold* or _italic_ for formatting."
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, paddingRight: 36 }}
                />
                {/* Emoji button placeholder */}
                <button style={{ position: "absolute", right: 8, bottom: 32, fontSize: 16, background: "none", border: "none", cursor: "pointer", opacity: 0.5 }}>😊</button>
                <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 10, color: "#aaa", marginTop: 3 }}>
                  Characters: {form.body.length} / 1024
                </div>
              </div>
            </div>

            {/* Footer */}
            <div>
              <label style={labelStyle}>FOOTER TEXT <span style={{ color: "#aaa", fontWeight: 400 }}>(optional)</span></label>
              <input
                value={form.footer}
                onChange={e => set("footer", e.target.value)}
                placeholder="Provide text for footer (60)"
                maxLength={60}
                style={inputStyle}
              />
            </div>

            {/* Buttons */}
            <div>
              {form.buttons.map((btn, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start", background: "#f9f9f9", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ flex: "none" }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>TYPE</div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "#333" }}>
                      {BUTTON_TYPES[btn.type]?.icon} {BUTTON_TYPES[btn.type]?.label}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>BUTTON TEXT</div>
                    <input value={btn.text} onChange={e => updateBtn(i, "text", e.target.value)} placeholder="Button label" style={{ ...inputStyle, padding: "6px 8px" }} />
                  </div>
                  {btn.type === "URL" && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>URL</div>
                      <input value={btn.url} onChange={e => updateBtn(i, "url", e.target.value)} placeholder="https://..." style={{ ...inputStyle, padding: "6px 8px" }} />
                    </div>
                  )}
                  {btn.type === "PHONE_NUMBER" && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>PHONE</div>
                      <input value={btn.phone_number} onChange={e => updateBtn(i, "phone_number", e.target.value)} placeholder="+91 9500996033" style={{ ...inputStyle, padding: "6px 8px" }} />
                    </div>
                  )}
                  {btn.type === "COPY_CODE" && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>OFFER CODE</div>
                      <input value={btn.code} onChange={e => updateBtn(i, "code", e.target.value)} placeholder="MUNAFE10" style={{ ...inputStyle, padding: "6px 8px" }} />
                    </div>
                  )}
                  <button onClick={() => removeBtn(i)} style={{ fontSize: 16, color: "#ccc", background: "none", border: "none", cursor: "pointer", paddingTop: 18 }}>✕</button>
                </div>
              ))}

              {/* Add button dropdown — matches Botbiz */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => { setShowBtnMenu(v => !v); setShowVarMenu(false); }}
                  style={{ fontSize: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  + Add button
                </button>
                {showBtnMenu && (
                  <div style={{ position: "absolute", top: "110%", left: 0, background: "#fff", border: "1px solid #eee", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 10, minWidth: 260, overflow: "hidden" }}>
                    <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.8 }}>Quick reply buttons</div>
                    <div onClick={() => addButton("QUICK_REPLY")} style={{ padding: "9px 14px", fontSize: 12, cursor: "pointer", color: "#333", borderBottom: "0.5px solid #f5f5f5" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                      ↩ Custom
                    </div>
                    <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.8 }}>Call to action buttons</div>
                    {[
                      { type: "URL",          label: "Visit website",     note: "2 buttons maximum" },
                      { type: "PHONE_NUMBER", label: "Call phone number", note: "1 button maximum" },
                      { type: "COPY_CODE",    label: "Copy offer code",   note: "1 button maximum" },
                    ].map(b => (
                      <div key={b.type} onClick={() => addButton(b.type)}
                        style={{ padding: "9px 14px", fontSize: 12, cursor: "pointer", color: "#333", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "0.5px solid #f5f5f5" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f5f5f5"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <span>{b.label}</span>
                        <span style={{ fontSize: 10, color: "#aaa" }}>{b.note}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div style={{ fontSize: 12, color: "#A32D2D", background: "#FFEBEE", padding: "10px 12px", borderRadius: 8 }}>{error}</div>
            )}

            {/* Footer actions */}
            <div style={{ display: "flex", gap: 10, paddingBottom: 8 }}>
              <Btn variant="secondary" onClick={onClose} style={{ minWidth: 80 }}>Cancel</Btn>
              <Btn onClick={submit} disabled={saving || success} style={{ flex: 1, padding: "10px", fontSize: 13 }}>
                {uploading ? <><Spinner size={14} /> &nbsp;Uploading media…</> :
                 saving    ? <><Spinner size={14} /> &nbsp;Submitting…</> :
                 "💾 Save"}
              </Btn>
            </div>
          </div>

          {/* ── Right: Phone preview ── */}
          <div style={{ width: 340, background: "#f0f0f0", borderLeft: "1px solid #e8e8e8", padding: "24px 20px", overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 16, alignSelf: "flex-start" }}>Preview</div>

            {/* Phone frame */}
            <div style={{ width: 260, background: "#1a1a2e", borderRadius: 36, padding: "10px 6px", boxShadow: "0 12px 40px rgba(0,0,0,0.3)" }}>
              {/* Screen */}
              <div style={{ background: "#fff", borderRadius: 28, overflow: "hidden" }}>
                {/* Status bar */}
                <div style={{ background: "#075E54", padding: "12px 14px 10px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#fff", fontSize: 16 }}>←</span>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🏨</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>Busines...</div>
                    <div style={{ fontSize: 9, color: "#B2DFDB" }}>online</div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                    {["📹","📞","⋮"].map(i => <span key={i} style={{ color: "#fff", fontSize: 12 }}>{i}</span>)}
                  </div>
                </div>

                {/* Chat area */}
                <div style={{ background: "#ECE5DD", minHeight: 320, padding: "10px 8px", position: "relative" }}>
                  {/* Time stamp background pattern */}
                  <div style={{ textAlign: "center", marginBottom: 8 }}>
                    <span style={{ background: "rgba(0,0,0,0.15)", color: "#fff", fontSize: 10, padding: "2px 10px", borderRadius: 10 }}>
                      {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </div>

                  {/* Message bubble */}
                  <div style={{ maxWidth: "90%", marginLeft: "auto" }}>
                    <div style={{ background: "#fff", borderRadius: "10px 0 10px 10px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>

                      {/* Header preview */}
                      {form.headerType === "TEXT" && form.headerText && (
                        <div style={{ padding: "10px 12px 0", fontSize: 12, fontWeight: 700, color: "#111", lineHeight: 1.4 }}>
                          {previewText(form.headerText)}
                        </div>
                      )}
                      {form.headerType === "IMAGE" && (
                        form.mediaPreviewUrl
                          ? <img src={form.mediaPreviewUrl} alt="" style={{ width: "100%", maxHeight: 120, objectFit: "cover", display: "block" }} />
                          : <div style={{ background: "#e0e0e0", height: 100, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>🖼</div>
                      )}
                      {form.headerType === "VIDEO" && (
                        form.mediaPreviewUrl
                          ? <video src={form.mediaPreviewUrl} style={{ width: "100%", maxHeight: 100, display: "block" }} />
                          : <div style={{ background: "#e0e0e0", height: 100, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>▶️</div>
                      )}
                      {form.headerType === "DOCUMENT" && (
                        <div style={{ background: "#f5f5f5", padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 20 }}>📄</span>
                          <span style={{ fontSize: 11, color: "#555" }}>{form.mediaFile?.name || "Document"}</span>
                        </div>
                      )}

                      {/* Body */}
                      <div style={{ padding: "10px 12px 4px" }}>
                        {form.body ? (
                          <div style={{ fontSize: 12, color: "#111", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                            {previewText(form.body)}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>Enter message body</div>
                        )}
                      </div>

                      {/* Footer */}
                      {form.footer && (
                        <div style={{ padding: "0 12px 6px", fontSize: 10, color: "#888" }}>{form.footer}</div>
                      )}

                      {/* Time */}
                      <div style={{ padding: "0 12px 8px", fontSize: 9, color: "#aaa", textAlign: "right" }}>
                        {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })} ✓✓
                      </div>
                    </div>

                    {/* Buttons preview */}
                    {form.buttons.filter(b => b.text).map((btn, i) => (
                      <div key={i} style={{
                        background: "#fff", borderRadius: 8, padding: "8px 12px",
                        marginTop: 4, textAlign: "center", fontSize: 11,
                        color: "#075E54", fontWeight: 500,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}>
                        {BUTTON_TYPES[btn.type]?.icon} {btn.text || BUTTON_TYPES[btn.type]?.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Approval note */}
            <div style={{ marginTop: 16, fontSize: 10, color: "#888", textAlign: "center", lineHeight: 1.7, maxWidth: 240 }}>
              Templates are reviewed by Meta before use.<br />Approval takes 24–48 hours.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Template Viewer ──────────────────────────────────────────────────────────
function TemplateViewer({ apiClient }) {
  const [templates,  setTemplates]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get("/api/marketing/templates")
      .then(res => setTemplates(res.data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [apiClient]);

  useEffect(() => { load(); }, [load]);

  const statusColor = s => s === "APPROVED" ? "#2E7D32" : s === "PENDING" ? "#BA7517" : "#A32D2D";
  const statusBg    = s => s === "APPROVED" ? "#E8F5E9" : s === "PENDING" ? "#FFF3E0" : "#FFEBEE";
  const marketing   = templates.filter(t => t.category === "MARKETING");
  const utility     = templates.filter(t => t.category === "UTILITY");

  const TemplateRow = ({ t }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#F7F7F5", borderRadius: 8, marginBottom: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#111", marginBottom: 2 }}>{t.name}</div>
        <div style={{ fontSize: 10, color: "#888" }}>{t.language}</div>
        {t.components?.find(c => c.type === "BODY")?.text && (
          <div style={{ fontSize: 11, color: "#666", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>
            {t.components.find(c => c.type === "BODY").text}
          </div>
        )}
      </div>
      <Pill label={t.status} color={statusColor(t.status)} bg={statusBg(t.status)} />
    </div>
  );

  return (
    <>
      {showModal && (
        <TemplateCreateModal
          apiClient={apiClient}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); setTimeout(load, 1000); }}
        />
      )}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Message templates</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: "#aaa" }}>{templates.length} total</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={load} style={{ fontSize: 11, color: "#378ADD", background: "none", border: "none", cursor: "pointer" }}>↻ Sync</button>
            <Btn onClick={() => setShowModal(true)} style={{ padding: "5px 12px" }}>+ New template</Btn>
          </div>
        </div>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}><Spinner /></div>
        ) : templates.length === 0 ? (
          <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: "32px 0", background: "#F7F7F5", borderRadius: 10 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>No templates yet</div>
            <div style={{ marginBottom: 16 }}>Create your first template to start sending campaigns.</div>
            <Btn onClick={() => setShowModal(true)}>+ Create template</Btn>
          </div>
        ) : (
          <div>
            {marketing.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#aaa", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>📢 Marketing ({marketing.length})</div>
                {marketing.map((t, i) => <TemplateRow key={i} t={t} />)}
              </div>
            )}
            {utility.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#aaa", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>🔔 Utility ({utility.length})</div>
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
function CampaignHistory({ apiClient, refreshTrigger }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiClient.get("/api/marketing/campaigns")
      .then(res => setCampaigns(res.data.campaigns || []))
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, [apiClient]);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const statusColor = s => ({ completed: "#2E7D32", sending: "#378ADD", failed: "#A32D2D", draft: "#888" })[s] ?? "#888";
  const statusBg    = s => ({ completed: "#E8F5E9", sending: "#F0F7FF", failed: "#FFEBEE", draft: "#F7F7F5" })[s] ?? "#F7F7F5";

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Campaign history</span>
        <button onClick={load} style={{ fontSize: 11, color: "#378ADD", background: "none", border: "none", cursor: "pointer" }}>↻ Refresh</button>
      </div>
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}><Spinner /></div>
      ) : campaigns.length === 0 ? (
        <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: "24px 0", background: "#F7F7F5", borderRadius: 8 }}>
          No campaigns yet. Send your first broadcast above.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid #F0F0EE" }}>
                {["Campaign", "Segment", "Sent", "Status", "Date"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: "#aaa", fontWeight: 400, fontSize: 11, paddingBottom: 8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c, i) => (
                <tr key={i} style={{ borderBottom: "0.5px solid #F7F7F5" }}>
                  <td style={{ padding: "8px 0", color: "#111", fontWeight: 500 }}>{c.name}</td>
                  <td style={{ padding: "8px 0", color: "#666" }}>
                    {SEGMENTS.find(s => s.key === c.segment_type)?.icon} {SEGMENTS.find(s => s.key === c.segment_type)?.label ?? c.segment_type}
                  </td>
                  <td style={{ padding: "8px 0", color: "#111" }}>{c.sent_count ?? 0} / {c.recipient_count ?? 0}</td>
                  <td style={{ padding: "8px 0" }}>
                    <Pill label={c.status} color={statusColor(c.status)} bg={statusBg(c.status)} />
                  </td>
                  <td style={{ padding: "8px 0", color: "#888" }}>{fmtDateTime(c.sent_at || c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── WABA Status strip ────────────────────────────────────────────────────────
function WABAStrip({ apiClient, restaurantId }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!restaurantId || !apiClient) return;
    apiClient.get(`/api/restaurants/${restaurantId}/waba`)
      .then(res => setInfo(res.data))
      .catch(() => {});
  }, [restaurantId, apiClient]);

  if (!info?.waba_id) return null;
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 14px", background: "#F0FBF6", border: "0.5px solid #B2DFDB", borderRadius: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "#1D9E75", fontWeight: 600 }}>● Connected</span>
      <span style={{ fontSize: 11, color: "#333" }}>{info.whatsapp_display_name ?? info.name}</span>
      <span style={{ fontSize: 11, color: "#888" }}>+{info.whatsapp_phone_number}</span>
      <span style={{ fontSize: 11, color: "#aaa" }}>WABA {info.waba_id}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MarketingDashboard({ restaurantId, restaurantName, onLogout, apiClient }) {
  const [stats,         setStats]         = useState(null);
  const [segmentCounts, setSegmentCounts] = useState(null);
  const [statsLoading,  setStatsLoading]  = useState(true);
  const [selectedSeg,   setSelectedSeg]   = useState("recent");
  const [draftMsg,      setDraftMsg]      = useState("");
  const [refreshCamps,  setRefreshCamps]  = useState(0);
  const [activeTab,     setActiveTab]     = useState("compose"); // compose | templates | history

  useEffect(() => {
    if (!apiClient || !restaurantId) return;
    apiClient.get("/api/marketing/subscribers")
      .then(res => {
        setStats(res.data.stats);
        setSegmentCounts(res.data.segments);
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [apiClient, restaurantId]);

  const tabs = [
    { key: "compose",   label: "📤 Compose" },
    { key: "templates", label: "📋 Templates" },
    { key: "history",   label: "🕐 History" },
  ];

  const tabStyle = (key) => ({
    fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "0.5px solid",
    cursor: "pointer", fontWeight: activeTab === key ? 500 : 400,
    background:  activeTab === key ? "#F0F0EE" : "transparent",
    color:       activeTab === key ? "#111" : "#888",
    borderColor: activeTab === key ? "#C8C8C4" : "#E0E0DC",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#F7F7F5", padding: "24px" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 500, color: "#111", margin: 0 }}>Marketing & CRM</h1>
            <p style={{ fontSize: 13, color: "#888", margin: "2px 0 0" }}>
              {restaurantName} · {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {tabs.map(t => (
                <button key={t.key} style={tabStyle(t.key)} onClick={() => setActiveTab(t.key)}>{t.label}</button>
              ))}
            </div>
            <div style={{ width: 1, height: 18, background: "#E0E0DC" }} />
            <button onClick={onLogout} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, border: "0.5px solid #FCEBEB", background: "#FFF5F5", color: "#A32D2D", cursor: "pointer" }}>
              Logout
            </button>
          </div>
        </div>

        {/* WABA strip */}
        <WABAStrip apiClient={apiClient} restaurantId={restaurantId} />

        {/* Subscriber stats — always visible */}
        <div style={{ marginBottom: 14 }}>
          <SubscriberStats stats={stats} loading={statsLoading} />
        </div>

        {activeTab === "compose" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* Left column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <AISegmentSuggester
                apiClient={apiClient}
                onSegmentSelected={seg => { setSelectedSeg(seg); setActiveTab("compose"); }}
                onMessageDrafted={msg => setDraftMsg(msg)}
              />
              <SegmentCards
                counts={segmentCounts}
                loading={statsLoading}
                selected={selectedSeg}
                onSelect={setSelectedSeg}
              />
            </div>
            {/* Right column */}
            <BroadcastComposer
              apiClient={apiClient}
              selectedSegment={selectedSeg}
              draftMessage={draftMsg}
              segmentCounts={segmentCounts}
              onSent={() => { setRefreshCamps(r => r + 1); setActiveTab("history"); }}
            />
          </div>
        )}

        {activeTab === "templates" && (
          <TemplateViewer apiClient={apiClient} />
        )}

        {activeTab === "history" && (
          <CampaignHistory apiClient={apiClient} refreshTrigger={refreshCamps} />
        )}

      </div>
    </div>
  );
}
