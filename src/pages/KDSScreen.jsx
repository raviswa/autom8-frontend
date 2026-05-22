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
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { formatDistanceToNow, isToday } from 'date-fns';

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
        orderId:      item.order_item?.order_id ?? null, // ← used by /complete endpoint
        tableNumber:  item.order_item?.order?.table?.table_number ?? item.table_number ?? null,
        tableSection: item.order_item?.order?.table?.section ?? null,
        serviceType:  item.service_type ?? null,
        createdAt:    item.created_at,
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

  return Array.from(groups.values());
}

function minutesAgo(iso) {
  return Math.floor((Date.now() - new Date(iso)) / 60000);
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

function StatusBadge({ status }) {
  const map = {
    pending:     { label: 'New order',   cls: 'badge-pending'     },
    in_progress: { label: 'Cooking',     cls: 'badge-in-progress' },
    ready:       { label: 'All ready',   cls: 'badge-ready'       },
    cancelled:   { label: 'Cancelled',   cls: 'badge-cancelled'   },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'badge-pending' };
  return <span className={`kds-badge ${cls}`}>{label}</span>;
}

function ItemDot({ status }) {
  const cls = { pending: 'dot-pending', in_progress: 'dot-cooking', ready: 'dot-ready', cancelled: 'dot-cancelled' };
  return <span className={`item-dot ${cls[status] ?? 'dot-pending'}`} />;
}

function TimerLabel({ createdAt }) {
  const mins = minutesAgo(createdAt);
  const cls  = mins > 20 ? 'timer-danger' : mins > 12 ? 'timer-warn' : 'timer-ok';
  const txt  = mins === 0 ? 'Just now' : mins === 1 ? '1 min ago' : `${mins} mins ago`;
  return <span className={`kds-timer ${cls}`}>{txt}</span>;
}

// ─── Order card ──────────────────────────────────────────────────────────────

function OrderCard({ group, onAdvanceItem, onAdvanceAll, onCancel }) {
  const orderStatus = deriveOrderStatus(group.items);
  const cardCls     = `kds-card status-${orderStatus}`;

  const advanceAllLabel = orderStatus === 'pending' ? '▶ Start all' : '✓ Mark all ready';
  const advanceAllCls   = orderStatus === 'pending' ? 'btn-start' : 'btn-ready';

  return (
    <div className={cardCls}>
      {/* Header */}
      <div className="kds-card-head">
        <div className="kds-card-head-left">
          <span className="kds-service-icon">{serviceIcon(group)}</span>
          <div>
            <p className="kds-service-label">{serviceLabel(group)}</p>
            <p className="kds-order-id">#{group.orderNumber?.slice(-6)}</p>
          </div>
        </div>
        <div className="kds-card-head-right">
          <StatusBadge status={orderStatus} />
          <TimerLabel createdAt={group.createdAt} />
        </div>
      </div>

      {/* Items */}
      <div className="kds-items">
        {group.items.map(item => (
          <div key={item.kdsId} className="kds-item-row">
            <ItemDot status={item.status} />
            <span className="kds-item-name">{item.name}</span>
            <span className="kds-item-qty">×{item.qty}</span>
            {item.status !== 'ready' && item.status !== 'cancelled' && (
              <button
                className="kds-item-btn"
                onClick={() => onAdvanceItem(item.kdsId, item.status)}
              >
                {item.status === 'pending' ? 'Start' : 'Done'}
              </button>
            )}
            {item.status === 'ready' && (
              <span className="kds-item-done">✓</span>
            )}
          </div>
        ))}
      </div>

      {/* Special notes */}
      {group.specialNotes && (
        <div className="kds-notes">
          ⚠ {group.specialNotes}
        </div>
      )}

      {/* Actions */}
      <div className="kds-card-actions">
        {orderStatus !== 'ready' && orderStatus !== 'cancelled' && (
          <button
            className={`kds-btn-main ${advanceAllCls}`}
            onClick={() => onAdvanceAll(group)}
          >
            {advanceAllLabel}
          </button>
        )}
        {orderStatus === 'ready' && (
          <button className="kds-btn-main btn-served" disabled>
            ✨ Ready for pickup
          </button>
        )}
        <button
          className="kds-btn-cancel"
          onClick={() => onCancel(group.orderNumber)}
          title="Cancel order"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── History table ────────────────────────────────────────────────────────────

function HistoryView({ items }) {
  // Show cancelled + ready items from today
  const hist = items.filter(
    i => (i.status === 'ready' || i.status === 'cancelled') && isToday(new Date(i.created_at))
  );
  const groups = groupItemsByOrder(hist);
  groups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

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
                    {new Date(g.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <StatusBadge status={deriveOrderStatus(g.items)} />
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
  const todayActive = allItems.filter(i =>
    isToday(new Date(i.created_at)) &&
    ['pending', 'in_progress', 'ready'].includes(i.status)
  );

  const allGroups = groupItemsByOrder(todayActive);
  allGroups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const filterGroups = (f) => {
    if (f === 'all') return allGroups;
    return allGroups.filter(g => deriveOrderStatus(g.items) === f);
  };

  const displayGroups = filterGroups(filter);

  const counts = {
    all:         allGroups.length,
    pending:     filterGroups('pending').length,
    in_progress: filterGroups('in_progress').length,
    ready:       filterGroups('ready').length,
  };

  // ── Item-level advance ────────────────────────────────────────────────────
  const advanceItem = async (kdsId, currentStatus) => {
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
  .kds-ws-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
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
  .kds-tab-active {
    background: #2a2a2a;
    color: #f0f0f0;
    font-weight: 500;
  }
  .kds-header-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }
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
  .kds-sound-btn.sound-on {
    color: #22c55e;
    border-color: #22c55e44;
  }
  .kds-logout-btn {
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 12px;
    border: 0.5px solid #2a2a2a;
    background: transparent;
    color: #666;
    cursor: pointer;
    transition: all .15s;
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
  .kds-sort-hint {
    margin-left: auto;
    font-size: 11px;
    color: #444;
  }

  /* Board */
  .kds-board {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
    gap: 12px;
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

  /* Order card */
  .kds-card {
    background: #141414;
    border-radius: 10px;
    border: 1px solid #252525;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .kds-card.status-pending     { border-color: #7f1d1d88; }
  .kds-card.status-in_progress { border-color: #7c2d1288; }
  .kds-card.status-ready       { border-color: #14532d88; }
  .kds-card.status-cancelled   { opacity: .5; }

  /* Card head */
  .kds-card-head {
    padding: 10px 13px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    border-bottom: 1px solid #1a1a1a;
  }
  .kds-card-head-left {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .kds-service-icon { font-size: 18px; line-height: 1; }
  .kds-service-label { font-size: 15px; font-weight: 500; color: #f0f0f0; }
  .kds-order-id      { font-size: 11px; color: #555; margin-top: 1px; }
  .kds-card-head-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  /* Status badge */
  .kds-badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 500;
    white-space: nowrap;
  }
  .badge-pending     { background: #7f1d1d33; color: #fca5a5; border: 0.5px solid #7f1d1d; }
  .badge-in-progress { background: #7c2d1233; color: #fdba74; border: 0.5px solid #7c2d12; }
  .badge-ready       { background: #14532d33; color: #86efac; border: 0.5px solid #14532d; }
  .badge-cancelled   { background: #1f2937;   color: #6b7280; border: 0.5px solid #374151; }

  /* Timer */
  .kds-timer    { font-size: 11px; }
  .timer-danger { color: #ef4444; font-weight: 500; }
  .timer-warn   { color: #f97316; }
  .timer-ok     { color: #555; }

  /* Items */
  .kds-items {
    padding: 10px 13px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    flex: 1;
  }
  .kds-item-row {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .item-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot-pending   { background: #ef4444; }
  .dot-cooking   { background: #f97316; }
  .dot-ready     { background: #22c55e; }
  .dot-cancelled { background: #374151; }
  .kds-item-name {
    font-size: 13px;
    color: #d0d0d0;
    flex: 1;
    line-height: 1.3;
  }
  .kds-item-qty {
    font-size: 12px;
    color: #555;
    flex-shrink: 0;
  }
  .kds-item-btn {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    border: 0.5px solid #2a2a2a;
    background: transparent;
    color: #888;
    cursor: pointer;
    flex-shrink: 0;
    transition: all .1s;
    white-space: nowrap;
  }
  .kds-item-btn:hover { background: #222; color: #f0f0f0; border-color: #444; }
  .kds-item-done {
    font-size: 12px;
    color: #22c55e;
    flex-shrink: 0;
    padding: 0 4px;
  }

  /* Special notes */
  .kds-notes {
    margin: 0 13px 10px;
    padding: 7px 10px;
    border-radius: 6px;
    border-left: 3px solid #eab308;
    background: #eab30810;
    font-size: 12px;
    color: #fde68a;
    line-height: 1.4;
  }

  /* Card actions */
  .kds-card-actions {
    padding: 10px 13px;
    border-top: 1px solid #1a1a1a;
    display: flex;
    gap: 8px;
  }
  .kds-btn-main {
    flex: 1;
    padding: 7px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all .1s;
  }
  .btn-start  { background: #1d4ed8; color: #bfdbfe; }
  .btn-start:hover { background: #2563eb; }
  .btn-ready  { background: #15803d; color: #bbf7d0; }
  .btn-ready:hover { background: #16a34a; }
  .btn-served { background: #1a1a1a; color: #555; cursor: default; }
  .kds-btn-cancel {
    padding: 7px 11px;
    border-radius: 7px;
    font-size: 13px;
    border: 0.5px solid #2a2a2a;
    background: transparent;
    color: #555;
    cursor: pointer;
    transition: all .1s;
    flex-shrink: 0;
  }
  .kds-btn-cancel:hover { color: #ef4444; border-color: #ef444466; }

  /* History */
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
  .kds-history-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0 20px 20px;
  }
  .kds-hist-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
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
