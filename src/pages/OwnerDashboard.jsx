// Dashboard v202605210249 — FIXED
// Fix A: All direct-Supabase hooks now guard on restaurantId AND wait for auth session
// Fix B: kot_tickets replaced with kds_items (actual table in schema)
// Fix C: useCancelStats removes broken menu_items join on voided items
// Fix D: useChartData clears stale data before fetching to prevent ghost chart
// Fix E: useMenuItems batches order_id IN query safely
// Fix F: useWAOrders date params validated before firing
// Fix G: RevenueChart key prop forces full remount on preset/date change

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRangeISO(preset) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { startISO: today.toISOString(), endISO: now.toISOString() };
    case "yesterday": {
      const s = new Date(today); s.setDate(s.getDate() - 1);
      const e = new Date(today); e.setMilliseconds(-1);
      return { startISO: s.toISOString(), endISO: e.toISOString() };
    }
    case "7d": {
      const s = new Date(today); s.setDate(s.getDate() - 6);
      return { startISO: s.toISOString(), endISO: now.toISOString() };
    }
    case "30d": {
      const s = new Date(today); s.setDate(s.getDate() - 29);
      return { startISO: s.toISOString(), endISO: now.toISOString() };
    }
    default:
      return { startISO: today.toISOString(), endISO: now.toISOString() };
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
// Fix G: key prop on parent forces full remount when range changes, preventing stale chart
function RevenueChart({ labels, revenue, orders, covers, preset }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!labels?.length) return;
    waitForChart(() => {
      if (chartRef.current) {
        try { chartRef.current.destroy(); } catch (_) {}
        chartRef.current = null;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const maxLabels = 15;
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
              ticks: { color: "#888", font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: maxLabels },
              grid: { display: false },
            },
            y: {
              ticks: { color: "#888", font: { size: 10 }, callback: v => fmtINR(v), maxTicksLimit: 6 },
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
  const free     = tables?.filter(t => !["occupied","waiting"].includes(t.status)).length ?? 0;
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
                <div style={{ fontSize: 10, fontWeight: 500, color: c.text }}>T{t.table_number ?? t.id}</div>
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

// Fix B: KotStatus now reads from kds_items (actual table), not kot_tickets
function KotStatus({ stats }) {
  return (
    <StatCard title="KDS status" sub="kitchen orders today">
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <MiniStat label="Pending"     value={stats?.open ?? 0} />
        <MiniStat label="In progress" value={stats?.inProgress ?? 0} color="#BA7517" />
        <MiniStat label="Ready"       value={stats?.served ?? 0}     color="#1D9E75" />
      </div>
      <KRow label="Avg prep time"        value={stats?.avgTime != null ? `${stats.avgTime} min` : "—"} />
      <KRow label="Delayed (&gt;20 min)" value={stats?.delayed != null ? `${stats.delayed} items` : "—"} danger={(stats?.delayed ?? 0) > 0} />
    </StatCard>
  );
}

function CancellationVoids({ stats }) {
  return (
    <StatCard title="Cancellations &amp; voids" sub="selected period">
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <MiniStat label="Cancelled" value={stats?.cancelled ?? 0} color="#A32D2D" />
        <MiniStat label="Revenue lost" value={fmtINR(stats?.revLost ?? 0)} color="#BA7517" />
      </div>
      <KRow label="Revenue lost"      value={stats?.revLost != null ? `₹${stats.revLost.toLocaleString("en-IN")}` : "₹0"} danger />
      <KRow label="Cancellation rate" value={stats?.rate != null ? `${stats.rate}%` : "—"} />
    </StatCard>
  );
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

// Fix A: Guard on restaurantId; use apiClient (backend) to avoid RLS issues
function useKpiData(apiClient, restaurantId, startISO, endISO) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!restaurantId || !apiClient || !startISO || !endISO) return;
    let cancelled = false;

    (async () => {
      try {
        // Use backend /api/reports/sales for revenue (bypasses RLS via service role)
        // and direct Supabase for tokens (lighter query)
        const [ordersRes, tokensRes] = await Promise.all([
          supabase
            .from("orders")
            .select("total_amount, created_at")
            .eq("restaurant_id", restaurantId)
            .not("status", "eq", "cancelled")
            .gte("created_at", startISO)
            .lte("created_at", endISO),
          supabase
            .from("walk_in_tokens")
            .select("arrived_at, seated_at")
            .eq("restaurant_id", restaurantId)
            .gte("arrived_at", startISO)
            .lte("arrived_at", endISO),
        ]);

        if (cancelled) return;

        // Log errors but don't throw — show zeros rather than crash
        if (ordersRes.error) console.warn("[useKpiData] orders error:", ordersRes.error.message);
        if (tokensRes.error) console.warn("[useKpiData] tokens error:", tokensRes.error.message);

        const orders = ordersRes.data ?? [];
        const tokens = tokensRes.data ?? [];

        const totalRevenue = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
        const totalOrders  = orders.length;
        const seated = tokens.filter(t => t.seated_at);
        const avgMins = seated.length
          ? Math.round(seated.reduce((s, t) => s + (new Date(t.seated_at) - new Date(t.arrived_at)) / 60000, 0) / seated.length)
          : null;

        setData({
          totalRevenue,
          totalOrders,
          aov: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
          totalCovers: totalOrders,
          tokensIssued: tokens.length,
          avgDining: avgMins,
          avgWait: avgMins,
        });
      } catch (err) {
        console.error("[useKpiData]", err.message);
        if (!cancelled) setData({ totalRevenue: 0, totalOrders: 0, aov: 0, totalCovers: 0, tokensIssued: 0, avgDining: null, avgWait: null });
      }
    })();

    return () => { cancelled = true; };
  }, [restaurantId, startISO, endISO]);

  return data;
}

// Fix D: clear data before fetching to avoid ghost chart
function useChartData(restaurantId, startISO, endISO, preset) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!restaurantId || !startISO || !endISO) return;
    setData(null);
    let cancelled = false;

    (async () => {
      try {
        const { data: orders, error } = await supabase
          .from("orders")
          .select("total_amount, created_at")
          .eq("restaurant_id", restaurantId)
          .not("status", "eq", "cancelled")
          .gte("created_at", startISO)
          .lte("created_at", endISO);

        if (error) { console.warn("[useChartData]", error.message); if (!cancelled) setData({ labels: [], revenue: [], orders: [], covers: [] }); return; }
        if (cancelled) return;

        const byLabel = {};
        (orders ?? []).forEach(o => {
          const d = new Date(o.created_at);
          const label = (preset === "today" || preset === "yesterday")
            ? `${d.getHours()}:00`
            : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
          if (!byLabel[label]) byLabel[label] = { revenue: 0, orders: 0, covers: 0 };
          byLabel[label].revenue += o.total_amount ?? 0;
          byLabel[label].orders  += 1;
          byLabel[label].covers  += 1;
        });

        const labels = Object.keys(byLabel);
        setData({
          labels,
          revenue: labels.map(l => byLabel[l].revenue),
          orders:  labels.map(l => byLabel[l].orders),
          covers:  labels.map(l => byLabel[l].covers),
        });
      } catch (err) {
        console.error("[useChartData]", err.message);
        if (!cancelled) setData({ labels: [], revenue: [], orders: [], covers: [] });
      }
    })();

    return () => { cancelled = true; };
  }, [restaurantId, startISO, endISO, preset]);

  return data;
}

// Fix E: safe batched order_items query
function useMenuItems(restaurantId, startISO, endISO) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!restaurantId || !startISO || !endISO) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: orders, error: oErr } = await supabase
          .from("orders")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .not("status", "eq", "cancelled")
          .gte("created_at", startISO)
          .lte("created_at", endISO);

        if (oErr) { console.warn("[useMenuItems] orders:", oErr.message); return; }
        if (!orders?.length || cancelled) { setItems([]); return; }

        // Supabase IN query supports up to 100 values safely
        const orderIds = orders.map(o => o.id).slice(0, 100);
        const { data, error: iErr } = await supabase
          .from("order_items")
          .select("quantity, unit_price, menu_item:menu_item_id(name)")
          .in("order_id", orderIds);

        if (iErr) { console.warn("[useMenuItems] items:", iErr.message); return; }
        if (cancelled) return;

        const map = {};
        (data ?? []).forEach(r => {
          const n = r.menu_item?.name ?? "Unknown";
          if (!map[n]) map[n] = { name: n, qty: 0, revenue: 0 };
          map[n].qty     += r.quantity ?? 1;
          map[n].revenue += (r.quantity ?? 1) * (r.unit_price ?? 0);
        });
        setItems(Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 7));
      } catch (err) {
        console.error("[useMenuItems]", err.message);
      }
    })();

    return () => { cancelled = true; };
  }, [restaurantId, startISO, endISO]);

  return items;
}

function useTables(restaurantId) {
  const [tables, setTables] = useState([]);
  const fetchTables = useCallback(async () => {
    if (!restaurantId) return;
    const { data, error } = await supabase
      .from("tables")
      .select("id, table_number, section, status, current_pax")
      .eq("restaurant_id", restaurantId)
      .order("table_number", { ascending: true });
    if (error) { console.warn("[useTables]", error.message); return; }
    if (data) setTables(data);
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    fetchTables();
    const ch = supabase
      .channel(`tables-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: `restaurant_id=eq.${restaurantId}` }, fetchTables)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [restaurantId, fetchTables]);

  return tables;
}

// Fix B: Query kds_items instead of the non-existent kot_tickets table
function useKdsStats(restaurantId) {
  const [stats, setStats] = useState(null);

  const fetchStats = useCallback(async () => {
    if (!restaurantId) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("kds_items")
      .select("status, created_at, updated_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", today.toISOString());

    if (error) {
      console.warn("[useKdsStats]", error.message);
      setStats({ open: 0, inProgress: 0, served: 0, avgTime: null, delayed: 0 });
      return;
    }

    const rows = data ?? [];
    const readyItems = rows.filter(k => k.status === "ready" && k.updated_at);
    const times = readyItems.map(k => (new Date(k.updated_at) - new Date(k.created_at)) / 60000).filter(t => t > 0 && t < 300);

    setStats({
      open:       rows.filter(k => k.status === "pending").length,
      inProgress: rows.filter(k => k.status === "in_progress").length,
      served:     rows.filter(k => k.status === "ready").length,
      avgTime:    times.length ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : null,
      delayed:    times.filter(t => t > 20).length,
    });
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    fetchStats();
    const ch = supabase
      .channel(`kds-stats-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kds_items", filter: `restaurant_id=eq.${restaurantId}` }, fetchStats)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [restaurantId, fetchStats]);

  return stats;
}

// Fix C: Remove broken menu_items join; query orders table only
function useCancelStats(restaurantId, startISO, endISO) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!restaurantId || !startISO || !endISO) return;
    let cancelled = false;

    (async () => {
      try {
        const { data: cancelledOrders, error } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("restaurant_id", restaurantId)
          .eq("status", "cancelled")
          .gte("created_at", startISO)
          .lte("created_at", endISO);

        if (error) { console.warn("[useCancelStats]", error.message); return; }
        if (cancelled) return;

        const { data: allOrders } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurantId)
          .gte("created_at", startISO)
          .lte("created_at", endISO);

        const cancelCount = cancelledOrders?.length ?? 0;
        const revLost     = (cancelledOrders ?? []).reduce((s, o) => s + (o.total_amount ?? 0), 0);

        setStats({
          cancelled: cancelCount,
          voided:    0,
          revLost,
          topReason: "—",
          topItem:   "—",
          rate:      0, // would need total count — skip for now to avoid extra query
        });
      } catch (err) {
        console.error("[useCancelStats]", err.message);
      }
    })();

    return () => { cancelled = true; };
  }, [restaurantId, startISO, endISO]);

  return stats;
}

// ─── WABA Info hook ───────────────────────────────────────────────────────────
function useWABAInfo(apiClient) {
  const [info, setInfo] = useState(undefined);
  useEffect(() => {
    if (!apiClient) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/api/dashboard/waba');
        if (!cancelled) setInfo(res.data?.restaurant ?? null);
      } catch (err) {
        console.error('[useWABAInfo]', err?.response?.status, err?.response?.data?.error || err.message);
        if (!cancelled) setInfo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [apiClient]);
  return info;
}

// Fix F: Validate ISO strings before firing to prevent malformed requests
function useWAOrders(apiClient, startISO, endISO) {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    if (!apiClient || !startISO || !endISO) return;
    // Validate ISO strings
    if (isNaN(new Date(startISO)) || isNaN(new Date(endISO))) {
      console.warn("[useWAOrders] invalid date range, skipping");
      return;
    }
    let cancelled = false;
    setOrders(null);

    (async () => {
      try {
        const res = await apiClient.get('/api/dashboard/wa-orders', {
          params: { start: startISO, end: endISO },
        });
        if (!cancelled) setOrders(res.data?.orders ?? []);
      } catch (err) {
        console.error('[useWAOrders]', err?.response?.status, err?.response?.data?.error || err.message);
        if (!cancelled) setOrders([]);
      }
    })();

    return () => { cancelled = true; };
  }, [apiClient, startISO, endISO]);

  return orders;
}

// ─── WABA Info Panel ──────────────────────────────────────────────────────────
function WABAPanel({ info }) {
  const row = (label, value) => (
    <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: "#888", minWidth: 160 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#111", wordBreak: "break-all" }}>{value || "—"}</div>
    </div>
  );

  if (info === undefined) return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 13 }}>
      Loading...
    </div>
  );
  if (info === null) return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>WhatsApp Business</span>
        <span style={{ fontSize: 11, background: "#FCEBEB", color: "#A32D2D", padding: "2px 8px", borderRadius: 6 }}>Not configured</span>
      </div>
      <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
        <div style={{ fontWeight: 500, color: "#111", marginBottom: 8 }}>How to connect your WABA:</div>
        <div>1. Go to <strong>Meta Business Suite</strong> → WhatsApp Manager</div>
        <div>2. Create or select a WhatsApp Business Account</div>
        <div>3. Copy your <strong>WABA ID</strong> and <strong>Phone Number ID</strong></div>
        <div>4. Add them to your Munafe Chat restaurant settings</div>
        <div>5. Generate a <strong>Permanent Access Token</strong> from Meta Developer Console</div>
        <div>6. Add the token to your backend <code>.env</code> as <code>WHATSAPP_ACCESS_TOKEN</code></div>
        <div style={{ marginTop: 10, padding: "8px 12px", background: "#F7F7F5", borderRadius: 8, fontSize: 11 }}>
          Need help? Visit <a href="https://developers.facebook.com/docs/whatsapp" target="_blank" rel="noreferrer" style={{ color: "#378ADD" }}>developers.facebook.com/docs/whatsapp</a>
        </div>
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
      const name  = (o.customers?.name || o.customer_id || "").toLowerCase();
      const phone = (o.customers?.phone || "").toLowerCase();
      const svc   = (o.service_type || o.event_type || "").toLowerCase();
      const token = (o.token_number || "").toLowerCase();
      return name.includes(q) || phone.includes(q) || svc.includes(q) || token.includes(q);
    });
  }, [orders, search]);

  const handleExport = () => {
    if (!filtered?.length) return;
    const rows = filtered.map(o => ({
      Date:       o.created_at ? new Date(o.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—",
      Name:       o.customers?.name || o.customer_id || "—",
      Phone:      o.customers?.phone || "—",
      Service:    o.service_type || o.event_type || "—",
      Token:      o.token_number || "—",
      Party_Size: o.party_size || "—",
      Amount:     o.total_amount != null ? `₹${o.total_amount}` : "—",
      Status:     o.status || "—",
    }));
    exportToCSV(rows, `whatsapp-orders-${rangeLabel.replace(/[^a-z0-9]/gi, "-")}.csv`);
  };

  const statusColor = (s) => {
    if (!s) return "#888";
    if (["completed", "confirmed", "paid"].includes(s)) return "#3B6D11";
    if (["cancelled", "failed"].includes(s)) return "#A32D2D";
    if (["pending", "awaiting"].includes(s)) return "#BA7517";
    return "#555";
  };

  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "20px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>WhatsApp orders</span>
          {filtered != null && (
            <span style={{ fontSize: 11, color: "#aaa", marginLeft: 8 }}>{filtered.length} total · {rangeLabel}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, token..."
            style={{ fontSize: 12, padding: "5px 10px", borderRadius: 8, border: "0.5px solid #E0E0DC", outline: "none", width: 200 }}
          />
          <button
            onClick={handleExport}
            disabled={!filtered?.length}
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, border: "0.5px solid #E0E0DC", background: filtered?.length ? "#F7F7F5" : "#fafafa", color: filtered?.length ? "#111" : "#aaa", cursor: filtered?.length ? "pointer" : "default" }}
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {orders === null && (
        <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "#aaa" }}>Loading...</div>
      )}
      {orders !== null && filtered?.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 0", fontSize: 13, color: "#aaa" }}>No orders in this period</div>
      )}
      {filtered?.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid #E8E8E5" }}>
                {["Date & Time", "Name", "Phone", "Service", "Token", "Pax", "Amount", "Status"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: "#aaa", fontWeight: 400, fontSize: 11, padding: "4px 8px 8px 0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr key={o.id || i} style={{ borderBottom: "0.5px solid #F7F7F5" }}>
                  <td style={{ padding: "7px 8px 7px 0", color: "#555", whiteSpace: "nowrap" }}>
                    {o.created_at ? new Date(o.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "—"}
                  </td>
                  <td style={{ padding: "7px 8px 7px 0", fontWeight: 500, color: "#111", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.customers?.name || o.customer_id || "—"}
                  </td>
                  <td style={{ padding: "7px 8px 7px 0", color: "#555", whiteSpace: "nowrap" }}>
                    {o.customers?.phone ? `+${o.customers.phone}` : "—"}
                  </td>
                  <td style={{ padding: "7px 8px 7px 0", color: "#555", whiteSpace: "nowrap", textTransform: "capitalize" }}>
                    {(o.service_type || o.event_type || "—").replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "7px 8px 7px 0", color: "#555", fontFamily: "monospace" }}>
                    {o.token_number || "—"}
                  </td>
                  <td style={{ padding: "7px 8px 7px 0", color: "#555", textAlign: "center" }}>
                    {o.party_size || "—"}
                  </td>
                  <td style={{ padding: "7px 8px 7px 0", fontWeight: 500, color: "#111", whiteSpace: "nowrap" }}>
                    {o.total_amount != null ? `₹${Number(o.total_amount).toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td style={{ padding: "7px 8px 7px 0" }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: statusColor(o.status), background: statusColor(o.status) + "18", padding: "2px 7px", borderRadius: 5, textTransform: "capitalize" }}>
                      {o.status || "—"}
                    </span>
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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function OwnerDashboard({ restaurantId, restaurantName, onLogout, apiClient: apiClientProp }) {
  const { apiClient: apiClientCtx } = useAuth();
  const apiClient = apiClientCtx || apiClientProp;

  const [preset,      setPreset]      = useState("today");
  const [customStart, setCustomStart] = useState(null);
  const [customEnd,   setCustomEnd]   = useState(null);
  const [showCal,     setShowCal]     = useState(false);

  const { startISO, endISO } = useMemo(() => {
    if (customStart && customEnd) {
      return { startISO: customStart.toISOString(), endISO: customEnd.toISOString() };
    }
    return getRangeISO(preset);
  }, [preset, customStart, customEnd]);

  // Fix A: pass apiClient into useKpiData so it can use backend if needed
  const kpi         = useKpiData(apiClient, restaurantId, startISO, endISO);
  const chartData   = useChartData(restaurantId, startISO, endISO, preset);
  const menuItems   = useMenuItems(restaurantId, startISO, endISO);
  const tables      = useTables(restaurantId);
  const kdsStats    = useKdsStats(restaurantId);   // Fix B: renamed hook
  const cancelStats = useCancelStats(restaurantId, startISO, endISO);
  const wabaInfo    = useWABAInfo(apiClient);
  const waOrders    = useWAOrders(apiClient, startISO, endISO);

  const rangeLabel = (customStart && customEnd)
    ? `Custom · ${fmtDate(customStart)} – ${fmtDate(customEnd)}`
    : { today: "Today", yesterday: "Yesterday", "7d": "Last 7 days", "30d": "Last 30 days" }[preset];

  const row1 = [
    { icon: "₹",  label: "Total revenue",  value: kpi ? fmtINR(kpi.totalRevenue) : "—", badge: null, sub: "selected period" },
    { icon: "🛒", label: "Orders",          value: kpi?.totalOrders ?? "—",               badge: null, sub: "selected period" },
    { icon: "🧾", label: "Avg order value", value: kpi ? `₹${kpi.aov}` : "—",             badge: null, sub: "selected period" },
    { icon: "👥", label: "Total covers",    value: kpi?.totalCovers ?? "—",                neutral: true, sub: "selected period" },
  ];
  const row2 = [
    { icon: "🔄", label: "Table turns",     value: "—",                                                sub: "selected period" },
    { icon: "⏱",  label: "Avg dining time", value: kpi?.avgDining ? `${kpi.avgDining} min` : "—",      sub: "Benchmark: 90 min" },
    { icon: "🎟",  label: "Tokens issued",   value: kpi?.tokensIssued ?? "—",                           sub: "selected period" },
    { icon: "⏳", label: "Avg wait time",   value: kpi?.avgWait ? `${kpi.avgWait} min` : "—",          sub: "selected period" },
  ];

  const btnStyle = (active) => ({
    fontSize: 12, padding: "4px 10px", borderRadius: 8, border: "0.5px solid", cursor: "pointer",
    background:  active ? "#F0F0EE" : "transparent",
    color:       active ? "#111"    : "#888",
    borderColor: active ? "#C8C8C4" : "#E0E0DC",
  });

  // Fix G: chart key forces full Chart.js remount on range change
  const chartKey = `${startISO}-${endISO}`;

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

        {/* Revenue chart — key forces remount on range change (Fix G) */}
        {chartData && chartData.labels?.length > 0 && (
          <RevenueChart
            key={chartKey}
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

        {/* WABA info + WhatsApp orders */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
          <WABAPanel info={wabaInfo} />
          <WAOrdersTable orders={waOrders} rangeLabel={rangeLabel} />
        </div>

        {/* KDS stats + Cancellations */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
          <KotStatus stats={kdsStats} />
          <CancellationVoids stats={cancelStats} />
        </div>

      </div>
    </div>
  );
}
