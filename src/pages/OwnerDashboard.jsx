import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "../contexts/AuthContext";

// ─── Constants ──────────────────────────────────────────────────────────────
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRange(preset) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":     return { start: today, end: now };
    case "yesterday": {
      const s = new Date(today); s.setDate(s.getDate() - 1);
      const e = new Date(today); e.setMilliseconds(-1);
      return { start: s, end: e };
    }
    case "7d": {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { start: s, end: now };
    }
    case "30d": {
      const s = new Date(today); s.setDate(s.getDate() - 29);
      return { start: s, end: now };
    }
    default: return { start: today, end: now };
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

// ─── Chart.js CDN loader — waits until fully ready before resolving ──────────
let _chartReady = false;
let _chartCbs   = [];

function waitForChart(cb) {
  if (_chartReady && window.Chart) { cb(); return; }
  _chartCbs.push(cb);
  if (document.querySelector('script[data-chartjs]')) return; // already loading
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
  s.setAttribute("data-chartjs", "1");
  s.onload = () => {
    _chartReady = true;
    _chartCbs.forEach(fn => fn());
    _chartCbs = [];
  };
  document.head.appendChild(s);
}

// ─── Revenue + Heatmap chart ──────────────────────────────────────────────────
function RevenueChart({ labels, revenue, orders, covers, preset }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!labels?.length) return;

    waitForChart(() => {
      // Destroy old instance before creating new one
      if (chartRef.current) {
        try { chartRef.current.destroy(); } catch (_) {}
        chartRef.current = null;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      // Clear canvas explicitly to avoid ghost rendering
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // For 30-day view skip some x labels to avoid compression
      const maxLabels = 15;
      const step = labels.length > maxLabels ? Math.ceil(labels.length / maxLabels) : 1;

      chartRef.current = new window.Chart(ctx, {
        data: {
          labels,
          datasets: [
            {
              type: "bar",
              label: "Revenue",
              data: revenue,
              backgroundColor: "#378ADD",
              borderRadius: 3,
              yAxisID: "y",
              maxBarThickness: 32,
            },
            {
              type: "line",
              label: "Orders",
              data: orders,
              borderColor: "#1D9E75",
              backgroundColor: "transparent",
              borderWidth: 2,
              pointRadius: labels.length > 15 ? 1 : 3,
              tension: 0.4,
              yAxisID: "y2",
              borderDash: [4, 3],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: {
                color: "#888",
                font: { size: 10 },
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: maxLabels,
              },
              grid: { display: false },
            },
            y: {
              ticks: {
                color: "#888",
                font: { size: 10 },
                callback: v => fmtINR(v),
                maxTicksLimit: 6,
              },
              grid: { color: "rgba(0,0,0,0.06)" },
            },
            y2: {
              position: "right",
              ticks: { color: "#888", font: { size: 10 }, maxTicksLimit: 6 },
              grid: { display: false },
            },
          },
        },
      });
    });

    return () => {
      if (chartRef.current) {
        try { chartRef.current.destroy(); } catch (_) {}
        chartRef.current = null;
      }
    };
  }, [labels, revenue, orders]);

  const maxC = Math.max(...(covers ?? [1]));

  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>Revenue trend &amp; peak hours</span>
        <span style={{ fontSize: 11, color: "#aaa" }}>
          {preset === "today" || preset === "yesterday" ? "hourly" : "daily"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#888", marginBottom: 12 }}>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#378ADD", marginRight: 4, verticalAlign: "middle" }}></span>Revenue</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#1D9E75", marginRight: 4, verticalAlign: "middle" }}></span>Orders</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "#0C447C", marginRight: 4, verticalAlign: "middle" }}></span>Cover intensity</span>
      </div>
      <div style={{ height: 200, position: "relative" }}>
        <canvas ref={canvasRef} />
      </div>
      {covers?.length > 0 && (
        <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: `repeat(${covers.length}, 1fr)`, gap: 3 }}>
          {covers.map((v, i) => {
            const ci = Math.min(4, Math.floor((v / maxC) * 4.99));
            return <div key={i} title={`${v} covers`} style={{ background: HEAT_COLORS[ci], height: 10, borderRadius: 3 }} />;
          })}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 11, color: "#aaa" }}>
        <span>Covers</span>
        <div style={{ display: "flex", gap: 2 }}>
          {HEAT_COLORS.map((c, i) => <span key={i} style={{ background: c, width: 14, height: 8, borderRadius: 2, display: "inline-block" }} />)}
        </div>
        <span>Low → High</span>
      </div>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────
function Badge({ val, neutral }) {
  if (neutral) return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 6, background: "#F1EFE8", color: "#5F5E5A" }}>→ 0%</span>;
  if (val === undefined || val === null) return null;
  const up = val >= 0;
  return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 6, background: up ? "#EAF3DE" : "#FCEBEB", color: up ? "#3B6D11" : "#A32D2D" }}>{up ? "↑" : "↓"} {Math.abs(val)}%</span>;
}

function MetricCard({ icon, label, value, sub, badge, neutral }) {
  return (
    <div style={{ background: "#F7F7F5", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: "#111" }}>{value ?? "—"}</div>
      <div style={{ fontSize: 11, color: "#aaa", marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Badge val={badge} neutral={neutral} />
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

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

function TableOccupancy({ tables }) {
  const occupied = tables?.filter(t => t.status === "occupied").length ?? 0;
  const waiting  = tables?.filter(t => t.status === "waiting").length ?? 0;
  const free     = tables?.filter(t => t.status === "free").length ?? 0;
  const total    = tables?.length ?? 0;
  const occPax   = tables?.filter(t => t.status === "occupied").reduce((s, t) => s + (t.current_pax ?? 0), 0) ?? 0;
  const avgPax   = occupied > 0 ? (occPax / occupied).toFixed(1) : "—";
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
          <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{avgPax}</div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>Occupancy rate</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>{occRate}%</div>
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
          {tables?.map(t => {
            const c = TABLE_COLORS[t.status] ?? TABLE_COLORS.free;
            return (
              <div key={t.id} style={{ background: c.bg, borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: c.text }}>{t.label ?? `T${t.id}`}</div>
                <div style={{ fontSize: 10, color: c.text, opacity: 0.8 }}>{(t.current_pax ?? 0) > 0 ? `${t.current_pax}p` : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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

function KotStatus({ stats }) {
  return (
    <StatCard title="KOT status" sub="kitchen orders today">
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <MiniStat label="Open"        value={stats?.open ?? 0} />
        <MiniStat label="In progress" value={stats?.inProgress ?? 0} color="#BA7517" />
        <MiniStat label="Served"      value={stats?.served ?? 0}     color="#1D9E75" />
      </div>
      <KRow label="Avg KOT time"      value={stats?.avgTime != null ? `${stats.avgTime} min` : "—"} />
      <KRow label="Delayed (&gt;20 min)" value={stats?.delayed != null ? `${stats.delayed} KOTs` : "—"} danger={(stats?.delayed ?? 0) > 0} />
      <KRow label="Fastest item"      value={stats?.fastestItem ?? "—"} />
      <KRow label="Slowest item"      value={stats?.slowestItem ?? "—"} warn />
    </StatCard>
  );
}

function CancellationVoids({ stats }) {
  return (
    <StatCard title="Cancellations &amp; voids" sub="today">
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <MiniStat label="Cancelled"    value={stats?.cancelled ?? 0} color="#A32D2D" />
        <MiniStat label="Voided items" value={stats?.voided ?? 0}    color="#BA7517" />
      </div>
      <KRow label="Revenue lost"      value={stats?.revLost != null ? `₹${stats.revLost.toLocaleString("en-IN")}` : "₹0"} danger />
      <KRow label="Top void reason"   value={stats?.topReason ?? "—"} />
      <KRow label="Most voided item"  value={stats?.topItem ?? "—"} />
      <KRow label="Cancellation rate" value={stats?.rate != null ? `${stats.rate}%` : "—"} />
    </StatCard>
  );
}

// ─── Data hooks ───────────────────────────────────────────────────────────────
function useKpiData(restaurantId, startISO, endISO) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!restaurantId) return;
    (async () => {
      const [{ data: orders }, { data: tokens }] = await Promise.all([
        supabase.from("orders").select("total, pax").eq("restaurant_id", restaurantId).eq("status", "completed").gte("created_at", startISO).lte("created_at", endISO),
        supabase.from("walk_in_tokens").select("created_at, seated_at").eq("restaurant_id", restaurantId).gte("arrived_at", startISO).lte("arrived_at", endISO),
      ]);
      const totalRevenue = (orders ?? []).reduce((s, o) => s + (o.total ?? 0), 0);
      const totalOrders  = (orders ?? []).length;
      const seated = (tokens ?? []).filter(t => t.seated_at);
      const avgMins = seated.length ? Math.round(seated.reduce((s, t) => s + (new Date(t.seated_at) - new Date(t.created_at)) / 60000, 0) / seated.length) : null;
      setData({ totalRevenue, totalOrders, aov: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0, totalCovers: (orders ?? []).reduce((s, o) => s + (o.pax ?? 0), 0), tokensIssued: (tokens ?? []).length, avgDining: avgMins, avgWait: avgMins });
    })();
  }, [restaurantId, startISO, endISO]);
  return data;
}

function useChartData(restaurantId, startISO, endISO, preset) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!restaurantId) return;
    setData(null); // clear old data immediately to avoid stale chart
    (async () => {
      const { data: orders } = await supabase.from("orders").select("total, pax, created_at").eq("restaurant_id", restaurantId).eq("status", "completed").gte("created_at", startISO).lte("created_at", endISO);
      if (!orders) return;
      const byLabel = {};
      orders.forEach(o => {
        const d = new Date(o.created_at);
        const label = (preset === "today" || preset === "yesterday")
          ? `${d.getHours()}:00`
          : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        if (!byLabel[label]) byLabel[label] = { revenue: 0, orders: 0, covers: 0 };
        byLabel[label].revenue += o.total ?? 0;
        byLabel[label].orders  += 1;
        byLabel[label].covers  += o.pax ?? 0;
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
      const { data } = await supabase.from("order_items").select("quantity, unit_price, menu_items(name)").eq("restaurant_id", restaurantId).gte("created_at", startISO).lte("created_at", endISO);
      if (!data) return;
      const map = {};
      data.forEach(r => { const n = r.menu_items?.name ?? "Unknown"; if (!map[n]) map[n] = { name: n, qty: 0, revenue: 0 }; map[n].qty += r.quantity ?? 1; map[n].revenue += (r.quantity ?? 1) * (r.unit_price ?? 0); });
      setItems(Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 7));
    })();
  }, [restaurantId, startISO, endISO]);
  return items;
}

function useTables(restaurantId) {
  const [tables, setTables] = useState([]);
  const fetch = useCallback(async () => {
    if (!restaurantId) return;
    const { data } = await supabase.from("tables").select("id, label, status, current_pax").eq("restaurant_id", restaurantId).order("label");
    if (data) setTables(data);
  }, [restaurantId]);
  useEffect(() => {
    fetch();
    const ch = supabase.channel(`tables-${restaurantId}`).on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: `restaurant_id=eq.${restaurantId}` }, fetch).subscribe();
    return () => supabase.removeChannel(ch);
  }, [restaurantId, fetch]);
  return tables;
}

function useKotStats(restaurantId) {
  const [stats, setStats] = useState(null);
  const fetch = useCallback(async () => {
    if (!restaurantId) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("kot_tickets").select("status, created_at, served_at").eq("restaurant_id", restaurantId).gte("created_at", today.toISOString());
    if (!data) return;
    const times = data.filter(k => k.served_at).map(k => (new Date(k.served_at) - new Date(k.created_at)) / 60000);
    setStats({ open: data.filter(k => k.status === "open").length, inProgress: data.filter(k => k.status === "in_progress").length, served: data.filter(k => k.status === "served").length, avgTime: times.length ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : null, delayed: times.filter(t => t > 20).length, fastestItem: null, slowestItem: null });
  }, [restaurantId]);
  useEffect(() => {
    fetch();
    const ch = supabase.channel(`kot-${restaurantId}`).on("postgres_changes", { event: "*", schema: "public", table: "kot_tickets", filter: `restaurant_id=eq.${restaurantId}` }, fetch).subscribe();
    return () => supabase.removeChannel(ch);
  }, [restaurantId, fetch]);
  return stats;
}

function useCancelStats(restaurantId, startISO, endISO) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!restaurantId) return;
    (async () => {
      const [{ data: cancelled }, { data: voided }] = await Promise.all([
        supabase.from("orders").select("total").eq("restaurant_id", restaurantId).eq("status", "cancelled").gte("created_at", startISO).lte("created_at", endISO),
        supabase.from("order_items").select("unit_price, quantity, void_reason, menu_items(name)").eq("restaurant_id", restaurantId).eq("voided", true).gte("created_at", startISO).lte("created_at", endISO),
      ]);
      const reasonMap = {}, itemMap = {};
      (voided ?? []).forEach(v => { const r = v.void_reason ?? "Unknown"; reasonMap[r] = (reasonMap[r] ?? 0) + 1; const n = v.menu_items?.name ?? "Unknown"; itemMap[n] = (itemMap[n] ?? 0) + 1; });
      const total = (cancelled?.length ?? 0) + (voided?.length ?? 0);
      setStats({ cancelled: cancelled?.length ?? 0, voided: voided?.length ?? 0, revLost: (cancelled ?? []).reduce((s, o) => s + (o.total ?? 0), 0), topReason: Object.entries(reasonMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—", topItem: Object.entries(itemMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—", rate: total > 0 ? Math.round(((cancelled?.length ?? 0) / total) * 100) : 0 });
    })();
  }, [restaurantId, startISO, endISO]);
  return stats;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function OwnerDashboard({ restaurantId, restaurantName, onLogout }) {
  const [preset,      setPreset]      = useState("today");
  const [customStart, setCustomStart] = useState(null);
  const [customEnd,   setCustomEnd]   = useState(null);
  const [showCal,     setShowCal]     = useState(false);

  const { start, end } = (customStart && customEnd) ? { start: customStart, end: customEnd } : getRange(preset);

  // Memoize ISO strings — prevents hooks re-firing on every render
  const startISO = useMemo(() => start.toISOString(), [start.getTime()]);
  const endISO   = useMemo(() => end.toISOString(),   [end.getTime()]);

  const kpi         = useKpiData(restaurantId, startISO, endISO);
  const chartData   = useChartData(restaurantId, startISO, endISO, preset);
  const menuItems   = useMenuItems(restaurantId, startISO, endISO);
  const tables      = useTables(restaurantId);
  const kotStats    = useKotStats(restaurantId);
  const cancelStats = useCancelStats(restaurantId, startISO, endISO);

  const rangeLabel = (customStart && customEnd) ? `Custom · ${fmtDate(customStart)} – ${fmtDate(customEnd)}` : { today: "Today", yesterday: "Yesterday", "7d": "Last 7 days", "30d": "Last 30 days" }[preset];

  const row1 = [
    { icon: "₹",  label: "Total revenue",   value: kpi ? fmtINR(kpi.totalRevenue) : "—", badge: null, sub: "vs prior" },
    { icon: "🛒", label: "Orders",           value: kpi?.totalOrders ?? "—",               badge: null, sub: "vs prior" },
    { icon: "🧾", label: "Avg order value",  value: kpi ? `₹${kpi.aov}` : "—",             badge: null, sub: "vs prior" },
    { icon: "👥", label: "Total covers",     value: kpi?.totalCovers ?? "—",                neutral: true, sub: "vs prior" },
  ];
  const row2 = [
    { icon: "🔄", label: "Table turns",     value: "—",                                                 sub: "vs prior" },
    { icon: "⏱",  label: "Avg dining time", value: kpi?.avgDining ? `${kpi.avgDining} min` : "—",       sub: "Benchmark: 90 min" },
    { icon: "🎟",  label: "Tokens issued",   value: kpi?.tokensIssued ?? "—",                            sub: "vs prior" },
    { icon: "⏳", label: "Avg wait time",   value: kpi?.avgWait ? `${kpi.avgWait} min` : "—",           sub: "vs prior" },
  ];

  const btnStyle = (active) => ({
    fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "0.5px solid", cursor: "pointer",
    background:  active ? "#F0F0EE" : "transparent",
    color:       active ? "#111"    : "#888",
    borderColor: active ? "#C8C8C4" : "#E0E0DC",
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
                <button key={p.key} style={btnStyle(preset === p.key && !customStart)} onClick={() => { setPreset(p.key); setCustomStart(null); setCustomEnd(null); setShowCal(false); }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ width: 1, height: 18, background: "#E0E0DC" }} />
            <button style={{ ...btnStyle(!!customStart), display: "flex", alignItems: "center", gap: 5 }} onClick={() => setShowCal(v => !v)}>
              📅 {customStart ? `${fmtDate(customStart)} – ${fmtDate(customEnd)}` : "Custom"}
            </button>
            <div style={{ width: 1, height: 18, background: "#E0E0DC" }} />
            <button onClick={onLogout} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, border: "0.5px solid #FCEBEB", background: "#FFF5F5", color: "#A32D2D", cursor: "pointer" }}>
              Logout
            </button>
          </div>
        </div>

        {/* Custom date picker */}
        {showCal && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: 12, background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#888" }}>From</label>
            <input type="date" style={{ border: "0.5px solid #E0E0DC", borderRadius: 8, padding: "4px 8px", fontSize: 12 }} onChange={e => setCustomStart(new Date(e.target.value))} />
            <label style={{ fontSize: 12, color: "#888" }}>To</label>
            <input type="date" style={{ border: "0.5px solid #E0E0DC", borderRadius: 8, padding: "4px 8px", fontSize: 12 }} onChange={e => setCustomEnd(new Date(e.target.value + "T23:59:59"))} />
            <button onClick={() => { if (customStart && customEnd) { setPreset(null); setShowCal(false); } }} style={{ fontSize: 12, padding: "4px 14px", borderRadius: 8, border: "none", background: "#378ADD", color: "#fff", cursor: "pointer" }}>Apply</button>
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

        {/* Revenue + heatmap — only render when data is ready */}
        {chartData && chartData.labels?.length > 0 && (
          <RevenueChart
            labels={chartData.labels}
            revenue={chartData.revenue}
            orders={chartData.orders}
            covers={chartData.covers}
            preset={preset}
          />
        )}
        {chartData && chartData.labels?.length === 0 && (
          <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "32px 20px", marginBottom: 12, textAlign: "center", fontSize: 13, color: "#aaa" }}>
            No orders in this period
          </div>
        )}
        {!chartData && (
          <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "32px 20px", marginBottom: 12, textAlign: "center", fontSize: 13, color: "#aaa" }}>
            Loading chart...
          </div>
        )}

        {/* Menu + Tables */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 12 }}>
          <TopMenuItems items={menuItems} />
          <TableOccupancy tables={tables} />
        </div>

        {/* KOT + Cancellations */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
          <KotStatus stats={kotStats} />
          <CancellationVoids stats={cancelStats} />
        </div>

      </div>
    </div>
  );
}
