// OwnerInsights.jsx
//
// Fixes applied in this version:
//  #6  - Hourly heatmap now aggregates by day-of-week × hour (not specific date)
//  #7  - Revenue by service type reads orders.service_type directly
//  #8  - Top customers by visits: spend computed from orders with customer join
//  #9  - Top customers by spend: same fix, sorted by spend descending
//  #10 - Frequently ordered together: correct order_items pair logic
//  #11 - Out-of-stock: reads menu_items.is_available (live status)
//  #12 - Menu engineering: uses order_items data; boundaries use median not mean
//
// Additional fixes:
//  - Returning customers % and visit frequency correctly computed from walk_in_tokens
//  - RFM-lite segments use token.arrived_at (visit time, not order time)
//  - All sections gracefully handle empty/no-data states

import React, { useState, useEffect } from "react";
import { supabase } from "../contexts/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HEAT_PALETTE = ["#EDF5FE", "#B5D4F4", "#6AAEE8", "#2E7DD4", "#0C447C"];
const SERVICE_COLORS = ["#378ADD", "#1D9E75", "#BA7517", "#A32D2D", "#9B59B6", "#888"];
const QUAD_META = {
  star:   { label: "Stars",       desc: "High revenue · high volume",  color: "#3B6D11", bg: "#EAF3DE" },
  gem:    { label: "Hidden gems", desc: "High revenue · low volume",   color: "#185FA5", bg: "#E6F1FB" },
  filler: { label: "Fillers",     desc: "Low revenue · high volume",   color: "#633806", bg: "#FAEEDA" },
  dead:   { label: "Dead weight", desc: "Low revenue · low volume",    color: "#888",    bg: "#F5F5F3" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtINR(n) {
  if (!n) return "₹0";
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000)   return "₹" + (n / 1000).toFixed(1) + "k";
  return "₹" + Math.round(n);
}

function fmtDays(d) {
  if (d == null) return "—";
  if (d < 1) return "< 1 day";
  return `${Math.round(d)} day${Math.round(d) !== 1 ? "s" : ""}`;
}

function normalizeServiceType(raw) {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().replace(/[\s_-]/g, "");
  if (s === "dinein" || s === "dine")     return "dine_in";
  if (s === "takeaway" || s === "take")   return "takeaway";
  if (s === "delivery")                   return "delivery";
  return raw.toLowerCase();
}

function serviceLabel(type) {
  const map = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery", unknown: "Unknown" };
  return map[type] || type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, sub, children }) {
  return (
    <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "18px 20px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>{title}</span>
        {sub && <span style={{ fontSize: 11, color: "#aaa" }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ msg }) {
  return <div style={{ fontSize: 12, color: "#aaa", textAlign: "center", padding: "16px 0" }}>{msg}</div>;
}

// ─── 1. Hourly Heatmap (day-of-week × hour) ──────────────────────────────────
// FIX #6: aggregate across the whole period by day name, not specific calendar date
function HourlyHeatmap({ grid, rangeLabel }) {
  const allVals = grid.flat();
  const maxVal  = Math.max(...allVals, 1);
  const heatIdx = v => Math.min(4, Math.floor((v / maxVal) * 4.99));

  // Hour labels: show at 0, 4, 8, 12, 16, 20
  const hourLabels = Array.from({ length: 24 }, (_, h) => {
    if (h % 4 !== 0) return "";
    if (h === 0)  return "12a";
    if (h < 12)  return `${h}a`;
    if (h === 12) return "12p";
    return `${h - 12}p`;
  });

  return (
    <Section title="Hourly revenue heatmap" sub={`${rangeLabel} · darker = more revenue`}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 520 }}>
          {/* Hour header */}
          <div style={{ display: "flex", marginBottom: 4, marginLeft: 38 }}>
            {hourLabels.map((lbl, h) => (
              <div key={h} style={{ flex: 1, fontSize: 9, color: "#bbb", textAlign: "center", minWidth: 14 }}>{lbl}</div>
            ))}
          </div>

          {/* One row per day-of-week */}
          {DAYS_OF_WEEK.map((day, d) => (
            <div key={d} style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
              <div style={{ width: 34, fontSize: 10, color: "#888", flexShrink: 0 }}>{day}</div>
              {grid[d].map((v, h) => (
                <div
                  key={h}
                  title={`${day} ${h}:00 – ${fmtINR(Math.round(v))}`}
                  style={{
                    flex: 1,
                    height: 16,
                    background: HEAT_PALETTE[heatIdx(v)],
                    borderRadius: 2,
                    marginRight: 1,
                    minWidth: 12,
                    cursor: "default",
                  }}
                />
              ))}
            </div>
          ))}

          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 10, color: "#aaa" }}>
            <span>Low</span>
            {HEAT_PALETTE.map((c, i) => (
              <span key={i} style={{ background: c, width: 14, height: 8, borderRadius: 2, display: "inline-block", border: "0.5px solid #e8e8e5" }} />
            ))}
            <span>High revenue</span>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─── 2. Revenue by Service Type ───────────────────────────────────────────────
// FIX #7: reads orders.service_type directly, shows proper breakdown
function ServiceTypeRevenue({ byType, total }) {
  const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  return (
    <Section title="Revenue by service type" sub="selected period">
      {!entries.length ? (
        <Empty msg="No service type recorded on orders in this period" />
      ) : (
        <div>
          {entries.map(([type, rev], i) => {
            const pct = total > 0 ? Math.round((rev / total) * 100) : 0;
            return (
              <div key={type} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "#555" }}>{serviceLabel(type)}</span>
                  <span style={{ fontWeight: 500 }}>
                    {fmtINR(rev)} <span style={{ color: "#aaa", fontWeight: 400 }}>({pct}%)</span>
                  </span>
                </div>
                <div style={{ background: "#F0F0EE", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, background: SERVICE_COLORS[i % SERVICE_COLORS.length], height: "100%", borderRadius: 4 }} />
                </div>
              </div>
            );
          })}
          {byType["unknown"] > 0 && (
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>
              💡 "Unknown" orders have no service_type set. Add a service_type field on order creation to improve this breakdown.
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── 3. Customer Retention & Frequency ───────────────────────────────────────
function CustomerRetention({ returningPct, totalUnique, returningCount, avgGap, medianGap, segments }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
      {/* Returning % + RFM */}
      <Section title="Returning customers %" sub="selected period">
        <div style={{ fontSize: 30, fontWeight: 500, color: "#111", marginBottom: 4 }}>{returningPct}%</div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>
          {returningCount} of {totalUnique} unique customers visited more than once
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
          Customer recency · RFM-lite segments
        </div>
        {[
          { label: "Active (≤14 days)",    count: segments.active,  color: "#1D9E75" },
          { label: "At-risk (15–45 days)", count: segments.atRisk,  color: "#BA7517" },
          { label: "Lapsed (45+ days)",    count: segments.lapsed,  color: "#A32D2D" },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid #F7F7F5", fontSize: 12 }}>
            <span style={{ color: "#888" }}>{r.label}</span>
            <span style={{ fontWeight: 500, color: r.color }}>{r.count}</span>
          </div>
        ))}
      </Section>

      {/* Visit frequency */}
      <Section title="Visit frequency" sub="based on WhatsApp sessions">
        {avgGap == null ? (
          <div>
            <div style={{ fontSize: 22, fontWeight: 500, color: "#aaa", marginBottom: 4 }}>—</div>
            <div style={{ fontSize: 11, color: "#aaa", background: "#F7F7F5", borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>
              Need customers with 2+ visits in this period to compute frequency.
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 30, fontWeight: 500, color: "#111", marginBottom: 4 }}>{fmtDays(avgGap)}</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>avg days between visits</div>
            <div style={{ fontSize: 12, color: "#aaa", marginBottom: 16 }}>Median: {fmtDays(medianGap)}</div>
            <div style={{ fontSize: 11, color: "#888" }}>
              Based on {totalUnique} unique phone numbers in the period.
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── 4. Top Customers (by visits & by spend) ──────────────────────────────────
// FIX #8, #9: spend is computed by matching orders to customer phone numbers
function CustomerRow({ rank, c }) {
  const daysSince = c.lastVisit
    ? Math.floor((Date.now() - new Date(c.lastVisit)) / 86400000)
    : null;
  return (
    <tr
      onMouseEnter={e => (e.currentTarget.style.background = "#F7F7F5")}
      onMouseLeave={e => (e.currentTarget.style.background = "")}
      style={{ borderBottom: "0.5px solid #F7F7F5" }}
    >
      <td style={{ padding: "6px 6px 6px 0", color: "#aaa", fontSize: 11, width: 24 }}>{rank}</td>
      <td style={{ padding: "6px 6px 6px 0", fontWeight: 500, color: "#111", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || "—"}</td>
      <td style={{ padding: "6px 6px 6px 0", color: "#555", fontSize: 11, whiteSpace: "nowrap" }}>{c.phone ? `+${c.phone}` : "—"}</td>
      <td style={{ padding: "6px 6px 6px 0", textAlign: "center", fontWeight: 500 }}>{c.visits}</td>
      <td style={{ padding: "6px 6px 6px 0", textAlign: "right", fontWeight: 500, color: c.spend > 0 ? "#111" : "#aaa" }}>
        {c.spend > 0 ? `₹${Math.round(c.spend).toLocaleString("en-IN")}` : "—"}
      </td>
      <td style={{ padding: "6px 0 6px 0", textAlign: "right", fontSize: 11, color: "#aaa", whiteSpace: "nowrap" }}>
        {daysSince != null ? `${daysSince}d ago` : "—"}
      </td>
    </tr>
  );
}

function CustomerTable({ rows }) {
  const headers = ["#", "Name", "Phone", "Visits", "Spend", "Last visit"];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
        <thead>
          <tr style={{ borderBottom: "0.5px solid #E8E8E5" }}>
            {headers.map((h, i) => (
              <th key={h} style={{
                textAlign: ["Spend", "Last visit"].includes(h) ? "right" : h === "Visits" ? "center" : "left",
                color: "#aaa", fontWeight: 400, fontSize: 11, padding: "0 6px 8px 0",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((c, i) => <CustomerRow key={c.phone || i} rank={i + 1} c={c} />)}
        </tbody>
      </table>
    </div>
  );
}

function TopCustomers({ byVisits, bySpend }) {
  const hasSpend = bySpend.some(c => c.spend > 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
      <Section title="Top customers by visits" sub="WhatsApp-identified guests">
        {!byVisits.length
          ? <Empty msg="No customer visit data in this period" />
          : <CustomerTable rows={byVisits} />
        }
      </Section>

      <Section title="Top customers by spend" sub="WhatsApp-identified guests">
        {!bySpend.length ? (
          <Empty msg="No spend data in this period" />
        ) : (
          <>
            <CustomerTable rows={bySpend.filter(c => c.spend > 0)} />
            {!hasSpend && (
              <div style={{ fontSize: 11, color: "#aaa", background: "#F7F7F5", borderRadius: 8, padding: "10px 12px", marginTop: 8, lineHeight: 1.5 }}>
                💡 Spend is matched by linking orders to customer phone numbers. Add a <code>token_id</code> FK on the orders table for exact per-session attribution.
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

// ─── 5. Frequently Ordered Together ──────────────────────────────────────────
// FIX #10: correct pair counting from order_items grouped by order_id
function FrequentlyTogether({ pairs, ordersScanned, multiItemOrders }) {
  return (
    <Section title="Frequently ordered together" sub="Bundle & procurement signals">
      {!pairs.length ? (
        <div>
          <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>
            {ordersScanned === 0
              ? "No orders with item data in this period."
              : multiItemOrders === 0
              ? `All ${ordersScanned} orders in this period contain a single item. Pairs require multiple items per order.`
              : `No item pair appears in 2+ orders yet. (${multiItemOrders} multi-item orders scanned)`}
          </div>
          {ordersScanned > 0 && multiItemOrders === 0 && (
            <div style={{ fontSize: 11, color: "#aaa", background: "#F7F7F5", borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>
              💡 If customers order one item at a time via WhatsApp, use session-level grouping: add a <code>token_id</code> FK to orders, then group items across all orders in the same session.
            </div>
          )}
        </div>
      ) : (
        <>
          {pairs.map(({ pair, count }, i) => (
            <div key={pair} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid #F7F7F5", fontSize: 12 }}>
              <span style={{ color: "#555" }}>{i + 1}. {pair}</span>
              <span style={{ fontWeight: 500, color: "#185FA5", background: "#E6F1FB", padding: "2px 8px", borderRadius: 6, fontSize: 11 }}>
                {count}× ordered together
              </span>
            </div>
          ))}
        </>
      )}
    </Section>
  );
}

// ─── 6. Out-of-Stock ─────────────────────────────────────────────────────────
// FIX #11: reads menu_items.is_available (live state, not historical toggles)
function OutOfStockPanel({ items }) {
  return (
    <Section title="Out-of-stock items" sub="Current live status from menu">
      {!items.length ? (
        <div style={{ fontSize: 12, fontWeight: 500, color: "#1D9E75" }}>
          ✓ All menu items are currently marked as available
        </div>
      ) : (
        <div>
          {items.map(item => (
            <div key={item.id || item.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "0.5px solid #F7F7F5", fontSize: 12 }}>
              <span style={{ color: "#555" }}>{item.name}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {item.category && <span style={{ fontSize: 10, color: "#aaa" }}>{item.category}</span>}
                <span style={{ fontSize: 11, color: "#A32D2D", fontWeight: 500, background: "#FCEBEB", padding: "2px 7px", borderRadius: 5 }}>Unavailable</span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 10 }}>
            Toggle availability in Menu management. Historical toggle frequency requires an audit log table.
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── 7. Menu Engineering Quadrant ────────────────────────────────────────────
// FIX #12: uses order_items data correctly; median-based quadrant boundaries
function MenuQuadrant({ classified, medQty, medRev }) {
  if (!classified.length) {
    return (
      <Section title="Menu engineering quadrant" sub="Stars · Hidden gems · Fillers · Dead weight">
        <Empty msg="No item sales recorded in this period" />
      </Section>
    );
  }

  const byQ = { star: [], gem: [], filler: [], dead: [] };
  classified.forEach(it => byQ[it.quadrant]?.push(it));

  return (
    <Section title="Menu engineering quadrant" sub="Stars · Hidden gems · Fillers · Dead weight">
      <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
        Quadrant boundaries: median revenue {fmtINR(medRev)} · median qty {Math.round(medQty)} sold
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {["star", "gem", "filler", "dead"].map(q => {
          const { label, desc, color, bg } = QUAD_META[q];
          const items = byQ[q];
          return (
            <div key={q} style={{ background: bg, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 10, color, opacity: 0.7, marginBottom: 8 }}>{desc}</div>
              {items.length === 0 ? (
                <div style={{ fontSize: 11, color, opacity: 0.4 }}>None this period</div>
              ) : (
                items.map(it => (
                  <div key={it.name} style={{ fontSize: 11, color, marginBottom: 4, lineHeight: 1.4 }}>
                    <strong>{it.name}</strong>
                    <span style={{ opacity: 0.65, marginLeft: 6 }}>{it.qty} sold · {fmtINR(it.revenue)}</span>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadInsightData(restaurantId, startISO, endISO) {
  const [
    { data: orders,    error: e1 },
    { data: tokens,    error: e2 },
    { data: menuItems, error: e3 },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id, total_amount, created_at, service_type, table_id, customers(name, phone)")
      .eq("restaurant_id", restaurantId)
      .not("status", "eq", "cancelled")
      .gte("created_at", startISO)
      .lte("created_at", endISO),
    supabase
      .from("walk_in_tokens")
      .select("id, type, status, table_id, arrived_at, seated_at, completed_at, customers(name, phone)")
      .eq("restaurant_id", restaurantId)
      .gte("arrived_at", startISO)
      .lte("arrived_at", endISO),
    supabase
      .from("menu_items")
      .select("id, name, is_available, category")
      .eq("restaurant_id", restaurantId),
  ]);

  if (e1) console.error("[OwnerInsights] orders:", e1.message);
  if (e2) console.error("[OwnerInsights] tokens:", e2.message);
  if (e3) console.error("[OwnerInsights] menu_items:", e3.message);

  const orderIds = (orders ?? []).map(o => o.id);
  const { data: orderItems, error: e4 } = orderIds.length
    ? await supabase
        .from("order_items")
        .select("order_id, quantity, unit_price, menu_item:menu_item_id(name)")
        .in("order_id", orderIds)
    : { data: [], error: null };

  if (e4) console.error("[OwnerInsights] order_items:", e4.message);

  return {
    orders:    orders    ?? [],
    tokens:    tokens    ?? [],
    menuItems: menuItems ?? [],
    orderItems: orderItems ?? [],
  };
}

// ─── Metric Computation ───────────────────────────────────────────────────────
function computeMetrics({ orders, tokens, menuItems, orderItems }) {

  // ── 1. Hourly heatmap: grid[dayOfWeek][hour] = total revenue ───────────
  // FIX #6: aggregate by day name across entire period, not specific dates
  const hourlyGrid = Array.from({ length: 7 }, () => Array(24).fill(0));
  orders.forEach(o => {
    const d = new Date(o.created_at);
    hourlyGrid[d.getDay()][d.getHours()] += o.total_amount ?? 0;
  });

  // ── 2. Revenue by service type ─────────────────────────────────────────
  // FIX #7: read from orders.service_type
  const revenueByType  = {};
  const totalRevenue   = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0);
  orders.forEach(o => {
    const type = normalizeServiceType(o.service_type);
    revenueByType[type] = (revenueByType[type] || 0) + (o.total_amount ?? 0);
  });

  // ── 3. Customer map: visits from tokens, spend from orders ─────────────
  // FIX #8, #9: correct spend computation via customer phone join on orders
  const customerMap = {}; // phone → { name, phone, visits, spend, visitDates, lastVisit }

  tokens.forEach(t => {
    const phone = t.customers?.phone;
    if (!phone) return;
    if (!customerMap[phone]) customerMap[phone] = {
      name: t.customers?.name || "—", phone,
      visits: 0, spend: 0, visitDates: [], lastVisit: null,
    };
    customerMap[phone].visits++;
    const dt = t.arrived_at || t.created_at;
    if (dt) {
      customerMap[phone].visitDates.push(dt);
      if (!customerMap[phone].lastVisit || dt > customerMap[phone].lastVisit) {
        customerMap[phone].lastVisit = dt;
      }
    }
  });

  // Accumulate spend from orders (customer_id → phone via join)
  orders.forEach(o => {
    const phone = o.customers?.phone;
    if (!phone) return;
    if (!customerMap[phone]) customerMap[phone] = {
      name: o.customers?.name || "—", phone,
      visits: 0, spend: 0, visitDates: [], lastVisit: null,
    };
    customerMap[phone].spend += o.total_amount ?? 0;
  });

  const allCustomers   = Object.values(customerMap);
  const totalUnique    = allCustomers.length;
  const returningArr   = allCustomers.filter(c => c.visits > 1);
  const returningCount = returningArr.length;
  const returningPct   = totalUnique ? Math.round(returningCount / totalUnique * 100) : 0;

  // Visit frequency: gaps between consecutive visits per customer
  const allGaps = [];
  allCustomers.forEach(c => {
    if (c.visitDates.length < 2) return;
    const sorted = [...c.visitDates].sort();
    for (let i = 1; i < sorted.length; i++) {
      const gapDays = (new Date(sorted[i]) - new Date(sorted[i - 1])) / 86400000;
      allGaps.push(gapDays);
    }
  });
  const avgGap     = allGaps.length ? allGaps.reduce((s, v) => s + v, 0) / allGaps.length : null;
  const sortedGaps = [...allGaps].sort((a, b) => a - b);
  const medianGap  = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : null;

  // RFM-lite segments (based on last visit time relative to today)
  const now = Date.now();
  const segments = { active: 0, atRisk: 0, lapsed: 0 };
  allCustomers.forEach(c => {
    if (!c.lastVisit) return;
    const days = (now - new Date(c.lastVisit)) / 86400000;
    if (days <= 14)  segments.active++;
    else if (days <= 45) segments.atRisk++;
    else segments.lapsed++;
  });

  const byVisits = [...allCustomers].sort((a, b) => b.visits - a.visits);
  const bySpend  = [...allCustomers].sort((a, b) => b.spend - a.spend);

  // ── 4. Frequently ordered together ────────────────────────────────────
  // FIX #10: correct pair counting by grouping order_items by order_id
  const byOrderId = {};
  orderItems.forEach(item => {
    const name = item.menu_item?.name;
    if (!name) return;
    if (!byOrderId[item.order_id]) byOrderId[item.order_id] = new Set();
    byOrderId[item.order_id].add(name);
  });

  const pairCounts  = {};
  let multiItemOrders = 0;
  Object.values(byOrderId).forEach(itemSet => {
    const arr = [...itemSet];
    if (arr.length > 1) multiItemOrders++;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = [arr[i], arr[j]].sort().join(" + ");
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }
    }
  });

  const topPairs = Object.entries(pairCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([pair, count]) => ({ pair, count }));

  // ── 5. Out-of-stock ───────────────────────────────────────────────────
  // FIX #11: live status from menu_items.is_available
  const outOfStock = menuItems.filter(m => m.is_available === false);

  // ── 6. Menu engineering quadrant ──────────────────────────────────────
  // FIX #12: uses order_items; median-based quadrant thresholds
  const itemStats = {};
  orderItems.forEach(item => {
    const name = item.menu_item?.name;
    if (!name) return;
    if (!itemStats[name]) itemStats[name] = { name, qty: 0, revenue: 0 };
    itemStats[name].qty     += item.quantity ?? 1;
    itemStats[name].revenue += (item.quantity ?? 1) * (item.unit_price ?? 0);
  });

  const itemArr = Object.values(itemStats);
  let classified = [], medQty = 0, medRev = 0;

  if (itemArr.length) {
    const sortedQ = [...itemArr].sort((a, b) => a.qty - b.qty);
    const sortedR = [...itemArr].sort((a, b) => a.revenue - b.revenue);
    const mid = Math.floor(itemArr.length / 2);
    medQty = sortedQ[mid]?.qty ?? 0;
    medRev = sortedR[mid]?.revenue ?? 0;

    classified = itemArr.map(it => {
      const highRev = it.revenue >= medRev;
      const highQty = it.qty >= medQty;
      const quadrant = highRev && highQty  ? "star"
                     : highRev && !highQty ? "gem"
                     : !highRev && highQty ? "filler"
                     : "dead";
      return { ...it, quadrant };
    });
    // Sort each quadrant by revenue desc
    classified.sort((a, b) => b.revenue - a.revenue);
  }

  return {
    hourlyGrid,
    revenueByType, totalRevenue,
    totalUnique, returningPct, returningCount, avgGap, medianGap, segments,
    byVisits, bySpend,
    topPairs, ordersScanned: Object.keys(byOrderId).length, multiItemOrders,
    outOfStock,
    classified, medQty, medRev,
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function OwnerInsights({ restaurantId, startISO, endISO, rangeLabel }) {
  const [loading,  setLoading]  = useState(true);
  const [metrics,  setMetrics]  = useState(null);
  const [loadErr,  setLoadErr]  = useState(null);

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    setLoadErr(null);
    loadInsightData(restaurantId, startISO, endISO)
      .then(raw => {
        setMetrics(computeMetrics(raw));
        setLoading(false);
      })
      .catch(e => {
        console.error("[OwnerInsights]", e);
        setLoadErr(e.message);
        setLoading(false);
      });
  }, [restaurantId, startISO, endISO]);

  const Wrapper = ({ children }) => (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#111", marginBottom: 4 }}>Insights</div>
      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 14 }}>
        Actionable analytics for staffing, menu, and WhatsApp retention · {rangeLabel}
      </div>
      {children}
    </div>
  );

  if (loading) {
    return (
      <Wrapper>
        <div style={{ background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "32px 20px", textAlign: "center", fontSize: 13, color: "#aaa" }}>
          Loading insights...
        </div>
      </Wrapper>
    );
  }

  if (loadErr) {
    return (
      <Wrapper>
        <div style={{ background: "#FCEBEB", borderRadius: 12, padding: "14px 18px", fontSize: 12, color: "#A32D2D" }}>
          Failed to load insights: {loadErr}
        </div>
      </Wrapper>
    );
  }

  if (!metrics) return null;

  return (
    <Wrapper>
      <HourlyHeatmap grid={metrics.hourlyGrid} rangeLabel={rangeLabel} />

      <ServiceTypeRevenue byType={metrics.revenueByType} total={metrics.totalRevenue} />

      <CustomerRetention
        returningPct={metrics.returningPct}
        totalUnique={metrics.totalUnique}
        returningCount={metrics.returningCount}
        avgGap={metrics.avgGap}
        medianGap={metrics.medianGap}
        segments={metrics.segments}
      />

      <TopCustomers byVisits={metrics.byVisits} bySpend={metrics.bySpend} />

      <FrequentlyTogether
        pairs={metrics.topPairs}
        ordersScanned={metrics.ordersScanned}
        multiItemOrders={metrics.multiItemOrders}
      />

      <OutOfStockPanel items={metrics.outOfStock} />

      <MenuQuadrant
        classified={metrics.classified}
        medQty={metrics.medQty}
        medRev={metrics.medRev}
      />
    </Wrapper>
  );
}
