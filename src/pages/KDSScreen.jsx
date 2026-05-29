// ============================================================================
// AUTOM8 FRONTEND - KDS SCREEN
// src/pages/KDSScreen.jsx
//
// CHANGES IN THIS VERSION
// ──────────────────────────────
//  1. AUTO-PRINT KOT on ORDER_NEW WebSocket event — opens a styled thermal
//     print window automatically. Works with any printer connected to the
//     browser (USB, network, cloud) via the OS print dialog.
//     printKOT(orderData) is also called after every successful fetchFeed
//     for any NEW order that hasn't been printed yet (tracked by a ref Set).
//
//  2. KOT print format: restaurant name, order#, table/token/type,
//     item list with qty, special notes, timestamp — fits 80mm thermal roll.
//
//  3. Manual "Print KOT" button added to each item card so staff can
//     reprint a KOT for a specific order at any time.
//
//  4. All prior logic (slot-agnostic feed, IST timezone, item-level cards,
//     optimistic updates, feedback, referral, condiment nudge) unchanged.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';

// ─── Timezone helpers ────────────────────────────────────────────────────────

const IST_OFFSET_MS      = 5.5 * 60 * 60 * 1000;
const READY_TIMEOUT_MINS = 20;

function toUTC(iso) {
  if (!iso) return iso;
  return iso.toString().replace(' ', 'T').replace(/([+-]\d{2}:\d{2}|Z)$/, '') + 'Z';
}

function getISTDateStr(iso) {
  const istMs = new Date(toUTC(iso)).getTime() + IST_OFFSET_MS;
  return new Date(istMs).toISOString().slice(0, 10);
}

function todayISTStr() {
  return getISTDateStr(new Date().toISOString());
}

function isTodayIST(iso) {
  return getISTDateStr(iso) === todayISTStr();
}

function minutesAgo(iso) {
  return Math.floor((Date.now() - new Date(toUTC(iso))) / 60000);
}

function formatISTTime(iso) {
  return new Date(toUTC(iso)).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

// ─── KOT PRINT ENGINE ────────────────────────────────────────────────────────
//
// Builds a minimal 80mm-compatible HTML page and fires window.print().
// No external deps — works with any printer the OS can see.
//
// `kotData` shape accepted:
//   { orderNumber, tableLabel, serviceType, customerName, items, notes, timestamp }
// ─────────────────────────────────────────────────────────────────────────────

function printKOT(kotData) {
  const {
    orderNumber  = '—',
    tableLabel   = '—',
    serviceType  = '',
    customerName = '',
    items        = [],
    notes        = '',
    timestamp    = new Date().toISOString(),
  } = kotData;

  const timeStr = formatISTTime(timestamp);

  const itemRows = items.map(i =>
    `<tr>
       <td class="item-name">${i.name || 'Item'}</td>
       <td class="item-qty">x${i.qty || i.quantity || 1}</td>
     </tr>`
  ).join('');

  const notesHtml = notes
    ? `<div class="notes">⚠ NOTES: ${notes}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>KOT ${orderNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 13px;
    width: 72mm;
    padding: 4mm;
    color: #000;
    background: #fff;
  }
  .restaurant-name {
    font-size: 15px;
    font-weight: bold;
    text-align: center;
    letter-spacing: 0.05em;
    margin-bottom: 2mm;
  }
  .kot-label {
    text-align: center;
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    border-top: 1px dashed #000;
    border-bottom: 1px dashed #000;
    padding: 2mm 0;
    margin: 2mm 0;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin: 1mm 0;
  }
  .meta-label { color: #555; }
  .meta-value { font-weight: bold; }
  .divider {
    border: none;
    border-top: 1px dashed #000;
    margin: 2.5mm 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  td { padding: 2mm 0; vertical-align: top; }
  .item-name { font-size: 14px; font-weight: bold; width: 85%; }
  .item-qty  { font-size: 14px; font-weight: bold; text-align: right; width: 15%; }
  .notes {
    margin-top: 3mm;
    padding: 2mm 3mm;
    border: 1px solid #000;
    font-size: 12px;
    font-weight: bold;
    background: #f0f0f0;
  }
  .footer {
    text-align: center;
    font-size: 10px;
    color: #555;
    margin-top: 4mm;
    border-top: 1px dashed #000;
    padding-top: 2mm;
  }
  @media print {
    body { width: 72mm; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>
  <div class="restaurant-name">KITCHEN ORDER TICKET</div>
  <div class="kot-label">KOT</div>

  <div class="meta-row">
    <span class="meta-label">Order</span>
    <span class="meta-value">#${orderNumber}</span>
  </div>
  <div class="meta-row">
    <span class="meta-label">Table / Type</span>
    <span class="meta-value">${tableLabel}${serviceType ? ' · ' + serviceType : ''}</span>
  </div>
  ${customerName ? `<div class="meta-row"><span class="meta-label">Customer</span><span class="meta-value">${customerName}</span></div>` : ''}
  <div class="meta-row">
    <span class="meta-label">Time</span>
    <span class="meta-value">${timeStr}</span>
  </div>

  <hr class="divider" />

  <table>
    <tbody>${itemRows}</tbody>
  </table>

  ${notesHtml}

  <div class="footer">Printed ${timeStr} · Autom8</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) {
    console.warn('[KOT] Popup blocked — allow popups for auto-print');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Small delay so fonts/styles settle before print dialog opens
  setTimeout(() => {
    win.print();
    win.close();
  }, 350);
}

// ─── Build KOT data from a WebSocket ORDER_NEW payload ───────────────────────
// The WS payload from /api/kds/notify and handleWhatsAppOrder includes:
//   order_number, table_number, token_number, customer_name,
//   service_type, special_notes, source
// Items are NOT in the WS payload — we fetch them from the KDS feed.

function buildKOTFromWSPayload(wsPayload, feedItems) {
  const orderNum = wsPayload.order_number || wsPayload.order_id || '—';

  // Match KDS items that belong to this order by order_number
  const myItems = feedItems.filter(i => {
    const itemOrderNum = i.order_item?.order?.order_number;
    return itemOrderNum && itemOrderNum === wsPayload.order_number;
  });

  const items = myItems.length > 0
    ? myItems.map(i => ({
        name: i.order_item?.menu_item?.name ?? i.item_name ?? 'Item',
        qty:  i.order_item?.quantity ?? 1,
      }))
    : (wsPayload.items || []);  // fallback if feed hasn't refreshed yet

  const tableLabel = wsPayload.table_number
    ? `Table ${wsPayload.table_number}`
    : wsPayload.token_number
    ? `Token ${wsPayload.token_number}`
    : wsPayload.service_type || 'Walk-in';

  return {
    orderNumber:  orderNum,
    tableLabel,
    serviceType:  wsPayload.service_type  || wsPayload.source || '',
    customerName: wsPayload.customer_name || '',
    items,
    notes:        wsPayload.special_notes || '',
    timestamp:    wsPayload.timestamp     || new Date().toISOString(),
  };
}

// ─── Build KOT data from a KDS feed item ─────────────────────────────────────
// Used for the manual "Reprint KOT" button on each card.

function buildKOTFromFeedItem(item, allItems) {
  const orderNum = item.order_item?.order?.order_number;

  // Gather all items for this order so the KOT shows the full ticket
  const siblings = orderNum
    ? allItems.filter(i => i.order_item?.order?.order_number === orderNum)
    : [item];

  const items = siblings.map(i => ({
    name: i.order_item?.menu_item?.name ?? i.item_name ?? 'Item',
    qty:  i.order_item?.quantity ?? 1,
  }));

  const tableNum = item.order_item?.order?.table?.table_number;
  const tableLabel = tableNum
    ? `Table ${tableNum}`
    : item.token_number
    ? `Token ${item.token_number}`
    : item.service_type || 'Walk-in';

  return {
    orderNumber:  orderNum?.slice(-8) ?? item.id,
    tableLabel,
    serviceType:  item.service_type || '',
    customerName: '',
    items,
    notes:        item.special_instructions || '',
    timestamp:    item.created_at,
  };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status, isServed }) {
  const map = {
    pending:     { label: 'New',                          cls: 'badge-pending'     },
    in_progress: { label: 'Cooking',                      cls: 'badge-in-progress' },
    ready:       { label: isServed ? 'Served' : 'Ready',  cls: 'badge-ready'       },
    cancelled:   { label: 'Void',                         cls: 'badge-cancelled'   },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'badge-pending' };
  return <span className={`kds-badge ${cls}`}>{label}</span>;
}

function TimerLabel({ createdAt, status, readyAt }) {
  const mins = minutesAgo(createdAt);
  const txt  = mins === 0 ? 'Just now' : mins === 1 ? '1 min ago' : `${mins} mins ago`;

  if (status === 'ready' && readyAt) {
    const minsReady = Math.floor((Date.now() - new Date(toUTC(readyAt))) / 60000);
    const minsLeft  = READY_TIMEOUT_MINS - minsReady;
    if (minsLeft <= 5 && minsLeft > 0)
      return <span className="kds-timer timer-warn">{txt} · clears in {minsLeft}m</span>;
    if (minsLeft <= 0)
      return <span className="kds-timer timer-ok">{txt} · clearing…</span>;
  }

  const cls = mins > 20 ? 'timer-danger' : mins > 12 ? 'timer-warn' : 'timer-ok';
  return <span className={`kds-timer ${cls}`}>{txt}</span>;
}

function itemServiceLabel(item) {
  const tableNum = item.order_item?.order?.table?.table_number;
  if (tableNum) return `Table ${tableNum}`;
  const t = (item.service_type ?? '').toLowerCase();
  if (t.includes('takeaway')) return 'Takeaway';
  if (t.includes('delivery')) return 'Delivery';
  if (t.includes('dine'))     return 'Dine-in';
  return item.order_item?.order?.order_number?.slice(-6) ?? 'Order';
}

function itemServiceIcon(item) {
  const tableNum = item.order_item?.order?.table?.table_number;
  if (tableNum)                                    return '🪑';
  const t = (item.service_type ?? '').toLowerCase();
  if (t.includes('takeaway') || t === 'takeaway')  return '🛍️';
  if (t.includes('delivery'))                      return '🛵';
  return '🍽️';
}

// ─── Item card ────────────────────────────────────────────────────────────────

function ItemCard({ item, allItems, onAdvance, onVoid }) {
  const status = item.status;

  const actionMap = {
    pending:     { label: 'START COOKING', cls: 'btn-action-start',  icon: '▶' },
    in_progress: { label: 'MARK READY',    cls: 'btn-action-ready',  icon: '✓' },
    ready:       { label: 'SERVED ✓',      cls: 'btn-action-served', icon: ''  },
  };
  const action = actionMap[status] ?? actionMap.pending;

  const name     = item.order_item?.menu_item?.name ?? item.item_name ?? 'Item';
  const qty      = item.order_item?.quantity ?? 1;
  const orderNum = item.order_item?.order?.order_number?.slice(-6)
    ?? item.token_number
    ?? item.id;

  const rowCls = {
    pending:     'item-row-pending',
    in_progress: 'item-row-cooking',
    ready:       'item-row-ready',
    cancelled:   'item-row-cancelled',
  }[status] ?? 'item-row-pending';

  const handleReprint = () => printKOT(buildKOTFromFeedItem(item, allItems));

  return (
    <div className={`kds-card status-${status}`}>
      {/* Header */}
      <div className="kds-card-head">
        <div className="kds-card-head-left">
          <span className="kds-service-icon">{itemServiceIcon(item)}</span>
          <div>
            <p className="kds-service-label">{itemServiceLabel(item)}</p>
            <p className="kds-order-id">#{orderNum}</p>
          </div>
        </div>
        <div className="kds-card-head-right">
          <StatusBadge status={status} isServed={false} />
          <TimerLabel
            createdAt={item.created_at}
            status={status}
            readyAt={item.updated_at}
          />
        </div>
      </div>

      {/* Item row */}
      <div className="kds-items">
        <div className={`kds-item-row ${rowCls}`}>
          <span className={`item-check ${status === 'ready' ? 'item-check-done' : ''}`}>
            {status === 'ready' ? '✓' : status === 'in_progress' ? '▶' : '○'}
          </span>
          <span className={`kds-item-name ${status === 'ready' ? 'item-name-done' : ''}`}>
            {name}
          </span>
          <span className="kds-item-qty">×{qty}</span>
        </div>
      </div>

      {/* Special notes */}
      {item.special_instructions && (
        <div className="kds-notes">⚠ {item.special_instructions}</div>
      )}

      {/* Primary action */}
      <div className="kds-card-actions">
        <button
          className={`kds-btn-action ${action.cls} ${status === 'ready' ? 'btn-action-disabled' : ''}`}
          onClick={() => status !== 'ready' && onAdvance(item.id, status)}
          disabled={status === 'ready'}
        >
          {action.icon && <span className="btn-action-icon">{action.icon}</span>}
          {action.label}
        </button>
      </div>

      {/* Footer actions: Void + Reprint */}
      <div className="kds-card-footer">
        {status !== 'ready' && (
          <button className="kds-btn-void" onClick={() => onVoid(item.id)}>
            Void item
          </button>
        )}
        <button className="kds-btn-reprint" onClick={handleReprint}>
          🖨 Reprint KOT
        </button>
      </div>
    </div>
  );
}

// ─── History table ────────────────────────────────────────────────────────────

function HistoryView({ items }) {
  const nowMs = Date.now();
  const hist = items
    .filter(i => {
      if (!isTodayIST(i.created_at)) return false;
      if (i.status === 'cancelled')  return true;
      if (i.status === 'ready') {
        const readyAt   = i.updated_at ?? i.created_at;
        const minsReady = (nowMs - new Date(toUTC(readyAt))) / 60000;
        return minsReady > READY_TIMEOUT_MINS;
      }
      return false;
    })
    .sort((a, b) => new Date(toUTC(b.created_at)) - new Date(toUTC(a.created_at)));

  return (
    <div className="kds-history">
      <div className="kds-history-bar">
        <span>Today's completed &amp; cancelled items</span>
        <span className="kds-history-count">{hist.length} items</span>
      </div>
      {hist.length === 0 ? (
        <div className="kds-empty">
          <p className="kds-empty-icon">📋</p>
          <p>No history yet today</p>
        </div>
      ) : (
        <div className="kds-history-scroll">
          <table className="kds-hist-table">
            <thead>
              <tr>
                <th>Order</th><th>Table / type</th><th>Item</th>
                <th>Qty</th><th>Time</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {hist.map(item => {
                const name = item.order_item?.menu_item?.name
                  ?? item.item_name ?? 'Item';
                const qty      = item.order_item?.quantity ?? 1;
                const orderNum = item.order_item?.order?.order_number?.slice(-6)
                  ?? item.token_number ?? item.id;
                return (
                  <tr key={item.id}>
                    <td className="td-order">#{orderNum}</td>
                    <td>{itemServiceLabel(item)}</td>
                    <td><span className="hist-item">{name}</span></td>
                    <td>×{qty}</td>
                    <td className="td-time">{formatISTTime(item.created_at)}</td>
                    <td><StatusBadge status={item.status} isServed={true} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function KDSScreen() {
  const { apiClient, logout } = useAuth();
  const { connected, updates } = useWebSocket();

  const [allItems, setAllItems]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [filter,   setFilter]     = useState('all');
  const [view,     setView]       = useState('live');
  const [sound,    setSound]      = useState(true);
  const [printMsg, setPrintMsg]   = useState('');   // transient "Printing KOT…" toast

  // Track order numbers that have already been auto-printed this session
  // so a polling refresh doesn't re-print the same KOT
  const printedOrders = useRef(new Set());

  // ── Fetch feed ──────────────────────────────────────────────────────────────
const fetchFeed = useCallback(async () => {
  try {
    const res = await apiClient.get('/api/kds/feed', {
      params: { status: 'all' },
    });
    setAllItems(res.data.items || []);
    return res.data.items || [];
  } catch (err) {
    console.error('[KDS] fetchFeed error:', err);
    return [];
  } finally {
    setLoading(false);
  }
}, [apiClient]);

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, connected ? 3000 : 1000);
    return () => clearInterval(interval);
  }, [fetchFeed, connected]);

  // ── WebSocket ORDER_NEW → auto-print KOT ────────────────────────────────────
  //
  // When the WS fires ORDER_NEW:
  //   1. Play beep (if sound on)
  //   2. Fetch fresh feed (so item names are available)
  //   3. Build KOT from the WS payload + fresh feed items
  //   4. Print immediately
  //   5. Mark this order as printed so polling doesn't reprint
  //
  useEffect(() => {
    if (!updates || updates.length === 0) return;
    const latest = updates[0];
    if (latest?.type !== 'ORDER_NEW') return;

    const orderNum = latest.order_number;
    if (!orderNum || printedOrders.current.has(orderNum)) return;

    // Mark immediately to prevent double-fire if the effect re-runs
    printedOrders.current.add(orderNum);

    if (sound) playBeep();

    // Fetch fresh items so the KOT has real item names, then print
    fetchFeed().then(freshItems => {
      const kotData = buildKOTFromWSPayload(latest, freshItems);
      printKOT(kotData);
      showPrintToast(`KOT printed for #${orderNum}`);
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updates]);

  function showPrintToast(msg) {
    setPrintMsg(msg);
    setTimeout(() => setPrintMsg(''), 3500);
  }

  function playBeep() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const now  = ctx.currentTime;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(660, now + 0.12);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.setValueAtTime(0, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
    } catch (_) {}
  }

  // ── Live item filtering ─────────────────────────────────────────────────────
  const nowMs = Date.now();

  const todayActive = allItems.filter(i =>
    isTodayIST(i.created_at) &&
    ['pending', 'in_progress', 'ready'].includes(i.status)
  );

  const liveItems = todayActive.filter(i => {
    if (i.status !== 'ready') return true;
    const readyAt = i.updated_at ?? i.created_at;
    return (nowMs - new Date(toUTC(readyAt))) / 60000 <= READY_TIMEOUT_MINS;
  });

  liveItems.sort((a, b) => new Date(toUTC(b.created_at)) - new Date(toUTC(a.created_at)));

  const filterItems = (f) =>
    f === 'all' ? liveItems : liveItems.filter(i => i.status === f);

  const displayItems = filterItems(filter);

  const counts = {
    all:         liveItems.length,
    pending:     filterItems('pending').length,
    in_progress: filterItems('in_progress').length,
    ready:       filterItems('ready').length,
  };

  // ── Advance / Void ──────────────────────────────────────────────────────────
  const advanceItem = async (kdsId, currentStatus) => {
    if (currentStatus === 'ready' || currentStatus === 'cancelled') return;
    const nextStatus = currentStatus === 'pending' ? 'in_progress' : 'ready';
    setAllItems(prev => prev.map(i => i.id === kdsId ? { ...i, status: nextStatus } : i));
    try {
      await apiClient.put(`/api/kds/${kdsId}/status`, { status: nextStatus });
      fetchFeed();
    } catch (err) {
      console.error('[KDS] advanceItem error:', err);
      fetchFeed();
    }
  };

  const voidItem = async (kdsId) => {
    setAllItems(prev => prev.map(i => i.id === kdsId ? { ...i, status: 'cancelled' } : i));
    try {
      await apiClient.put(`/api/kds/${kdsId}/status`, { status: 'cancelled' });
      fetchFeed();
    } catch (err) {
      console.error('[KDS] voidItem error:', err);
      fetchFeed();
    }
  };

  if (loading) {
    return (
      <div className="kds-loading">
        <div className="kds-spinner" />
        <p>Loading kitchen display…</p>
      </div>
    );
  }

  return (
    <>
      <style>{KDS_CSS}</style>

      {/* Print toast */}
      {printMsg && (
        <div className="kds-print-toast">
          🖨 {printMsg}
        </div>
      )}

      <div className="kds-root">
        {/* Header */}
        <header className="kds-header">
          <div className="kds-logo">
            <span className={`kds-ws-dot ${connected ? 'dot-live' : 'dot-offline'}`} />
            <span>Kitchen display</span>
            <span className="kds-ws-label">{connected ? '• live' : '• offline'}</span>
          </div>

          <div className="kds-header-tabs">
            <button
              className={`kds-tab ${view === 'live' ? 'kds-tab-active' : ''}`}
              onClick={() => setView('live')}
            >Live orders</button>
            <button
              className={`kds-tab ${view === 'history' ? 'kds-tab-active' : ''}`}
              onClick={() => setView('history')}
            >History</button>
          </div>

          <div className="kds-header-right">
            <button
              className={`kds-sound-btn ${sound ? 'sound-on' : ''}`}
              onClick={() => setSound(s => !s)}
            >
              {sound ? '🔔 Sound on' : '🔇 Sound off'}
            </button>
            <button className="kds-logout-btn" onClick={logout}>↩ Logout</button>
          </div>
        </header>

        {/* Live view */}
        {view === 'live' && (
          <>
            <div className="kds-filter-bar">
              {[
                { key: 'all',         label: 'All active' },
                { key: 'pending',     label: 'New'        },
                { key: 'in_progress', label: 'Cooking'    },
                { key: 'ready',       label: 'Ready'      },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className={`kds-filter-pill ${filter === key ? 'pill-active' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span className="pill-count">{counts[key]}</span>
                </button>
              ))}
              <span className="kds-sort-hint">Today · newest first</span>
            </div>

            <div className="kds-board">
              {displayItems.length === 0 ? (
                <div className="kds-empty">
                  <p className="kds-empty-icon">😎</p>
                  <p>{filter === 'all' ? 'No active orders right now' : `No ${filter.replace('_', ' ')} orders`}</p>
                  <p className="kds-empty-sub">Kitchen is caught up</p>
                </div>
              ) : (
                displayItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    allItems={allItems}
                    onAdvance={advanceItem}
                    onVoid={voidItem}
                  />
                ))
              )}
            </div>
          </>
        )}

        {view === 'history' && <HistoryView items={allItems} />}
      </div>
    </>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const KDS_CSS = `
  .kds-root {
    height: 100vh; display: flex; flex-direction: column;
    background: #0d0d0d; color: #f0f0f0;
    font-family: system-ui, -apple-system, sans-serif; overflow: hidden;
  }
  .kds-loading {
    height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: #0d0d0d; color: #888; gap: 16px; font-size: 15px;
  }
  .kds-spinner {
    width: 40px; height: 40px; border: 3px solid #2a2a2a;
    border-top-color: #3b82f6; border-radius: 50%;
    animation: kds-spin 0.8s linear infinite;
  }
  @keyframes kds-spin { to { transform: rotate(360deg); } }

  /* Print toast */
  .kds-print-toast {
    position: fixed; top: 16px; right: 20px; z-index: 9999;
    background: #1a3a1a; color: #86efac;
    border: 1px solid #22c55e44; border-radius: 8px;
    padding: 10px 16px; font-size: 13px; font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,.5);
    animation: toast-in .2s ease;
  }
  @keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }

  .kds-header {
    background: #111; border-bottom: 1px solid #1e1e1e;
    padding: 10px 20px; display: flex; align-items: center; gap: 16px; flex-shrink: 0;
  }
  .kds-logo { font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 7px; color: #f0f0f0; }
  .kds-ws-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .dot-live    { background: #22c55e; }
  .dot-offline { background: #ef4444; }
  .kds-ws-label { font-size: 12px; color: #555; font-weight: 400; }
  .kds-header-tabs {
    display: flex; gap: 2px; background: #1a1a1a;
    border-radius: 7px; padding: 3px; margin-left: 8px;
  }
  .kds-tab {
    padding: 5px 14px; border-radius: 5px; font-size: 13px;
    cursor: pointer; border: none; background: transparent;
    color: #666; font-weight: 400; transition: all .15s;
  }
  .kds-tab-active { background: #2a2a2a; color: #f0f0f0; font-weight: 500; }
  .kds-header-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .kds-sound-btn {
    padding: 5px 12px; border-radius: 6px; font-size: 12px;
    border: 0.5px solid #2a2a2a; background: transparent; color: #666; cursor: pointer;
  }
  .kds-sound-btn.sound-on { color: #22c55e; border-color: #22c55e44; }
  .kds-logout-btn {
    padding: 5px 12px; border-radius: 6px; font-size: 12px;
    border: 0.5px solid #2a2a2a; background: transparent; color: #666; cursor: pointer;
  }
  .kds-logout-btn:hover { color: #f0f0f0; border-color: #444; }

  .kds-filter-bar {
    background: #0d0d0d; border-bottom: 1px solid #1a1a1a;
    padding: 10px 20px; display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  }
  .kds-filter-pill {
    padding: 4px 12px; border-radius: 20px; font-size: 12px;
    border: 0.5px solid #2a2a2a; background: transparent; color: #666;
    cursor: pointer; display: flex; align-items: center; gap: 5px;
    white-space: nowrap; transition: all .15s;
  }
  .kds-filter-pill:hover { border-color: #444; color: #aaa; }
  .pill-active { background: #1e1e1e; color: #f0f0f0; border-color: #444; }
  .pill-count { font-size: 11px; background: #2a2a2a; padding: 1px 6px; border-radius: 10px; color: #aaa; }
  .pill-active .pill-count { background: #333; color: #f0f0f0; }
  .kds-sort-hint { margin-left: auto; font-size: 11px; color: #444; }

  .kds-board {
    flex: 1; overflow-y: auto; padding: 16px 20px;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px; align-content: start;
  }

  .kds-empty {
    grid-column: 1 / -1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; padding: 80px 0; gap: 8px;
  }
  .kds-empty-icon { font-size: 44px; }
  .kds-empty p   { font-size: 16px; color: #555; }
  .kds-empty-sub { font-size: 13px; color: #383838; }

  .kds-card {
    background: #141414; border-radius: 12px; border: 2px solid #252525;
    display: flex; flex-direction: column; overflow: hidden; transition: border-color .2s;
  }
  .kds-card.status-pending     { border-color: #ef4444; }
  .kds-card.status-in_progress { border-color: #f97316; }
  .kds-card.status-ready       { border-color: #22c55e; }
  .kds-card.status-cancelled   { opacity: .4; border-color: #374151; }

  .kds-card-head {
    padding: 12px 14px 10px; display: flex; align-items: flex-start;
    justify-content: space-between; border-bottom: 1px solid #1a1a1a;
  }
  .kds-card-head-left { display: flex; align-items: center; gap: 9px; }
  .kds-service-icon   { font-size: 20px; line-height: 1; }
  .kds-service-label  { font-size: 16px; font-weight: 500; color: #f0f0f0; }
  .kds-order-id       { font-size: 11px; color: #555; margin-top: 2px; }
  .kds-card-head-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }

  .kds-badge {
    font-size: 11px; padding: 3px 9px; border-radius: 12px;
    font-weight: 600; white-space: nowrap; letter-spacing: .04em; text-transform: uppercase;
  }
  .badge-pending     { background: #ef444422; color: #fca5a5; border: 1px solid #ef444466; }
  .badge-in-progress { background: #f9731622; color: #fdba74; border: 1px solid #f9731666; }
  .badge-ready       { background: #22c55e22; color: #86efac; border: 1px solid #22c55e66; }
  .badge-cancelled   { background: #1f2937;   color: #6b7280; border: 1px solid #374151;   }

  .kds-timer    { font-size: 11px; }
  .timer-danger { color: #ef4444; font-weight: 600; }
  .timer-warn   { color: #f97316; }
  .timer-ok     { color: #555; }

  .kds-items { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .kds-item-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 8px; border-left: 3px solid transparent;
    transition: background .1s; min-height: 44px;
  }
  .item-row-pending     { background: #ef444418; border-left-color: #ef4444; }
  .item-row-cooking     { background: #f9731618; border-left-color: #f97316; }
  .item-row-ready       { background: #22c55e18; border-left-color: #22c55e; }
  .item-row-cancelled   { background: #1f293733; border-left-color: #374151; opacity: .5; }

  .item-check { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; color: #555; }
  .item-row-pending .item-check   { color: #ef4444; }
  .item-row-cooking .item-check   { color: #f97316; }
  .item-check-done                { color: #22c55e !important; }

  .kds-item-name { font-size: 14px; color: #e0e0e0; flex: 1; line-height: 1.3; }
  .item-row-pending .kds-item-name     { color: #fca5a5; }
  .item-row-cooking .kds-item-name     { color: #fdba74; }
  .item-row-ready   .kds-item-name     { color: #86efac; }
  .item-row-cancelled .kds-item-name   { color: #6b7280; text-decoration: line-through; }
  .item-name-done { text-decoration: line-through; color: #86efac !important; }

  .kds-item-qty { font-size: 13px; color: #666; flex-shrink: 0; font-weight: 500; }

  .kds-notes {
    margin: 2px 12px 8px; padding: 8px 10px; border-radius: 6px;
    border-left: 3px solid #eab308; background: #eab30810;
    font-size: 12px; color: #fde68a; line-height: 1.4;
  }

  .kds-card-actions { padding: 10px 12px 4px; }

  .kds-btn-action {
    width: 100%; padding: 16px; border-radius: 10px;
    font-size: 15px; font-weight: 700; letter-spacing: .06em;
    border: none; cursor: pointer; display: flex; align-items: center;
    justify-content: center; gap: 8px; transition: opacity .1s, transform .1s;
    -webkit-tap-highlight-color: transparent;
  }
  .kds-btn-action:active { opacity: 0.85; transform: scale(0.98); }
  .btn-action-start  { background: #1d4ed8; color: #fff; }
  .btn-action-ready  { background: #15803d; color: #fff; }
  .btn-action-served { background: #1a2e1a; color: #22c55e; cursor: default; }
  .btn-action-disabled { opacity: 1; }
  .btn-action-icon   { font-size: 16px; }

  /* Card footer: void + reprint side by side */
  .kds-card-footer {
    display: flex; align-items: center;
    padding: 0 8px 8px; gap: 4px;
  }
  .kds-btn-void {
    flex: 1; padding: 9px; background: transparent; border: none;
    color: #3f3f3f; font-size: 12px; cursor: pointer; text-align: center;
    transition: color .15s; border-radius: 6px;
  }
  .kds-btn-void:hover  { color: #ef4444; background: #ef444410; }
  .kds-btn-reprint {
    flex: 1; padding: 9px; background: transparent;
    border: 0.5px solid #2a2a2a; color: #555; font-size: 12px;
    cursor: pointer; text-align: center; border-radius: 6px; transition: all .15s;
  }
  .kds-btn-reprint:hover { color: #f0f0f0; border-color: #555; background: #1a1a1a; }

  /* History */
  .kds-history { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .kds-history-bar {
    padding: 10px 20px; border-bottom: 1px solid #1a1a1a;
    display: flex; align-items: center; font-size: 13px; color: #666;
  }
  .kds-history-count { margin-left: auto; font-size: 12px; color: #444; }
  .kds-history-scroll { flex: 1; overflow-y: auto; padding: 0 20px 20px; }
  .kds-hist-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .kds-hist-table th {
    text-align: left; padding: 10px 12px; color: #555; font-weight: 400;
    border-bottom: 1px solid #1a1a1a; font-size: 11px;
    text-transform: uppercase; letter-spacing: .05em;
  }
  .kds-hist-table td {
    padding: 10px 12px; border-bottom: 1px solid #141414;
    color: #888; vertical-align: top;
  }
  .kds-hist-table tr:hover td { background: #111; }
  .td-order { color: #d0d0d0; font-weight: 500; }
  .td-time  { color: #555; }
  .hist-item { font-size: 12px; color: #666; }
`;
