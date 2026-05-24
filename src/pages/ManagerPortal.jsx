// ============================================================================
// AUTOM8 FRONTEND - MANAGER PORTAL
// src/pages/ManagerPortal.jsx
//
// FIX: Removed all useSubscription / hasFeature / hasAnyOf / FEATURES usage.
//
// MENU TAB: Added Excel catalog upload flow + real-time availability toggle.
//   - Toggle switch on each menu item → PUT /api/menu-items/:id/availability
//   - Updates is_stocked in DB + pushes to Meta catalog immediately
//   - Excel is_available column now passed through to backend
//
// Fix 22 — Large Party Approval:
//   A new "🟣 Pending Approval" section in the Queue tab shows large_party
//   tokens (status='pending_approval'). Manager sees the customer name, pax,
//   and proposed table split. Two buttons: Approve and Reject (with optional
//   reason). On Approve the bot notifies the customer and the token moves to
//   the normal waiting queue. On Reject the customer is offered a reservation.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO } from 'date-fns';

const TABLE_COLOURS = {
  available: 'bg-green-500',
  occupied:  'bg-blue-500',
  reserved:  'bg-yellow-500',
  dirty:     'bg-red-500',
};

const TOKEN_PILL = {
  waiting:          'bg-orange-100 text-orange-700',
  seated:           'bg-green-100  text-green-700',
  takeaway:         'bg-blue-100   text-blue-700',
  completed:        'bg-gray-100   text-gray-500',
  pending_approval: 'bg-purple-100 text-purple-700',
};

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

const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'in_progress'];

const SLOT_LABEL_TO_DB = {
  'morning tiffin': 'morning_tiffin',
  'lunch':          'lunch',
  'evening snacks': 'evening_snacks',
  'dinner tiffin':  'dinner_tiffin',
};

function mapExcelRowToMenuItem(row) {
  const id          = String(row['id']          || row['ID']          || '').trim();
  const name        = String(row['title']        || row['name']        || row['Title'] || row['Name'] || '').trim();
  const description = String(row['description']  || row['Description'] || '').trim();
  const priceRaw    = row['price']               || row['Price']       || 0;
  const price       = parseFloat(String(priceRaw).replace(/[^0-9.]/g, '')) || 0;
  const slotRaw     = String(row['custom_label_0'] || row['time_slot'] || row['category'] || '').trim().toLowerCase();
  const time_slot   = SLOT_LABEL_TO_DB[slotRaw] || 'morning_tiffin';
  const image_url   = String(row['image_link']   || row['image_url']   || '').trim();
  // PATCH: read is_available from Excel → is_stocked in DB (permanent OOS flag)
  // Accepts TRUE/FALSE, 1/0, yes/no (case-insensitive). Absent column = omit (defaults to true).
  const availRaw    = row['is_available'] ?? row['Is Available'] ?? row['is_stocked'] ?? '';
  const is_available = availRaw === '' ? undefined
    : !['false', '0', 'no'].includes(String(availRaw).toLowerCase().trim());
  return { id, name, description, price, time_slot, image_url,
           ...(is_available !== undefined ? { is_available } : {}) };
}

function validateRow(row, index) {
  const errors = [];
  if (!row.id)    errors.push(`Row ${index + 1}: missing id`);
  if (!row.name)  errors.push(`Row ${index + 1}: missing name/title`);
  if (row.price <= 0) errors.push(`Row ${index + 1} (${row.name || row.id}): price must be > 0`);
  return errors;
}

export default function ManagerPortal() {
  const { user, apiClient, logout } = useAuth();

  const [tables,        setTables]        = useState([]);
  const [orders,        setOrders]        = useState([]);
  const [menuItems,     setMenuItems]     = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showNewOrder,  setShowNewOrder]  = useState(false);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [tokens,         setTokens]         = useState([]);
  const [assigningToken, setAssigningToken] = useState(null);
  const [assignTableSel, setAssignTableSel] = useState({});
  const [activeTab,      setActiveTab]      = useState('queue');
  const [toastMsg,       setToastMsg]       = useState('');

  const [freeTableModal, setFreeTableModal] = useState(null);

  const [rejectModal,    setRejectModal]    = useState(null);
  const [rejectReason,   setRejectReason]   = useState('');
  const [processingId,   setProcessingId]   = useState(null);

  const [uploadFile,      setUploadFile]      = useState(null);
  const [uploadRows,      setUploadRows]       = useState([]);
  const [uploadErrors,    setUploadErrors]     = useState([]);
  const [uploadDragOver,  setUploadDragOver]   = useState(false);
  const [uploadStatus,    setUploadStatus]     = useState('idle');
  const [uploadResult,    setUploadResult]     = useState(null);
  const fileInputRef = useRef(null);

  // PATCH: toggle state for mid-service availability changes
  const [togglingId, setTogglingId] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

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
      // PATCH: ignore_slot=true so ALL items show in the menu table,
      // not just those matching the current time slot
      const res = await apiClient.get('/api/menu-items?ignore_slot=true');
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

  const getTableStatus = (table) => {
    const order = orders.find(o => o.table_id === table.id && ACTIVE_ORDER_STATUSES.includes(o.status));
    const token = tokens.find(t => t.table_id === table.id && t.status === 'seated');
    const dbStatus = table.status || 'available';
    return { status: (order || token) ? 'occupied' : dbStatus, order, token };
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
    meta:         t.meta || {},
  });

  const normalisedTokens      = tokens.map(normaliseToken);
  const waitingTokens         = normalisedTokens.filter(t => t.status === 'waiting');
  const seatedTokens          = normalisedTokens.filter(t => t.status === 'seated');
  const takeawayTokens        = normalisedTokens.filter(t => t.status === 'takeaway');
  const pendingApprovalTokens = normalisedTokens.filter(t => t.status === 'pending_approval');
  const freeTablesCount       = tables.filter(t => getTableStatus(t).status === 'available').length;

  const openFreeTableModal = (table) => {
    const { order, token } = getTableStatus(table);
    setFreeTableModal({ tableId: table.id, tableNumber: table.table_number, order: order || null, token: token || null });
  };

  const confirmFreeTable = async (orderAction) => {
    const { tableId, tableNumber, order, token } = freeTableModal;
    setFreeTableModal(null);
    try {
      if (order && orderAction === 'complete') await apiClient.put(`/api/orders/${order.id}/status`, { status: 'completed' });
      else if (order && orderAction === 'cancel') await apiClient.delete(`/api/orders/${order.id}`);
      if (token) {
        try { await apiClient.put(`/api/tokens/${token.id}/complete`); }
        catch (tokErr) { console.warn('Could not complete token:', tokErr.message); }
      }
      await apiClient.put(`/api/tables/${tableId}/status`, { status: 'available' });
      await fetchTables(); await fetchOrders(); await fetchTokens();
      showToast(`✅ Table ${tableNumber} is now available`);
    } catch (err) {
      console.error('Failed to free table:', err);
      showToast(`❌ Failed: ${err.message}`);
    }
  };

  // ─── Large party approval helpers ─────────────────────────────────────────

  const approveToken = async (token) => {
    setProcessingId(token.id);
    try {
      await apiClient.put(`/api/tokens/${token.id}/approve`);
      showToast(`✅ ${token.id} approved — customer notified`);
      await fetchTokens();
    } catch (err) {
      console.error('Failed to approve token:', err);
      showToast(`❌ Approve failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (token) => {
    setRejectReason('');
    setRejectModal({ tokenId: token.id, tokenName: token.name, pax: token.pax });
  };

  const confirmReject = async () => {
    if (!rejectModal) return;
    setProcessingId(rejectModal.tokenId);
    setRejectModal(null);
    try {
      await apiClient.put(`/api/tokens/${rejectModal.tokenId}/reject`, { reason: rejectReason || undefined });
      showToast(`Token ${rejectModal.tokenId} rejected — customer offered reservation`);
      await fetchTokens();
    } catch (err) {
      console.error('Failed to reject token:', err);
      showToast(`❌ Reject failed: ${err.message}`);
    } finally {
      setProcessingId(null);
      setRejectReason('');
    }
  };

  // ─── Token helpers ──────────────────────────────────────────────────────────

  const assignTable = async (token) => {
    const tableId = assignTableSel[token.id];
    if (!tableId) { showToast('Please select a table first'); return; }
    const table = tables.find(t => String(t.id) === String(tableId));
    if (!table) return;
    setAssigningToken(token.id);
    try {
      await apiClient.put(`/api/tokens/${token.id}/assign`, { table_id: table.id, table_number: table.table_number });
      showToast(`✅ Token ${token.id} → Table ${table.table_number} · WhatsApp sent`);
      setAssignTableSel(prev => { const n = {...prev}; delete n[token.id]; return n; });
      await fetchTokens(); await fetchTables();
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
      await fetchTokens(); await fetchTables();
    } catch (err) {
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

  // ─── Menu availability toggle (PATCH) ─────────────────────────────────────
  // Real-time mid-service: when an item runs out, manager taps the toggle.
  // Calls PUT /api/menu-items/:id/availability → updates is_stocked in DB
  // + immediately pushes to Meta catalog (single item, ~2 seconds).
  // No Excel upload or restart needed.

  const toggleAvailability = async (item) => {
    setTogglingId(item.id);
    const newValue = !(item.is_stocked ?? item.is_available);
    try {
      await apiClient.put(`/api/menu-items/${item.id}/availability`, { is_available: newValue });
      // Optimistic update so the toggle flips immediately in the UI
      setMenuItems(prev => prev.map(m =>
        m.id === item.id ? { ...m, is_stocked: newValue, is_available: newValue } : m
      ));
      showToast(newValue
        ? `✅ ${item.name} is back in stock`
        : `⛔ ${item.name} marked out of stock — WhatsApp catalog updated`
      );
    } catch (err) {
      showToast(`❌ Failed to update ${item.name}: ${err.message}`);
    } finally {
      setTogglingId(null);
    }
  };

  // ─── Order helpers ──────────────────────────────────────────────────────────

  const createOrder = async () => {
    if (!selectedTable || selectedItems.length === 0) { showToast('Please select a table and items'); return; }
    if (isSubmitting) return;
    setIsSubmitting(true);
    setShowNewOrder(false);
    const tableId = selectedTable;
    const items = selectedItems.map(item => ({ menu_item_id: item.id, quantity: item.quantity || 1, special_instructions: item.special_instructions }));
    setSelectedItems([]); setSelectedTable(null);
    try {
      await apiClient.post('/api/orders', { table_id: tableId, items, notes: '' });
      await fetchOrders(); await fetchTables();
    } catch (err) {
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
      showToast('Error cancelling order: ' + err.message);
    }
  };

  const markOrderReady = async (orderId) => {
    try {
      await apiClient.put(`/api/orders/${orderId}/status`, { status: 'completed' });
      fetchData();
    } catch (err) {
      showToast('Error updating order: ' + err.message);
    }
  };

  // ─── Menu upload helpers ────────────────────────────────────────────────────

  const parseExcelFile = (file) => {
    setUploadStatus('parsing'); setUploadErrors([]); setUploadRows([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook  = XLSX.read(e.target.result, { type: 'array' });
        const sheetName = workbook.SheetNames.includes('WhatsApp Catalog') ? 'WhatsApp Catalog' : workbook.SheetNames[0];
        const sheet     = workbook.Sheets[sheetName];
        const rawRows   = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (rawRows.length === 0) { setUploadErrors(['The selected sheet appears to be empty.']); setUploadStatus('idle'); return; }
        const mapped   = rawRows.map(mapExcelRowToMenuItem);
        const nonEmpty = mapped.filter(r => r.id || r.name);
        const allErrors = nonEmpty.flatMap((r, i) => validateRow(r, i));
        setUploadRows(nonEmpty); setUploadErrors(allErrors); setUploadStatus('preview');
      } catch (err) {
        setUploadErrors([`Could not read the file: ${err.message}`]); setUploadStatus('idle');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
    if (!isExcel) { setUploadErrors(['Please upload an Excel file (.xlsx or .xls) or CSV.']); return; }
    setUploadFile(file); parseExcelFile(file);
  };

  const handleDrop = (e) => { e.preventDefault(); setUploadDragOver(false); handleFileSelect(e.dataTransfer.files[0]); };

  const handleConfirmUpload = async () => {
    if (uploadErrors.length > 0) { showToast('Fix the errors before uploading'); return; }
    setUploadStatus('uploading');
    try {
      const res = await apiClient.post('/api/menu/upload', { items: uploadRows });
      setUploadResult(res.data); setUploadStatus('done');
      await fetchMenuItems();
      showToast(`✅ Menu updated — ${res.data.upserted} items saved`);
    } catch (err) {
      setUploadErrors([`Upload failed: ${err.response?.data?.error || err.message}`]); setUploadStatus('preview');
    }
  };

  const handleResetUpload = () => {
    setUploadFile(null); setUploadRows([]); setUploadErrors([]);
    setUploadStatus('idle'); setUploadResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const SLOT_DB_TO_LABEL = {
    morning_tiffin: 'Morning Tiffin', lunch: 'Lunch',
    evening_snacks: 'Evening Snacks', dinner_tiffin: 'Dinner Tiffin',
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl">
          {toastMsg}
        </div>
      )}

      {/* ── Reject reason modal ─────────────────────────────────────────────── */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="bg-red-600 text-white px-6 py-5">
              <h3 className="text-lg font-bold">Reject Large Party Request</h3>
              <p className="text-red-100 text-sm mt-0.5">{rejectModal.tokenName} · {rejectModal.pax} people</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Reason <span className="text-gray-400 font-normal">(optional — sent to customer)</span>
                </label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="e.g. Not enough space tonight, try reserving for tomorrow"
                  rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setRejectModal(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition">Cancel</button>
                <button onClick={confirmReject} className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition">Reject & Notify</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Free Table Modal ────────────────────────────────────────────────── */}
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
                  <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-700 mb-2">
                    <p className="font-semibold text-gray-900 mb-1">Order #{freeTableModal.order.order_number?.slice(-4)}</p>
                    <p>Status: <span className="capitalize font-medium">{freeTableModal.order.status}</span></p>
                    <p>Amount: <span className="font-medium">₹{freeTableModal.order.total_amount?.toFixed(2) ?? '—'}</span></p>
                  </div>
                  <button onClick={() => confirmFreeTable('complete')} className="w-full flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 text-green-800 font-semibold px-4 py-3 rounded-xl transition text-sm text-left">
                    <span className="text-xl">✅</span>
                    <div><p className="font-bold">Order Completed</p><p className="text-green-600 font-normal text-xs">Guests paid and left — mark order done</p></div>
                  </button>
                  <button onClick={() => confirmFreeTable('cancel')} className="w-full flex items-center gap-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 font-semibold px-4 py-3 rounded-xl transition text-sm text-left">
                    <span className="text-xl">❌</span>
                    <div><p className="font-bold">Cancel Order</p><p className="text-red-500 font-normal text-xs">Guests left / mistake — void the order</p></div>
                  </button>
                </>
              ) : (
                <button onClick={() => confirmFreeTable(null)} className="w-full flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 text-green-800 font-semibold px-4 py-3 rounded-xl transition text-sm text-left">
                  <span className="text-xl">🟢</span>
                  <div><p className="font-bold">Mark Available</p><p className="text-green-600 font-normal text-xs">No active order — just free the table</p></div>
                </button>
              )}
              <button onClick={() => setFreeTableModal(null)} className="w-full text-center text-sm text-gray-400 hover:text-gray-600 py-2 transition">Never mind</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
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
              <button onClick={() => { setShowNewOrder(true); setActiveTab('orders'); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                New Order
              </button>
              <button onClick={logout} className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-5 rounded-lg transition flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" /></svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ── Stats bar ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Approval Needed', value: pendingApprovalTokens.length, colour: 'bg-purple-50 border-purple-200 text-purple-700' },
            { label: 'Waiting',         value: waitingTokens.length,          colour: 'bg-orange-50 border-orange-200 text-orange-700' },
            { label: 'Seated',          value: seatedTokens.length,           colour: 'bg-green-50  border-green-200  text-green-700'  },
            { label: 'Takeaway',        value: takeawayTokens.length,         colour: 'bg-blue-50   border-blue-200   text-blue-700'   },
            { label: 'Tables Free',     value: freeTablesCount,               colour: 'bg-gray-50   border-gray-200   text-gray-700'   },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border px-5 py-4 ${s.colour}`}>
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-sm font-medium mt-1 opacity-80">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────────────── */}
        <div className="flex gap-2 mb-6 bg-white rounded-xl p-1.5 shadow-sm w-fit">
          {[
            { key: 'queue',  label: `Queue${(waitingTokens.length + pendingApprovalTokens.length) ? ` (${waitingTokens.length + pendingApprovalTokens.length})` : ''}` },
            { key: 'tables', label: 'Tables' },
            { key: 'orders', label: 'Active Orders' },
            { key: 'menu',   label: 'Menu' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${activeTab === tab.key ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:text-gray-900'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: QUEUE
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'queue' && (
          <div className="space-y-10">

            {pendingApprovalTokens.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  🟣 Pending Approval
                  <span className="text-sm font-normal text-gray-500">
                    ({pendingApprovalTokens.length} large {pendingApprovalTokens.length === 1 ? 'party' : 'parties'})
                  </span>
                </h2>
                <div className="grid gap-4">
                  {pendingApprovalTokens.map(token => {
                    const combo = token.meta?.combo ?? [];
                    const isProcessing = processingId === token.id;
                    const tableLines = combo.length > 0
                      ? combo.map(t => `Table ${t[0]} (${t[2]}/${t[1]} seats)`).join(' + ')
                      : `${token.pax} seats across multiple tables`;
                    return (
                      <div key={token.id} className="bg-white rounded-xl shadow-sm p-5 border border-purple-200">
                        <div className="flex items-start gap-4">
                          <div className="w-14 h-14 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-lg font-bold flex-shrink-0">
                            {String(token.id).replace('T-', '')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900 text-lg">{token.id}</span>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TOKEN_PILL.pending_approval}`}>Needs Approval</span>
                            </div>
                            <p className="text-gray-600 text-sm mt-0.5">
                              {token.name} · <strong>{token.pax} people</strong> · Arrived {safeFormat(token.arrived_at, 'HH:mm')}
                            </p>
                            {token.phone && <p className="text-gray-400 text-xs mt-0.5">📱 +{token.phone}</p>}
                            <div className="mt-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-xs text-purple-800">
                              <span className="font-semibold">Proposed split: </span>{tableLines}
                            </div>
                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                              <button onClick={() => approveToken(token)} disabled={isProcessing}
                                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1">
                                {isProcessing ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Processing...</> : '✅ Approve'}
                              </button>
                              <button onClick={() => openRejectModal(token)} disabled={isProcessing}
                                className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50">
                                ❌ Reject
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                🟠 Waiting for Table
                <span className="text-sm font-normal text-gray-500">({waitingTokens.length} token{waitingTokens.length !== 1 ? 's' : ''})</span>
              </h2>
              {waitingTokens.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">No customers waiting right now.</div>
              ) : (
                <div className="grid gap-4">
                  {waitingTokens.map(token => {
                    const avail = availableTablesFor(token.pax);
                    const isAssigning = assigningToken === token.id;
                    return (
                      <div key={token.id} className="bg-white rounded-xl shadow-sm p-5 border border-orange-100">
                        <div className="flex items-start gap-4">
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
                              <select value={assignTableSel[token.id] || ''} onChange={e => setAssignTableSel(prev => ({ ...prev, [token.id]: e.target.value }))}
                                disabled={avail.length === 0} className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50">
                                <option value="">{avail.length === 0 ? 'No tables available' : '— assign table —'}</option>
                                {avail.map(t => (
                                  <option key={t.id} value={t.id}>
                                    Table {t.table_number}{t.capacity ? ` (${t.capacity} seats)` : ''}{t.section ? ` · ${t.section}` : ''}
                                  </option>
                                ))}
                              </select>
                              <button onClick={() => assignTable(token)} disabled={!assignTableSel[token.id] || isAssigning}
                                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition flex items-center gap-1">
                                {isAssigning ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Assigning...</> : '✓ Assign + Notify'}
                              </button>
                              <button onClick={() => dismissToken(token.id)} className="text-gray-400 hover:text-red-500 text-sm px-2 py-2 transition" title="Dismiss token">✕</button>
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
                        <div className="w-12 h-12 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold">{String(token.id).replace('T-', '')}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">{token.id}</span>
                            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Table {token.table_number}</span>
                          </div>
                          <p className="text-gray-500 text-sm">{token.name} · {token.pax} pax</p>
                        </div>
                      </div>
                      <button onClick={() => completeToken(token)} className="text-xs bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-600 font-semibold px-3 py-2 rounded-lg transition">Free Table</button>
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
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">{String(token.id).replace('T-', '')}</div>
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

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: TABLES
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'tables' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Table Allocation</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {tables.map(table => {
                const { status, order, token } = getTableStatus(table);
                return (
                  <div key={table.id} className={`p-6 rounded-xl text-white font-bold text-xl shadow-lg flex flex-col items-center ${TABLE_COLOURS[status] || 'bg-gray-500'}`}>
                    <p className="text-sm opacity-90 mb-2">Table {table.table_number}</p>
                    <p className="text-2xl mb-3">🪑</p>
                    <p className="capitalize text-sm mb-2">{status}</p>
                    {token && <p className="text-xs opacity-90 bg-black bg-opacity-20 px-2 py-1 rounded mb-1">Token: {token.id}</p>}
                    {order && <p className="text-xs opacity-80 bg-black bg-opacity-20 px-2 py-1 rounded mb-3">Order: {order.order_number?.slice(-4)}</p>}
                    {status === 'occupied'
                      ? <button onClick={() => openFreeTableModal(table)} className="mt-auto text-xs bg-white bg-opacity-25 hover:bg-opacity-40 border border-white border-opacity-50 px-3 py-1.5 rounded-lg font-semibold transition w-full">Mark Available</button>
                      : <button onClick={() => { setSelectedTable(table.id); setShowNewOrder(true); }} className="mt-auto text-xs bg-white bg-opacity-25 hover:bg-opacity-40 border border-white border-opacity-50 px-3 py-1.5 rounded-lg font-semibold transition w-full">+ New Order</button>}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-6 flex-wrap">
              {Object.entries({ available: 'Available', occupied: 'Occupied', reserved: 'Reserved', dirty: 'Needs cleaning' }).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className={`w-3 h-3 rounded-full ${TABLE_COLOURS[k]}`} />{v}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: ORDERS
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Active Orders</h2>
            <div className="grid gap-6">
              {orders.filter(o => ACTIVE_ORDER_STATUSES.includes(o.status)).map(order => {
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
                              <span className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${item.status === 'pending' ? 'bg-red-100 text-red-700' : item.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' : item.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{item.status}</span>
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
                        {order.status === 'in_progress' && <button onClick={() => markOrderReady(order.id)} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition text-sm">Mark Ready</button>}
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

        {/* ══════════════════════════════════════════════════════════════════════
            TAB: MENU
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'menu' && (
          <div className="space-y-8">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Menu Management</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Toggle items in/out of stock instantly, or upload the catalog Excel to update prices, names, or add new items.
                </p>
              </div>
              <a href="/catalog_template.xlsx" download className="flex items-center gap-2 bg-white border border-gray-300 hover:border-blue-500 text-gray-700 hover:text-blue-600 font-semibold text-sm px-4 py-2.5 rounded-lg transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download template
              </a>
            </div>

            {uploadStatus === 'idle' && (
              <div onDragOver={e => { e.preventDefault(); setUploadDragOver(true); }} onDragLeave={() => setUploadDragOver(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-2xl px-8 py-14 text-center transition ${uploadDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'}`}>
                <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <p className="text-gray-700 font-semibold text-lg mb-1">Drop your catalog Excel file here</p>
                <p className="text-gray-400 text-sm">or click to browse — .xlsx, .xls, or .csv</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => handleFileSelect(e.target.files[0])} />
              </div>
            )}

            {uploadStatus === 'parsing' && (
              <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600 font-medium">Reading file…</p>
              </div>
            )}

            {uploadStatus === 'preview' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-sm font-semibold px-4 py-2 rounded-full">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    {uploadFile?.name} &mdash; {uploadRows.length} rows found
                  </div>
                  <button onClick={handleResetUpload} className="text-sm text-gray-400 hover:text-red-500 transition">✕ Choose different file</button>
                </div>
                {uploadErrors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <p className="text-red-700 font-semibold text-sm mb-2">⚠️ {uploadErrors.length} issue{uploadErrors.length !== 1 ? 's' : ''} found — fix in the Excel file and re-upload</p>
                    <ul className="list-disc list-inside space-y-1">{uploadErrors.map((e, i) => <li key={i} className="text-red-600 text-xs">{e}</li>)}</ul>
                  </div>
                )}
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600 w-20">ID</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600 w-32">Slot</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600 w-24">Price</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">Description</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {uploadRows.map((row, i) => {
                          const hasError = uploadErrors.some(e => e.includes(`Row ${i + 1}`));
                          return (
                            <tr key={i} className={hasError ? 'bg-red-50' : 'hover:bg-gray-50'}>
                              <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.id}</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                              <td className="px-4 py-3"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{SLOT_DB_TO_LABEL[row.time_slot] || row.time_slot}</span></td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900">₹{row.price.toFixed(2)}</td>
                              <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell max-w-xs truncate">{row.description}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={handleResetUpload} className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition">Cancel</button>
                  <button onClick={handleConfirmUpload} disabled={uploadErrors.length > 0} className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold text-sm transition flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Confirm & Upload {uploadRows.length} items
                  </button>
                </div>
              </div>
            )}

            {uploadStatus === 'uploading' && (
              <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-700 font-semibold">Saving to database…</p>
                <p className="text-gray-400 text-sm mt-1">Updating Meta catalog in the background</p>
              </div>
            )}

            {uploadStatus === 'done' && uploadResult && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
                <p className="text-4xl mb-3">✅</p>
                <p className="text-green-800 font-bold text-xl mb-1">Menu updated successfully</p>
                <p className="text-green-600 text-sm mb-4">
                  {uploadResult.upserted} item{uploadResult.upserted !== 1 ? 's' : ''} saved
                  {uploadResult.skipped > 0 ? ` · ${uploadResult.skipped} skipped` : ''}
                  {' '}· WhatsApp catalog updated · Slot scheduler syncs within 60s
                </p>
                <button onClick={handleResetUpload} className="px-5 py-2 rounded-lg bg-green-700 hover:bg-green-800 text-white font-semibold text-sm transition">Upload another file</button>
              </div>
            )}

            {/* ── Current menu table with availability toggles (PATCH) ───── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">
                  Current menu <span className="ml-2 text-sm font-normal text-gray-400">({menuItems.length} items · all slots)</span>
                </h3>
                <p className="text-xs text-gray-400">Toggle to mark items in/out of stock instantly</p>
              </div>
              {menuItems.length === 0 ? (
                <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">No menu items yet. Upload the catalog Excel to get started.</div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-600 w-36">Slot</th>
                        <th className="text-right px-4 py-3 font-semibold text-gray-600 w-24">Price</th>
                        <th className="text-center px-4 py-3 font-semibold text-gray-600 w-32">In Stock</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {menuItems.map(item => {
                          const inStock = item.is_stocked ?? item.is_available;
                          const isToggling = togglingId === item.id;
                          return (
                            <tr key={item.id} className={`hover:bg-gray-50 ${!inStock ? 'opacity-60' : ''}`}>
                              <td className="px-4 py-3">
                                <span className="font-medium text-gray-900">{item.name}</span>
                                {!inStock && <span className="ml-2 text-xs text-red-500 font-semibold">Out of stock</span>}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                                  {SLOT_DB_TO_LABEL[item.time_slot] || item.time_slot}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900">₹{Number(item.price).toFixed(2)}</td>
                              <td className="px-4 py-3 text-center">
                                {/* PATCH: toggle switch — tap to flip in/out of stock */}
                                <button
                                  onClick={() => toggleAvailability(item)}
                                  disabled={isToggling}
                                  title={inStock ? 'In stock — tap to mark out of stock' : 'Out of stock — tap to mark in stock'}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50
                                    ${inStock ? 'bg-green-500' : 'bg-gray-300'}`}
                                >
                                  {isToggling
                                    ? <span className="absolute inset-0 flex items-center justify-center">
                                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      </span>
                                    : <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                                        ${inStock ? 'translate-x-6' : 'translate-x-1'}`} />
                                  }
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Order Detail Modal ───────────────────────────────────────────────── */}
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
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${item.status === 'pending' ? 'bg-red-100 text-red-700' : item.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' : item.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{item.status}</span>
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

      {/* ── New Order Modal ──────────────────────────────────────────────────── */}
      {showNewOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="sticky top-0 bg-blue-600 text-white p-6 flex justify-between items-center">
              <h3 className="text-2xl font-bold">New Order {selectedTable ? `- Table ${tables.find(t => t.id === selectedTable)?.table_number}` : ''}</h3>
              <button onClick={() => setShowNewOrder(false)} className="text-2xl hover:opacity-80 transition">✕</button>
            </div>
            <div className="p-6">
              <p className="font-semibold text-gray-900 mb-4">Select items:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {menuItems.map(item => (
                  <button key={item.id}
                    onClick={() => {
                      const existing = selectedItems.find(i => i.id === item.id);
                      if (existing) setSelectedItems(selectedItems.filter(i => i.id !== item.id));
                      else setSelectedItems([...selectedItems, { ...item, quantity: 1 }]);
                    }}
                    className={`p-3 rounded-lg border-2 transition text-left ${selectedItems.find(i => i.id === item.id) ? 'border-blue-600 bg-blue-50' : 'border-gray-300 hover:border-blue-600'}`}>
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-blue-600 font-bold">₹{item.price?.toFixed(2)}</p>
                  </button>
                ))}
              </div>
              <div className="flex gap-4">
                <button onClick={() => setShowNewOrder(false)} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold py-3 rounded-lg transition">Cancel</button>
                <button onClick={createOrder} disabled={isSubmitting} className={`flex-1 font-bold py-3 rounded-lg transition text-white ${isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
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
