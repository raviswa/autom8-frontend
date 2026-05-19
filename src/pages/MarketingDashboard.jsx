//=============================================================
//=======MARKETING DASHBOARD - CAMPAIGN ANALYTICS==============
//=============================================================



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

// ─── Template Viewer ──────────────────────────────────────────────────────────
function TemplateViewer({ apiClient }) {
  const [templates, setTemplates] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    apiClient.get("/api/marketing/templates")
      .then(res => setTemplates(res.data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [apiClient]);

  const statusColor = s => s === "APPROVED" ? "#2E7D32" : s === "PENDING" ? "#BA7517" : "#A32D2D";
  const statusBg    = s => s === "APPROVED" ? "#E8F5E9" : s === "PENDING" ? "#FFF3E0" : "#FFEBEE";

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Message templates</span>
        <span style={{ fontSize: 11, color: "#aaa" }}>from Meta Business</span>
      </div>
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}><Spinner /></div>
      ) : templates.length === 0 ? (
        <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: "16px 0", background: "#F7F7F5", borderRadius: 8 }}>
          No templates found. Create templates in Meta Business Suite and they'll appear here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
          {templates.map((t, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#F7F7F5", borderRadius: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#111" }}>{t.name}</div>
                <div style={{ fontSize: 10, color: "#888" }}>{t.category} · {t.language}</div>
              </div>
              <Pill label={t.status} color={statusColor(t.status)} bg={statusBg(t.status)} />
            </div>
          ))}
        </div>
      )}
    </Card>
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
