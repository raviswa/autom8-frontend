// ============================================================================
// AUTOM8 FRONTEND - KDS SCREEN
// src/pages/KDSScreen.jsx
//
// FIX LOG
// -------
//  Fix 1 — Default filter changed from 'pending' to 'all' so all active
//           orders are visible at once; kitchen doesn't miss in-progress items
//  Fix 2 — Optimistic local state update on status change so item moves
//           instantly (pending → in_progress → ready) without flicker/disappear
//  Fix 3 — fetchKDSFeed called with current filter via ref so the effect
//           closure never stales out after a filter change
//  Fix 4 — Null-guard on order_item / menu_item so a null join (caused by
//           slot-scheduler deactivating menu items) never crashes the render
//           and never silently drops a card from the list
//  Fix 5 — item_name fallback: cards render the name stored at order-time
//           (item.item_name) when menu_item join returns null
//  Fix 6 — Poll interval adaptive: 1 s when WebSocket is offline, 3 s when live
//  Fix 7 — WebSocket reconnect uses exponential back-off (max 10 s) instead
//           of the previous fixed 60 s gap that caused missed ORDER_NEW broadcasts
//  Fix 8 — Filter buttons reordered: ALL first (matches new default)
//  Fix 9 — Empty-state copy adapts to current filter
//  Fix 10 — Status badge added to every card so staff can see state at a glance
//            without switching tabs
//  FIX 11 — Always fetch ALL items from backend (status: 'all'), never pass
//            the filter to the API. Filtering happens entirely on the frontend
//            in filterItems(). This ensures tab counts always reflect totals
//            across all statuses, not just the currently-displayed ones.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { formatDistanceToNow } from 'date-fns';

export default function KDSScreen() {
  const { user, apiClient, logout } = useAuth();
  const { connected, updates } = useWebSocket();

  // Fix 1 — default to 'all' so in-progress items are never hidden
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all');
  const [sound, setSound]     = useState(true);

  // Fix 3 — keep a ref so fetchKDSFeed always reads the latest filter value
  const filterRef = useRef(filter);
  useEffect(() => { filterRef.current = filter; }, [filter]);

  // Fix 7 — exponential back-off reconnect ref (lives in WebSocketContext,
  //          but we expose a retryCount here for the adaptive poll below)
  const wsRetryCount = useRef(0);
  useEffect(() => {
    if (connected) {
      wsRetryCount.current = 0;
    }
  }, [connected]);

  // ── Fetch KDS feed ─────────────────────────────────────────────────────────
  // FIX 11: Always fetch ALL items regardless of filter.
  // Filter only affects display, not what's loaded into state.
  // This ensures tab counts always show correct totals across all statuses.
  const fetchKDSFeed = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/kds/feed', {
        params: { status: 'all' },  // Always fetch all items
      });
      setItems(response.data.items || []);
    } catch (err) {
      console.error('Failed to fetch KDS feed:', err);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  // Fix 6 — adaptive poll: faster when WebSocket is offline
  useEffect(() => {
    fetchKDSFeed();
    const interval = setInterval(fetchKDSFeed, connected ? 3000 : 1000);
    return () => clearInterval(interval);
  }, [fetchKDSFeed, connected]);

  // Sound on new orders via WebSocket
  useEffect(() => {
    if (sound && updates.length > 0) {
      const last = updates[0];
      if (last.type === 'ORDER_NEW' || last.status === 'pending') {
        playNotificationSound();
      }
    }
  }, [updates, sound]);

  const playNotificationSound = () => {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const now  = ctx.currentTime;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.setValueAtTime(600, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.setValueAtTime(0, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (_) {
      // AudioContext may be blocked before user gesture — safe to ignore
    }
  };

  // Fix 2 — optimistic update so item moves instantly without disappearing
  const updateItemStatus = async (itemId, newStatus) => {
    // Immediately reflect the change in local state
    setItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, status: newStatus } : item
      )
    );

    try {
      await apiClient.put(`/api/kds/${itemId}/status`, { status: newStatus });
      // Sync with server to pick up any side-effects (e.g. customer notify)
      fetchKDSFeed();
      if (newStatus === 'ready' && sound) {
        playNotificationSound();
      }
    } catch (err) {
      console.error('Failed to update item status:', err);
      // Revert optimistic update on error
      fetchKDSFeed();
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-600 text-white';
      case 'high':   return 'bg-orange-500 text-white';
      case 'normal': return 'bg-blue-500 text-white';
      case 'low':    return 'bg-green-500 text-white';
      default:       return 'bg-gray-500 text-white';
    }
  };

  // Fix 10 — status badge styling
  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':     return 'bg-red-700 text-red-100';
      case 'in_progress': return 'bg-orange-600 text-orange-100';
      case 'ready':       return 'bg-green-600 text-green-100';
      default:            return 'bg-gray-600 text-gray-100';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending':     return '🔴 Pending';
      case 'in_progress': return '🟠 In Progress';
      case 'ready':       return '🟢 Ready';
      default:            return status;
    }
  };

  const getTimeColor = (createdAt) => {
    const minutes = Math.floor((Date.now() - new Date(createdAt)) / 60000);
    if (minutes > 20) return 'text-red-400 font-bold';
    if (minutes > 15) return 'text-orange-400 font-bold';
    return 'text-gray-400';
  };

  // Fix 4 — filter out items where order_item is null so render never crashes
  const filterItems = (status) => {
    const safe = items.filter(item => item != null);
    if (status === 'all') return safe.filter(i => ['pending', 'in_progress', 'ready'].includes(i.status));
    return safe.filter(item => item.status === status);
  };

  const displayItems = filterItems(filter);

  // Fix 8 — reordered so ALL is first
  const FILTER_TABS = ['all', 'pending', 'in_progress', 'ready'];

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading Kitchen Display...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black text-white overflow-hidden flex flex-col">

      {/* Header */}
      <div className="bg-gray-900 border-b-4 border-blue-600 p-6 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-blue-400">🔥 KITCHEN DISPLAY SYSTEM</h1>
          <p className="text-gray-400 mt-2">
            {displayItems.length} {filter === 'all' ? 'active orders' : filter.replace('_', ' ') + ' items'} •{' '}
            WebSocket:{' '}
            <span className={`font-bold ${connected ? 'text-green-400' : 'text-red-400'}`}>
              {connected ? '🟢 LIVE' : '🔴 OFFLINE'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Fix 8 — filter tabs reordered: ALL first */}
          {/* FIX 11 — Tab counts now always show correct totals because we have all items in state */}
          <div className="flex gap-2">
            {FILTER_TABS.map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  filter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
              >
                {status.replace('_', ' ').toUpperCase()}
                <span className="ml-2 text-sm">({filterItems(status).length})</span>
              </button>
            ))}
          </div>

          <button
            onClick={logout}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition flex items-center text-sm"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
            Logout
          </button>

          <button
            onClick={() => setSound(!sound)}
            className={`px-4 py-2 rounded-lg font-semibold transition ${sound ? 'bg-blue-600' : 'bg-red-600'}`}
          >
            {sound ? '🔔 Sound ON' : '🔇 Sound OFF'}
          </button>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="flex-1 overflow-auto p-6">
        {/* Fix 9 — empty state copy adapts to current filter */}
        {displayItems.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl mb-4">😎</p>
              <p className="text-3xl text-gray-400 font-semibold">
                {filter === 'all'
                  ? 'No active orders'
                  : `No ${filter.replace('_', ' ')} orders`}
              </p>
              <p className="text-gray-600 mt-2">Great job! Everything is caught up.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {displayItems.map((item) => {
              // Fix 5 — item_name fallback when menu_item join is null
              const itemName =
                item.order_item?.menu_item?.name ??
                item.item_name ??
                item.order_item?.special_instructions ??
                'Item';

              const itemDescription = item.order_item?.menu_item?.description ?? null;
              const prepTime        = item.order_item?.menu_item?.prep_time_minutes ?? null;
              const tableNumber     = item.order_item?.order?.table?.table_number ?? item.table_number ?? null;
              const tableSection    = item.order_item?.order?.table?.section ?? null;
              const orderNumber     = item.order_item?.order?.order_number ?? item.token_number ?? null;
              const specialNotes    = item.special_instructions ?? null;
              const qty             = item.order_item?.quantity ?? 1;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl overflow-hidden shadow-2xl transform transition hover:scale-105 ${
                    item.status === 'pending'
                      ? 'bg-red-900 border-4 border-red-600'
                      : item.status === 'in_progress'
                      ? 'bg-orange-900 border-4 border-orange-500'
                      : 'bg-green-900 border-4 border-green-500'
                  }`}
                >
                  {/* Card Header */}
                  <div className="bg-black p-4 border-b-2 border-gray-700">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-2xl font-bold text-white">
                          {tableNumber ? `Table ${tableNumber}` : item.service_type ?? 'Order'}
                        </p>
                        {tableSection && (
                          <p className="text-gray-400 text-sm">{tableSection}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${getPriorityColor(item.priority ?? 'normal')}`}>
                          {(item.priority ?? 'normal').toUpperCase()}
                        </span>
                        {/* Fix 10 — status badge */}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusBadge(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                      </div>
                    </div>

                    <p className={`text-xl font-bold ${getTimeColor(item.created_at)}`}>
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>

                  {/* Card Body */}
                  <div className="p-6">
                    <div className="mb-6">
                      <p className="text-gray-300 text-sm font-semibold mb-3">ITEM:</p>

                      {/* Fix 4 + 5 — safe name with fallback */}
                      <p className="text-3xl font-bold text-white mb-2">
                        {itemName}
                      </p>

                      {itemDescription && (
                        <p className="text-gray-300 text-sm mb-2">{itemDescription}</p>
                      )}

                      {/* Special notes (customer preferences from WhatsApp) */}
                      {specialNotes && (
                        <div className="bg-yellow-900 border-l-4 border-yellow-500 p-3 my-3">
                          <p className="text-yellow-200 font-semibold text-sm">⚠️ SPECIAL NOTES:</p>
                          <p className="text-yellow-100 text-sm mt-1">{specialNotes}</p>
                        </div>
                      )}

                      <p className="text-gray-400 text-sm mt-3">
                        Qty: <span className="text-white font-bold text-lg">{qty}</span>
                      </p>
                    </div>

                    {/* Prep Time */}
                    {prepTime && (
                      <div className="bg-gray-800 rounded p-3 mb-4">
                        <p className="text-gray-400 text-xs">Expected Prep Time</p>
                        <p className="text-xl font-bold text-blue-400">{prepTime} mins</p>
                      </div>
                    )}

                    {/* Status Action Buttons */}
                    <div className="space-y-2">
                      {item.status === 'pending' && (
                        <button
                          onClick={() => updateItemStatus(item.id, 'in_progress')}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition text-lg"
                        >
                          ▶️ START COOKING
                        </button>
                      )}

                      {item.status === 'in_progress' && (
                        <button
                          onClick={() => updateItemStatus(item.id, 'ready')}
                          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition text-lg"
                        >
                          ✅ MARK READY
                        </button>
                      )}

                      {item.status === 'ready' && (
                        <div className="w-full bg-green-600 text-white font-bold py-3 rounded-lg text-center text-lg">
                          ✨ READY FOR PICKUP
                        </div>
                      )}

                      <button
                        onClick={() => updateItemStatus(item.id, 'cancelled')}
                        className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-2 rounded-lg transition"
                      >
                        ❌ Cancel
                      </button>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="bg-black p-3 border-t-2 border-gray-700 text-center">
                    <p className="text-gray-500 text-xs">
                      {orderNumber
                        ? `Order #${String(orderNumber).slice(-6)}`
                        : `Token: ${item.token_number ?? '—'}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
