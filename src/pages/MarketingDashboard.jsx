import { useEffect, useState, useCallback, useMemo } from "react";

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

// ─── Template Create Drawer ───────────────────────────────────────────────────
const HEADER_TYPES = ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"];
const LANGUAGES    = [
  { code: "en",    label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "ta",    label: "Tamil" },
  { code: "hi",    label: "Hindi" },
];

function TemplateCreateDrawer({ apiClient, onClose, onCreated }) {
  const [form, setForm] = useState({
    name:        "",
    category:    "MARKETING",
    language:    "en",
    headerType:  "NONE",
    headerText:  "",
    body:        "",
    footer:      "",
    buttons:     [],
  });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [success,  setSuccess]  = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const addButton = () => {
    if (form.buttons.length >= 3) return;
    setForm(f => ({ ...f, buttons: [...f.buttons, { type: "QUICK_REPLY", text: "" }] }));
  };
  const updateButton = (i, key, val) => {
    const btns = [...form.buttons];
    btns[i] = { ...btns[i], [key]: val };
    setForm(f => ({ ...f, buttons: btns }));
  };
  const removeButton = (i) => setForm(f => ({ ...f, buttons: f.buttons.filter((_, idx) => idx !== i) }));

  // Live phone preview — render {{1}} style vars as highlighted spans
  const previewBody = form.body.replace(/\{\{(\d+)\}\}/g, (_, n) => `[var${n}]`);

  const submit = async () => {
    if (!form.name.trim())  { setError("Template name is required"); return; }
    if (!form.body.trim())  { setError("Message body is required"); return; }
    if (!/^[a-z0-9_]+$/.test(form.name)) { setError("Name must be lowercase letters, numbers and underscores only"); return; }

    setSaving(true); setError(null);
    try {
      await apiClient.post("/api/marketing/templates/create", {
        name:     form.name,
        category: form.category,
        language: form.language,
        components: [
          ...(form.headerType !== "NONE" ? [{
            type:   "HEADER",
            format: form.headerType,
            ...(form.headerType === "TEXT" ? { text: form.headerText } : {}),
          }] : []),
          { type: "BODY", text: form.body },
          ...(form.footer.trim() ? [{ type: "FOOTER", text: form.footer }] : []),
          ...(form.buttons.length > 0 ? [{
            type:    "BUTTONS",
            buttons: form.buttons.filter(b => b.text.trim()),
          }] : []),
        ],
      });
      setSuccess(true);
      setTimeout(() => { onCreated(); onClose(); }, 1800);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setSaving(false);
  };

  const inputStyle = {
    width: "100%", fontSize: 12, padding: "8px 10px",
    borderRadius: 8, border: "0.5px solid #E0E0DC",
    boxSizing: "border-box", background: "#fff",
  };
  const labelStyle = { fontSize: 11, color: "#888", marginBottom: 5, display: "block" };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 100, backdropFilter: "blur(2px)" }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 880,
        background: "#F7F7F5", zIndex: 101, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        animation: "slideIn 0.2s ease-out",
      }}>
        <style>{`
          @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes spin    { to { transform: rotate(360deg); } }
        `}</style>

        {/* Drawer header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", background: "#fff", borderBottom: "0.5px solid #E8E8E5" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#111" }}>Create message template</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Submitted to Meta for approval · usually 24–48 hours</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "#888", lineHeight: 1 }}>✕</button>
        </div>

        {/* Two-column layout: form + preview */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", flex: 1, overflow: "hidden" }}>

          {/* Form */}
          <div style={{ overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

            {success && (
              <div style={{ background: "#E8F5E9", border: "0.5px solid #A5D6A7", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>✅</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#2E7D32" }}>Template submitted!</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Meta will review and approve within 24–48 hours.</div>
              </div>
            )}

            {/* Name + Category row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Template name <span style={{ color: "#aaa" }}>(lowercase, underscores)</span></label>
                <input
                  value={form.name}
                  onChange={e => set("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="e.g. welcome_back_offer"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {["MARKETING", "UTILITY"].map(cat => (
                    <button
                      key={cat}
                      onClick={() => set("category", cat)}
                      style={{
                        flex: 1, fontSize: 12, padding: "8px", borderRadius: 8, cursor: "pointer", fontWeight: form.category === cat ? 600 : 400,
                        border: `0.5px solid ${form.category === cat ? "#378ADD" : "#E0E0DC"}`,
                        background: form.category === cat ? "#F0F7FF" : "#fff",
                        color: form.category === cat ? "#185FA5" : "#888",
                      }}
                    >
                      {cat === "MARKETING" ? "📢 Marketing" : "🔔 Utility"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Language */}
            <div>
              <label style={labelStyle}>Language</label>
              <select value={form.language} onChange={e => set("language", e.target.value)} style={inputStyle}>
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>

            {/* Header */}
            <div>
              <label style={labelStyle}>Header type <span style={{ color: "#aaa" }}>(optional)</span></label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {HEADER_TYPES.map(ht => (
                  <button
                    key={ht}
                    onClick={() => set("headerType", ht)}
                    style={{
                      fontSize: 11, padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontWeight: form.headerType === ht ? 600 : 400,
                      border: `0.5px solid ${form.headerType === ht ? "#378ADD" : "#E0E0DC"}`,
                      background: form.headerType === ht ? "#F0F7FF" : "#fff",
                      color: form.headerType === ht ? "#185FA5" : "#888",
                    }}
                  >
                    {{ NONE: "No header", TEXT: "📝 Text", IMAGE: "🖼 Image", VIDEO: "🎬 Video", DOCUMENT: "📄 Document" }[ht]}
                  </button>
                ))}
              </div>
              {form.headerType === "TEXT" && (
                <input
                  value={form.headerText}
                  onChange={e => set("headerText", e.target.value)}
                  placeholder="Header text (60 chars max)"
                  maxLength={60}
                  style={{ ...inputStyle, marginTop: 8 }}
                />
              )}
              {["IMAGE", "VIDEO", "DOCUMENT"].includes(form.headerType) && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#888", background: "#F7F7F5", padding: "8px 10px", borderRadius: 8 }}>
                  {form.headerType === "IMAGE" && "📎 An image will be required when sending this template."}
                  {form.headerType === "VIDEO" && "📎 A video will be required when sending this template."}
                  {form.headerType === "DOCUMENT" && "📎 A document will be required when sending this template."}
                </div>
              )}
            </div>

            {/* Body */}
            <div>
              <label style={labelStyle}>
                Message body <span style={{ color: "#aaa" }}>(use {"{{1}}"}, {"{{2}}"} for variables)</span>
              </label>
              <textarea
                value={form.body}
                onChange={e => set("body", e.target.value)}
                rows={5}
                maxLength={1024}
                placeholder={"Hi {{1}}, we missed you at Hotel Munafe! Come back this week for a special treat. 🍽️"}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#aaa", marginTop: 3 }}>
                <span>Use {"{{1}}"} for name, {"{{2}}"} for other variables</span>
                <span>{form.body.length} / 1024</span>
              </div>
            </div>

            {/* Footer */}
            <div>
              <label style={labelStyle}>Footer text <span style={{ color: "#aaa" }}>(optional, 60 chars max)</span></label>
              <input
                value={form.footer}
                onChange={e => set("footer", e.target.value)}
                placeholder="e.g. Reply STOP to unsubscribe"
                maxLength={60}
                style={inputStyle}
              />
            </div>

            {/* Buttons */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Buttons <span style={{ color: "#aaa" }}>(optional, max 3)</span></label>
                {form.buttons.length < 3 && (
                  <button onClick={addButton} style={{ fontSize: 11, color: "#378ADD", background: "none", border: "none", cursor: "pointer" }}>+ Add button</button>
                )}
              </div>
              {form.buttons.map((btn, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <select
                    value={btn.type}
                    onChange={e => updateButton(i, "type", e.target.value)}
                    style={{ ...inputStyle, width: 140, flex: "none" }}
                  >
                    <option value="QUICK_REPLY">Quick reply</option>
                    <option value="URL">URL</option>
                    <option value="PHONE_NUMBER">Phone</option>
                  </select>
                  <input
                    value={btn.text}
                    onChange={e => updateButton(i, "text", e.target.value)}
                    placeholder={btn.type === "URL" ? "Button label" : btn.type === "PHONE_NUMBER" ? "Button label" : "Reply text"}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  {btn.type === "URL" && (
                    <input
                      value={btn.url || ""}
                      onChange={e => updateButton(i, "url", e.target.value)}
                      placeholder="https://..."
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  )}
                  {btn.type === "PHONE_NUMBER" && (
                    <input
                      value={btn.phone_number || ""}
                      onChange={e => updateButton(i, "phone_number", e.target.value)}
                      placeholder="+91..."
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  )}
                  <button onClick={() => removeButton(i)} style={{ fontSize: 14, color: "#A32D2D", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>

            {error && (
              <div style={{ fontSize: 12, color: "#A32D2D", background: "#FFEBEE", padding: "8px 10px", borderRadius: 8 }}>{error}</div>
            )}

            <div style={{ display: "flex", gap: 10, paddingBottom: 8 }}>
              <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
              <Btn onClick={submit} disabled={saving || success} style={{ flex: 1, padding: "10px" }}>
                {saving ? <><Spinner size={14} /> &nbsp;Submitting…</> : "📤 Submit for approval"}
              </Btn>
            </div>
          </div>

          {/* Phone preview */}
          <div style={{ background: "#E8E8E5", padding: "20px 16px", overflowY: "auto", borderLeft: "0.5px solid #E0E0DC" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Preview</div>
            {/* Phone frame */}
            <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", overflow: "hidden" }}>
              {/* Status bar */}
              <div style={{ background: "#075E54", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🏨</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Hotel Munafe</div>
                  <div style={{ fontSize: 10, color: "#B2DFDB" }}>Business account</div>
                </div>
              </div>
              {/* Chat area */}
              <div style={{ background: "#ECE5DD", minHeight: 300, padding: "12px 10px" }}>
                <div style={{ background: "#fff", borderRadius: "0 10px 10px 10px", padding: "10px 12px", maxWidth: "85%", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                  {/* Header preview */}
                  {form.headerType === "TEXT" && form.headerText && (
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginBottom: 6 }}>{form.headerText}</div>
                  )}
                  {form.headerType === "IMAGE" && (
                    <div style={{ background: "#F0F0EE", borderRadius: 8, height: 80, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8, fontSize: 24 }}>🖼</div>
                  )}
                  {form.headerType === "VIDEO" && (
                    <div style={{ background: "#F0F0EE", borderRadius: 8, height: 80, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8, fontSize: 24 }}>▶️</div>
                  )}
                  {form.headerType === "DOCUMENT" && (
                    <div style={{ background: "#F0F0EE", borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 11, color: "#555" }}>📄 Document</div>
                  )}
                  {/* Body */}
                  {form.body ? (
                    <div style={{ fontSize: 12, color: "#111", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{previewBody}</div>
                  ) : (
                    <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>Your message body will appear here…</div>
                  )}
                  {/* Footer */}
                  {form.footer && (
                    <div style={{ fontSize: 10, color: "#888", marginTop: 6, borderTop: "0.5px solid #F0F0EE", paddingTop: 6 }}>{form.footer}</div>
                  )}
                  <div style={{ fontSize: 10, color: "#aaa", textAlign: "right", marginTop: 4 }}>
                    {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                  </div>
                </div>
                {/* Buttons */}
                {form.buttons.filter(b => b.text).map((btn, i) => (
                  <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "8px 12px", marginTop: 4, textAlign: "center", fontSize: 12, color: "#075E54", fontWeight: 500, maxWidth: "85%", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                    {btn.type === "URL" ? "🔗 " : btn.type === "PHONE_NUMBER" ? "📞 " : "↩ "}{btn.text}
                  </div>
                ))}
              </div>
            </div>
            {/* Approval note */}
            <div style={{ marginTop: 12, fontSize: 10, color: "#888", textAlign: "center", lineHeight: 1.6 }}>
              Templates must be approved by Meta before use. Approval typically takes 24–48 hours.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Template Viewer ──────────────────────────────────────────────────────────
function TemplateViewer({ apiClient }) {
  const [templates,    setTemplates]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showDrawer,   setShowDrawer]   = useState(false);

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

  // Group by category
  const marketing = templates.filter(t => t.category === "MARKETING");
  const utility   = templates.filter(t => t.category === "UTILITY");

  const TemplateRow = ({ t }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#F7F7F5", borderRadius: 8, marginBottom: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#111", marginBottom: 2 }}>{t.name}</div>
        <div style={{ fontSize: 10, color: "#888" }}>{t.language}</div>
        {/* Show body preview if available */}
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
      {showDrawer && (
        <TemplateCreateDrawer
          apiClient={apiClient}
          onClose={() => setShowDrawer(false)}
          onCreated={() => { setShowDrawer(false); setTimeout(load, 1000); }}
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
            <Btn onClick={() => setShowDrawer(true)} style={{ padding: "5px 12px" }}>+ New template</Btn>
          </div>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}><Spinner /></div>
        ) : templates.length === 0 ? (
          <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: "32px 0", background: "#F7F7F5", borderRadius: 10 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>No templates yet</div>
            <div style={{ marginBottom: 16 }}>Create your first template to start sending campaigns outside the 24h window.</div>
            <Btn onClick={() => setShowDrawer(true)}>+ Create template</Btn>
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
