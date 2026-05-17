import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Chart } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

// ─── Supabase client ────────────────────────────────────────────────────────
// Replace with your actual env vars (or import from a shared supabase.js)
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Constants ───────────────────────────────────────────────────────────────
const HEAT_COLORS = ["#E6F1FB", "#85B7EB", "#378ADD", "#185FA5", "#0C447C"];

const TABLE_STATUS_COLORS = {
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

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getDateRange(preset) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "today":
      return { start: today, end: now };
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
    default:
      return { start: today, end: now };
  }
}

function fmtDate(d) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtINR(n) {
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000)   return "₹" + (n / 1000).toFixed(1) + "k";
  return "₹" + Math.round(n);
}

function pctBadge(val) {
  if (val === null || val === undefined) return null;
  const positive = val >= 0;
  const cls = positive
    ? "inline-block text-xs font-medium px-2 py-0.5 rounded bg-green-100 text-green-800"
    : "inline-block text-xs font-medium px-2 py-0.5 rounded bg-red-100 text-red-800";
  return <span className={cls}>{positive ? "↑" : "↓"} {Math.abs(val)}%</span>;
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, badge, neutral }) {
  const badgeCls = neutral
    ? "inline-block text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-600"
    : null;
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <span>{icon}</span>{label}
      </div>
      <div className="text-2xl font-medium text-gray-900">{value ?? "—"}</div>
      <div className="text-xs text-gray-400 mt-1 flex items-center gap-1.5">
        {badge !== undefined ? pctBadge(badge) : neutral ? <span className={badgeCls}>→ 0%</span> : null}
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

function KpiRow({ metrics }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
      {metrics.map((m, i) => <MetricCard key={i} {...m} />)}
    </div>
  );
}

function RevenueChart({ labels, revenue, orders, covers }) {
  const maxC = Math.max(...(covers || [1]));
  const data = {
    labels,
    datasets: [
      {
        type: "bar",
        label: "Revenue",
        data: revenue,
        backgroundColor: "#378ADD",
        borderRadius: 3,
        yAxisID: "y",
      },
      {
        type: "line",
        label: "Orders",
        data: orders,
        borderColor: "#1D9E75",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.4,
        yAxisID: "y2",
        borderDash: [4, 3],
      },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: "#888", font: { size: 11 } }, grid: { display: false } },
      y: { ticks: { color: "#888", font: { size: 11 }, callback: (v) => fmtINR(v) }, grid: { color: "rgba(0,0,0,0.06)" } },
      y2: { position: "right", ticks: { color: "#888", font: { size: 11 } }, grid: { display: false } },
    },
  };
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-900">Revenue trend &amp; peak hours</span>
        <span className="text-xs text-gray-400">{labels?.length <= 7 ? "hourly / daily" : "daily"}</span>
      </div>
      <div className="flex gap-3 text-xs text-gray-500 mb-3">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: "#378ADD" }}></span>Revenue</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: "#1D9E75" }}></span>Orders</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: "#0C447C" }}></span>Cover intensity</span>
      </div>
      <div style={{ height: 200 }}>
        <Chart type="bar" data={data} options={options} />
      </div>
      {/* Heatmap strip */}
      {covers?.length > 0 && (
        <div
          className="mt-1.5"
          style={{ display: "grid", gridTemplateColumns: `repeat(${covers.length}, 1fr)`, gap: 3 }}
        >
          {covers.map((v, i) => {
            const ci = Math.min(4, Math.floor((v / maxC) * 4.99));
            return (
              <div
                key={i}
                title={`${v} covers`}
                style={{ background: HEAT_COLORS[ci], height: 10, borderRadius: 3 }}
              />
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
        <span>Covers</span>
        <div className="flex gap-0.5">
          {HEAT_COLORS.map((c, i) => (
            <span key={i} style={{ background: c, width: 14, height: 8, borderRadius: 2, display: "inline-block" }} />
          ))}
        </div>
        <span>Low → High</span>
      </div>
    </div>
  );
}

function TopMenuItems({ items }) {
  const maxRev = items?.[0]?.revenue ?? 1;
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-medium text-gray-900">Top menu items</span>
        <span className="text-xs text-gray-400">by revenue</span>
      </div>
      <table className="w-full text-xs" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr className="text-gray-400 border-b border-gray-100">
            <th className="text-left pb-2 font-normal" style={{ width: "38%" }}>Item</th>
            <th className="text-right pb-2 font-normal" style={{ width: "14%" }}>Qty</th>
            <th className="text-right pb-2 font-normal" style={{ width: "26%" }}>Revenue</th>
            <th className="pb-2 font-normal" style={{ width: "22%" }}></th>
          </tr>
        </thead>
        <tbody>
          {items?.map((it, i) => (
            <tr key={i} className="border-b border-gray-50 last:border-0">
              <td className="py-1.5 text-gray-500">{i + 1}. {it.name}</td>
              <td className="py-1.5 text-right">{it.qty}</td>
              <td className="py-1.5 text-right font-medium">₹{it.revenue.toLocaleString("en-IN")}</td>
              <td className="py-1.5 pl-2">
                <div className="bg-gray-100 rounded h-1 overflow-hidden">
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
  const avgPax   = tables?.length
    ? (tables.filter(t => t.status === "occupied").reduce((s, t) => s + (t.current_pax ?? 0), 0) / Math.max(occupied, 1)).toFixed(1)
    : "—";
  const occRate  = total ? Math.round((occupied / total) * 100) : 0;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-medium text-gray-900">Table occupancy</span>
        <span className="text-xs text-gray-400">live now</span>
      </div>
      <div className="flex gap-4 items-start">
        <div className="min-w-[90px]">
          <div className="text-2xl font-medium text-gray-900">
            {occupied}<span className="text-base text-gray-400">/{total}</span>
          </div>
          <div className="text-xs text-gray-400 mb-2.5">tables occupied</div>
          <div className="flex flex-col gap-1.5 text-xs">
            <div><span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: "#1D9E75" }}></span>Occupied <strong>{occupied}</strong></div>
            <div><span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: "#BA7517" }}></span>Waiting <strong>{waiting}</strong></div>
            <div><span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: "#B4B2A9" }}></span>Free <strong>{free}</strong></div>
          </div>
          <div className="mt-2.5 text-xs text-gray-400">Avg pax/table</div>
          <div className="text-sm font-medium text-gray-900">{avgPax}</div>
          <div className="text-xs text-gray-400 mt-1">Occupancy rate</div>
          <div className="text-sm font-medium text-gray-900">{occRate}%</div>
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-4 gap-1.5">
            {tables?.map(t => {
              const c = TABLE_STATUS_COLORS[t.status] ?? TABLE_STATUS_COLORS.free;
              return (
                <div key={t.id} style={{ background: c.bg, borderRadius: 8, padding: "6px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 500, color: c.text }}>{t.label ?? t.id}</div>
                  <div style={{ fontSize: 10, color: c.text, opacity: 0.8 }}>{t.current_pax > 0 ? `${t.current_pax}p` : "—"}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function KotStatus({ stats }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-medium text-gray-900">KOT status</span>
        <span className="text-xs text-gray-400">kitchen orders today</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500 mb-0.5">Open</div>
          <div className="text-xl font-medium text-gray-900">{stats?.open ?? 0}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500 mb-0.5">In progress</div>
          <div className="text-xl font-medium" style={{ color: "#BA7517" }}>{stats?.inProgress ?? 0}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500 mb-0.5">Served</div>
          <div className="text-xl font-medium" style={{ color: "#1D9E75" }}>{stats?.served ?? 0}</div>
        </div>
      </div>
      {[
        { label: "Avg KOT time",       value: stats?.avgTime ? `${stats.avgTime} min` : "—" },
        { label: "Delayed (>20 min)",  value: stats?.delayed ?? 0, danger: (stats?.delayed ?? 0) > 0 },
        { label: "Fastest item",       value: stats?.fastestItem ?? "—" },
        { label: "Slowest item",       value: stats?.slowestItem ?? "—", warn: true },
      ].map((r, i) => (
        <div key={i} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0 text-xs">
          <span className="text-gray-500">{r.label}</span>
          <span className="font-medium" style={{ color: r.danger ? "#A32D2D" : r.warn ? "#BA7517" : undefined }}>
            {r.danger ? `${r.value} KOTs` : r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function CancellationVoids({ stats }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-medium text-gray-900">Cancellations &amp; voids</span>
        <span className="text-xs text-gray-400">today</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500 mb-0.5">Cancelled</div>
          <div className="text-xl font-medium" style={{ color: "#A32D2D" }}>{stats?.cancelled ?? 0}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500 mb-0.5">Voided items</div>
          <div className="text-xl font-medium" style={{ color: "#BA7517" }}>{stats?.voided ?? 0}</div>
        </div>
      </div>
      {[
        { label: "Revenue lost",      value: stats?.revLost ? `₹${stats.revLost.toLocaleString("en-IN")}` : "₹0", danger: true },
        { label: "Top void reason",   value: stats?.topReason ?? "—" },
        { label: "Most voided item",  value: stats?.topItem ?? "—" },
        { label: "Cancellation rate", value: stats?.rate ? `${stats.rate}%` : "—" },
      ].map((r, i) => (
        <div key={i} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0 text-xs">
          <span className="text-gray-500">{r.label}</span>
          <span className="font-medium" style={{ color: r.danger ? "#A32D2D" : undefined }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Data fetching hooks ──────────────────────────────────────────────────────

function useKpiData(restaurantId, start, end) {
  const [data, setData] = useState(null);

  const fetch = useCallback(async () => {
    // Orders in range
    const { data: orders } = await supabase
      .from("orders")
      .select("id, total, pax, created_at, status")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .eq("status", "completed");

    // Walk-in tokens
    const { data: tokens } = await supabase
      .from("walk_in_tokens")
      .select("id, pax, created_at, seated_at")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    if (!orders) return;

    const totalRevenue  = orders.reduce((s, o) => s + (o.total ?? 0), 0);
    const totalOrders   = orders.length;
    const aov           = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const totalCovers   = orders.reduce((s, o) => s + (o.pax ?? 0), 0);

    // Avg dining time from tokens (seated_at - created_at)
    const diningTimes = (tokens ?? [])
      .filter(t => t.seated_at)
      .map(t => (new Date(t.seated_at) - new Date(t.created_at)) / 60000);
    const avgDining = diningTimes.length
      ? Math.round(diningTimes.reduce((s, v) => s + v, 0) / diningTimes.length)
      : null;

    // Avg wait time (time between token issued and seated)
    const waitTimes = (tokens ?? [])
      .filter(t => t.seated_at)
      .map(t => (new Date(t.seated_at) - new Date(t.created_at)) / 60000);
    const avgWait = waitTimes.length
      ? Math.round(waitTimes.reduce((s, v) => s + v, 0) / waitTimes.length)
      : null;

    setData({
      totalRevenue,
      totalOrders,
      aov,
      totalCovers,
      tokensIssued: (tokens ?? []).length,
      avgDining,
      avgWait,
    });
  }, [restaurantId, start, end]);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, refetch: fetch };
}

function useChartData(restaurantId, start, end, preset) {
  const [data, setData] = useState(null);

  useEffect(() => {
    async function fetch() {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, total, pax, created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .eq("status", "completed");

      if (!orders) return;

      // Group by hour (today/yesterday) or by day (7d/30d)
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

      const labels  = Object.keys(byLabel);
      const revenue = labels.map(l => byLabel[l].revenue);
      const ord     = labels.map(l => byLabel[l].orders);
      const covers  = labels.map(l => byLabel[l].covers);

      setData({ labels, revenue, orders: ord, covers });
    }
    fetch();
  }, [restaurantId, start, end, preset]);

  return data;
}

function useMenuItems(restaurantId, start, end) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("order_items")
        .select("quantity, unit_price, menu_item_id, menu_items(name)")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (!data) return;

      const map = {};
      data.forEach(row => {
        const name = row.menu_items?.name ?? "Unknown";
        if (!map[name]) map[name] = { name, qty: 0, revenue: 0 };
        map[name].qty     += row.quantity ?? 1;
        map[name].revenue += (row.quantity ?? 1) * (row.unit_price ?? 0);
      });

      const sorted = Object.values(map)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 7);
      setItems(sorted);
    }
    fetch();
  }, [restaurantId, start, end]);

  return items;
}

function useTables(restaurantId) {
  const [tables, setTables] = useState([]);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from("tables")
      .select("id, label, status, current_pax")
      .eq("restaurant_id", restaurantId)
      .order("label");
    if (data) setTables(data);
  }, [restaurantId]);

  useEffect(() => {
    fetch();
    const channel = supabase
      .channel(`tables-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tables", filter: `restaurant_id=eq.${restaurantId}` }, fetch)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [restaurantId, fetch]);

  return tables;
}

function useKotStats(restaurantId) {
  const [stats, setStats] = useState(null);

  const fetch = useCallback(async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from("kot_tickets")
      .select("id, status, created_at, served_at, items")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", today.toISOString());

    if (!data) return;

    const open       = data.filter(k => k.status === "open").length;
    const inProgress = data.filter(k => k.status === "in_progress").length;
    const served     = data.filter(k => k.status === "served").length;

    const times = data
      .filter(k => k.served_at)
      .map(k => (new Date(k.served_at) - new Date(k.created_at)) / 60000);
    const avgTime = times.length ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : null;
    const delayed = times.filter(t => t > 20).length;

    setStats({ open, inProgress, served, avgTime, delayed, fastestItem: null, slowestItem: null });
  }, [restaurantId]);

  useEffect(() => {
    fetch();
    const channel = supabase
      .channel(`kot-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kot_tickets", filter: `restaurant_id=eq.${restaurantId}` }, fetch)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [restaurantId, fetch]);

  return stats;
}

function useCancellationStats(restaurantId, start, end) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    async function fetch() {
      const { data: cancelled } = await supabase
        .from("orders")
        .select("id, total")
        .eq("restaurant_id", restaurantId)
        .eq("status", "cancelled")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      const { data: voided } = await supabase
        .from("order_items")
        .select("id, unit_price, quantity, void_reason, menu_items(name)")
        .eq("restaurant_id", restaurantId)
        .eq("voided", true)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (!cancelled || !voided) return;

      const revLost = cancelled.reduce((s, o) => s + (o.total ?? 0), 0);
      const totalOrders = (cancelled.length + (voided.length ?? 0)) || 1;

      // Top void reason
      const reasonMap = {};
      voided.forEach(v => {
        const r = v.void_reason ?? "Unknown";
        reasonMap[r] = (reasonMap[r] ?? 0) + 1;
      });
      const topReason = Object.entries(reasonMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

      // Most voided item
      const itemMap = {};
      voided.forEach(v => {
        const n = v.menu_items?.name ?? "Unknown";
        itemMap[n] = (itemMap[n] ?? 0) + 1;
      });
      const topItem = Object.entries(itemMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

      const rate = Math.round((cancelled.length / totalOrders) * 100);
      setStats({ cancelled: cancelled.length, voided: voided.length, revLost, topReason, topItem, rate });
    }
    fetch();
  }, [restaurantId, start, end]);

  return stats;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function OwnerDashboard({ restaurantId, restaurantName }) {
  const [preset, setPreset]         = useState("today");
  const [customStart, setCustomStart] = useState(null);
  const [customEnd,   setCustomEnd]   = useState(null);
  const [showCal,     setShowCal]     = useState(false);

  const { start, end } = customStart && customEnd
    ? { start: customStart, end: customEnd }
    : getDateRange(preset);

  const { data: kpi } = useKpiData(restaurantId, start, end);
  const chartData     = useChartData(restaurantId, start, end, preset);
  const menuItems     = useMenuItems(restaurantId, start, end);
  const tables        = useTables(restaurantId);
  const kotStats      = useKotStats(restaurantId);
  const cancelStats   = useCancellationStats(restaurantId, start, end);

  const rangeLabel = customStart && customEnd
    ? `Custom · ${fmtDate(customStart)} – ${fmtDate(customEnd)}`
    : { today: "Today", yesterday: "Yesterday", "7d": "Last 7 days", "30d": "Last 30 days" }[preset];

  const kpiRow1 = [
    { icon: "₹", label: "Total revenue",    value: kpi ? fmtINR(kpi.totalRevenue) : "—", badge: 12,    sub: "vs prior" },
    { icon: "🛒", label: "Orders",           value: kpi?.totalOrders ?? "—",               badge: 8,     sub: "vs prior" },
    { icon: "🧾", label: "Avg order value",  value: kpi ? `₹${kpi.aov}` : "—",             badge: -3,    sub: "vs prior" },
    { icon: "👥", label: "Total covers",     value: kpi?.totalCovers ?? "—",                neutral: true, sub: "vs prior" },
  ];

  const kpiRow2 = [
    { icon: "🔄", label: "Table turns",     value: "3.2×",                                  badge: 12,    sub: "vs prior" },
    { icon: "⏱",  label: "Avg dining time", value: kpi?.avgDining ? `${kpi.avgDining} min` : "—", sub: "Benchmark: 90 min" },
    { icon: "🎟",  label: "Tokens issued",   value: kpi?.tokensIssued ?? "—",                badge: 18,    sub: "vs prior" },
    { icon: "⏳", label: "Avg wait time",   value: kpi?.avgWait ? `${kpi.avgWait} min` : "—", badge: -22, sub: "vs prior" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
          <div>
            <h1 className="text-lg font-medium text-gray-900">Owner dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">{restaurantName} · {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => { setPreset(p.key); setCustomStart(null); setCustomEnd(null); setShowCal(false); }}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    preset === p.key && !customStart
                      ? "bg-gray-100 text-gray-900 border-gray-300"
                      : "bg-transparent text-gray-500 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="w-px h-5 bg-gray-200" />
            <button
              onClick={() => setShowCal(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-colors ${
                customStart ? "bg-gray-100 text-gray-900 border-gray-300" : "bg-transparent text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              📅 {customStart ? `${fmtDate(customStart)} – ${fmtDate(customEnd)}` : "Custom"}
            </button>
          </div>
        </div>

        {/* Custom date inputs (simple fallback — replace with a datepicker library if preferred) */}
        {showCal && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-white border border-gray-100 rounded-xl text-sm">
            <label className="text-gray-500 text-xs">From</label>
            <input type="date" className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
              onChange={e => setCustomStart(new Date(e.target.value))} />
            <label className="text-gray-500 text-xs">To</label>
            <input type="date" className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
              onChange={e => setCustomEnd(new Date(e.target.value + "T23:59:59"))} />
            <button
              onClick={() => { if (customStart && customEnd) { setPreset(null); setShowCal(false); } }}
              className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Apply
            </button>
          </div>
        )}

        <p className="text-xs text-gray-400 mb-3">Showing: {rangeLabel}</p>

        {/* KPI rows */}
        <KpiRow metrics={kpiRow1} />
        <KpiRow metrics={kpiRow2} />

        {/* Revenue + Heatmap */}
        {chartData && (
          <RevenueChart
            labels={chartData.labels}
            revenue={chartData.revenue}
            orders={chartData.orders}
            covers={chartData.covers}
          />
        )}

        {/* Menu items + Table occupancy */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <TopMenuItems items={menuItems} />
          <TableOccupancy tables={tables} />
        </div>

        {/* KOT + Cancellations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <KotStatus stats={kotStats} />
          <CancellationVoids stats={cancelStats} />
        </div>

      </div>
    </div>
  );
}
