// ============================================================================
// AUTOM8 FRONTEND - KDS SCREEN (REDESIGNED)
// src/pages/KDSScreen.jsx
//
// CHANGES FROM PREVIOUS VERSION
// ──────────────────────────────
//  1. Orders grouped per order-card (all items inside one card) rather than
//     one card per KDS item. Item-level status dots + buttons sit inside each
//     order card, matching how a kitchen actually works.
//  2. Today-only filter applied client-side; historical orders live in a
//     separate "History" tab with a table view.
//  3. Newest first sort within each filter group.
//  4. Subscription gate flicker fixed: KDS no longer calls /api/subscription
//     on mount; it goes straight to fetching the feed. The gate is handled
//     by the router/ProtectedRoute, not inside the screen.
//  5. FIX 11 retained: backend always queried with status=all; all client-side
//     filtering so tab counts are always correct.
//  6. All prior null-guards (Fix 4/5) and optimistic update (Fix 2) kept.
//  7. "Mark all ready" now calls POST /api/orders/:id/complete instead of N
//     parallel PUT /api/kds/:id/status calls, eliminating the race condition
//     that could fire duplicate WhatsApp notifications. The new endpoint
//     atomically marks all items ready and sends exactly one notification.
//     Individual item-level PUT calls are unchanged.
//  8. Timezone fix: isToday and display comparisons now use IST (UTC+5:30)
//     via isTodayIST() helper instead of browser-local time, so the "today"
//     filter and timer labels are correct for Indian restaurants.
//  9. Item-level color rows: each item shows red/amber/green background pill
//     matching its own status, independent of the overall order status.
//     Card border still reflects the worst item (red if any pending, etc).
// 10. Subscription flicker: KDSScreen no longer participates in subscription
//     gating at all. The fix for the flicker is in the router/ProtectedRoute:
//     see NOTE below in the component body.
//     parallel PUT /api/kds/:id/status calls, eliminating the race condition
//     that could fire duplicate WhatsApp notifications. The new endpoint
//     atomically marks all items ready and sends exactly one notification.
//     Individual item-level PUT calls are unchanged.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { formatDistanceToNow } from 'date-fns';

// ─── helpers ─────────────────────────────────────────────────────────────────

function deriveOrderStatus(kdsItems) {
  if (!kdsItems || kdsItems.length === 0) return 'pending';
  const statuses = kdsItems.map(i => i.status);
  if (statuses.every(s => s === 'ready'))      return 'ready';
  if (statuses.every(s => s === 'cancelled'))  return 'cancelled';
  if (statuses.some(s => s === 'in_progress')) return 'in_progress';
  return 'pending';
}

function groupItemsByOrder(rawItems) {
  // Each kds_item may have order_item.order.order_number as the grouping key.
  // Fallback: group by token_number, then by item id (ungrouped).
  const groups = new Map();

  for (const item of rawItems) {
    const orderNum =
      item.order_item?.order?.order_number ??
      item.token_number ??
      item.id; // last resort: single-item group

    if (!groups.has(orderNum)) {
      groups.set(orderNum, {
        orderNumber:  orderNum,
        orderId:      item.order_item?.order_id ?? null,
        tableNumber:  item.order_item?.order?.table?.table_number ?? item.table_number ?? null,
        tableSection: item.order_item?.order?.table?.section ?? null,
        serviceType:  item.service_type ?? null,
        createdAt:    item.created_at,
        readyAt:      null, // set below when all items are ready
        specialNotes: item.special_instructions ?? null,
        items:        [],
      });
    }

    const g = groups.get(orderNum);

    // Keep the earliest created_at as the group timestamp
    if (item.created_at < g.createdAt) g.createdAt = item.created_at;

    // Fill in orderId from first item that has it
    if (!g.orderId && item.order_item?.order_id)
      g.orderId = item.order_item.order_id;

    // Merge special notes (first non-null wins)
    if (!g.specialNotes && item.special_instructions)
      g.specialNotes = item.special_instructions;

    g.items.push({
      kdsId:    item.id,
      name:     item.order_item?.menu_item?.name ?? item.item_name ?? item.order_item?.special_instructions ?? 'Item',
      qty:      item.order_item?.quantity ?? 1,
      status:   item.status,
      priority: item.priority ?? 'normal',
    });
  }

  // For groups where all items are ready, set readyAt to the latest
  // updated_at among items — this is when the last item was marked ready.
  for (const g of groups.values()) {
    if (g.items.length > 0 && g.items.every(i => i.status === 'ready' || i.status === 'cancelled')) {
      // Use updated_at from the raw items if available, else fall back to createdAt
      const readyTimes = g.items
        .filter(i => i.status === 'ready')
        .map(i => {
          // Find the raw item to get updated_at
          const raw = rawItems.find(r => r.id === i.kdsId);
          return raw?.updated_at ?? raw?.created_at ?? g.createdAt;
        })
        .filter(Boolean);
      if (readyTimes.length > 0) {
        g.readyAt = readyTimes.reduce((latest, t) => t > latest ? t : latest);
      }
    }
  }

  return Array.from(groups.values());
}

// ── Timezone helpers ────────────────────────────────────────────────────────
// Supabase always returns timestamps in UTC (Z or +00:00 suffix).
// We NEVER use Date.getTimezoneOffset() — it varies per browser locale and
// caused a double-offset bug in IST browsers (returns -330, so subtracting
// it added 330 again = +660 mins instead of +330).
// Instead we always add a fixed 5.5 hr constant to UTC ms.

const IST_OFFSET_MS    = 5.5 * 60 * 60 * 1000; // 330 min in ms

// Ready orders auto-move to History after this many minutes.
const READY_TIMEOUT_MINS = 20;

// Supabase returns timestamps as "2026-05-22 08:19:09.68241" —
// space separator, no Z, no +00:00. JS parses these inconsistently:
// IST browsers treat them as local (IST) time, UTC browsers as UTC.
// We normalise to a proper UTC ISO string before any Date() call.
function toUTC(iso) {
  if (!iso) return iso;
  // Replace space separator with T, strip trailing timezone if any,
  // then append Z to force UTC interpretation.
  return iso.toString().replace(' ', 'T').replace(/([+-]\d{2}:\d{2}|Z)$/, '') + 'Z';
}

// Returns "YYYY-MM-DD" as it appears on a clock in India for any UTC timestamp.
function getISTDateStr(iso) {
  const istMs = new Date(toUTC(iso)).getTime() + IST_OFFSET_MS;
  return new Date(istMs).toISOString().slice(0, 10);
}

// Today's IST date string — browser-timezone-agnostic.
function todayISTStr() {
  return getISTDateStr(new Date().toISOString());
}

// Elapsed time in minutes. Pure UTC ms difference — always correct.
function minutesAgo(iso) {
  return Math.floor((Date.now() - new Date(toUTC(iso))) / 60000);
}

// True if the UTC timestamp falls on today's IST calendar date.
function isTodayIST(iso) {
  return getISTDateStr(iso) === todayISTStr();
}

function serviceLabel(group) {
  if (group.tableNumber)  return `Table ${group.tableNumber}`;
  const t = group.serviceType?.toLowerCase() ?? '';
  if (t.includes('takeaway') || t === 'takeaway') return 'Takeaway';
  if (t.includes('delivery'))                     return 'Delivery';
  if (t.includes('dine'))                         return 'Dine-in';
  return group.orderNumber?.slice(-6) ?? 'Order';
}

function serviceIcon(group) {
  const t = group.serviceType?.toLowerCase() ?? '';
  if (group.tableNumber)                          return '🪑';
  if (t.includes('takeaway') || t === 'takeaway') return '🛍️';
  if (t.includes('delivery'))                     return '🛵';
  return '🍽️';
}

// ─── sub-components ──────────────────────────────────────────────────────────
// Industry standard KDS UX (Toast, Square, TouchBistro):
//   • 3 states: NEW → COOKING → SERVED
//   • Tap the whole card/button to advance — large touch targets for kitchens
//   • Items show strikethrough when done (TouchBistro style)
//   • Color: red=new, amber=cooking, green=ready

function StatusBadge({ status, isServed }) {
  const map = {
    pending:     { label: 'New',      cls: 'badge-pending'     },
    in_progress: { label: 'Cooking',  cls: 'badge-in-progress' },
    ready:       { label: isServed ? 'Served' : 'Ready',  cls: 'badge-ready' },
    cancelled:   { label: 'Void',     cls: 'badge-cancelled'   },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'badge-pending' };
  return <span className={`kds-badge ${cls}`}>{label}</span>;
}

// Item row: tappable to advance individually, strikethrough when done
function ItemRow({ item, onAdvance }) {
  const rowCls = {
    pending:     'item-row-pending',
    in_progress: 'item-row-cooking',
    ready:       'item-row-ready',
    cancelled:   'item-row-cancelled',
  }[item.status] ?? 'item-row-pending';

  const canTap = item.status === 'pending' || item.status === 'in_progress';

  return (
    <div
      className={`kds-item-row ${rowCls} ${canTap ? 'item-row-tappable' : ''}`}
      onClick={canTap ? () => onAdvance(item.kdsId, item.status) : undefined}
    >
      {/* Checkbox-style indicator */}
      <span className={`item-check ${item.status === 'ready' ? 'item-check-done' : ''}`}>
        {item.status === 'ready' ? '✓' : item.status === 'in_progress' ? '▶' : '○'}
      </span>
      <span className={`kds-item-name ${item.status === 'ready' ? 'item-name-done' : ''}`}>
        {item.name}
      </span>
      <span className="kds-item-qty">×{item.qty}</span>
    </div>
  );
}

function TimerLabel({ createdAt, status, readyAt }) {
  const mins = minutesAgo(createdAt);
  const txt  = mins === 0 ? 'Just now' : mins === 1 ? '1 min ago' : `${mins} mins ago`;

  // For ready orders: show how long until auto-retirement
  if (status === 'ready' && readyAt) {
    const minsReady   = Math.floor((Date.now() - new Date(toUTC(readyAt))) / 60000);
    const minsLeft    = READY_TIMEOUT_MINS - minsReady;
    if (minsLeft <= 5 && minsLeft > 0) {
      return (
        <span className="kds-timer timer-warn">
          {txt} · clears in {minsLeft}m
        </span>
      );
    }
    if (minsLeft <= 0) {
      return <span className="kds-timer timer-ok">{txt} · clearing…</span>;
    }
  }

  const cls = mins > 20 ? 'timer-danger' : mins > 12 ? 'timer-warn' : 'timer-ok';
  return <span className={`kds-timer ${cls}`}>{txt}</span>;
}

// ─── Order card ──────────────────────────────────────────────────────────────
// Touch-first design:
//   • BIG action button at the bottom — easy to tap with a finger
//   • Action label changes with state: START COOKING → MARK READY → SERVED ✓
//   • Items tappable individually to advance one at a time
//   • Void (cancel) is a small secondary link, not equal weight to the action

function OrderCard({ group, onAdvanceItem, onAdvanceAll, onCancel }) {
  const orderStatus = deriveOrderStatus(group.items);
  const cardCls     = `kds-card status-${orderStatus}`;

  // Primary action config per state
  const actionMap = {
    pending:     { label: 'START COOKING',  cls: 'btn-action-start',  icon: '▶' },
    in_progress: { label: 'MARK READY',     cls: 'btn-action-ready',  icon: '✓' },
    ready:       { label: 'SERVED ✓',       cls: 'btn-action-served', icon: ''  },
  };
  const action = actionMap[orderStatus] ?? actionMap.pending;

  return (
    <div className={cardCls}>
      {/* Header — service type + timer */}
      <div className="kds-card-head">
        <div className="kds-card-head-left">
          <span className="kds-service-icon">{serviceIcon(group)}</span>
          <div>
            <p className="kds-service-label">{serviceLabel(group)}</p>
            <p className="kds-order-id">#{group.orderNumber?.slice(-6)}</p>
          </div>
        </div>
        <div className="kds-card-head-right">
          <StatusBadge status={orderStatus} isServed={false} />
          <TimerLabel
            createdAt={group.createdAt}
            status={orderStatus}
            readyAt={group.readyAt}
          />
        </div>
      </div>

      {/* Items — tap individually to advance */}
      <div className="kds-items">
        {group.items.map(item => (
          <ItemRow key={item.kdsId} item={item} onAdvance={onAdvanceItem} />
        ))}
      </div>

      {/* Special notes */}
      {group.specialNotes && (
        <div className="kds-notes">
          ⚠ {group.specialNotes}
        </div>
      )}

      {/* Primary action — large touch target */}
      <div className="kds-card-actions">
        <button
          className={`kds-btn-action ${action.cls} ${orderStatus === 'ready' ? 'btn-action-disabled' : ''}`}
          onClick={() => orderStatus !== 'ready' && onAdvanceAll(group)}
          disabled={orderStatus === 'ready'}
        >
          {action.icon && <span className="btn-action-icon">{action.icon}</span>}
          {action.label}
        </button>
      </div>

      {/* Void — small secondary, below main action */}
      {orderStatus !== 'ready' && (
        <button
          className="kds-btn-void"
          onClick={() => onCancel(group.orderNumber)}
        >
          Void order
        </button>
      )}
    </div>
  );
}

// ─── History table ────────────────────────────────────────────────────────────

function HistoryView({ items }) {
  // Show cancelled + ready items from today
  // History shows today's cancelled items + ready items that have timed out
  // of the live board (> READY_TIMEOUT_MINS since marked ready).
  // We group first, then filter by timeout at group level — same logic as live board.
  const histAllGroups = groupItemsByOrder(
    items.filter(i =>
      isTodayIST(i.created_at) &&
      ['ready', 'cancelled'].includes(i.status)
    )
  );
  const histNowMs = Date.now();
  const hist = histAllGroups.filter(g => {
    const s = deriveOrderStatus(g.items);
    if (s === 'cancelled') return true;
    // For ready groups: only show in history once they've timed out of live board
    if (s === 'ready' && g.readyAt) {
      const minsReady = (histNowMs - new Date(toUTC(g.readyAt))) / 60000;
      return minsReady > READY_TIMEOUT_MINS;
    }
    return false;
  });
  const groups = [...hist].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="kds-history">
      <div className="kds-history-bar">
        <span>Today's completed &amp; cancelled orders</span>
        <span className="kds-history-count">{groups.length} orders</span>
      </div>
      {groups.length === 0 ? (
        <div className="kds-empty">
          <p className="kds-empty-icon">📋</p>
          <p>No history yet today</p>
        </div>
      ) : (
        <div className="kds-history-scroll">
          <table className="kds-hist-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Table / type</th>
                <th>Items</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.orderNumber}>
                  <td className="td-order">#{g.orderNumber?.slice(-6)}</td>
                  <td>{serviceLabel(g)}</td>
                  <td>
                    <div className="hist-items">
                      {g.items.map((item, idx) => (
                        <span key={idx} className="hist-item">
                          {item.name} ×{item.qty}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="td-time">
                    {new Date(toUTC(g.createdAt)).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <StatusBadge status={deriveOrderStatus(g.items)} isServed={true} />
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

// ─── Main screen ──────────────────────────────────────────────────────────────

// ─── SUBSCRIPTION FLICKER FIX ────────────────────────────────────────────────
// If you see "Dine-in ordering isn't enabled" flash before the KDS loads,
// the bug is in your ProtectedRoute / subscription check wrapper, NOT here.
// The fix: in whatever component calls GET /api/subscription and shows the
// gate UI, add a loading guard so it only shows the error AFTER the fetch
// resolves — never while isLoading is true. Example:
//
//   if (isLoading) return null;          // ← add this line
//   if (!features.includes('kds')) return <SubscriptionWall />;
//
// This KDSScreen itself does not call /api/subscription.
// ─────────────────────────────────────────────────────────────────────────────

export default function KDSScreen() {
  const { apiClient, logout } = useAuth();
  const { connected, updates } = useWebSocket();

  const [allItems, setAllItems]   = useState([]);   // raw kds_items from server
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('all');
  const [view, setView]           = useState('live'); // 'live' | 'history'
  const [sound, setSound]         = useState(true);

  // ── Fetch all KDS items (always status=all, FIX 11) ──────────────────────
  const fetchFeed = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/kds/feed', { params: { status: 'all' } });
      setAllItems(res.data.items || []);
    } catch (err) {
      console.error('[KDS] fetchFeed error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  // Adaptive poll: 1 s when WebSocket is offline, 3 s when live
  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, connected ? 3000 : 1000);
    return () => clearInterval(interval);
  }, [fetchFeed, connected]);

  // Sound on new ORDER_NEW broadcast
  useEffect(() => {
    if (!sound || !updates.length) return;
    if (updates[0]?.type === 'ORDER_NEW') playBeep();
  }, [updates, sound]);

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

  // ── Derive today's live groups ────────────────────────────────────────────
  // todayActive: all kds_items from today (any active status).
  // Timeout check is done AFTER grouping at the group level,
  // using group.readyAt which is reliably computed from the last
  // item's updated_at — not the potentially-stale individual item timestamp.
  const todayActive = allItems.filter(i =>
    isTodayIST(i.created_at) &&
    ['pending', 'in_progress', 'ready'].includes(i.status)
  );

  const allGroups = groupItemsByOrder(todayActive);
  allGroups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const nowMs = Date.now();

  // Auto-retire: exclude ready groups whose readyAt exceeds the timeout.
  // readyAt is set in groupItemsByOrder() as the max updated_at of ready items,
  // so this check is reliable — it uses actual "time since marked ready"
  // not the order's original created_at.
  const isTimedOut = (group) => {
    if (deriveOrderStatus(group.items) !== 'ready') return false;
    if (!group.readyAt) return false; // readyAt not set → not fully ready yet
    const minsReady = (nowMs - new Date(toUTC(group.readyAt))) / 60000;
    return minsReady > READY_TIMEOUT_MINS;
  };

  const liveGroups = allGroups.filter(g => !isTimedOut(g));

  const filterGroups = (f) => {
    if (f === 'all') return liveGroups;
    return liveGroups.filter(g => deriveOrderStatus(g.items) === f);
  };

  const displayGroups = filterGroups(filter);

  const counts = {
    all:         liveGroups.length,
    pending:     filterGroups('pending').length,
    in_progress: filterGroups('in_progress').length,
    ready:       filterGroups('ready').length,
  };

  // ── Item-level advance ────────────────────────────────────────────────────
  const advanceItem = async (kdsId, currentStatus) => {
    // Guard: don't advance beyond ready (prevents any double-tap race)
    if (currentStatus === 'ready' || currentStatus === 'cancelled') return;
    const nextStatus = currentStatus === 'pending' ? 'in_progress' : 'ready';
    // Optimistic update
    setAllItems(prev =>
      prev.map(i => i.id === kdsId ? { ...i, status: nextStatus } : i)
    );
    try {
      await apiClient.put(`/api/kds/${kdsId}/status`, { status: nextStatus });
      fetchFeed(); // sync side-effects (e.g. customer WhatsApp notify)
    } catch (err) {
      console.error('[KDS] advanceItem error:', err);
      fetchFeed(); // revert on error
    }
  };

  // ── Order-level advance (all items together) ─────────────────────────────
  //
  // "Start all" (pending → in_progress): still uses parallel item-level PUTs
  //   because there is no race risk — no notification fires on this transition.
  //
  // "Mark all ready" (in_progress → ready): calls POST /api/orders/:id/complete
  //   which atomically marks every item ready and fires exactly ONE WhatsApp
  //   notification server-side, eliminating the duplicate-notify race.
  const advanceAll = async (group) => {
    const orderStatus = deriveOrderStatus(group.items);

    // ── "Start all": pending → in_progress ──────────────────────────────────
    if (orderStatus === 'pending') {
      const toStart = group.items.filter(i => i.status === 'pending');
      // Optimistic update
      setAllItems(prev =>
        prev.map(i => toStart.find(t => t.kdsId === i.id) ? { ...i, status: 'in_progress' } : i)
      );
      try {
        await Promise.all(
          toStart.map(item =>
            apiClient.put(`/api/kds/${item.kdsId}/status`, { status: 'in_progress' })
          )
        );
        fetchFeed();
      } catch (err) {
        console.error('[KDS] advanceAll (start) error:', err);
        fetchFeed();
      }
      return;
    }

    // ── "Mark all ready": in_progress → ready ────────────────────────────────
    // Resolve the order_id from the group (set by groupItemsByOrder)
    const orderId = group.orderId ?? null;

    if (!orderId) {
      // Fallback: no order_id resolvable (e.g. orphaned KDS items from old data)
      // Fall back to parallel PUTs so the UI isn't broken
      console.warn('[KDS] advanceAll: could not resolve order_id, falling back to parallel PUTs');
      const toReady = group.items.filter(i => i.status !== 'ready' && i.status !== 'cancelled');
      setAllItems(prev =>
        prev.map(i => toReady.find(t => t.kdsId === i.id) ? { ...i, status: 'ready' } : i)
      );
      try {
        await Promise.all(
          toReady.map(item =>
            apiClient.put(`/api/kds/${item.kdsId}/status`, { status: 'ready' })
          )
        );
      } catch (err) {
        console.error('[KDS] advanceAll (ready fallback) error:', err);
      }
      fetchFeed();
      return;
    }

    // Optimistic: mark all active items ready in local state immediately
    const activeKdsIds = group.items
      .filter(i => i.status !== 'cancelled')
      .map(i => i.kdsId);
    setAllItems(prev =>
      prev.map(i => activeKdsIds.includes(i.id) ? { ...i, status: 'ready' } : i)
    );

    try {
      await apiClient.post(`/api/orders/${orderId}/complete`);
      fetchFeed();
    } catch (err) {
      console.error('[KDS] advanceAll (complete) error:', err);
      fetchFeed(); // revert optimistic update on error
    }
  };

  // ── Cancel order (mark all items cancelled) ──────────────────────────────
  const cancelOrder = async (orderNumber) => {
    const group = allGroups.find(g => g.orderNumber === orderNumber);
    if (!group) return;
    const toCancel = group.items.filter(i => i.status !== 'cancelled');
    setAllItems(prev =>
      prev.map(i => toCancel.find(t => t.kdsId === i.id) ? { ...i, status: 'cancelled' } : i)
    );
    try {
      await Promise.all(
        toCancel.map(item => apiClient.put(`/api/kds/${item.kdsId}/status`, { status: 'cancelled' }))
      );
      fetchFeed();
    } catch (err) {
      console.error('[KDS] cancelOrder error:', err);
      fetchFeed();
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="kds-loading">
        <div className="kds-spinner" />
        <p>Loading kitchen display…</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{KDS_CSS}</style>

      <div className="kds-root">
        {/* ── Header ─────────────────────────────────────────────────────── */}
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
            >
              Live orders
            </button>
            <button
              className={`kds-tab ${view === 'history' ? 'kds-tab-active' : ''}`}
              onClick={() => setView('history')}
            >
              History
            </button>
          </div>

          <div className="kds-header-right">
            <button
              className={`kds-sound-btn ${sound ? 'sound-on' : ''}`}
              onClick={() => setSound(s => !s)}
            >
              {sound ? '🔔 Sound on' : '🔇 Sound off'}
            </button>
            <button className="kds-logout-btn" onClick={logout}>
              ↩ Logout
            </button>
          </div>
        </header>

        {/* ── Live view ──────────────────────────────────────────────────── */}
        {view === 'live' && (
          <>
            <div className="kds-filter-bar">
              {[
                { key: 'all',         label: 'All active' },
                { key: 'pending',     label: 'New' },
                { key: 'in_progress', label: 'Cooking' },
                { key: 'ready',       label: 'Ready' },
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
              {displayGroups.length === 0 ? (
                <div className="kds-empty">
                  <p className="kds-empty-icon">😎</p>
                  <p>
                    {filter === 'all'
                      ? 'No active orders right now'
                      : `No ${filter.replace('_', ' ')} orders`}
                  </p>
                  <p className="kds-empty-sub">Kitchen is caught up</p>
                </div>
              ) : (
                displayGroups.map(group => (
                  <OrderCard
                    key={group.orderNumber}
                    group={group}
                    onAdvanceItem={advanceItem}
                    onAdvanceAll={advanceAll}
                    onCancel={cancelOrder}
                  />
                ))
              )}
            </div>
          </>
        )}

        {/* ── History view ───────────────────────────────────────────────── */}
        {view === 'history' && <HistoryView items={allItems} />}
      </div>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const KDS_CSS = `
  .kds-root {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #0d0d0d;
    color: #f0f0f0;
    font-family: system-ui, -apple-system, sans-serif;
    overflow: hidden;
  }

  /* Loading */
  .kds-loading {
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0d0d0d;
    color: #888;
    gap: 16px;
    font-size: 15px;
  }
  .kds-spinner {
    width: 40px; height: 40px;
    border: 3px solid #2a2a2a;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: kds-spin 0.8s linear infinite;
  }
  @keyframes kds-spin { to { transform: rotate(360deg); } }

  /* Header */
  .kds-header {
    background: #111;
    border-bottom: 1px solid #1e1e1e;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
  }
  .kds-logo {
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 7px;
    color: #f0f0f0;
  }
  .kds-ws-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .dot-live    { background: #22c55e; }
  .dot-offline { background: #ef4444; }
  .kds-ws-label { font-size: 12px; color: #555; font-weight: 400; }
  .kds-header-tabs {
    display: flex;
    gap: 2px;
    background: #1a1a1a;
    border-radius: 7px;
    padding: 3px;
    margin-left: 8px;
  }
  .kds-tab {
    padding: 5px 14px;
    border-radius: 5px;
    font-size: 13px;
    cursor: pointer;
    border: none;
    background: transparent;
    color: #666;
    font-weight: 400;
    transition: all .15s;
  }
  .kds-tab-active { background: #2a2a2a; color: #f0f0f0; font-weight: 500; }
  .kds-header-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .kds-sound-btn {
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 12px;
    border: 0.5px solid #2a2a2a;
    background: transparent;
    color: #666;
    cursor: pointer;
    transition: all .15s;
  }
  .kds-sound-btn.sound-on { color: #22c55e; border-color: #22c55e44; }
  .kds-logout-btn {
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 12px;
    border: 0.5px solid #2a2a2a;
    background: transparent;
    color: #666;
    cursor: pointer;
  }
  .kds-logout-btn:hover { color: #f0f0f0; border-color: #444; }

  /* Filter bar */
  .kds-filter-bar {
    background: #0d0d0d;
    border-bottom: 1px solid #1a1a1a;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .kds-filter-pill {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    border: 0.5px solid #2a2a2a;
    background: transparent;
    color: #666;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    transition: all .15s;
  }
  .kds-filter-pill:hover { border-color: #444; color: #aaa; }
  .pill-active { background: #1e1e1e; color: #f0f0f0; border-color: #444; }
  .pill-count {
    font-size: 11px;
    background: #2a2a2a;
    padding: 1px 6px;
    border-radius: 10px;
    color: #aaa;
  }
  .pill-active .pill-count { background: #333; color: #f0f0f0; }
  .kds-sort-hint { margin-left: auto; font-size: 11px; color: #444; }

  /* Board */
  .kds-board {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
    align-content: start;
  }

  /* Empty state */
  .kds-empty {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 0;
    gap: 8px;
  }
  .kds-empty-icon { font-size: 44px; }
  .kds-empty p   { font-size: 16px; color: #555; }
  .kds-empty-sub { font-size: 13px; color: #383838; }

  /* ── Order card ─────────────────────────────────────────────────────────── */
  .kds-card {
    background: #141414;
    border-radius: 12px;
    border: 2px solid #252525;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Slightly larger shadow on new orders so they pop */
    box-shadow: 0 0 0 0 transparent;
    transition: border-color .2s;
  }
  /* Color-coded left border by status — industry standard */
  .kds-card.status-pending     { border-color: #ef4444; }
  .kds-card.status-in_progress { border-color: #f97316; }
  .kds-card.status-ready       { border-color: #22c55e; }
  .kds-card.status-cancelled   { opacity: .4; border-color: #374151; }

  /* Card head */
  .kds-card-head {
    padding: 12px 14px 10px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 1px solid #1a1a1a;
  }
  .kds-card-head-left { display: flex; align-items: center; gap: 9px; }
  .kds-service-icon   { font-size: 20px; line-height: 1; }
  .kds-service-label  { font-size: 16px; font-weight: 500; color: #f0f0f0; }
  .kds-order-id       { font-size: 11px; color: #555; margin-top: 2px; }
  .kds-card-head-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }

  /* Status badge */
  .kds-badge {
    font-size: 11px;
    padding: 3px 9px;
    border-radius: 12px;
    font-weight: 600;
    white-space: nowrap;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .badge-pending     { background: #ef444422; color: #fca5a5; border: 1px solid #ef444466; }
  .badge-in-progress { background: #f9731622; color: #fdba74; border: 1px solid #f9731666; }
  .badge-ready       { background: #22c55e22; color: #86efac; border: 1px solid #22c55e66; }
  .badge-cancelled   { background: #1f2937;   color: #6b7280; border: 1px solid #374151; }

  /* Timer */
  .kds-timer    { font-size: 11px; }
  .timer-danger { color: #ef4444; font-weight: 600; }
  .timer-warn   { color: #f97316; }
  .timer-ok     { color: #555; }

  /* ── Item rows ─────────────────────────────────────────────────────────── */
  .kds-items {
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  .kds-item-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    border-left: 3px solid transparent;
    transition: background .1s;
    min-height: 44px; /* touch-friendly minimum */
  }
  /* Tappable rows get a clear active state */
  .item-row-tappable { cursor: pointer; }
  .item-row-tappable:active { opacity: 0.7; transform: scale(0.98); }

  .item-row-pending     { background: #ef444418; border-left-color: #ef4444; }
  .item-row-cooking     { background: #f9731618; border-left-color: #f97316; }
  .item-row-ready       { background: #22c55e18; border-left-color: #22c55e; }
  .item-row-cancelled   { background: #1f293733; border-left-color: #374151; opacity: .5; }

  /* Checkbox-style indicator */
  .item-check {
    font-size: 14px;
    width: 18px;
    text-align: center;
    flex-shrink: 0;
    color: #555;
  }
  .item-row-pending .item-check   { color: #ef4444; }
  .item-row-cooking .item-check   { color: #f97316; }
  .item-check-done                { color: #22c55e !important; }

  .kds-item-name {
    font-size: 14px;
    color: #e0e0e0;
    flex: 1;
    line-height: 1.3;
  }
  .item-row-pending .kds-item-name   { color: #fca5a5; }
  .item-row-cooking .kds-item-name   { color: #fdba74; }
  .item-row-ready   .kds-item-name   { color: #86efac; }
  .item-row-cancelled .kds-item-name { color: #6b7280; text-decoration: line-through; }
  /* Strikethrough when item is done */
  .item-name-done { text-decoration: line-through; color: #86efac !important; }

  .kds-item-qty { font-size: 13px; color: #666; flex-shrink: 0; font-weight: 500; }

  /* Special notes */
  .kds-notes {
    margin: 2px 12px 8px;
    padding: 8px 10px;
    border-radius: 6px;
    border-left: 3px solid #eab308;
    background: #eab30810;
    font-size: 12px;
    color: #fde68a;
    line-height: 1.4;
  }

  /* ── Primary action button — BIG, touch-friendly ────────────────────────── */
  .kds-card-actions { padding: 10px 12px 4px; }

  .kds-btn-action {
    width: 100%;
    padding: 16px;           /* tall = easy to tap */
    border-radius: 10px;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: .06em;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity .1s, transform .1s;
    -webkit-tap-highlight-color: transparent;
  }
  .kds-btn-action:active { opacity: 0.85; transform: scale(0.98); }

  .btn-action-start  { background: #1d4ed8; color: #fff; }
  .btn-action-ready  { background: #15803d; color: #fff; }
  .btn-action-served { background: #1a2e1a; color: #22c55e; cursor: default; }
  .btn-action-disabled { opacity: 1; }

  .btn-action-icon { font-size: 16px; }

  /* Void — small, secondary, below the main action */
  .kds-btn-void {
    width: 100%;
    padding: 10px;
    background: transparent;
    border: none;
    color: #3f3f3f;
    font-size: 12px;
    cursor: pointer;
    text-align: center;
    transition: color .15s;
    margin-bottom: 4px;
  }
  .kds-btn-void:hover { color: #ef4444; }
  .kds-btn-void:active { color: #dc2626; }

  /* ── History ─────────────────────────────────────────────────────────────── */
  .kds-history {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .kds-history-bar {
    padding: 10px 20px;
    border-bottom: 1px solid #1a1a1a;
    display: flex;
    align-items: center;
    font-size: 13px;
    color: #666;
  }
  .kds-history-count { margin-left: auto; font-size: 12px; color: #444; }
  .kds-history-scroll { flex: 1; overflow-y: auto; padding: 0 20px 20px; }
  .kds-hist-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .kds-hist-table th {
    text-align: left;
    padding: 10px 12px;
    color: #555;
    font-weight: 400;
    border-bottom: 1px solid #1a1a1a;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .05em;
  }
  .kds-hist-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #141414;
    color: #888;
    vertical-align: top;
  }
  .kds-hist-table tr:hover td { background: #111; }
  .td-order { color: #d0d0d0; font-weight: 500; }
  .td-time  { color: #555; }
  .hist-items { display: flex; flex-direction: column; gap: 2px; }
  .hist-item  { font-size: 12px; color: #666; }
`;
