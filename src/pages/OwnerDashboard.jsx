import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../contexts/AuthContext";

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

function fmtINRFull(n) {
  if (!n) return "₹0.00";
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  if (isToday) return `Today ${time}`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + time;
}

// ─── Chart.js loaded from CDN ─────────────────────────────────────────────────
let _chartJsLoaded = false;
let _chartJsCbs = [];
function loadChartJs(cb) {
  if (window.Chart) { cb(); return; }
  _chartJsCbs.push(cb);
  if (_chartJsLoaded) return;
  _chartJsLoaded = true;
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
  s.onload = () => { _chartJsCbs.forEach(fn => fn()); _chartJsCbs = []; };
  document.head.appendChild(s);
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function Badge({ val, neutral }) {
  if (neutral) return <span style={{ display:"inline-block", fontSize:11, fontWeight:500, padding:"1px 7px", borderRadius:6, background:"#F1EFE8", color:"#5F5E5A" }}>→ 0%</span>;
  if (val === undefined || val === null) return null;
  const up = val >= 0;
  return <span style={{ display:"inline-block", fontSize:11, fontWeight:500, padding:"1px 7px", borderRadius:6, background: up ? "#EAF3DE" : "#FCEBEB", color: up ? "#3B6D11" : "#A32D2D" }}>{up ? "↑" : "↓"} {Math.abs(val)}%</span>;
}

function MetricCard({ icon, label, value, sub, badge, neutral }) {
  return (
    <div style={{ background:"#F7F7F5", borderRadius:12, padding:"14px 16px" }}>
      <div style={{ fontSize:12, color:"#888", marginBottom:4 }}>{icon} {label}</div>
      <div style={{ fontSize:22, fontWeight:500, color:"#111" }}>{value ?? "—"}</div>
      <div style={{ fontSize:11, color:"#aaa", marginTop:4, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
        <Badge val={badge} neutral={neutral} />
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    pending:   { bg: "#FFF3E0", color: "#BA7517", label: "Pending" },
    confirmed: { bg: "#E8F5E9", color: "#2E7D32", label: "Confirmed" },
    completed: { bg: "#E3F2FD", color: "#1565C0", label: "Completed" },
    cancelled: { bg: "#FFEBEE", color: "#C62828", label: "Cancelled" },
  };
  const s = map[status] ?? { bg: "#F1EFE8", color: "#5F5E5A", label: status };
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
      background: s.bg, color: s.color, letterSpacing: 0.3, textTransform: "uppercase",
    }}>
      {s.label}
    </span>
  );
}

function StatCard({ title, sub, children }) {
  return (
    <div style={{ background:"#fff", border:"0.5px solid #E8E8E5", borderRadius:12, padding:"16px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ fontSize:14, fontWeight:500, color:"#111" }}>{title}</span>
        <span style={{ fontSize:11, color:"#aaa" }}>{sub}</span>
      </div>
      {children}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background:"#F7F7F5", borderRadius:10, padding:"8px 10px", textAlign:"center", flex:1 }}>
      <div style={{ fontSize:11, color:"#888", marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:500, color: color ?? "#111" }}>{value}</div>
    </div>
  );
}

function KRow({ label, value, danger, warn }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"0.5px solid #F7F7F5", fontSize:12 }}>
      <span style={{ color:"#888" }}>{label}</span>
      <span style={{ fontWeight:500, color: danger ? "#A32D2D" : warn ? "#BA7517" : "#111" }}>{value}</span>
    </div>
  );
}

// ─── Dashboard Widgets ────────────────────────────────────────────────────────

function RevenueChart({ labels, revenue, orders, covers }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!labels?.length) return;
    loadChartJs(() => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      chartRef.current = new window.Chart(ctx, {
        data: {
          labels,
          datasets: [
            { type:"bar",  label:"Revenue", data:revenue, backgroundColor:"#378ADD", borderRadius:3, yAxisID:"y" },
            { type:"line", label:"Orders",  data:orders,  borderColor:"#1D9E75", backgroundColor:"transparent", borderWidth:2, pointRadius:3, tension:0.4, yAxisID:"y2", borderDash:[4,3] },
          ],
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{ display:false } },
          scales:{
            x:  { ticks:{ color:"#888", font:{ size:11 } }, grid:{ display:false } },
            y:  { ticks:{ color:"#888", font:{ size:11 }, callback: v => fmtINR(v) }, grid:{ color:"rgba(0,0,0,0.06)" } },
            y2: { position:"right", ticks:{ color:"#888", font:{ size:11 } }, grid:{ display:false } },
          },
        },
      });
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [labels, revenue, orders]);

  const maxC = Math.max(...(covers ?? [1]));

  return (
    <div style={{ background:"#fff", border:"0.5px solid #E8E8E5", borderRadius:12, padding:"16px 20px", marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <span style={{ fontSize:14, fontWeight:500, color:"#111" }}>Revenue trend &amp; peak hours</span>
      </div>
      <div style={{ display:"flex", gap:12, fontSize:11, color:"#888", marginBottom:12 }}>
        <span><span style={{ display:"inline-block", width:9, height:9, borderRadius:2, background:"#378ADD", marginRight:4, verticalAlign:"middle" }}></span>Revenue</span>
        <span><span style={{ display:"inline-block", width:9, height:9, borderRadius:2, background:"#1D9E75", marginRight:4, verticalAlign:"middle" }}></span>Orders</span>
        <span><span style={{ display:"inline-block", width:9, height:9, borderRadius:2, background:"#0C447C", marginRight:4, verticalAlign:"middle" }}></span>Cover intensity</span>
      </div>
      <div style={{ height:200, position:"relative" }}><canvas ref={canvasRef} /></div>
      {covers?.length > 0 && (
        <div style={{ marginTop:6, display:"grid", gridTemplateColumns:`repeat(${covers.length},1fr)`, gap:3 }}>
          {covers.map((v, i) => {
            const ci = Math.min(4, Math.floor((v / maxC) * 4.99));
            return <div key={i} title={`${v} covers`} style={{ background:HEAT_COLORS[ci], height:10, borderRadius:3 }} />;
          })}
        </div>
      )}
      <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8, fontSize:11, color:"#aaa" }}>
        <span>Covers</span>
        <div style={{ display:"flex", gap:2 }}>{HEAT_COLORS.map((c,i) => <span key={i} style={{ background:c, width:14, height:8, borderRadius:2, display:"inline-block" }} />)}</div>
        <span>Low → High</span>
      </div>
    </div>
  );
}

function TopMenuItems({ items }) {
  const maxRev = items?.[0]?.revenue ?? 1;
  return (
    <div style={{ background:"#fff", border:"0.5px solid #E8E8E5", borderRadius:12, padding:"16px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ fontSize:14, fontWeight:500, color:"#111" }}>Top menu items</span>
        <span style={{ fontSize:11, color:"#aaa" }}>by revenue</span>
      </div>
      {!items?.length && <div style={{ fontSize:12, color:"#aaa", padding:"16px 0", textAlign:"center" }}>No data for this period</div>}
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, tableLayout:"fixed" }}>
        <thead>
          <tr style={{ borderBottom:"0.5px solid #F0F0EE" }}>
            <th style={{ textAlign:"left", color:"#aaa", fontWeight:400, fontSize:11, paddingBottom:6, width:"40%" }}>Item</th>
            <th style={{ textAlign:"right", color:"#aaa", fontWeight:400, fontSize:11, paddingBottom:6, width:"15%" }}>Qty</th>
            <th style={{ textAlign:"right", color:"#aaa", fontWeight:400, fontSize:11, paddingBottom:6, width:"25%" }}>Revenue</th>
            <th style={{ width:"20%" }}></th>
          </tr>
        </thead>
        <tbody>
          {items?.map((it, i) => (
            <tr key={i} style={{ borderBottom:"0.5px solid #F7F7F5" }}>
              <td style={{ padding:"7px 0", color:"#666" }}>{i+1}. {it.name}</td>
              <td style={{ padding:"7px 0", textAlign:"right" }}>{it.qty}</td>
              <td style={{ padding:"7px 0", textAlign:"right", fontWeight:500 }}>₹{it.revenue.toLocaleString("en-IN")}</td>
              <td style={{ padding:"7px 0 7px 8px" }}>
                <div style={{ background:"#F0F0EE", borderRadius:3, height:5, overflow:"hidden" }}>
                  <div style={{ width:`${Math.round(it.revenue/maxRev*100)}%`, background:"#378ADD", height:"100%", borderRadius:3 }} />
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
  const occPax   = tables?.filter(t => t.status === "occupied").reduce((s,t) => s+(t.current_pax??0), 0) ?? 0;
  const avgPax   = occupied > 0 ? (occPax/occupied).toFixed(1) : "—";
  const occRate  = total ? Math.round((occupied/total)*100) : 0;

  return (
    <div style={{ background:"#fff", border:"0.5px solid #E8E8E5", borderRadius:12, padding:"16px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ fontSize:14, fontWeight:500, color:"#111" }}>Table occupancy</span>
        <span style={{ fontSize:11, color:"#aaa" }}>live now</span>
      </div>
      <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
        <div style={{ minWidth:90 }}>
          <div style={{ fontSize:26, fontWeight:500, color:"#111" }}>{occupied}<span style={{ fontSize:15, color:"#aaa" }}>/{total}</span></div>
          <div style={{ fontSize:11, color:"#aaa", marginBottom:10 }}>tables occupied</div>
          {[{label:"Occupied",count:occupied,color:"#1D9E75"},{label:"Waiting",count:waiting,color:"#BA7517"},{label:"Free",count:free,color:"#B4B2A9"}].map(r=>(
            <div key={r.label} style={{ fontSize:12, marginBottom:5 }}>
              <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:r.color, marginRight:6, verticalAlign:"middle" }}></span>
              {r.label} <strong>{r.count}</strong>
            </div>
          ))}
          <div style={{ marginTop:10, fontSize:11, color:"#aaa" }}>Avg pax/table</div>
          <div style={{ fontSize:13, fontWeight:500, color:"#111" }}>{avgPax}</div>
          <div style={{ fontSize:11, color:"#aaa", marginTop:4 }}>Occupancy rate</div>
          <div style={{ fontSize:13, fontWeight:500, color:"#111" }}>{occRate}%</div>
        </div>
        <div style={{ flex:1, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
          {tables?.map(t => {
            const c = TABLE_COLORS[t.status] ?? TABLE_COLORS.free;
            return (
              <div key={t.id} style={{ background:c.bg, borderRadius:8, padding:"6px 4px", textAlign:"center" }}>
                <div style={{ fontSize:10, fontWeight:500, color:c.text }}>{t.label ?? `T${t.id}`}</div>
                <div style={{ fontSize:10, color:c.text, opacity:0.8 }}>{(t.current_pax??0)>0?`${t.current_pax}p`:"—"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KotStatus({ stats }) {
  return (
    <StatCard title="KOT status" sub="kitchen orders today">
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
        <MiniStat label="Open"        value={stats?.open ?? 0} />
        <MiniStat label="In progress" value={stats?.inProgress ?? 0} color="#BA7517" />
        <MiniStat label="Served"      value={stats?.served ?? 0}     color="#1D9E75" />
      </div>
      <KRow label="Avg KOT time"      value={stats?.avgTime != null ? `${stats.avgTime} min` : "—"} />
      <KRow label="Delayed (>20 min)" value={stats?.delayed != null ? `${stats.delayed} KOTs` : "—"} danger={(stats?.delayed??0)>0} />
      <KRow label="Fastest item"      value={stats?.fastestItem ?? "—"} />
      <KRow label="Slowest item"      value={stats?.slowestItem ?? "—"} warn />
    </StatCard>
  );
}

function CancellationVoids({ stats }) {
  return (
    <StatCard title="Cancellations & voids" sub="today">
      <div style={{ display:"flex", gap:8, marginBottom:12 }}>
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

// ─── WhatsApp Widgets ─────────────────────────────────────────────────────────

function WABAStatus({ restaurantId, apiClient }) {
  const [info, setInfo]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId || !apiClient) return;
    (async () => {
      try {
        const res = await apiClient.get(`/api/restaurants/${restaurantId}/waba`);
        if (res.data) {
          setInfo({
            name:         res.data.name,
            waba_id:      res.data.waba_id,
            phone:        res.data.whatsapp_phone_number,
            display_name: res.data.whatsapp_display_name,
          });
        }
      } catch (err) {
        console.error('Failed to fetch WABA status:', err.message);
      }
      setLoading(false);
    })();
  }, [restaurantId, apiClient]);
  
  const connected = !loading && info?.waba_id;

  return (
    <div style={{ background:"#fff", border:"0.5px solid #E8E8E5", borderRadius:12, padding:"16px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <span style={{ fontSize:14, fontWeight:500, color:"#111" }}>WhatsApp Business</span>
        <span style={{
          fontSize:11, fontWeight:600, padding:"2px 10px", borderRadius:20,
          background: connected ? "#E8F5E9" : "#FFF3E0",
          color:      connected ? "#2E7D32" : "#BA7517",
        }}>
          {loading ? "Checking…" : connected ? "● Connected" : "○ Not configured"}
        </span>
      </div>

      {loading ? (
        <div style={{ fontSize:12, color:"#aaa", padding:"8px 0" }}>Loading…</div>
      ) : connected ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {[
            { label:"Business name",  value: info.display_name ?? info.name ?? "—" },
            { label:"Phone number",   value: info.phone ? `+${info.phone}` : "—" },
            { label:"WABA ID",        value: info.waba_id ?? "—" },
            { label:"API permission", value: "whatsapp_business_messaging" },
          ].map(({ label, value }) => (
            <div key={label} style={{ background:"#F7F7F5", borderRadius:8, padding:"8px 10px" }}>
              <div style={{ fontSize:10, color:"#aaa", marginBottom:2 }}>{label}</div>
              <div style={{ fontSize:12, fontWeight:500, color:"#111", wordBreak:"break-all", lineHeight:1.4 }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div style={{ fontSize:12, color:"#888", lineHeight:1.6, marginBottom:12 }}>
            No WhatsApp Business Account is linked yet. Connect your WABA to start receiving orders via WhatsApp.
          </div>
          <div style={{ background:"#F7F7F5", borderRadius:8, padding:"10px 12px", fontSize:11, color:"#5F5E5A", lineHeight:1.6 }}>
            <strong style={{ display:"block", marginBottom:4, color:"#111" }}>To connect:</strong>
            1. Go to <strong>Integrations</strong> in the sidebar<br />
            2. Select <strong>WhatsApp Business</strong><br />
            3. Follow the Meta Embedded Signup flow<br />
            4. Your WABA details will appear here once linked
          </div>
        </div>
      )}

      <div style={{
        marginTop:12, padding:"8px 10px", borderRadius:8,
        background:"#F0F7FF", border:"0.5px solid #C5DDF6",
        fontSize:11, color:"#185FA5", display:"flex", alignItems:"center", gap:6,
      }}>
        <span>📲</span>
        <span>Test ordering bot: send <strong>"Hi"</strong> to <strong>+91 9500996033</strong></span>
      </div>
    </div>
  );
}

function useWhatsAppOrders(restaurantId) {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!restaurantId) return;

    const { data: rawOrders } = await supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total_amount, subtotal, tax, discount, created_at, notes")
      .eq("restaurant_id", restaurantId)
      .eq("source", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!rawOrders?.length) { setOrders([]); setLoading(false); return; }

    const orderIds = rawOrders.map(o => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id, quantity, unit_price, special_instructions, menu_items(name)")
      .in("order_id", orderIds);

    // Fetch walk_in_tokens (takeaway/whatsapp) in the time window for customer name + phone
    const oldest = rawOrders[rawOrders.length - 1]?.created_at;
    const newest = rawOrders[0]?.created_at;
    const { data: tokens } = await supabase
      .from("walk_in_tokens")
      .select("id, name, phone, arrived_at, type")
      .eq("restaurant_id", restaurantId)
      .gte("arrived_at", oldest)
      .lte("arrived_at", newest)
      .in("type", ["takeaway", "whatsapp"]);

    // Match order to closest token within 3 minutes
    function findCustomer(orderCreatedAt) {
      if (!tokens?.length) return null;
      const orderTs = new Date(orderCreatedAt).getTime();
      let best = null, bestDiff = Infinity;
      tokens.forEach(t => {
        const diff = Math.abs(new Date(t.arrived_at).getTime() - orderTs);
        if (diff < bestDiff && diff <= 3 * 60 * 1000) { best = t; bestDiff = diff; }
      });
      return best;
    }

    const itemsByOrder = {};
    (items ?? []).forEach(it => {
      if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
      itemsByOrder[it.order_id].push(it);
    });

    setOrders(rawOrders.map(o => {
      const customer = findCustomer(o.created_at);
      return {
        ...o,
        items:          itemsByOrder[o.id] ?? [],
        customer_name:  customer?.name  ?? null,
        customer_phone: customer?.phone ?? null,
      };
    }));
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    fetchOrders();
    const ch = supabase
      .channel(`wa-orders-${restaurantId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"orders", filter:`restaurant_id=eq.${restaurantId}` }, fetchOrders)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [restaurantId, fetchOrders]);

  return { orders, loading };
}

function WhatsAppOrders({ restaurantId }) {
  const { orders, loading } = useWhatsAppOrders(restaurantId);
  const [expanded, setExpanded] = useState(null);

  const total   = orders.length;
  const pending = orders.filter(o => o.status === "pending").length;
  const revenue = orders
    .filter(o => o.status !== "cancelled")
    .reduce((s, o) => s + parseFloat(o.total_amount ?? 0), 0);

  return (
    <div style={{ background:"#fff", border:"0.5px solid #E8E8E5", borderRadius:12, padding:"16px 20px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div>
          <span style={{ fontSize:14, fontWeight:500, color:"#111" }}>WhatsApp orders</span>
          <span style={{
            marginLeft:8, fontSize:11, padding:"1px 7px", borderRadius:20,
            background:"#E8F5E9", color:"#2E7D32", fontWeight:600,
          }}>
            {total} total
          </span>
        </div>
        <span style={{ fontSize:11, color:"#aaa" }}>last 50 orders</span>
      </div>

      {/* Summary strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
        {[
          { label:"All orders", value: total,              color:"#111" },
          { label:"Pending",    value: pending,             color: pending > 0 ? "#BA7517" : "#111" },
          { label:"Revenue",    value: fmtINRFull(revenue), color:"#1D9E75" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:"#F7F7F5", borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#aaa", marginBottom:2 }}>{label}</div>
            <div style={{ fontSize:16, fontWeight:500, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div style={{ fontSize:12, color:"#aaa", padding:"16px 0", textAlign:"center" }}>Loading orders…</div>
      ) : orders.length === 0 ? (
        <div style={{ fontSize:12, color:"#aaa", padding:"24px 0", textAlign:"center", background:"#F7F7F5", borderRadius:8 }}>
          No WhatsApp orders yet.<br />
          <span style={{ fontSize:11 }}>Send <strong>"Hi"</strong> to +91 9500996033 to place a test order.</span>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:420, overflowY:"auto" }}>
          {orders.map(order => {
            const isOpen = expanded === order.id;
            return (
              <div key={order.id} style={{
                border:`0.5px solid ${isOpen ? "#C5DDF6" : "#F0F0EE"}`,
                borderRadius:10, overflow:"hidden",
                background: isOpen ? "#F8FBFF" : "#FAFAF9",
                transition:"border-color 0.15s",
              }}>
                {/* Collapsed row */}
                <div
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                  style={{
                    display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"10px 12px", cursor:"pointer", gap:8, flexWrap:"wrap",
                  }}
                >
                  {/* Left: customer name + phone + order ref */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
                    <span style={{ fontSize:11, color:"#1D9E75", fontWeight:600 }}>📲</span>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                        <span style={{ fontSize:12, fontWeight:600, color:"#111" }}>
                          {order.customer_name ?? "Unknown customer"}
                        </span>
                        {order.customer_phone && (
                          <span style={{
                            fontSize:10, color:"#1D9E75", fontFamily:"monospace",
                            background:"#F0FBF6", padding:"1px 6px", borderRadius:4,
                          }}>
                            +{order.customer_phone}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:10, color:"#aaa", fontFamily:"monospace" }}>
                        {order.order_number} · {fmtDateTime(order.created_at)}
                      </div>
                    </div>
                  </div>

                  {/* Middle: items summary */}
                  <div style={{
                    flex:1, fontSize:11, color:"#666",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0,
                  }}>
                    {order.items.length > 0
                      ? order.items.map(it => `${it.menu_items?.name ?? "Item"} ×${it.quantity}`).join(", ")
                      : "—"
                    }
                  </div>

                  {/* Right: total + status + chevron */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:"#111" }}>
                      {fmtINRFull(order.total_amount)}
                    </span>
                    <StatusPill status={order.status} />
                    <span style={{
                      fontSize:10, color:"#aaa",
                      transform: isOpen ? "rotate(180deg)" : "none",
                      transition:"transform 0.2s", display:"inline-block",
                    }}>▼</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ borderTop:"0.5px solid #E8EEF6", padding:"12px 14px", background:"#fff" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, marginBottom:10 }}>
                      <thead>
                        <tr style={{ borderBottom:"0.5px solid #F0F0EE" }}>
                          <th style={{ textAlign:"left",   color:"#aaa", fontWeight:400, fontSize:10, paddingBottom:6 }}>Item</th>
                          <th style={{ textAlign:"center", color:"#aaa", fontWeight:400, fontSize:10, paddingBottom:6 }}>Qty</th>
                          <th style={{ textAlign:"right",  color:"#aaa", fontWeight:400, fontSize:10, paddingBottom:6 }}>Price</th>
                          <th style={{ textAlign:"right",  color:"#aaa", fontWeight:400, fontSize:10, paddingBottom:6 }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((it, i) => (
                          <tr key={i} style={{ borderBottom:"0.5px solid #F7F7F5" }}>
                            <td style={{ padding:"5px 0", color:"#333" }}>
                              {it.menu_items?.name ?? "Unknown item"}
                              {it.special_instructions && (
                                <div style={{ fontSize:10, color:"#aaa" }}>{it.special_instructions}</div>
                              )}
                            </td>
                            <td style={{ padding:"5px 0", textAlign:"center", color:"#666" }}>{it.quantity}</td>
                            <td style={{ padding:"5px 0", textAlign:"right", color:"#666" }}>{fmtINRFull(it.unit_price)}</td>
                            <td style={{ padding:"5px 0", textAlign:"right", fontWeight:500, color:"#111" }}>
                              {fmtINRFull((it.quantity ?? 1) * parseFloat(it.unit_price ?? 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Totals */}
                    <div style={{ display:"flex", flexDirection:"column", gap:3, borderTop:"0.5px solid #F0F0EE", paddingTop:8, fontSize:12 }}>
                      {[
                        { label:"Subtotal", value: fmtINRFull(order.subtotal) },
                        { label:"Tax",      value: fmtINRFull(order.tax) },
                        { label:"Discount", value: fmtINRFull(order.discount ?? 0) },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display:"flex", justifyContent:"space-between", color:"#888" }}>
                          <span>{label}</span><span>{value}</span>
                        </div>
                      ))}
                      <div style={{
                        display:"flex", justifyContent:"space-between",
                        fontWeight:600, color:"#111", fontSize:13,
                        borderTop:"0.5px solid #E8E8E5", paddingTop:6, marginTop:3,
                      }}>
                        <span>Total</span>
                        <span>{fmtINRFull(order.total_amount)}</span>
                      </div>
                    </div>

                    {/* Badges */}
                    <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
                      <span style={{
                        fontSize:10, padding:"2px 8px", borderRadius:20, fontWeight:600, textTransform:"uppercase",
                        background: order.payment_status === "paid" ? "#E8F5E9" : "#FFF3E0",
                        color:      order.payment_status === "paid" ? "#2E7D32" : "#BA7517",
                      }}>
                        {order.payment_status ?? "unpaid"}
                      </span>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#F0F7FF", color:"#185FA5", fontWeight:600 }}>
                        via WhatsApp
                      </span>
                      {order.notes && (
                        <span style={{ fontSize:11, color:"#888" }}>Note: {order.notes}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Data Hooks ───────────────────────────────────────────────────────────────

function useKpiData(restaurantId, start, end) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!restaurantId || restaurantId === 'null' || restaurantId === 'undefined') return;
    (async () => {
      const [{ data: orders }, { data: tokens }] = await Promise.all([
        supabase.from("orders").select("total, pax").eq("restaurant_id", restaurantId).eq("status","completed").gte("created_at", start.toISOString()).lte("created_at", end.toISOString()),
        supabase.from("walk_in_tokens").select("created_at, seated_at").eq("restaurant_id", restaurantId).gte("created_at", start.toISOString()).lte("created_at", end.toISOString()),
      ]);
      const totalRevenue = (orders??[]).reduce((s,o)=>s+(o.total??0),0);
      const totalOrders  = (orders??[]).length;
      const seated = (tokens??[]).filter(t=>t.seated_at);
      const avgMins = seated.length ? Math.round(seated.reduce((s,t)=>s+(new Date(t.seated_at)-new Date(t.created_at))/60000,0)/seated.length) : null;
      setData({ totalRevenue, totalOrders, aov: totalOrders>0?Math.round(totalRevenue/totalOrders):0, totalCovers:(orders??[]).reduce((s,o)=>s+(o.pax??0),0), tokensIssued:(tokens??[]).length, avgDining:avgMins, avgWait:avgMins });
    })();
  }, [restaurantId, start, end]);
  return data;
}

function useChartData(restaurantId, start, end, preset) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!restaurantId || restaurantId === 'null' || restaurantId === 'undefined') return;
    (async () => {
      const { data: orders } = await supabase.from("orders").select("total, pax, created_at").eq("restaurant_id", restaurantId).eq("status","completed").gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      if (!orders) return;
      const byLabel = {};
      orders.forEach(o => {
        const d = new Date(o.created_at);
        const label = (preset==="today"||preset==="yesterday") ? `${d.getHours()}:00` : d.toLocaleDateString("en-IN",{day:"2-digit",month:"short"});
        if (!byLabel[label]) byLabel[label]={revenue:0,orders:0,covers:0};
        byLabel[label].revenue+=o.total??0; byLabel[label].orders+=1; byLabel[label].covers+=o.pax??0;
      });
      const labels=Object.keys(byLabel);
      setData({ labels, revenue:labels.map(l=>byLabel[l].revenue), orders:labels.map(l=>byLabel[l].orders), covers:labels.map(l=>byLabel[l].covers) });
    })();
  }, [restaurantId, start, end, preset]);
  return data;
}

function useMenuItems(restaurantId, start, end) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!restaurantId || restaurantId === 'null' || restaurantId === 'undefined') return;
    (async () => {
      const { data } = await supabase.from("order_items").select("quantity, unit_price, menu_items(name)").eq("restaurant_id", restaurantId).gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
      if (!data) return;
      const map={};
      data.forEach(r=>{ const n=r.menu_items?.name??"Unknown"; if(!map[n])map[n]={name:n,qty:0,revenue:0}; map[n].qty+=r.quantity??1; map[n].revenue+=(r.quantity??1)*(r.unit_price??0); });
      setItems(Object.values(map).sort((a,b)=>b.revenue-a.revenue).slice(0,7));
    })();
  }, [restaurantId, start, end]);
  return items;
}

function useTables(restaurantId) {
  const [tables, setTables] = useState([]);
  const fetch = useCallback(async () => {
    if (!restaurantId || restaurantId === 'null' || restaurantId === 'undefined') return;
    const { data } = await supabase.from("tables").select("id, label, status, current_pax").eq("restaurant_id", restaurantId).order("label");
    if (data) setTables(data);
  }, [restaurantId]);
  useEffect(() => {
    fetch();
    const ch = supabase.channel(`tables-${restaurantId}`).on("postgres_changes",{ event:"*", schema:"public", table:"tables", filter:`restaurant_id=eq.${restaurantId}` }, fetch).subscribe();
    return () => supabase.removeChannel(ch);
  }, [restaurantId, fetch]);
  return tables;
}

function useKotStats(restaurantId) {
  const [stats, setStats] = useState(null);
  const fetch = useCallback(async () => {
    if (!restaurantId || restaurantId === 'null' || restaurantId === 'undefined') return;
    const today = new Date(); today.setHours(0,0,0,0);
    const { data } = await supabase.from("kot_tickets").select("status, created_at, served_at").eq("restaurant_id", restaurantId).gte("created_at", today.toISOString());
    if (!data) return;
    const times = data.filter(k=>k.served_at).map(k=>(new Date(k.served_at)-new Date(k.created_at))/60000);
    setStats({ open:data.filter(k=>k.status==="open").length, inProgress:data.filter(k=>k.status==="in_progress").length, served:data.filter(k=>k.status==="served").length, avgTime:times.length?Math.round(times.reduce((s,v)=>s+v,0)/times.length):null, delayed:times.filter(t=>t>20).length, fastestItem:null, slowestItem:null });
  }, [restaurantId]);
  useEffect(() => {
    fetch();
    const ch = supabase.channel(`kot-${restaurantId}`).on("postgres_changes",{ event:"*", schema:"public", table:"kot_tickets", filter:`restaurant_id=eq.${restaurantId}` }, fetch).subscribe();
    return () => supabase.removeChannel(ch);
  }, [restaurantId, fetch]);
  return stats;
}

function useCancelStats(restaurantId, start, end) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!restaurantId || restaurantId === 'null' || restaurantId === 'undefined') return;
    (async () => {
      const [{ data: cancelled }, { data: voided }] = await Promise.all([
        supabase.from("orders").select("total").eq("restaurant_id", restaurantId).eq("status","cancelled").gte("created_at", start.toISOString()).lte("created_at", end.toISOString()),
        supabase.from("order_items").select("unit_price, quantity, void_reason, menu_items(name)").eq("restaurant_id", restaurantId).eq("voided",true).gte("created_at", start.toISOString()).lte("created_at", end.toISOString()),
      ]);
      const reasonMap={}, itemMap={};
      (voided??[]).forEach(v=>{ const r=v.void_reason??"Unknown"; reasonMap[r]=(reasonMap[r]??0)+1; const n=v.menu_items?.name??"Unknown"; itemMap[n]=(itemMap[n]??0)+1; });
      const total=(cancelled?.length??0)+(voided?.length??0);
      setStats({ cancelled:cancelled?.length??0, voided:voided?.length??0, revLost:(cancelled??[]).reduce((s,o)=>s+(o.total??0),0), topReason:Object.entries(reasonMap).sort((a,b)=>b[1]-a[1])[0]?.[0]??"—", topItem:Object.entries(itemMap).sort((a,b)=>b[1]-a[1])[0]?.[0]??"—", rate:total>0?Math.round(((cancelled?.length??0)/total)*100):0 });
    })();
  }, [restaurantId, start, end]);
  return stats;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function OwnerDashboard({ restaurantId, restaurantName, onLogout, apiClient  }) {
  const [preset,      setPreset]      = useState("today");
  const [customStart, setCustomStart] = useState(null);
  const [customEnd,   setCustomEnd]   = useState(null);
  const [showCal,     setShowCal]     = useState(false);

  const { start, end } = (customStart && customEnd) ? { start:customStart, end:customEnd } : getRange(preset);

  const kpi         = useKpiData(restaurantId, start, end);
  const chartData   = useChartData(restaurantId, start, end, preset);
  const menuItems   = useMenuItems(restaurantId, start, end);
  const tables      = useTables(restaurantId);
  const kotStats    = useKotStats(restaurantId);
  const cancelStats = useCancelStats(restaurantId, start, end);

  const rangeLabel = (customStart&&customEnd)
    ? `Custom · ${fmtDate(customStart)} – ${fmtDate(customEnd)}`
    : { today:"Today", yesterday:"Yesterday", "7d":"Last 7 days", "30d":"Last 30 days" }[preset];

  const row1 = [
    { icon:"₹",  label:"Total revenue",  value: kpi ? fmtINR(kpi.totalRevenue) : "—", badge:12,  sub:"vs prior" },
    { icon:"🛒", label:"Orders",          value: kpi?.totalOrders ?? "—",               badge:8,   sub:"vs prior" },
    { icon:"🧾", label:"Avg order value", value: kpi ? `₹${kpi.aov}` : "—",             badge:-3,  sub:"vs prior" },
    { icon:"👥", label:"Total covers",    value: kpi?.totalCovers ?? "—",                neutral:true, sub:"vs prior" },
  ];
  const row2 = [
    { icon:"🔄", label:"Table turns",     value:"3.2×",                                                badge:12,  sub:"vs prior" },
    { icon:"⏱",  label:"Avg dining time", value: kpi?.avgDining ? `${kpi.avgDining} min` : "—",        sub:"Benchmark: 90 min" },
    { icon:"🎟",  label:"Tokens issued",  value: kpi?.tokensIssued ?? "—",                             badge:18,  sub:"vs prior" },
    { icon:"⏳", label:"Avg wait time",   value: kpi?.avgWait ? `${kpi.avgWait} min` : "—",            badge:-22, sub:"vs prior" },
  ];

  const btnStyle = (active) => ({
    fontSize:12, padding:"4px 10px", borderRadius:8, border:"0.5px solid", cursor:"pointer",
    background:  active ? "#F0F0EE" : "transparent",
    color:       active ? "#111"    : "#888",
    borderColor: active ? "#C8C8C4" : "#E0E0DC",
  });

  return (
    <div style={{ minHeight:"100vh", background:"#F7F7F5", padding:"24px" }}>
      <div style={{ maxWidth:1100, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:12 }}>
          <div>
            <h1 style={{ fontSize:18, fontWeight:500, color:"#111", margin:0 }}>Owner dashboard</h1>
            <p style={{ fontSize:13, color:"#888", margin:"2px 0 0" }}>
              {restaurantName} · {new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
            </p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <div style={{ display:"flex", gap:4 }}>
              {PRESETS.map(p => (
                <button key={p.key} style={btnStyle(preset===p.key&&!customStart)} onClick={()=>{ setPreset(p.key); setCustomStart(null); setCustomEnd(null); setShowCal(false); }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ width:1, height:18, background:"#E0E0DC" }} />
            <button style={{ ...btnStyle(!!customStart), display:"flex", alignItems:"center", gap:5 }} onClick={()=>setShowCal(v=>!v)}>
              📅 {customStart ? `${fmtDate(customStart)} – ${fmtDate(customEnd)}` : "Custom"}
            </button>
            <div style={{ width:1, height:18, background:"#E0E0DC" }} />
            <button onClick={onLogout} style={{ fontSize:12, padding:"4px 12px", borderRadius:8, border:"0.5px solid #FCEBEB", background:"#FFF5F5", color:"#A32D2D", cursor:"pointer" }}>
              Logout
            </button>
          </div>
        </div>

        {/* Custom date picker */}
        {showCal && (
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, padding:12, background:"#fff", border:"0.5px solid #E8E8E5", borderRadius:12, flexWrap:"wrap" }}>
            <label style={{ fontSize:12, color:"#888" }}>From</label>
            <input type="date" style={{ border:"0.5px solid #E0E0DC", borderRadius:8, padding:"4px 8px", fontSize:12 }} onChange={e=>setCustomStart(new Date(e.target.value))} />
            <label style={{ fontSize:12, color:"#888" }}>To</label>
            <input type="date" style={{ border:"0.5px solid #E0E0DC", borderRadius:8, padding:"4px 8px", fontSize:12 }} onChange={e=>setCustomEnd(new Date(e.target.value+"T23:59:59"))} />
            <button onClick={()=>{ if(customStart&&customEnd){ setPreset(null); setShowCal(false); } }} style={{ fontSize:12, padding:"4px 14px", borderRadius:8, border:"none", background:"#378ADD", color:"#fff", cursor:"pointer" }}>Apply</button>
          </div>
        )}

        <p style={{ fontSize:11, color:"#aaa", marginBottom:12 }}>Showing: {rangeLabel}</p>

        {/* KPI rows */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:10, marginBottom:10 }}>
          {row1.map((m,i) => <MetricCard key={i} {...m} />)}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:10, marginBottom:14 }}>
          {row2.map((m,i) => <MetricCard key={i} {...m} />)}
        </div>

        {/* ── WhatsApp Business Section ────────────────────────────────── */}
        <div style={{ marginBottom:12 }}>
          <div style={{
            fontSize:11, fontWeight:600, color:"#aaa", letterSpacing:0.8,
            textTransform:"uppercase", marginBottom:8,
          }}>
            WhatsApp Business
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:12 }}>
            <WABAStatus restaurantId={restaurantId} apiClient={apiClient} />
            <WhatsAppOrders restaurantId={restaurantId} />
          </div>
        </div>
        {/* ──────────────────────────────────────────────────────────────── */}

        {/* Revenue chart */}
        {chartData && <RevenueChart {...chartData} />}

        {/* Menu + Tables */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:12, marginBottom:12 }}>
          <TopMenuItems items={menuItems} />
          <TableOccupancy tables={tables} />
        </div>

        {/* KOT + Cancellations */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:12 }}>
          <KotStatus stats={kotStats} />
          <CancellationVoids stats={cancelStats} />
        </div>

      </div>
    </div>
  );
}
