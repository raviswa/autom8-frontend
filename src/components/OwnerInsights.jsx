// OwnerInsights.jsx — Advanced analytics for Munafe owner dashboard

import React, { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";

const HEAT_COLORS = ["#F5F5F3", "#E6F1FB", "#85B7EB", "#378ADD", "#185FA5"];
const CARD = { background: "#fff", border: "0.5px solid #E8E8E5", borderRadius: 12, padding: "16px 20px" };
const QUAD_COLORS = {
  star: "#1D9E75",
  hidden_gem: "#7B61FF",
  filler: "#BA7517",
  dead_weight: "#B4B2A9",
};
const SEGMENT_COLORS = { active: "#1D9E75", atRisk: "#BA7517", lapsed: "#A32D2D" };

function fmtINR(n) {
  if (!n) return "₹0";
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return "₹" + (n / 1000).toFixed(1) + "k";
  return "₹" + Math.round(n);
}

let _chartReady = false;
let _chartCbs = [];
function waitForChart(cb) {
  if (_chartReady && window.Chart) { cb(); return; }
  _chartCbs.push(cb);
  if (document.querySelector("script[data-chartjs-insights]")) return;
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
  s.setAttribute("data-chartjs-insights", "1");
  s.onload = () => { _chartReady = true; _chartCbs.forEach(fn => fn()); _chartCbs = []; };
  document.head.appendChild(s);
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#111" }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function RevenueHeatmap({ data }) {
  if (!data?.matrix?.length || !(data.max > 0)) {
    return <div style={{ fontSize: 12, color: "#aaa" }}>No orders in selected period</div>;
  }
  const max = data.max || 1;
  const hourLabels = (h) => (h % 4 === 0 ? `${h % 12 || 12}${h < 12 ? "a" : "p"}` : "");

  return (
    <div>
      {data.peaks?.length > 0 && (
        <div style={{ fontSize: 12, color: "#185FA5", background: "#E6F1FB", borderRadius: 8, padding: "8px 12px", marginBottom: 12, lineHeight: 1.5 }}>
          <strong>Peak slots:</strong>{" "}
          {data.peaks.slice(0, 3).map(p => `${p.label} (${data.aggregation === "order_count" ? `${p.revenue} orders` : fmtINR(p.revenue)})`).join(" · ")}
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `72px repeat(24, 1fr)`, gap: 2, minWidth: 520 }}>
          <div />
          {data.hours.map(h => (
            <div key={h} style={{ fontSize: 9, color: "#aaa", textAlign: "center" }}>{hourLabels(h)}</div>
          ))}
          {data.days.map((day, di) => (
            <React.Fragment key={day.date || day.key || di}>
              <div style={{ fontSize: 10, color: "#666", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span style={{ fontWeight: 500 }}>{day.dow || day.label}</span>
                <span style={{ color: "#aaa" }}>{day.date ? day.label : ""}</span>
              </div>
              {data.hours.map(h => {
                const v = data.matrix[di][h];
                const ci = max ? Math.min(4, Math.floor((v / max) * 4.99)) : 0;
                return (
                  <div
                    key={`${di}-${h}`}
                    title={`${day.dow || day.label} ${h}:00 — ${data.aggregation === "order_count" ? `${v} orders` : fmtINR(v)}`}
                    style={{ background: HEAT_COLORS[ci], height: 22, borderRadius: 3, border: "0.5px solid #E8E8E5" }}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 10, color: "#aaa" }}>
        <span>Low</span>
        {HEAT_COLORS.map((c, i) => <span key={i} style={{ background: c, width: 16, height: 8, borderRadius: 2, display: "inline-block" }} />)}
        <span>High revenue</span>
      </div>
    </div>
  );
}

function DonutChart({ channels, whatsappPct, whatsappRevenue, whatsappOrderCount, mode, metricLabel }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!channels?.length) return;
    waitForChart(() => {
      if (chartRef.current) { try { chartRef.current.destroy(); } catch (_) {} chartRef.current = null; }
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      chartRef.current = new window.Chart(ctx, {
        type: "doughnut",
        data: {
          labels: channels.map(c => c.label),
          datasets: [{
            data: channels.map(c => c.value ?? c.revenue ?? 0),
            backgroundColor: ["#378ADD", "#1D9E75", "#7B61FF", "#D0D0CC"],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: { legend: { position: "right", labels: { font: { size: 11 }, boxWidth: 10 } } },
        },
      });
    });
    return () => { if (chartRef.current) { try { chartRef.current.destroy(); } catch (_) {} } };
  }, [channels]);

  return (
    <div>
      <div style={{ fontSize: 12, color: "#185FA5", marginBottom: 10 }}>
        {mode === "order_count" ? (
          <span><strong>{whatsappPct}%</strong> of orders ({whatsappOrderCount ?? 0}) came through WhatsApp ordering</span>
        ) : (
          <span><strong>{whatsappPct}%</strong> of revenue ({fmtINR(whatsappRevenue)}) came through WhatsApp ordering</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
        Showing service mix {metricLabel || "by revenue"}
      </div>
      <div style={{ height: 200, position: "relative" }}>
        {channels?.length ? <canvas ref={canvasRef} /> : <div style={{ fontSize: 12, color: "#aaa", paddingTop: 40, textAlign: "center" }}>No orders in period</div>}
      </div>
    </div>
  );
}

function RepeatTrendChart({ trend }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!trend?.length) return;
    waitForChart(() => {
      if (chartRef.current) { try { chartRef.current.destroy(); } catch (_) {} chartRef.current = null; }
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      chartRef.current = new window.Chart(ctx, {
        type: "line",
        data: {
          labels: trend.map(t => t.week.slice(5)),
          datasets: [{
            label: "Returning %",
            data: trend.map(t => t.returningPct),
            borderColor: "#1D9E75",
            backgroundColor: "rgba(29,158,117,0.1)",
            fill: true,
            tension: 0.35,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { min: 0, max: 100, ticks: { callback: v => `${v}%`, font: { size: 10 } } },
            x: { ticks: { font: { size: 10 } } },
          },
        },
      });
    });
    return () => { if (chartRef.current) { try { chartRef.current.destroy(); } catch (_) {} } };
  }, [trend]);

  if (!trend?.length) return <div style={{ fontSize: 12, color: "#aaa" }}>Need more order history for weekly trend</div>;
  return <div style={{ height: 180, position: "relative" }}><canvas ref={canvasRef} /></div>;
}

function MenuQuadrantChart({ data }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!data?.items?.length) return;
    waitForChart(() => {
      if (chartRef.current) { try { chartRef.current.destroy(); } catch (_) {} chartRef.current = null; }
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const byQ = {};
      for (const i of data.items) {
        if (!byQ[i.quadrant]) byQ[i.quadrant] = [];
        byQ[i.quadrant].push({ x: i.qty, y: i.revenue, label: i.name });
      }
      chartRef.current = new window.Chart(ctx, {
        type: "scatter",
        data: {
          datasets: Object.entries(byQ).map(([q, pts]) => ({
            label: q.replace("_", " "),
            data: pts,
            backgroundColor: QUAD_COLORS[q] || "#888",
            pointRadius: 6,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { font: { size: 10 }, boxWidth: 8 } },
            tooltip: { callbacks: { label: c => `${c.raw.label}: ${c.raw.x} sold, ${fmtINR(c.raw.y)}` } },
          },
          scales: {
            x: { title: { display: true, text: "Quantity sold", font: { size: 10 } }, ticks: { font: { size: 10 } } },
            y: { title: { display: true, text: "Revenue (₹)", font: { size: 10 } }, ticks: { font: { size: 10 } } },
          },
        },
      });
    });
    return () => { if (chartRef.current) { try { chartRef.current.destroy(); } catch (_) {} } };
  }, [data]);

  if (!data?.items?.length) return <div style={{ fontSize: 12, color: "#aaa" }}>No item sales in period</div>;
  return (
    <div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
        Median split: {data.medians.qty} units · {fmtINR(data.medians.revenue)}
      </div>
      <div style={{ height: 260, position: "relative" }}><canvas ref={canvasRef} /></div>
    </div>
  );
}

function CustomerLeaderboard({ rows, sortBy }) {
  if (!rows?.length) return <div style={{ fontSize: 12, color: "#aaa" }}>No customer data yet</div>;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: "0.5px solid #F0F0EE" }}>
          {["Name", "Phone", "Visits", "Spend", "Last visit"].map(h => (
            <th key={h} style={{ textAlign: "left", color: "#aaa", fontWeight: 400, fontSize: 10, paddingBottom: 6 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.phone || i} style={{ borderBottom: "0.5px solid #F7F7F5" }}>
            <td style={{ padding: "6px 8px 6px 0", fontWeight: 500 }}>{r.name}</td>
            <td style={{ padding: "6px 8px 6px 0", color: "#666", fontFamily: "monospace", fontSize: 11 }}>+91{r.phone}</td>
            <td style={{ padding: "6px 8px 6px 0" }}>{sortBy === "spend" ? r.visits : <strong>{r.visits}</strong>}</td>
            <td style={{ padding: "6px 8px 6px 0" }}>{sortBy === "spend" ? <strong>{fmtINR(r.spend)}</strong> : fmtINR(r.spend)}</td>
            <td style={{ padding: "6px 8px 6px 0", color: "#888", fontSize: 11 }}>
              {r.daysSinceLastVisit != null ? `${r.daysSinceLastVisit}d ago` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function useInsights(apiClient, startISO, endISO, skip = false) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (skip || !apiClient || !startISO || !endISO) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await apiClient.get("/api/dashboard/insights", { params: { start: startISO, end: endISO } });
        if (!cancelled) setData(res.data);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load insights");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiClient, startISO, endISO, skip]);

  return { data, loading, error };
}

export default function OwnerInsights({ apiClient, startISO, endISO, rangeLabel, insightsData }) {
  const fetched = useInsights(apiClient, startISO, endISO, Boolean(insightsData));
  const data = insightsData ?? fetched.data;
  const loading = !insightsData && fetched.loading;
  const error = !insightsData ? fetched.error : null;

  if (loading && !data) {
    return (
      <div style={{ ...CARD, textAlign: "center", padding: 32, color: "#aaa", fontSize: 13 }}>
        Loading insights…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ ...CARD, textAlign: "center", padding: 24, color: "#A32D2D", fontSize: 13 }}>
        {error}
      </div>
    );
  }
  if (!data) return null;

  const { revenueHeatmap, serviceSplit, repeatTrend, customers, stockOutages, comboPatterns, menuQuadrant } = data;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "#111", margin: 0 }}>Insights</h2>
        <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0" }}>
          Actionable analytics for staffing, menu, and WhatsApp retention · {rangeLabel}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={CARD}>
          <SectionHeader
            title="Hourly revenue heatmap"
            sub={revenueHeatmap?.aggregation === "order_count"
              ? "Last 7 days · darker = more orders (totals sparsely captured)"
              : "Last 7 days · darker = more revenue"}
          />
          <RevenueHeatmap data={revenueHeatmap} />
        </div>
        <div style={CARD}>
          <SectionHeader title="Revenue by service type" sub="Dine-in vs takeaway vs delivery" />
          <DonutChart
            channels={serviceSplit?.channels}
            whatsappPct={serviceSplit?.whatsappPct}
            whatsappRevenue={serviceSplit?.whatsappRevenue}
            whatsappOrderCount={serviceSplit?.whatsappOrderCount}
            mode={serviceSplit?.mode}
            metricLabel={serviceSplit?.metricLabel}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
        <div style={CARD}>
          <SectionHeader title="Returning customers %" sub="Weekly trend" />
          <RepeatTrendChart trend={repeatTrend} />
        </div>
        <div style={CARD}>
          <SectionHeader title="Visit frequency" sub="Based on phone numbers captured on orders" />
          <div style={{ fontSize: 28, fontWeight: 500, color: "#111" }}>
            {customers?.avgDaysBetweenVisits != null ? `${customers.avgDaysBetweenVisits} days` : "—"}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Avg days between visits</div>
          {customers?.medianDaysBetweenVisits != null && (
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 8 }}>Median: {customers.medianDaysBetweenVisits} days</div>
          )}
        </div>
        <div style={CARD}>
          <SectionHeader title="Customer recency" sub="RFM-lite segments" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { key: "active", label: "Active (≤14 days)", count: customers?.segments?.active },
              { key: "atRisk", label: "At-risk (15–45 days)", count: customers?.segments?.atRisk },
              { key: "lapsed", label: "Lapsed (45+ days)", count: customers?.segments?.lapsed },
            ].map(s => (
              <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "#666" }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: SEGMENT_COLORS[s.key], marginRight: 6 }} />
                  {s.label}
                </span>
                <strong style={{ color: "#111" }}>{s.count ?? 0}</strong>
              </div>
            ))}
          </div>
          {(customers?.segments?.lapsed ?? 0) > 0 && (
            <Link
              to="/dashboard/marketing"
              style={{
                marginTop: 14, width: "100%", fontSize: 11, fontWeight: 500, padding: "8px 12px",
                borderRadius: 8, border: "0.5px solid #CECBF6", background: "#EEEDFE", color: "#3C3489",
                cursor: "pointer", textDecoration: "none", display: "block", textAlign: "center", boxSizing: "border-box",
              }}
            >
              Win back {customers.segments.lapsed} lapsed customers →
            </Link>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={CARD}>
          <SectionHeader title="Top customers by visits" sub={`${customers?.totalCustomers ?? 0} unique phones in period`} />
          <CustomerLeaderboard rows={customers?.topByVisits} sortBy="visits" />
        </div>
        <div style={CARD}>
          <SectionHeader title="Top customers by spend" sub="WhatsApp-identified guests" />
          <CustomerLeaderboard rows={customers?.topBySpend} sortBy="spend" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={CARD}>
          <SectionHeader title="Frequently ordered together" sub="Bundle & procurement signals" />
          {!comboPatterns?.length ? (
            <div style={{ fontSize: 12, color: "#aaa" }}>Need more orders to detect pairs (min 2 co-orders)</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {comboPatterns.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: "0.5px solid #F7F7F5" }}>
                  <span style={{ color: "#444" }}>{p.itemA} + {p.itemB}</span>
                  <strong style={{ color: "#185FA5" }}>{p.count}×</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={CARD}>
          <SectionHeader title="Out-of-stock frequency" sub="From manager menu toggles" />
          {!stockOutages?.length ? (
            <div style={{ fontSize: 12, color: "#aaa" }}>No stock toggles recorded in this period</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid #F0F0EE" }}>
                  {["Item", "Times off", "Hours off"].map(h => (
                    <th key={h} style={{ textAlign: "left", color: "#aaa", fontWeight: 400, fontSize: 10, paddingBottom: 6 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockOutages.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "0.5px solid #F7F7F5" }}>
                    <td style={{ padding: "5px 0", fontWeight: 500 }}>{r.name}</td>
                    <td style={{ padding: "5px 8px 5px 0", color: r.offCount >= 3 ? "#A32D2D" : "#666" }}>{r.offCount}</td>
                    <td style={{ padding: "5px 0", color: "#666" }}>{r.totalOffHours > 0 ? `${r.totalOffHours}h` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={CARD}>
        <SectionHeader title="Menu engineering quadrant" sub="Stars · Hidden gems · Fillers · Dead weight" />
        <MenuQuadrantChart data={menuQuadrant} />
      </div>
    </div>
  );
}
