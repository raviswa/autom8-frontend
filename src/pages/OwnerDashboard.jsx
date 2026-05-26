// Dashboard v202505261100 — data fixes
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase, useAuth } from "../contexts/AuthContext";

// ── Export to CSV ─────────────────────────────────────────────────────────────
function exportToCSV(rows, filename) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = r[h] ?? "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
    }).join(","))
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const HEAT_COLORS = ["#E6F1FB", "#85B7EB", "#378ADD", "#185FA5", "#0C447C"];
const TABLE_COLORS = {
  occupied: { bg: "#1D9E75", text: "#085041" },
  waiting:  { bg: "#BA7517", text: "#633806" },
  free:     { bg: "#D3D1C7", text: "#444441" },
};
const PRESETS = [
  { label: "Today",     key: "today" },
  { label: "Yesterday", key: "yesterday" },
  { label: "7 days",    key: "7d" },
  { label: "30 days",   key: "30d" },
];

// ─── Timezone-aware helpers ───────────────────────────────────────────────────
// FIX: All date math was done in local browser time, but toISOString() outputs
// UTC. For a restaurant in IST (UTC+5:30) this means "today midnight UTC" =
// 5:30 AM IST — anything placed before 5:30 AM IST is silently excluded.
// We now compute range boundaries in IST explicitly.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5h 30m in ms

/** Returns the start-of-day in IST as a UTC Date object */
function istMidnightUTC(offsetDays = 0) {
  const nowUTC   = Date.now();
  const nowIST   = nowUTC + IST_OFFSET_MS;
  const dayIST   = new Date(nowIST);
  // Zero out time in IST
  dayIST.setUTCHours(0, 0, 0, 0);
  // Shift by requested days
  dayIST.setUTCDate(dayIST.getUTCDate() + offsetDays);
  // Convert back to UTC
  return new Date(dayIST.getTime() - IST_OFFSET_MS);
}

function getRangeISO(preset) {
  const now = new Date();
  switch (preset) {
    case "today":
      return { startISO: istMidnightUTC(0).toISOString(), endISO: now.toISOString() };
    case "yesterday": {
      const s = istMidnightUTC(-1);
      const e = new Date(istMidnightUTC(0).getTime() - 1);
      return { startISO: s.toISOString(), endISO: e.toISOString() };
    }
    case "7d":
      return { startISO: istMidnightUTC(-6).toISOString(), endISO: now.toISOString() };
    case "30d":
      return { startISO: istMidnightUTC(-29).toISOString(), endISO: now.toISOString() };
    default:
      return { startISO: istMidnightUTC(0).toISOString(), endISO: now.toISOString() };
  }
}

function fmtINR(n) {
  if (!n) return "₹0";
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000)   return "₹" + (n / 1000).toFixed(1) + "k";
  return "₹" + Math.round(n);
}

function fmtDate(d) {
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// FIX: customers.name sometimes stores the bot welcome message.
function resolveCustomerName(o) {
  const raw = o.customers?.name || o.customer_id || "";
  if (!raw || raw.toLowerCase().startsWith("hi,") || raw.length > 60) return "(Unresolved contact)";
  return raw;
}

// ─── Chart.js CDN loader ──────────────────────────────────────────────────────
let _chartReady = false;
let _chartCbs   = [];
function waitForChart(cb) {
  if (_chartReady && window.Chart) { cb(); return; }
  _chartCbs.push(cb);
  if (document.querySelector('script[data-chartjs]')) return;
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
  s.setAttribute("data-chartjs", "1");
  s.onload = () => { _chartReady = true; _chartCbs.forEach(fn => fn()); _chartCbs = []; };
  document.head.appendChild(s);
}

// ─── Revenue + Heatmap chart ──────────────────────────────────────────────────
function RevenueChart({ labels, revenue, orders, covers, preset }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const insight = useMemo(() => {
    if (!labels?.length) return null;
    const maxRevIdx = revenue.indexOf(Math.max(...revenue));
    const minRevIdx = revenue.indexOf(Math.min(...revenue));
    return `📈 ${labels[maxRevIdx]} had the highest revenue (${fmtINR(revenue[maxRevIdx])}, ${orders[maxRevIdx]} order${orders[maxRevIdx] !== 1 ? "s" : ""}).` +
      (minRevIdx !== maxRevIdx ? ` ${labels[minRevIdx]} was the quietest (${fmtINR(revenue[minRevIdx])}).` : "") +
      ` Peak covers: ${Math.max(...covers)}.`;
  }, [labels, revenue, orders, covers]);

  useEffect(() => {
    if (!labels?.length) return;
    waitForChart(() => {
      if (chartRef.current) { try { chartRef.current.destroy(); } catch (_) {} chartRef.current = null; }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      chartRef.current = new window.Chart(ctx, {
        data: {
          labels,
          datasets: [
            { type: "bar",  label: "Revenue (₹)", data: revenue, backgroundColor: "#378ADD", borderRadius: 4, yAxisID: "y",  maxBarThickness: 40, order: 2 },
            { type: "line", label: "Orders",       data: orders,  borderColor: "#1D9E75", backgroundColor: "rgba(29,158,117,0.08)", borderWidth: 2.5, pointRadius: labels.length > 15 ? 2 : 5, pointBackgroundColor: "#1D9E75", pointBorderColor: "#fff", pointBorderWidth: 2, tension: 0.4, yAxisID: "y2", fill: false, order: 1 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#1A1A1A", titleColor: "#fff", bodyColor: "#ccc", padding: 10, cornerRadius: 8,
              callbacks: { label: ctx => ctx.dataset.label === "Revenue (₹)" ? "  Revenue: " + fmtINR(ctx.parsed.y) : "  Orders: " + ctx.parsed.y }
            }
          },
          scales: {
            x: { ticks: { color: "#888", font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 15 }, grid: { display: false } },
            y:  { ticks: { color: "#888", font: { size: 10 }, callback: v => fmtINR(v), maxTicksLimit: 6 }, grid: { color: "rgba(0,0,0,0.06)" }, title: { display: true, text: "Revenue (₹)", color: "#aaa", font: { size: 10 } } },
            y2: { position: "right", ticks: { color: "#888", font: { size: 10 }, maxTicksLimit: 6, stepSize: 1 }, grid: { display: false }, title: { display: true, text: "Orders", color: "#aaa", font: { size: 10 } } },
          },
        },
      });
    });
    return () => { if (chartRef.current) { try { chartRef.current.destroy(); } catch (_) {} chartRef.current = null; } };
  }, [labels, revenue, orders]);

  const maxC = Math.max(...(covers ?? [1]));
  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Revenue &amp; order volume</span>
        <span style={{ fontSize: 11, color: "#aaa" }}>{preset === "today" || preset === "yesterday" ? "hourly" : "daily"}</span>
      </div>
      {insight && (
        <div style={{ fontSize: 12, color: "#555", background: "#F7F7F5", borderRadius: 8, padding: "8px 12px", marginBottom: 12, lineHeight: 1.55, borderLeft: "3px solid #378ADD" }}>
          {insight}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#888", marginBottom: 12, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#378ADD", marginRight: 4, verticalAlign: "middle" }}></span>Revenue (left axis)</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: "#1D9E75", marginRight: 4, verticalAlign: "middle" }}></span>Orders (right axis)</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#0C447C", marginRight: 4, verticalAlign: "middle" }}></span>Cover intensity (below)</span>
      </div>
      <div style={{ height: 200, position: "relative" }}><canvas ref={canvasRef} /></div>
      {covers?.length > 0 && (
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: `repeat(${covers.length}, 1fr)`, gap: 3 }}>
          {covers.map((v, i) => {
            const ci = Math.min(4, Math.floor((v / maxC) * 4.99));
            return <div key={i} title={`${labels?.[i] ?? i}: ${v} cover${v !== 1 ? "s" : ""}`} style={{ background: HEAT_COLORS[ci], height: 10, borderRadius: 3 }} />;
          })}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11, color: "#aaa" }}>
        <span>Covers</span>
        <div style={{ display: "flex", gap: 2 }}>{HEAT_COLORS.map((c, i) => <span key={i} style={{ background: c, width: 14, height: 8, borderRadius: 2, display: "inline-block" }} />)}</div>
        <span>Low → High</span>
      </div>
    </div>
  );
}

// ─── Shared UI pieces ─────────────────────────────────────────────────────────
function Badge({ val, neutral }) {
  if (neutral) return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 6, background: "#F1EFE8", color: "#5F5E5A" }}>→ 0%</span>;
  if (val === undefined || val === null) return null;
  const up = val >= 0;
  return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 6, background: up ? "#EAF3DE" : "#FCEBEB", color: up ? "#3B6D11" : "#A32D2D" }}>{up ? "↑" : "↓"} {Math.abs(val)}%</span>;
}

function Tooltip({ text, children }) {
  const [show, setShow] = React.useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <span style={{ marginLeft: 3, cursor: "help", color: "#C8C8C4", fontSize: 11 }}>ⓘ</span>
      {show && (
        <span style={{ position: "absolute", bottom: "120%", left: "50%", transform: "translateX(-50%)", background: "#1A1A1A", color: "#fff", fontSize: 11, padding: "6px 10px", borderRadius: 8, whiteSpace: "pre-wrap", maxWidth: 220, zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.2)", lineHeight: 1.5, pointerEvents: "none" }}>
          {text}
          <span style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #1A1A1A" }} />
        </span>
      )}
    </span>
  );
}

function MetricCard({ icon, label, value, sub, badge, neutral, tooltip }) {
  return (
    <div style={{ background: "#F7F7F5", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{icon} {tooltip ? <Tooltip text={tooltip}>{label}</Tooltip> : label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: "#111" }}>{value ?? "—"}</div>
      <div style={{ fontSize: 11, color: "#aaa", marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Badge val={badge} neutral={neutral} />{sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

function AlertBanner({ type = "warn", children }) {
  const s = { warn: { bg: "#FFFBF0", border: "#F5E0A0", color: "#7A5C00" }, info: { bg: "#F0F7FF", border: "#B8D8F8", color: "#1A4A7A" }, good: { bg: "#F0FAF4", border: "#A8DBBE", color: "#1A5C38" }, error: { bg: "#FFF5F5", border: "#FADADD", color: "#A32D2D" } }[type];
  return <div style={{ fontSize: 12, background: s.bg, border: `0.5px solid ${s.border}`, borderRadius: 8, padding: "8px 12px", marginBottom: 10, color: s.color, lineHeight: 1.55 }}>{children}</div>;
}

function StatCard({ title, sub, children }) {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>{title}</span>
        <span style={{ fontSize: 11, color: "#aaa" }}>{sub}</span>
      </div>
      {children}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: "#F7F7F5", borderRadius: 10, padding: "8px 10px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, color: color ?? "#111" }}>{value}</div>
    </div>
  );
}

function KRow({ label, value, danger, warn }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "0.5px solid #F7F7F5", fontSize: 12 }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ fontWeight: 500, color: danger ? "#A32D2D" : warn ? "#BA7517" : "#111" }}>{value}</span>
    </div>
  );
}

// ─── Top Menu Items ───────────────────────────────────────────────────────────
function TopMenuItems({ items }) {
  const maxRev = items?.[0]?.revenue ?? 1;
  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Top menu items</span>
        <span style={{ fontSize: 11, color: "#aaa" }}>by revenue</span>
      </div>
      {!items?.length && <div style={{ fontSize: 12, color: "#aaa", padding: "16px 0", textAlign: "center" }}>No data for this period</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
        <thead>
          <tr style={{ borderBottom: "0.5px solid #F0F0EE" }}>
            <th style={{ textAlign: "left", color: "#aaa", fontWeight: 400, fontSize: 11, paddingBottom: 6, width: "40%" }}>Item</th>
            <th style={{ textAlign: "right", color: "#aaa", fontWeight: 400, fontSize: 11, paddingBottom: 6, width: "15%" }}>Qty</th>
            <th style={{ textAlign: "right", color: "#aaa", fontWeight: 400, fontSize: 11, paddingBottom: 6, width: "25%" }}>Revenue</th>
            <th style={{ width: "20%" }}></th>
          </tr>
        </thead>
        <tbody>
          {items?.map((it, i) => (
            <tr key={i} style={{ borderBottom: "0.5px solid #F7F7F5" }}>
              <td style={{ padding: "7px 0", color: "#666" }}>{i + 1}. {it.name}</td>
              <td style={{ padding: "7px 0", textAlign: "right" }}>{it.qty}</td>
              <td style={{ padding: "7px 0", textAlign: "right", fontWeight: 500 }}>₹{it.revenue.toLocaleString("en-IN")}</td>
              <td style={{ padding: "7px 0 7px 8px" }}>
                <div style={{ background: "#F0F0EE", borderRadius: 3, height: 5, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(it.revenue / maxRev * 100)}%`, background: "#378ADD", height: "100%", borderRadius: 3 }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Table Occupancy ──────────────────────────────────────────────────────────
function TableOccupancy({ tables }) {
  const occupied = tables?.filter(t => t.status === "occupied").length ?? 0;
  const waiting  = tables?.filter(t => t.status === "waiting").length ?? 0;
  const free     = tables?.filter(t => t.status === "free").length ?? 0;
  const total    = tables?.length ?? 0;
  const occRate  = total ? Math.round((occupied / total) * 100) : 0;
  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Table occupancy</span>
        <span style={{ fontSize: 11, color: "#aaa" }}>live now</span>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ minWidth: 90 }}>
          <div style={{ fontSize: 26, fontWeight: 500, color: "#111" }}>{occupied}<span style={{ fontSize: 15, color: "#aaa" }}>/{total}</span></div>
          <div style={{ fontSize: 11, color: "#aaa", marginBottom: 10 }}>tables occupied</div>
          {[{ label: "Occupied", count: occupied, color: "#1D9E75" }, { label: "Waiting", count: waiting, color: "#BA7517" }, { label: "Free", count: free, color: "#B4B2A9" }].map(r => (
            <div key={r.label} style={{ fontSize: 12, marginBottom: 5 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.color, marginRight: 6, verticalAlign: "middle" }}></span>
              {r.label} <strong>{r.count}</strong>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 11, color: "#aaa" }}>Avg pax/table</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>
            <Tooltip text={"Live pax count per table is not in the current schema.\nEnable seat tracking to populate this."}>N/A</Tooltip>
          </div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>Occupancy rate</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{occRate}%</div>
          <div style={{ marginTop: 4, background: "#EEECEA", borderRadius: 4, height: 5, overflow: "hidden" }}>
            <div style={{ width: `${occRate}%`, background: "#1D9E75", height: "100%", borderRadius: 4, transition: "width .4s" }} />
          </div>
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {tables?.map(t => {
            const c = TABLE_COLORS[t.status] ?? TABLE_COLORS.free;
            return (
              <div key={t.id} style={{ background: c.bg, borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: c.text }}>T{t.table_number ?? t.id}</div>
                <div style={{ fontSize: 10, color: c.text, opacity: 0.8, textTransform: "capitalize" }}>
                  {t.status === "occupied" ? "Occ." : t.status === "waiting" ? "Wait" : "Free"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── KOT Status ───────────────────────────────────────────────────────────────
function KotStatus({ stats, error }) {
  const hasActivity = stats && (stats.open > 0 || stats.inProgress > 0 || stats.served > 0);
  return (
    <StatCard title="KOT status" sub="kitchen orders today">
      {error && <AlertBanner type="error">⚠️ Could not load KOT data: {error}</AlertBanner>}
      {!error && stats && !hasActivity && (
        <AlertBanner type="info">No KOT tickets raised today yet. They appear here once orders are sent to the kitchen.</AlertBanner>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <MiniStat label="Pending"  value={stats?.open   ?? 0} color="#BA7517" />
        <MiniStat label="Ready"    value={stats?.served ?? 0} color="#1D9E75" />
        <MiniStat label="Delayed (>20 min)" value={stats?.delayed ?? 0} color={(stats?.delayed ?? 0) > 0 ? "#A32D2D" : "#111"} />
      </div>
      <KRow label="Avg time in queue"   value={stats?.avgTime != null ? `${stats.avgTime} min` : <Tooltip text="Avg minutes from item entering queue to marked ready.">—</Tooltip>} />
      <KRow label="Fastest item"       value={stats?.fastestItem ?? <Tooltip text="Needs item-level KOT rows with served_at.">—</Tooltip>} />
      <KRow label="Slowest item"       value={stats?.slowestItem ?? <Tooltip text="Needs item-level KOT rows with served_at.">—</Tooltip>} warn />
    </StatCard>
  );
}

// ─── Cancellations & Voids ────────────────────────────────────────────────────
function CancellationVoids({ stats, error }) {
  const highBookingRate   = (stats?.bookingRate  ?? 0) >= 50;
  const orderCancelsClean = stats && stats.cancelled === 0 && (stats.totalOrders ?? 0) > 0;
  return (
    <StatCard title="Cancellations &amp; voids" sub="selected period">
      {error && <AlertBanner type="error">⚠️ Could not load cancellation data: {error}</AlertBanner>}

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Booking cancellations (WhatsApp)</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <MiniStat label="Cancelled"      value={stats?.bookingCancels ?? 0} color="#A32D2D" />
          <MiniStat label="Total bookings" value={stats?.totalBookings  ?? 0} />
          <MiniStat label="Rate"           value={stats?.bookingRate != null ? `${stats.bookingRate}%` : "—"} color="#BA7517" />
        </div>
        {highBookingRate && (
          <AlertBanner type="warn">⚠️ <strong>{stats.bookingRate}% cancellation rate</strong> — most are WhatsApp flow drops. Consider simplifying the bot steps to confirmation.</AlertBanner>
        )}
        <div style={{ fontSize: 11, color: "#aaa", padding: "6px 8px", background: "#FFF8F5", borderRadius: 6 }}>Customer-level: booking resets, flow abandonment, service type cancellations.</div>
      </div>

      <div style={{ borderTop: "0.5px solid #F0F0EE", marginBottom: 14 }} />

      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Order cancellations (Manager)</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <MiniStat label="Cancelled"    value={stats?.cancelled  ?? 0} color="#A32D2D" />
          <MiniStat label="Revenue lost" value={fmtINR(stats?.revLost ?? 0)} color="#BA7517" />
          <MiniStat label="Rate"         value={stats?.rate != null ? `${stats.rate}%` : "—"} color="#BA7517" />
        </div>
        {orderCancelsClean && <AlertBanner type="good">✅ No manager-level order cancellations this period — portal orders are clean.</AlertBanner>}
        <KRow label="Revenue lost"        value={stats?.revLost != null ? `₹${stats.revLost.toLocaleString("en-IN")}` : "₹0"} danger={(stats?.revLost ?? 0) > 0} />
        <KRow label="Total orders (base)" value={stats?.totalOrders ?? "—"} />
        <div style={{ marginTop: 8, fontSize: 11, color: "#aaa", padding: "6px 8px", background: "#FFF8F5", borderRadius: 6 }}>
          Manager cancelled placed orders in the portal. Cancellation reason not yet captured.
        </div>
      </div>
    </StatCard>
  );
}

// ─── WABA Info Panel ──────────────────────────────────────────────────────────
function WABAPanel({ info }) {
  const row = (label, value) => (
    <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: "#888", minWidth: 160 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#111", wordBreak: "break-all" }}>{value || "—"}</div>
    </div>
  );
  if (info === undefined) return <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 13 }}>Loading…</div>;
  if (info === null) return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>WhatsApp Business</span>
        <span style={{ fontSize: 11, background: "#FCEBEB", color: "#A32D2D", padding: "2px 8px", borderRadius: 6 }}>Not configured</span>
      </div>
      <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
        <div style={{ fontWeight: 500, color: "#111", marginBottom: 8 }}>How to connect your WABA:</div>
        <div>1. Go to <strong>Meta Business Suite</strong> → WhatsApp Manager</div>
        <div>2. Copy your <strong>WABA ID</strong> and <strong>Phone Number ID</strong></div>
        <div>3. Add them to your Munafe Chat restaurant settings</div>
        <div>4. Generate a <strong>Permanent Access Token</strong> and add it to your backend <code>.env</code> as <code>WHATSAPP_ACCESS_TOKEN</code></div>
      </div>
    </div>
  );
  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>WhatsApp Business</span>
        <span style={{ fontSize: 11, background: "#EAF3DE", color: "#3B6D11", padding: "2px 8px", borderRadius: 6 }}>● Connected</span>
      </div>
      {row("Business name",   info.name)}
      {row("Phone number",    info.whatsapp_number ? `+${info.whatsapp_number}` : null)}
      {row("WABA ID",         info.waba_id)}
      {row("Manager phone",   info.manager_phone ? `+${info.manager_phone}` : null)}
      {row("Timezone",        info.timezone)}
      {row("Dining duration", info.dining_duration_minutes ? `${info.dining_duration_minutes} min` : null)}
      {row("Payment mode",    info.payment_mode)}
      <div style={{ marginTop: 12, padding: "8px 12px", background: "#F7F7F5", borderRadius: 8, fontSize: 12, color: "#888" }}>
        📲 Test ordering bot: send <strong>"Hi"</strong> to <strong>+{info.whatsapp_number}</strong>
      </div>
    </div>
  );
}

// ─── WhatsApp Orders Table ────────────────────────────────────────────────────
function WAOrdersTable({ orders, rangeLabel }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!orders) return null;
    if (!search.trim()) return orders;
    const q = search.toLowerCase();
    return orders.filter(o => {
      const name  = resolveCustomerName(o).toLowerCase();
      const phone = (o.customers?.phone || "").toLowerCase();
      const svc   = (o.service_type || o.event_type || "").toLowerCase();
      const token = (o.token_number || "").toLowerCase();
      return name.includes(q) || phone.includes(q) || svc.includes(q) || token.includes(q);
    });
  }, [orders, search]);

  const handleExport = () => {
    if (!filtered?.length) return;
    exportToCSV(filtered.map(o => ({
      Date: o.created_at ? new Date(o.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—",
      Name: resolveCustomerName(o), Phone: o.customers?.phone || "—",
      Service: o.service_type || o.event_type || "—", Token: o.token_number || "—",
      Party_Size: o.party_size || "—", Amount: o.total_amount != null ? `₹${o.total_amount}` : "—", Status: o.status || "—",
    })), `whatsapp-orders-${rangeLabel.replace(/[^a-z0-9]/gi, "-")}.csv`);
  };

  const statusColor = s => {
    if (!s) return "#888";
    if (["completed","confirmed","paid"].includes(s)) return "#3B6D11";
    if (["cancelled","failed"].includes(s)) return "#A32D2D";
    if (["pending","awaiting"].includes(s)) return "#BA7517";
    return "#555";
  };

  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>WhatsApp orders</span>
          {filtered != null && <span style={{ fontSize: 11, color: "#aaa", marginLeft: 8 }}>{filtered.length} total · {rangeLabel}</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, token…"
            style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "0.5px solid #E0E0DC", outline: "none", width: 200 }} />
          <button onClick={handleExport} disabled={!filtered?.length}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "0.5px solid #E0E0DC", background: filtered?.length ? "#F7F7F5" : "#fafafa", color: filtered?.length ? "#111" : "#aaa", cursor: filtered?.length ? "pointer" : "default" }}>
            ⬇ Export CSV
          </button>
        </div>
      </div>
      {orders === null && <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "#aaa" }}>Loading…</div>}
      {orders !== null && filtered?.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "#aaa" }}>No orders in this period</div>}
      {filtered?.length > 0 && (
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 300, borderRadius: 8, border: "0.5px solid #F0F0EE" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <tr style={{ borderBottom: "0.5px solid #E8E8E5" }}>
                {["Date & Time","Name","Phone","Service","Token","Pax","Amount","Status"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: "#aaa", fontWeight: 400, fontSize: 11, padding: "8px 8px 8px 0", whiteSpace: "nowrap", background: "#fff" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr key={o.id || i} style={{ borderBottom: "0.5px solid #F7F7F5" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F7F7F5"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}>
                  <td style={{ padding: "5px 8px 5px 0", color: "#555", whiteSpace: "nowrap", fontSize: 11 }}>
                    {o.created_at ? new Date(o.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "—"}
                  </td>
                  <td style={{ padding: "7px 8px 7px 0", fontWeight: 500, color: "#111", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resolveCustomerName(o)}</td>
                  <td style={{ padding: "7px 8px 7px 0", color: "#555", whiteSpace: "nowrap" }}>{o.customers?.phone ? `+${o.customers.phone}` : "—"}</td>
                  <td style={{ padding: "7px 8px 7px 0", color: "#555", whiteSpace: "nowrap", textTransform: "capitalize" }}>{(o.service_type || o.event_type || "—").replace(/_/g, " ")}</td>
                  <td style={{ padding: "7px 8px 7px 0", color: "#555", fontFamily: "monospace" }}>{o.token_number || "—"}</td>
                  <td style={{ padding: "7px 8px 7px 0", color: "#555", textAlign: "center" }}>{o.party_size || "—"}</td>
                  <td style={{ padding: "7px 8px 7px 0", fontWeight: 500, color: "#111", whiteSpace: "nowrap" }}>{o.total_amount != null ? `₹${Number(o.total_amount).toLocaleString("en-IN")}` : "—"}</td>
                  <td style={{ padding: "7px 8px 7px 0" }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: statusColor(o.status), background: statusColor(o.status) + "18", padding: "2px 7px", borderRadius: 5, textTransform: "capitalize" }}>{o.status || "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Data hooks ───────────────────────────────────────────────────────────────
function useKpiData(restaurantId, startISO, endISO) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!restaurantId) return;
    setData(null);
    (async () => {
      const [{ data: orders, error: oErr }, { data: tokens, error: tErr }] = await Promise.all([
        supabase.from("orders").select("total_amount").eq("restaurant_id", restaurantId).not("status", "eq", "cancelled").gte("created_at", startISO).lte("created_at", endISO),
        supabase.from("walk_in_tokens").select("arrived_at, seated_at").eq("restaurant_id", restaurantId).gte("arrived_at", startISO).lte("arrived_at", endISO),
      ]);
      // FIX: log query errors rather than silently treating them as empty results
      if (oErr) console.error("[useKpiData] orders error:", oErr.message, oErr.details);
      if (tErr) console.error("[useKpiData] tokens error:", tErr.message);
      const totalRevenue = (orders ?? []).reduce((s, o) => s + (o.total_amount ?? 0), 0);
      const totalOrders  = (orders ?? []).length;
      const seated   = (tokens ?? []).filter(t => t.seated_at);
      const avgMins  = seated.length ? Math.round(seated.reduce((s, t) => s + (new Date(t.seated_at) - new Date(t.arrived_at ?? t.created_at)) / 60000, 0) / seated.length) : null;
      setData({ totalRevenue, totalOrders, aov: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0, totalCovers: totalOrders, tokensIssued: (tokens ?? []).length, avgDining: avgMins, avgWait: avgMins });
    })();
  }, [restaurantId, startISO, endISO]);
  return data;
}

function useChartData(restaurantId, startISO, endISO, preset) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!restaurantId) return;
    setData(null);
    (async () => {
      const { data: orders, error } = await supabase.from("orders").select("total_amount, created_at").eq("restaurant_id", restaurantId).not("status", "eq", "cancelled").gte("created_at", startISO).lte("created_at", endISO);
      if (error) { console.error("[useChartData]", error.message); return; }
      if (!orders) return;
      const byLabel = {};
      orders.forEach(o => {
        // FIX: format times in IST so the chart labels match what the owner sees on the clock
        const d     = new Date(o.created_at);
        const label = (preset === "today" || preset === "yesterday")
          ? `${String(new Date(d.getTime() + IST_OFFSET_MS).getUTCHours()).padStart(2, "0")}:00`
          : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
        if (!byLabel[label]) byLabel[label] = { revenue: 0, orders: 0, covers: 0 };
        byLabel[label].revenue += o.total_amount ?? 0;
        byLabel[label].orders  += 1;
        byLabel[label].covers  += 1;
      });
      const labels = Object.keys(byLabel);
      setData({ labels, revenue: labels.map(l => byLabel[l].revenue), orders: labels.map(l => byLabel[l].orders), covers: labels.map(l => byLabel[l].covers) });
    })();
  }, [restaurantId, startISO, endISO, preset]);
  return data;
}

function useMenuItems(restaurantId, startISO, endISO) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!restaurantId) return;
    (async () => {
      const { data: orders, error: oErr } = await supabase.from("orders")
        .select("id").eq("restaurant_id", restaurantId).not("status", "eq", "cancelled")
        .gte("created_at", startISO).lte("created_at", endISO);
      if (oErr) { console.error("[useMenuItems] orders:", oErr.message); setItems([]); return; }
      if (!orders?.length) { setItems([]); return; }
      const { data, error } = await supabase.from("order_items")
        .select("quantity, unit_price, special_instructions, menu_item:menu_item_id(name)")
        .in("order_id", orders.map(o => o.id));
      if (error) { console.error("[useMenuItems] items:", error.message); return; }
      if (!data) return;
      const map = {};
      data.forEach(r => {
        const n = r.menu_item?.name || r.special_instructions || null;
        if (!n) return;
        if (!map[n]) map[n] = { name: n, qty: 0, revenue: 0 };
        map[n].qty     += r.quantity ?? 1;
        map[n].revenue += (r.quantity ?? 1) * (r.unit_price ?? 0);
      });
      setItems(Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 7));
    })();
  }, [restaurantId, startISO, endISO]);
  return items;
}

function useTables(restaurantId) {
  const [tables, setTables] = useState([]);
  const fetch = useCallback(async () => {
    if (!restaurantId) return;
    const { data, error } = await supabase.from("tables").select("id, table_number, section, status").eq("restaurant_id", restaurantId).order("table_number", { ascending: true });
    if (error) { console.error("[useTables]", error.message); return; }
    if (data) setTables(data);
  }, [restaurantId]);
  useEffect(() => {
    fetch();
    const ch = supabase.channel(`tables-${restaurantId}`).on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: `restaurant_id=eq.${restaurantId}` }, fetch).subscribe();
    return () => supabase.removeChannel(ch);
  }, [restaurantId, fetch]);
  return tables;
}

// KOT data lives in kds_items, not kot_tickets.
// Real columns: id, restaurant_id, status, time_in_queue_seconds,
//               item_name, created_at, updated_at, token_number, service_type
// Real statuses: "pending" (in queue) | "ready" (served/completed)
function useKotStats(restaurantId) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  const doFetch = useCallback(async () => {
    if (!restaurantId) return;
    const todayStartISO = istMidnightUTC(0).toISOString();
    console.log("[useKotStats] querying kds_items from", todayStartISO);

    const { data, error: qErr } = await supabase
      .from("kds_items")
      .select("status, time_in_queue_seconds, item_name, created_at, updated_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", todayStartISO);

    if (qErr) {
      console.error("[useKotStats]", qErr.message, qErr.details);
      setError(qErr.message);
      return;
    }

    console.log("[useKotStats] rows:", data?.length ?? 0);
    setError(null);

    if (!data?.length) {
      setStats({ open: 0, inProgress: 0, served: 0, avgTime: null, delayed: 0, fastestItem: null, slowestItem: null });
      return;
    }

    const pending = data.filter(k => k.status === "pending");
    const ready   = data.filter(k => k.status === "ready");

    // time_in_queue_seconds is only populated once item is ready
    const readyTimes = ready
      .map(k => (k.time_in_queue_seconds ?? 0) / 60)
      .filter(t => t > 0);

    const avgTime = readyTimes.length
      ? Math.round(readyTimes.reduce((s, v) => s + v, 0) / readyTimes.length)
      : null;

    const delayed = readyTimes.filter(t => t > 20).length;

    // Fastest / slowest by avg queue time per item name (ready items only)
    const byItem = {};
    ready.forEach(k => {
      const secs = k.time_in_queue_seconds ?? 0;
      if (!secs || !k.item_name) return;
      if (!byItem[k.item_name]) byItem[k.item_name] = { total: 0, count: 0 };
      byItem[k.item_name].total += secs;
      byItem[k.item_name].count += 1;
    });
    const itemAvgs = Object.entries(byItem)
      .map(([name, { total, count }]) => ({ name, avg: total / count }))
      .sort((a, b) => a.avg - b.avg);

    setStats({
      open:        pending.length,   // "pending" = waiting in queue / being prepared
      inProgress:  0,                // kds_items has no separate in-progress status
      served:      ready.length,     // "ready" = completed
      avgTime,
      delayed,
      fastestItem: itemAvgs[0]?.name ?? null,
      slowestItem: itemAvgs[itemAvgs.length - 1]?.name ?? null,
    });
  }, [restaurantId]);

  useEffect(() => {
    doFetch();
    const ch = supabase.channel(`kds-${restaurantId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "kds_items",
        filter: `restaurant_id=eq.${restaurantId}`,
      }, () => {
        console.log("[useKotStats] realtime update — refetching");
        doFetch();
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [restaurantId, doFetch]);

  return { stats, error };
}

function useCancelStats(apiClient, restaurantId, startISO, endISO) {
  const [stats, setStats]   = useState(null);
  const [error, setError]   = useState(null);

  useEffect(() => {
    // FIX: guard all four params — if any are falsy the hook was running but
    // hitting the API with undefined params, which returned 0s silently
    if (!apiClient || !restaurantId || !startISO || !endISO) {
      console.warn("[useCancelStats] skipping — missing params", { apiClient: !!apiClient, restaurantId, startISO, endISO });
      return;
    }
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        console.log("[useCancelStats] fetching", { start: startISO, end: endISO });
        const res = await apiClient.get('/api/dashboard/cancel-stats', { params: { start: startISO, end: endISO } });
        if (cancelled) return;
        console.log("[useCancelStats] response:", res.data);
        const d = res.data;
        setStats({
          cancelled:      d.orderCancels,
          revLost:        d.orderRevLost,
          totalOrders:    d.totalOrders,
          rate:           d.orderRate,
          bookingCancels: d.bookingCancels,
          totalBookings:  d.totalBookings,
          bookingRate:    d.bookingRate,
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err?.response?.data?.message || err.message;
        console.error('[useCancelStats] error:', err?.response?.status, msg);
        setError(msg);
      }
    })();
    return () => { cancelled = true; };
  }, [apiClient, restaurantId, startISO, endISO]);

  return { stats, error };
}

function useWABAInfo(apiClient) {
  const [info, setInfo] = useState(undefined);
  useEffect(() => {
    if (!apiClient) return;
    (async () => {
      try {
        const res = await apiClient.get('/api/dashboard/waba');
        setInfo(res.data?.restaurant ?? null);
      } catch (err) {
        console.error('[useWABAInfo]', err?.response?.status, err.message);
        setInfo(null);
      }
    })();
  }, [apiClient]);
  return info;
}

function useWAOrders(apiClient, startISO, endISO) {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    if (!apiClient) return;
    setOrders(null);
    (async () => {
      try {
        const res = await apiClient.get('/api/dashboard/wa-orders', { params: { start: startISO, end: endISO } });
        setOrders(res.data?.orders ?? []);
      } catch (err) {
        console.error('[useWAOrders]', err?.response?.status, err.message);
        setOrders([]);
      }
    })();
  }, [apiClient, startISO, endISO]);
  return orders;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function OwnerDashboard({ restaurantId, restaurantName, onLogout, apiClient: apiClientProp }) {
  const { apiClient: apiClientCtx } = useAuth();
  const apiClient = apiClientCtx || apiClientProp;
  const [preset,      setPreset]      = useState("today");
  const [customStart, setCustomStart] = useState(null);
  const [customEnd,   setCustomEnd]   = useState(null);
  const [showCal,     setShowCal]     = useState(false);

  const { startISO, endISO } = useMemo(() => {
    if (customStart && customEnd) return { startISO: customStart.toISOString(), endISO: customEnd.toISOString() };
    return getRangeISO(preset);
  }, [preset, customStart, customEnd]);

  const kpi                         = useKpiData(restaurantId, startISO, endISO);
  const chartData                   = useChartData(restaurantId, startISO, endISO, preset);
  const menuItems                   = useMenuItems(restaurantId, startISO, endISO);
  const tables                      = useTables(restaurantId);
  const { stats: kotStats,    error: kotError    } = useKotStats(restaurantId);
  const { stats: cancelStats, error: cancelError } = useCancelStats(apiClient, restaurantId, startISO, endISO);
  const wabaInfo                    = useWABAInfo(apiClient);
  const waOrders                    = useWAOrders(apiClient, startISO, endISO);

  const rangeLabel = (customStart && customEnd)
    ? `Custom · ${fmtDate(customStart)} – ${fmtDate(customEnd)}`
    : { today: "Today", yesterday: "Yesterday", "7d": "Last 7 days", "30d": "Last 30 days" }[preset];

  const row1 = [
    { icon: "₹",  label: "Total revenue",  value: kpi ? fmtINR(kpi.totalRevenue) : "—", sub: "selected period" },
    { icon: "🛒", label: "Orders",          value: kpi?.totalOrders ?? "—",               sub: "selected period" },
    { icon: "🧾", label: "Avg order value", value: kpi ? `₹${kpi.aov}` : "—",             sub: "selected period", tooltip: "Total revenue ÷ orders. Excludes cancelled orders." },
    { icon: "👥", label: "Total covers",    value: kpi?.totalCovers ?? "—",               neutral: true, sub: "selected period", tooltip: "Total completed orders. Each order = 1 cover." },
  ];
  const row2 = [
    { icon: "🔄", label: "Table turns",     value: kpi && tables?.length ? (kpi.totalOrders / tables.length).toFixed(1) : "—", sub: "per table, period", tooltip: "Total orders ÷ tables. Higher = more efficient table reuse." },
    { icon: "⏱",  label: "Avg dining time", value: kpi?.avgDining ? `${kpi.avgDining} min` : "—", sub: "Benchmark: 90 min", tooltip: "Avg mins from walk-in check-in to table completion." },
    { icon: "🎟",  label: "Tokens issued",   value: kpi?.tokensIssued ?? "—", sub: "selected period", tooltip: "Walk-in customers who received a queue token via bot or QR." },
    { icon: "⏳", label: "Avg wait time",   value: kpi?.avgWait ? `${kpi.avgWait} min` : "—", sub: "selected period", tooltip: "Avg mins from check-in to table assignment." },
  ];

  const btnStyle = active => ({
    fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "0.5px solid", cursor: "pointer",
    background: active ? "#F0F0EE" : "transparent", color: active ? "#111" : "#888", borderColor: active ? "#C8C8C4" : "#E0E0DC",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#F7F7F5", padding: "24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 500, color: "#111", margin: 0 }}>Owner dashboard</h1>
            <p style={{ fontSize: 13, color: "#888", margin: "2px 0 0" }}>{restaurantName} · {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {PRESETS.map(p => (
                <button key={p.key} style={btnStyle(preset === p.key && !customStart)} onClick={() => { setPreset(p.key); setCustomStart(null); setCustomEnd(null); setShowCal(false); }}>{p.label}</button>
              ))}
            </div>
            <div style={{ width: 1, height: 18, background: "#E0E0DC" }} />
            <button style={{ ...btnStyle(!!customStart), display: "flex", alignItems: "center", gap: 5 }} onClick={() => setShowCal(v => !v)}>
              📅 {customStart ? `${fmtDate(customStart)} – ${fmtDate(customEnd)}` : "Custom"}
            </button>
            <div style={{ width: 1, height: 18, background: "#E0E0DC" }} />
            <button onClick={onLogout} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, border: "0.5px solid #FCEBEB", background: "#FFF5F5", color: "#A32D2D", cursor: "pointer" }}>Logout</button>
          </div>
        </div>

        {/* Custom date picker */}
        {showCal && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: 12, background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#888" }}>From</label>
            <input type="date" style={{ border: "0.5px solid #E0E0DC", borderRadius: 8, padding: "4px 8px", fontSize: 12 }} onChange={e => setCustomStart(new Date(e.target.value))} />
            <label style={{ fontSize: 12, color: "#888" }}>To</label>
            <input type="date" style={{ border: "0.5px solid #E0E0DC", borderRadius: 8, padding: "4px 8px", fontSize: 12 }} onChange={e => setCustomEnd(new Date(e.target.value + "T23:59:59"))} />
            <button onClick={() => { if (customStart && customEnd) { setPreset(null); setShowCal(false); } }}
              style={{ fontSize: 12, padding: "4px 14px", borderRadius: 8, border: "none", background: "#378ADD", color: "#fff", cursor: "pointer" }}>Apply</button>
          </div>
        )}

        <p style={{ fontSize: 11, color: "#aaa", marginBottom: 12 }}>Showing: {rangeLabel}</p>

        {/* KPI rows */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 10 }}>
          {row1.map((m, i) => <MetricCard key={i} {...m} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 14 }}>
          {row2.map((m, i) => <MetricCard key={i} {...m} />)}
        </div>

        {/* Revenue chart */}
        {chartData && chartData.labels?.length > 0 && (
          <RevenueChart labels={chartData.labels} revenue={chartData.revenue} orders={chartData.orders} covers={chartData.covers} preset={preset} />
        )}
        {chartData && chartData.labels?.length === 0 && (
          <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "32px 20px", marginBottom: 12, textAlign: "center", fontSize: 13, color: "#aaa" }}>No orders in this period</div>
        )}
        {!chartData && (
          <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "32px 20px", marginBottom: 12, textAlign: "center", fontSize: 13, color: "#aaa" }}>Loading chart…</div>
        )}

        {/* Menu + Tables */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
          <TopMenuItems items={menuItems} />
          <TableOccupancy tables={tables} />
        </div>

        {/* WABA + WhatsApp orders */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
          <WABAPanel info={wabaInfo} />
          <WAOrdersTable orders={waOrders} rangeLabel={rangeLabel} />
        </div>

        {/* KOT + Cancellations */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
          <KotStatus stats={kotStats} error={kotError} />
          <CancellationVoids stats={cancelStats} error={cancelError} />
        </div>

      </div>
    </div>
  );
}
