// ============================================================================
// AUTOM8 FRONTEND - MANAGER PORTAL
// src/pages/ManagerPortal.jsx
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription, FEATURES } from '../contexts/SubscriptionContext';
import { format, parseISO } from 'date-fns';

// ─── Status colours (tables) ─────────────────────────────────────────────────
const TABLE_COLOURS = {
  available: 'bg-green-500',
  occupied:  'bg-blue-500',
  reserved:  'bg-yellow-500',
  dirty:     'bg-red-500',
};

// ─── Token status pill colours ───────────────────────────────────────────────
const TOKEN_PILL = {
  waiting:   'bg-orange-100 text-orange-700',
  seated:    'bg-green-100  text-green-700',
  takeaway:  'bg-blue-100   text-blue-700',
  completed: 'bg-gray-100   text-gray-500',
};

// ─── Safe date formatter ──────────────────────────────────────────────────────
function safeFormat(dateVal, fmt) {
  if (!dateVal) return '—';
  try {
    const d = typeof dateVal === 'string' ? parseISO(dateVal) : new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    return format(d, fmt);
  } catch {
    return '—';
  }
}

// ─── Active order statuses — the ONLY statuses that keep a table "occupied" ──
// "cancelled" and "completed" are explicitly excluded so stale orders don't
// lock tables in the UI.
const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'in_progress'];

export default function ManagerPortal() {
  const { user, apiClient, logout } = useAuth();
  const { hasFeature, hasAnyOf } = useSubscription();

  // ── core state ─────────────────────────────────────────────────────────────
  const [tables,        setTables]        = useState([]);
  const [orders,        setOrders]        = useState([]);
  const [menuItems,     setMenuItems]     = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showNewOrder,  setShowNewOrder]  = useState(false);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // ── token / queue state ────────────────────────────────────────────────────
  const [tokens,         setTokens]         = useState([]);
  const [assigningToken, setAssigningToken] = useState(null);
  const [assignTableSel, setAssignTableSel] = useState({});
  const [activeTab,      setActiveTab]      = useState('queue');
  const [toastMsg,       setToastMsg]       = useState('');

  // ── "free table" modal ─────────────────────────────────────────────────────
  // Opened when manager clicks "Mark Available" on an occupied table.
  // Asks: Complete Order / Cancel Order / Just Free (if no order linked).
  const [freeTableModal, setFreeTableModal] = useState(null);
  // shape: { tableId, tableNumber, order | null, token | null }

  // ─── toast helper ──────────────────────────────────────────────────────────
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  // ─── fetch helpers ─────────────────────────────────────────────────────────
  const fetchTokens = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/tokens');
      setTokens(res.data.tokens || res.data || []);
    } catch (err) {
      console.error('Failed to fetch tokens:', err.message);
    }
  }, [apiClient]);

  const fetchTables = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/tables');
      setTables(res.data.tables || res.data || []);
    } catch (err) {
      console.error('Failed to fetch tables:', err.message);
    }
  }, [apiClient]);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/orders');
      setOrders(res.data.orders || res.data || []);
    } catch (err) {
      console.error('Failed to fetch orders:', err.message);
    }
  }, [apiClient]);

  const fetchMenuItems = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/menu-items');
      setMenuItems(res.data.items || res.data || []);
    } catch (err) {
      console.error('Failed to fetch menu items:', err.message);
    }
  }, [apiClient]);

  const fetchData = useCallback(async () => {
    await Promise.all([fetchTables(), fetchOrders(), fetchTokens(), fetchMenuItems()]);
    setLoading(false);
  }, [fetchTables, fetchOrders, fetchTokens, fetchMenuItems]);

  useEffect(() => {
    fetchData();
    const fullInterval  = setInterval(fetchData, 15000);
    const quickInterval = setInterval(async () => {
      await fetchTokens();
      await fetchTables();
      await fetchOrders();
    }, 8000);
    return () => {
      clearInterval(fullInterval);
      clearInterval(quickInterval);
    };
  }, [fetchData, fetchTokens, fetchTables, fetchOrders]);

  // ─── derived helpers ───────────────────────────────────────────────────────
  // FIX: only orders with ACTIVE_ORDER_STATUSES count toward "occupied".
  // Completed/cancelled orders no longer lock a table in the UI.
  const getTableStatus = (table) => {
    const order = orders.find(
      o => o.table_id === table.id && ACTIVE_ORDER_STATUSES.includes(o.status)
    );
    const token = tokens.find(t => t.table_id === table.id && t.status === 'seated');
    const dbStatus = table.status || 'available';
    return {
      status: (order || token) ? 'occupied' : dbStatus,
      order,
      token,
    };
  };

  const availableTablesFor = (pax) =>
    tables.filter(t => {
      const { status } = getTableStatus(t);
      return status === 'available' && (t.capacity == null || t.capacity >= pax);
    });

  const normaliseToken = (t) => ({
    ...t,
    id:           t.id || t.token_id || t.token_number || '?',
    status:       t.status || (t.type === 'takeaway' ? 'takeaway' : 'waiting'),
    name:         t.name || t.customer_name || 'Guest',
    pax:          t.pax || t.party_size || 1,
    arrived_at:   t.arrived_at || t.created_at || t.inserted_at || new Date().toISOString(),
    phone:        t.phone || t.customer_phone || null,
    table_id:     t.table_id || null,
    table_number: t.table_number || null,
  });

  const normalisedTokens = tokens.map(normaliseToken);
  const waitingTokens    = normalisedTokens.filter(t => t.status === 'waiting');
  const seatedTokens     = normalisedTokens.filter(t => t.status === 'seated');
  const takeawayTokens   = normalisedTokens.filter(t => t.status === 'takeaway');
  const freeTablesCount  = tables.filter(t => getTableStatus(t).status === 'available').length;

  // ─── open "free table" choice modal ───────────────────────────────────────
  const openFreeTableModal = (table) => {
    const { order, token } = getTableStatus(table);
    setFreeTableModal({
      tableId:     table.id,
      tableNumber: table.table_number,
      order:       order || null,
      token:       token || null,
    });
  };

  // ─── confirm freeing the table ─────────────────────────────────────────────
  // orderAction: 'complete' | 'cancel' | null (null = no order to handle)
  const confirmFreeTable = async (orderAction) => {
    const { tableId, tableNumber, order, token } = freeTableModal;
    setFreeTableModal(null);

    try {
      // 1. Handle the linked order
      if (order && orderAction === 'complete') {
        await apiClient.put(`/api/orders/${order.id}/status`, { status: 'completed' });
      } else if (order && orderAction === 'cancel') {
        await apiClient.delete(`/api/orders/${order.id}`);
      }

      // 2. Complete any seated walk-in token on this table
      if (token) {
        try {
          await apiClient.put(`/api/tokens/${token.id}/complete`);
        } catch (tokErr) {
          console.warn('Could not complete token:', tokErr.message);
        }
      }

      // 3. Force the table to available in DB
      await apiClient.put(`/api/tables/${tableId}/status`, { status: 'available' });

      await fetchTables();
      await fetchOrders();
      await fetchTokens();
      showToast(`✅ Table ${tableNumber} is now available`);
    } catch (err) {
      console.error('Failed to free table:', err);
      showToast(`❌ Failed: ${err.message}`);
    }
  };

  // ─── token helpers ─────────────────────────────────────────────────────────
  const assignTable = async (token) => {
    const tableId = assignTableSel[token.id];
    if (!tableId) { showToast('Please select a table first'); return; }
    const table = tables.find(t => String(t.id) === String(tableId));
    if (!table) return;
    setAssigningToken(token.id);
    try {
      await apiClient.put(`/api/tokens/${token.id}/assign`, {
        table_id:     table.id,
        table_number: table.table_number,
      });
      showToast(`✅ Token ${token.id} → Table ${table.table_number} · WhatsApp sent`);
      setAssignTableSel(prev => { const n = {...prev}; delete n[token.id]; return n; });
      await fetchTokens();
      await fetchTables();
    } catch (err) {
      console.error('Failed to assign table:', err);
      showToast('❌ Failed to assign table — check backend logs');
    } finally {
      setAssigningToken(null);
    }
  };

  const completeToken = async (token) => {
    try {
      await apiClient.put(`/api/tokens/${token.id}/complete`);
      showToast(`Table ${token.table_number} is now free`);
      await fetchTokens();
      await fetchTables();
    } catch (err) {
      console.error('Failed to complete token:', err);
      showToast('❌ Failed to complete token');
    }
  };

  const dismissToken = async (tokenId) => {
    try {
      await apiClient.delete(`/api/tokens/${tokenId}`);
      await fetchTokens();
    } catch (err) {
      console.error('Failed to dismiss token:', err);
    }
  };

  // ─── order helpers ─────────────────────────────────────────────────────────
  const createOrder = async () => {
    if (!selectedTable || selectedItems.length === 0) {
      showToast('Please select a table and items');
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    setShowNewOrder(false);
    const tableId = selectedTable;
    const items = selectedItems.map(item => ({
      menu_item_id: item.id,
      quantity: item.quantity || 1,
      special_instructions: item.special_instructions,
    }));
    setSelectedItems([]);
    setSelectedTable(null);
    try {
      await apiClient.post('/api/orders', { table_id: tableId, items, notes: '' });
      await fetchOrders();
      await fetchTables();
    } catch (err) {
      console.error('Failed to create order:', err);
      showToast('Error creating order: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelOrder = async (orderId, tableId) => {
    try {
      await apiClient.delete(`/api/orders/${orderId}`);
      if (tableId) await apiClient.put(`/api/tables/${tableId}/status`, { status: 'available' });
      fetchData();
    } catch (err) {
      console.error('Failed to cancel order:', err);
      showToast('Error cancelling order: ' + err.message);
    }
  };

  const markOrderReady = async (orderId) => {
    try {
      await apiClient.put(`/api/orders/${orderId}/status`, { status: 'completed' });
      fetchData();
    } catch (err) {
      console.error('Failed to update order:', err);
      showToast('Error updating order: ' + err.message);
    }
  };

  // ─── loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Loading Manager Portal...</p>
        </div>
      </div>
    );
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl">
          {toastMsg}
        </div>
      )}

      {/* ── Free Table Modal ───────────────────────────────────────────────── */}
      {freeTableModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-blue-600 text-white px-6 py-5">
              <h3 className="text-lg font-bold">Free Table {freeTableModal.tableNumber}</h3>
              <p className="text-blue-100 text-sm mt-0.5">What happened with this table?</p>
            </div>
            <div className="p-6 space-y-3">
              {freeTableModal.order ? (
                <>
                  {/* Order summary */}
                  <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-700 mb-2">
                    <p className="font-semibold text-gray-900 mb-1">
                      Order #{freeTableModal.order.order_number?.slice(-4)}
                    </p>
                    <p>Status: <span className="capitalize font-medium">{freeTableModal.order.status}</span></p>
                    <p>Amount: <span className="font-medium">₹{freeTableModal.order.total_amount?.toFixed(2) ?? '—'}</span></p>
                  </div>

                  {/* Option A: Complete */}
                  <button
                    onClick={() => confirmFreeTable('complete')}
                    className="w-full flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 text-green-800 font-semibold px-4 py-3 rounded-xl transition text-sm text-left"
                  >
                    <span className="text-xl">✅</span>
                    <div>
                      <p className="font-bold">Order Completed</p>
                      <p className="text-green-600 font-normal text-xs">Guests paid and left — mark order done</p>
                    </div>
                  </button>

                  {/* Option B: Cancel */}
                  <button
                    onClick={() => confirmFreeTable('cancel')}
                    className="w-full flex items-center gap-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 font-semibold px-4 py-3 rounded-xl transition text-sm text-left"
                  >
                    <span className="text-xl">❌</span>
                    <div>
                      <p className="font-bold">Cancel Order</p>
                      <p className="text-red-500 font-normal text-xs">Guests left / mistake — void the order</p>
                    </div>
                  </button>
                </>
              ) : (
                /* No active order — just free the table */
                <button
                  onClick={() => confirmFreeTable(null)}
                  className="w-full flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 text-green-800 font-semibold px-4 py-3 rounded-xl transition text-sm text-left"
                >
                  <span className="text-xl">🟢</span>
                  <div>
                    <p className="font-bold">Mark Available</p>
                    <p className="text-green-600 font-normal text-xs">No active order — just free the table</p>
                  </div>
                </button>
              )}

              <button
                onClick={() => setFreeTableModal(null)}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 py-2 transition"
              >
                Never mind
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 flex items-center">
                <svg className="w-10 h-10 text-blue-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM4 16a1 1 0 00-1 1v2a1 1 0 001 1h12a1 1 0 001-1v-2a1 1 0 00-1-1H4z" />
                </svg>
                Manager Portal
              </h1>
              <p className="text-gray-600 mt-1">Manage tables, orders, and kitchen operations</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">👤 {user?.full_name || user?.email}</span>
              {hasAnyOf(FEATURES.DINE_IN, FEATURES.TAKEAWAY, FEATURES.DELIVERY) && (
              <button
                onClick={() => { setShowNewOrder(true); setActiveTab('orders'); }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Order
              </button>
              )}
              <button
                onClick={logout}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-5 rounded-lg transition flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ── Stats bar ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Waiting',     value: waitingTokens.length,  colour: 'bg-orange-50 border-orange-200 text-orange-700' },
            { label: 'Seated',      value: seatedTokens.length,   colour: 'bg-green-50  border-green-200  text-green-700'  },
            { label: 'Takeaway',    value: takeawayTokens.length, colour: 'bg-blue-50   border-blue-200   text-blue-700'   },
            { label: 'Tables Free', value: freeTablesCount,       colour: 'bg-gray-50   border-gray-200   text-gray-700'   },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border px-5 py-4 ${s.colour}`}>
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-sm font-medium mt-1 opacity-80">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-6 bg-white rounded-xl p-1.5 shadow-sm w-fit">
          {[
            ...(hasFeature(FEATURES.TOKEN_MANAGEMENT) ? [{ key: 'queue', label: `Queue${waitingTokens.length ? ` (${waitingTokens.length})` : ''}` }] : []),
            { key: 'tables', label: 'Tables' },
            { key: 'orders', label: 'Active Orders' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TAB: QUEUE
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'queue' && (
          <div className="space-y-10">

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                🟠 Waiting for Table
                <span className="text-sm font-normal text-gray-500">
                  ({waitingTokens.length} token{waitingTokens.length !== 1 ? 's' : ''})
                </span>
              </h2>

              {waitingTokens.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                  No customers waiting right now.
                </div>
              ) : (
                <div className="grid gap-4">
                  {waitingTokens.map(token => {
                    const avail = availableTablesFor(token.pax);
                    const isAssigning = assigningToken === token.id;
                    return (
                      <div key={token.id} className="bg-white rounded-xl shadow-sm p-5 border border-orange-100">
                        <div className="flex items-start justify-between gap-4">
                          <div className="w-14 h-14 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-lg font-bold flex-shrink-0">
                            {String(token.id).replace('T-', '')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900 text-lg">{token.id}</span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TOKEN_PILL.waiting}`}>Waiting</span>
                            </div>
                            <p className="text-gray-600 text-sm mt-0.5">
                              {token.name} · {token.pax} {token.pax === 1 ? 'person' : 'people'} · Arrived {safeFormat(token.arrived_at, 'HH:mm')}
                            </p>
                            {token.phone && <p className="text-gray-400 text-xs mt-0.5">📱 +{token.phone}</p>}
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                              <select
                                value={assignTableSel[token.id] || ''}
                                onChange={e => setAssignTableSel(prev => ({ ...prev, [token.id]: e.target.value }))}
                                disabled={avail.length === 0}
                                className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                              >
                                <option value="">{avail.length === 0 ? 'No tables available' : '— assign table —'}</option>
                                {avail.map(t => (
                                  <option key={t.id} value={t.id}>
                                    Table {t.table_number}{t.capacity ? ` (${t.capacity} seats)` : ''}{t.section ? ` · ${t.section}` : ''}
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => assignTable(token)}
                                disabled={!assignTableSel[token.id] || isAssigning}
                                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1"
                              >
                                {isAssigning
                                  ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />Assigning...</>
                                  : '✓ Assign + Notify'
                                }
                              </button>
                              <button onClick={() => dismissToken(token.id)} className="text-gray-400 hover:text-red-500 text-sm px-2 py-2 transition" title="Dismiss">✕</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {seatedTokens.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-4">🟢 Seated</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {seatedTokens.map(token => (
                    <div key={token.id} className="bg-white rounded-xl shadow-sm p-5 border border-green-100 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold">
                          {String(token.id).replace('T-', '')}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">{token.id}</span>
                            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Table {token.table_number}</span>
                          </div>
                          <p className="text-gray-500 text-sm">{token.name} · {token.pax} pax</p>
                        </div>
                      </div>
                      <button onClick={() => completeToken(token)} className="text-xs bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-600 font-semibold px-3 py-2 rounded-lg transition">
                        Free Table
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {takeawayTokens.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-4">🔵 Takeaway</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {takeawayTokens.map(token => (
                    <div key={token.id} className="bg-white rounded-xl shadow-sm p-5 border border-blue-100 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                          {String(token.id).replace('T-', '')}
                        </div>
                        <div>
                          <span className="font-bold text-gray-900">{token.id}</span>
                          <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${TOKEN_PILL.takeaway}`}>Takeaway</span>
                          <p className="text-gray-500 text-sm">{token.name} · {safeFormat(token.arrived_at, 'HH:mm')}</p>
                        </div>
                      </div>
                      <button onClick={() => dismissToken(token.id)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold px-3 py-2 rounded-lg transition">Done</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB: TABLES
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'tables' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Table Allocation</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {tables.map(table => {
                const { status, order, token } = getTableStatus(table);
                return (
                  <div
                    key={table.id}
                    className={`p-6 rounded-xl text-white font-bold text-xl shadow-lg flex flex-col items-center ${TABLE_COLOURS[status] || 'bg-gray-500'}`}
                  >
                    <p className="text-sm opacity-90 mb-2">Table {table.table_number}</p>
                    <p className="text-2xl mb-3">🪑</p>
                    <p className="capitalize text-sm mb-2">{status}</p>
                    {token && (
                      <p className="text-xs opacity-90 bg-black bg-opacity-20 px-2 py-1 rounded mb-1">
                        Token: {token.id}
                      </p>
                    )}
                    {order && (
                      <p className="text-xs opacity-80 bg-black bg-opacity-20 px-2 py-1 rounded mb-3">
                        Order: {order.order_number?.slice(-4)}
                      </p>
                    )}
                    {status === 'occupied' ? (
                      <button
                        onClick={() => openFreeTableModal(table)}
                        className="mt-auto text-xs bg-white bg-opacity-25 hover:bg-opacity-40 border border-white border-opacity-50 px-3 py-1.5 rounded-lg font-semibold transition w-full"
                      >
                        Mark Available
                      </button>
                    ) : (
                      <button
                        onClick={() => { setSelectedTable(table.id); setShowNewOrder(true); }}
                        className="mt-auto text-xs bg-white bg-opacity-25 hover:bg-opacity-40 border border-white border-opacity-50 px-3 py-1.5 rounded-lg font-semibold transition w-full"
                      >
                        + New Order
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-6 flex-wrap">
              {Object.entries({ available: 'Available', occupied: 'Occupied', reserved: 'Reserved', dirty: 'Needs cleaning' }).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className={`w-3 h-3 rounded-full ${TABLE_COLOURS[k]}`} />
                  {v}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB: ORDERS
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Active Orders</h2>
            <div className="grid gap-6">
              {orders
                .filter(o => ACTIVE_ORDER_STATUSES.includes(o.status))
                .map(order => {
                  const table = tables.find(t => t.id === order.table_id);
                  return (
                    <div key={order.id} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">Order #{order.order_number?.slice(-4)}</h3>
                          <p className="text-gray-600 text-sm mt-1">Table {table?.table_number || 'N/A'} · {table?.section}</p>
                          <p className="text-gray-500 text-xs mt-2">{safeFormat(order.created_at, 'HH:mm:ss')}</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-2">Items</p>
                          <div className="space-y-1">
                            {order.order_items?.map((item, idx) => (
                              <p key={idx} className="text-sm text-gray-600">
                                {item.quantity}x {item.menu_item?.name}
                                <span className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${
                                  item.status === 'pending'     ? 'bg-red-100 text-red-700' :
                                  item.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                                  item.status === 'ready'       ? 'bg-green-100 text-green-700' :
                                                                  'bg-gray-100 text-gray-700'
                                }`}>{item.status}</span>
                              </p>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-700 mb-2">Total</p>
                          <p className="text-2xl font-bold text-blue-600">₹{order.total_amount?.toFixed(2)}</p>
                          <p className="text-xs text-gray-500 mt-1">Status: <span className="font-semibold capitalize">{order.status}</span></p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button onClick={() => setSelectedOrder(order)} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition text-sm">View Details</button>
                          {order.status === 'in_progress' && (
                            <button onClick={() => markOrderReady(order.id)} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition text-sm">Mark Ready</button>
                          )}
                          <button onClick={() => cancelOrder(order.id, order.table_id)} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg transition text-sm">Cancel</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              {orders.filter(o => ACTIVE_ORDER_STATUSES.includes(o.status)).length === 0 && (
                <div className="bg-white rounded-xl p-10 text-center text-gray-400 shadow-sm">No active orders.</div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Order Detail Modal ─────────────────────────────────────────────── */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full">
            <div className="bg-blue-600 text-white p-5 rounded-t-lg flex justify-between items-center">
              <h3 className="text-xl font-bold">Order #{selectedOrder.order_number?.slice(-4)}</h3>
              <button onClick={() => setSelectedOrder(null)} className="text-2xl hover:opacity-80">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-500">Table</p><p className="font-semibold">{tables.find(t => t.id === selectedOrder.table_id)?.table_number || 'N/A'}</p></div>
                <div><p className="text-gray-500">Status</p><p className="font-semibold capitalize">{selectedOrder.status}</p></div>
                <div><p className="text-gray-500">Time</p><p className="font-semibold">{safeFormat(selectedOrder.created_at, 'HH:mm:ss')}</p></div>
                <div><p className="text-gray-500">Payment</p><p className="font-semibold capitalize">{selectedOrder.payment_status || 'Unpaid'}</p></div>
              </div>
              <div>
                <p className="text-gray-500 text-sm mb-2 font-semibold">Items</p>
                <div className="space-y-2">
                  {selectedOrder.order_items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-gray-50 rounded p-2 text-sm">
                      <span>{item.quantity}x {item.menu_item?.name}</span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        item.status === 'pending'     ? 'bg-red-100 text-red-700' :
                        item.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                        item.status === 'ready'       ? 'bg-green-100 text-green-700' :
                                                        'bg-gray-100 text-gray-700'
                      }`}>{item.status}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t pt-4 flex justify-between items-center">
                <div>
                  <p className="text-gray-500 text-sm">Total</p>
                  <p className="text-2xl font-bold text-blue-600">₹{selectedOrder.total_amount?.toFixed(2)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { cancelOrder(selectedOrder.id, selectedOrder.table_id); setSelectedOrder(null); }} className="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg text-sm">Cancel Order</button>
                  {selectedOrder.status === 'in_progress' && (
                    <button onClick={() => { markOrderReady(selectedOrder.id); setSelectedOrder(null); }} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg text-sm">Mark Ready</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New Order Modal ─────────────────────────────────────────────────── */}
      {showNewOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="sticky top-0 bg-blue-600 text-white p-6 flex justify-between items-center">
              <h3 className="text-2xl font-bold">
                New Order {selectedTable ? `- Table ${tables.find(t => t.id === selectedTable)?.table_number}` : ''}
              </h3>
              <button onClick={() => setShowNewOrder(false)} className="text-2xl hover:opacity-80 transition">✕</button>
            </div>
            <div className="p-6">
              <p className="font-semibold text-gray-900 mb-4">Select items:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {menuItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      const existing = selectedItems.find(i => i.id === item.id);
                      if (existing) setSelectedItems(selectedItems.filter(i => i.id !== item.id));
                      else setSelectedItems([...selectedItems, { ...item, quantity: 1 }]);
                    }}
                    className={`p-3 rounded-lg border-2 transition text-left ${
                      selectedItems.find(i => i.id === item.id)
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-600'
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-blue-600 font-bold">₹{item.price?.toFixed(2)}</p>
                  </button>
                ))}
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowNewOrder(false)} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold py-3 rounded-lg transition">Cancel</button>
                <button
                  onClick={createOrder}
                  disabled={isSubmitting}
                  className={`flex-1 font-bold py-3 rounded-lg transition text-white ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {isSubmitting ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
