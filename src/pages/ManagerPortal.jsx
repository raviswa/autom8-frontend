// ============================================================================
// AUTOM8 — MANAGER PORTAL (ENHANCED)
//
// Changes in this revision:
//   1. New-order modal: collects customer name + WhatsApp number BEFORE items.
//      Step 1 = customer details, Step 2 = item selection. Modal has a proper
//      max-height + overflow-y: auto scrollbar so long menus scroll.
//   2. Table status management:
//      - Available tables show a "Set status" menu (Reserved / Cleaning).
//      - Reserved tables accept a duration (30 / 60 / 90 / 120 min).
//      - Auto-release: a client-side interval ticks every 30 s and frees
//        any reserved table whose reservation_expires timestamp has passed.
//        The interval fires PUT /api/tables/:id/status → 'available'.
//   3. Booking guard: occupied / reserved / cleaning tables block the
//      "+ New order" button and show the appropriate action instead.
//   4. All existing functionality (queue, orders, menu, tokens) preserved.
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import { useKOTPrint } from '../components/KOTPrint';
import { kotRef } from '../App';
import { format } from 'date-fns';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  primary:       "#378ADD",
  primaryDark:   "#185FA5",
  primaryLight:  "#E6F1FB",
  primaryBorder: "#B5D4F4",
  success:       "#1D9E75",
  successLight:  "#E1F5EE",
  successBorder: "#9FE1CB",
  successDark:   "#085041",
  warning:       "#BA7517",
  warningLight:  "#FAEEDA",
  warningBorder: "#FAC775",
  warningDark:   "#633806",
  danger:        "#A32D2D",
  dangerLight:   "#FCEBEB",
  dangerBorder:  "#F7C1C1",
  dangerDark:    "#791F1F",
  accent:        "#7B61FF",
  accentLight:   "#EEEDFE",
  accentBorder:  "#CECBF6",
  accentDark:    "#3C3489",
  pageBg:        "#F5F5F3",
  cardBg:        "#ffffff",
  surfaceBg:     "#F5F5F3",
  border:        "#E8E8E5",
  borderStrong:  "#D0D0CC",
  text:          "#111111",
  textSub:       "#555555",
  textMuted:     "#999999",
};

const CARD = {
  background: C.cardBg,
  border: `0.5px solid ${C.border}`,
  borderRadius: 12,
  padding: "20px 24px",
};

// ─── Table status palette ──────────────────────────────────────────────────────
const TABLE_STATUS = {
  available: { bg: C.successLight,  text: C.successDark,  label: "Available" },
  occupied:  { bg: C.primaryLight,  text: C.primaryDark,  label: "Occupied"  },
  reserved:  { bg: C.warningLight,  text: C.warningDark,  label: "Reserved"  },
  dirty:     { bg: C.dangerLight,   text: C.dangerDark,   label: "Cleaning"  },
};

const TOKEN_STATUS = {
  waiting:          { bg: C.warningLight,  color: C.warningDark,  avatarBg: "#FAEEDA", avatarColor: C.warningDark  },
  seated:           { bg: C.successLight,  color: C.successDark,  avatarBg: "#E1F5EE", avatarColor: C.successDark  },
  takeaway:         { bg: C.primaryLight,  color: C.primaryDark,  avatarBg: "#E6F1FB", avatarColor: C.primaryDark  },
  pending_approval: { bg: C.accentLight,   color: C.accentDark,   avatarBg: "#EEEDFE", avatarColor: C.accentDark   },
};

const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'in_progress'];

const SLOT_LABEL_TO_DB = {
  'morning tiffin': 'morning_tiffin',
  'lunch':          'lunch',
  'evening snacks': 'evening_snacks',
  'dinner tiffin':  'dinner_tiffin',
};
const SLOT_DB_TO_LABEL = {
  morning_tiffin: 'Morning Tiffin',
  lunch:          'Lunch',
  evening_snacks: 'Evening Snacks',
  dinner_tiffin:  'Dinner Tiffin',
};

// Reservation duration options (minutes)
const RESERVATION_DURATIONS = [30, 60, 90, 120];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safeFormat(dateVal, fmt) {
  if (!dateVal) return '—';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '—';
    if (fmt === 'HH:mm') {
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
    return format(d, fmt);
  } catch { return '—'; }
}

// Returns mm:ss remaining string, or null if expired
function reservationCountdown(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// ─── UI Primitives ────────────────────────────────────────────────────────────
function Spinner({ size = 20 }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid ${C.border}`,
      borderTop: `2px solid ${C.primary}`,
      borderRadius: "50%",
      animation: "spin .7s linear infinite",
      display: "inline-block", flexShrink: 0,
    }} />
  );
}

const PILL_VARIANTS = {
  blue:   { color: C.primaryDark,  background: C.primaryLight  },
  green:  { color: "#27500A",      background: "#EAF3DE"       },
  amber:  { color: C.warningDark,  background: C.warningLight  },
  red:    { color: C.dangerDark,   background: C.dangerLight   },
  gray:   { color: "#444441",      background: "#F1EFE8"       },
  purple: { color: C.accentDark,   background: C.accentLight   },
  teal:   { color: C.successDark,  background: C.successLight  },
};
function Pill({ label, variant = "gray" }) {
  const v = PILL_VARIANTS[variant] ?? PILL_VARIANTS.gray;
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: "2px 8px",
      borderRadius: 20, letterSpacing: "0.03em", ...v,
    }}>
      {label}
    </span>
  );
}

const BTN_VARIANTS = {
  primary:   { background: C.primary,      color: "#fff",        border: `0.5px solid ${C.primaryDark}`  },
  secondary: { background: C.surfaceBg,    color: C.text,        border: `0.5px solid ${C.border}`       },
  danger:    { background: C.dangerLight,  color: C.danger,      border: `0.5px solid ${C.dangerBorder}` },
  success:   { background: C.successLight, color: C.successDark, border: `0.5px solid ${C.successBorder}`},
  ghost:     { background: "transparent",  color: C.textMuted,   border: `0.5px solid ${C.border}`       },
  warning:   { background: C.warningLight, color: C.warningDark, border: `0.5px solid ${C.warningBorder}`},
};
function Btn({ children, onClick, variant = "primary", disabled, style }) {
  const v = BTN_VARIANTS[variant] ?? BTN_VARIANTS.primary;
  return (
    <button
      style={{
        fontSize: 12, padding: "7px 16px", borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, fontWeight: 500,
        transition: "opacity .15s", ...v, ...style,
      }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 50,
      background: "#1A1A18", color: "#fff", fontSize: 12, fontWeight: 500,
      padding: "10px 16px", borderRadius: 10,
      boxShadow: "0 4px 20px rgba(0,0,0,.2)",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {msg}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, color: C.textMuted,
      letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, colorStyle }) {
  return (
    <div style={{
      borderRadius: 10, padding: "14px 16px",
      border: `0.5px solid ${colorStyle.border}`,
      background: colorStyle.bg,
    }}>
      <div style={{ fontSize: 26, fontWeight: 500, color: colorStyle.color }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: colorStyle.color, opacity: 0.8, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function AlertBanner({ type = "warn", children }) {
  const variants = {
    info:  { bg: C.primaryLight,  border: C.primaryBorder,  color: C.primaryDark  },
    good:  { bg: C.successLight,  border: C.successBorder,  color: C.successDark  },
    warn:  { bg: C.warningLight,  border: C.warningBorder,  color: C.warningDark  },
    error: { bg: C.dangerLight,   border: C.dangerBorder,   color: C.dangerDark   },
  };
  const s = variants[type];
  return (
    <div style={{
      fontSize: 12, background: s.bg, border: `0.5px solid ${s.border}`,
      borderRadius: 8, padding: "8px 12px", color: s.color,
      lineHeight: 1.6, marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

// ─── Live catalog template download ───────────────────────────────────────────
const SLOT_DB_TO_LABEL_TMPL = {
  morning_tiffin: 'Morning Tiffin',
  lunch:          'Lunch',
  evening_snacks: 'Evening Snacks',
  dinner_tiffin:  'Dinner Tiffin',
};

async function downloadCatalogTemplate(apiClient, showToast, currentMenuItems = []) {
  const HEADERS    = ['id', 'title', 'description', 'price', 'custom_label_0', 'image_link', 'is_available'];
  const COL_WIDTHS = [{ wch: 8 }, { wch: 28 }, { wch: 48 }, { wch: 8 }, { wch: 16 }, { wch: 52 }, { wch: 14 }];

  const fromApiItems = (items) =>
    items.map(item => [item.id, item.title, item.description, item.price, item.custom_label_0, item.image_link, item.is_available]);

  const fromStateItems = (items) =>
    items.map(item => [
      item.retailer_id || item.id || '',
      item.name        || '',
      item.description || '',
      Number(item.price) || 0,
      SLOT_DB_TO_LABEL_TMPL[item.time_slot] || item.time_slot || 'Morning Tiffin',
      item.image_url   || '',
      (item.is_stocked ?? item.is_available ?? true) ? 'TRUE' : 'FALSE',
    ]);

  const writeAndDownload = (rows, count, source) => {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
    ws['!cols'] = COL_WIDTHS;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WhatsApp Catalog');
    XLSX.writeFile(wb, 'catalog_template.xlsx');
    showToast(`Template downloaded — ${count} item${count !== 1 ? 's' : ''} (${source})`);
  };

  try {
    showToast('Preparing template from live catalog…');
    const res = await apiClient.get('/api/catalog/feed/template');
    const apiItems = res.data?.items ?? [];
    if (apiItems.length > 0) { writeAndDownload(fromApiItems(apiItems), apiItems.length, 'live catalog'); return; }
  } catch (err) {
    console.warn('[template-dl] API failed:', err.message);
  }

  if (currentMenuItems && currentMenuItems.length > 0) {
    const rows = fromStateItems(currentMenuItems);
    writeAndDownload(rows, rows.length, 'local snapshot');
    return;
  }

  const stubRow = ['M001', 'Idli', 'Soft steamed idlis with sambar and chutney', 50, 'Morning Tiffin', '', 'TRUE'];
  writeAndDownload([stubRow], 0, 'blank template — fill in your items');
  showToast('No items in database yet — blank template downloaded');
}

// ─── Excel helpers ─────────────────────────────────────────────────────────────
function mapExcelRowToMenuItem(row) {
  const id          = String(row['id'] || row['ID'] || '').trim();
  const name        = String(row['title'] || row['name'] || row['Title'] || row['Name'] || '').trim();
  const description = String(row['description'] || row['Description'] || '').trim();
  const priceRaw    = row['price'] || row['Price'] || 0;
  const price       = parseFloat(String(priceRaw).replace(/[^0-9.]/g, '')) || 0;
  const slotRaw     = String(row['custom_label_0'] || row['time_slot'] || row['category'] || '').trim().toLowerCase();
  const time_slot   = SLOT_LABEL_TO_DB[slotRaw] || 'morning_tiffin';
  const image_url   = String(row['image_link'] || row['image_url'] || row['Image Link'] || row['Image URL'] || '').trim();
  const availRaw    = row['is_available'] ?? row['Is Available'] ?? row['is_stocked'] ?? '';
  const is_available = availRaw === '' ? undefined : !['false', '0', 'no'].includes(String(availRaw).toLowerCase().trim());
  return { id, name, description, price, time_slot, image_url, ...(is_available !== undefined ? { is_available } : {}) };
}
function validateRow(row, index) {
  const errors = [];
  if (!row.id)        errors.push(`Row ${index + 1}: missing id`);
  if (!row.name)      errors.push(`Row ${index + 1}: missing name/title`);
  if (row.price <= 0) errors.push(`Row ${index + 1} (${row.name || row.id}): price must be > 0`);
  return errors;
}

// ============================================================================
// COMPONENT
// ============================================================================
export default function ManagerPortal() {
  const { user, apiClient, logout } = useAuth();
  const { printConsolidated } = useKOTPrint(kotRef);

  const [tables,        setTables]        = useState([]);
  const [orders,        setOrders]        = useState([]);
  const [menuItems,     setMenuItems]     = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showNewOrder,  setShowNewOrder]  = useState(false);
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Customer info for new order
  const [orderStep,       setOrderStep]       = useState(1); // 1=customer details, 2=item selection
  const [customerName,    setCustomerName]    = useState('');
  const [customerPhone,   setCustomerPhone]   = useState('');
  const [customerNameErr, setCustomerNameErr] = useState('');
  const [customerPhoneErr,setCustomerPhoneErr]= useState('');

  const [tokens,         setTokens]         = useState([]);
  const [assigningToken, setAssigningToken] = useState(null);
  const [assignTableSel, setAssignTableSel] = useState({});
  const [activeTab,      setActiveTab]      = useState('queue');
  const [toastMsg,       setToastMsg]       = useState('');

  const [freeTableModal,  setFreeTableModal]  = useState(null);
  const [rejectModal,     setRejectModal]     = useState(null);
  const [rejectReason,    setRejectReason]    = useState('');
  const [processingId,    setProcessingId]    = useState(null);

  // Table status management
  const [tableStatusModal,    setTableStatusModal]    = useState(null); // { tableId, tableNumber, currentStatus }
  const [pendingStatus,       setPendingStatus]       = useState('');   // 'reserved' | 'dirty'
  const [reservationDuration, setReservationDuration] = useState(60);  // minutes
  const [settingTableStatus,  setSettingTableStatus]  = useState(false);
  // Local map of reservation expiry times { tableId: ISOString }
  const [reservationExpiry,   setReservationExpiry]   = useState({});
  // Countdown tick
  const [, setTick] = useState(0);

  const [uploadFile,     setUploadFile]     = useState(null);
  const [uploadRows,     setUploadRows]     = useState([]);
  const [uploadErrors,   setUploadErrors]   = useState([]);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [uploadStatus,   setUploadStatus]   = useState('idle');
  const [uploadResult,   setUploadResult]   = useState(null);
  const [downloadingTpl, setDownloadingTpl] = useState(false);
  const [togglingId,     setTogglingId]     = useState(null);
  const fileInputRef = useRef(null);

  const showToast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3500); };

  // ── Fetchers ─────────────────────────────────────────────────────────────
  const fetchTokens    = useCallback(async () => { try { const r = await apiClient.get('/api/tokens');     setTokens(r.data.tokens || r.data || []); } catch(e) {} }, [apiClient]);
  const fetchTables    = useCallback(async () => { try { const r = await apiClient.get('/api/tables');     setTables(r.data.tables || r.data || []); } catch(e) {} }, [apiClient]);
  const fetchOrders    = useCallback(async () => { try { const r = await apiClient.get('/api/orders');     setOrders(r.data.orders || r.data || []); } catch(e) {} }, [apiClient]);
  const fetchMenuItems = useCallback(async () => { try { const r = await apiClient.get('/api/menu-items?ignore_slot=true'); setMenuItems(r.data.items || r.data || []); } catch(e) {} }, [apiClient]);
  const fetchData      = useCallback(async () => { await Promise.all([fetchTables(), fetchOrders(), fetchTokens(), fetchMenuItems()]); setLoading(false); }, [fetchTables, fetchOrders, fetchTokens, fetchMenuItems]);

  useEffect(() => {
    fetchData();
    const full  = setInterval(fetchData, 15000);
    const quick = setInterval(async () => { await fetchTokens(); await fetchTables(); await fetchOrders(); }, 8000);
    return () => { clearInterval(full); clearInterval(quick); };
  }, [fetchData, fetchTokens, fetchTables, fetchOrders]);

  // ── Countdown ticker — updates every second for reservation timers ────────
  useEffect(() => {
    const ticker = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(ticker);
  }, []);

  // ── Auto-release expired reservations (checks every 30s) ─────────────────
  useEffect(() => {
    const check = async () => {
      const now = Date.now();
      for (const [tableId, expiresAt] of Object.entries(reservationExpiry)) {
        if (new Date(expiresAt).getTime() <= now) {
          try {
            await apiClient.put(`/api/tables/${tableId}/status`, { status: 'available' });
            setReservationExpiry(prev => { const n = { ...prev }; delete n[tableId]; return n; });
            await fetchTables();
            const table = tables.find(t => String(t.id) === String(tableId));
            showToast(`Table ${table?.table_number ?? tableId} reservation expired — now available`);
          } catch(err) {
            console.error('[auto-release] Failed for', tableId, err.message);
          }
        }
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [reservationExpiry, apiClient, tables, fetchTables]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const getTableStatus = (table) => {
    const order  = orders.find(o => o.table_id === table.id && ACTIVE_ORDER_STATUSES.includes(o.status));
    const token  = tokens.find(t => t.table_id === table.id && t.status === 'seated');
    const dbStatus = table.status || 'available';
    return { status: (order || token) ? 'occupied' : dbStatus, order, token };
  };
  const availableTablesFor = (pax) => tables.filter(t => {
    const { status } = getTableStatus(t);
    return status === 'available' && (t.capacity == null || t.capacity >= pax);
  });

  const normaliseToken = (t) => ({
    ...t,
    id: t.id || t.token_id || t.token_number || '?',
    status: t.status || (t.type === 'takeaway' ? 'takeaway' : 'waiting'),
    name: t.name || t.customer_name || 'Guest',
    pax: t.pax || t.party_size || 1,
    arrived_at: t.arrived_at || t.created_at || t.inserted_at || new Date().toISOString(),
    phone: t.phone || t.customer_phone || null,
    table_id: t.table_id || null,
    table_number: t.table_number || null,
    meta: t.meta || {},
  });

  const normTokens         = tokens.map(normaliseToken);
  const waitingTokens      = normTokens.filter(t => t.status === 'waiting');
  const seatedTokens       = normTokens.filter(t => t.status === 'seated');
  const takeawayTokens     = normTokens.filter(t => t.status === 'takeaway');
  const pendingApprTokens  = normTokens.filter(t => t.status === 'pending_approval');
  const freeTablesCount    = tables.filter(t => getTableStatus(t).status === 'available').length;

  // ── Open new-order modal ──────────────────────────────────────────────────
  const openNewOrderModal = (tableId = null) => {
    setSelectedTable(tableId);
    setSelectedItems([]);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerNameErr('');
    setCustomerPhoneErr('');
    setOrderStep(1);
    setShowNewOrder(true);
    setActiveTab('orders');
  };

  // ── Customer details validation (Step 1 → Step 2) ────────────────────────
  const validateAndProceedToItems = () => {
    let ok = true;
    if (!customerName.trim()) { setCustomerNameErr('Customer name is required'); ok = false; }
    else setCustomerNameErr('');

    const digits = customerPhone.replace(/\D/g, '');
    if (!digits || digits.length < 10) { setCustomerPhoneErr('Enter a valid 10-digit WhatsApp number'); ok = false; }
    else setCustomerPhoneErr('');

    if (ok) setOrderStep(2);
  };

  // ── Free table ────────────────────────────────────────────────────────────
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
      if (token) { try { await apiClient.put(`/api/tokens/${token.id}/complete`); } catch(e) {} }
      await apiClient.put(`/api/tables/${tableId}/status`, { status: 'available' });
      if (token?.phone) {
        await apiClient.post('/api/feedback/queue', { customer_phone: token.phone, customer_name: token.name, token_number: token.id, table_number: String(tableNumber) }).catch(()=>{});
      }
      // Clear any local reservation expiry
      setReservationExpiry(prev => { const n = { ...prev }; delete n[tableId]; return n; });
      await fetchTables(); await fetchOrders(); await fetchTokens();
      showToast(`Table ${tableNumber} is now available`);
    } catch(err) { showToast(`Failed: ${err.message}`); }
  };

  // ── Table status management ───────────────────────────────────────────────
  const openTableStatusModal = (table) => {
    setTableStatusModal({ tableId: table.id, tableNumber: table.table_number });
    setPendingStatus('reserved');
    setReservationDuration(60);
  };

  const confirmTableStatus = async () => {
    if (!tableStatusModal || !pendingStatus) return;
    setSettingTableStatus(true);
    const { tableId, tableNumber } = tableStatusModal;
    try {
      await apiClient.put(`/api/tables/${tableId}/status`, { status: pendingStatus });

      if (pendingStatus === 'reserved') {
        const expiresAt = new Date(Date.now() + reservationDuration * 60 * 1000).toISOString();
        setReservationExpiry(prev => ({ ...prev, [tableId]: expiresAt }));
        showToast(`Table ${tableNumber} reserved for ${reservationDuration} min — auto-releases at ${format(new Date(expiresAt), 'HH:mm')}`);
      } else {
        showToast(`Table ${tableNumber} marked as Cleaning`);
      }

      setTableStatusModal(null);
      await fetchTables();
    } catch(err) {
      showToast(`Failed to update table: ${err.message}`);
    } finally {
      setSettingTableStatus(false);
    }
  };

  // Release a reserved/cleaning table back to available manually
  const releaseTable = async (table) => {
    try {
      await apiClient.put(`/api/tables/${table.id}/status`, { status: 'available' });
      setReservationExpiry(prev => { const n = { ...prev }; delete n[table.id]; return n; });
      await fetchTables();
      showToast(`Table ${table.table_number} is now available`);
    } catch(err) {
      showToast(`Failed: ${err.message}`);
    }
  };

  // ── Approve / Reject ──────────────────────────────────────────────────────
  const approveToken = async (token) => {
    setProcessingId(token.id);
    try { await apiClient.put(`/api/tokens/${token.id}/approve`); showToast(`${token.id} approved — customer notified`); await Promise.all([fetchTokens(), fetchTables()]); }
    catch(err) { showToast(`Approve failed: ${err.message}`); }
    finally { setProcessingId(null); }
  };
  const openRejectModal = (token) => { setRejectReason(''); setRejectModal({ tokenId: token.id, tokenName: token.name, pax: token.pax }); };
  const confirmReject = async () => {
    if (!rejectModal) return;
    setProcessingId(rejectModal.tokenId); setRejectModal(null);
    try { await apiClient.put(`/api/tokens/${rejectModal.tokenId}/reject`, { reason: rejectReason || undefined }); showToast(`Token ${rejectModal.tokenId} rejected — customer offered reservation`); await fetchTokens(); }
    catch(err) { showToast(`Reject failed: ${err.message}`); }
    finally { setProcessingId(null); setRejectReason(''); }
  };

  // ── Token actions ─────────────────────────────────────────────────────────
  const assignTable = async (token) => {
    const tableId = assignTableSel[token.id];
    if (!tableId) { showToast('Please select a table first'); return; }
    const table = tables.find(t => String(t.id) === String(tableId));
    if (!table) return;
    setAssigningToken(token.id);
    try {
      await apiClient.put(`/api/tokens/${token.id}/assign`, { table_id: table.id, table_number: table.table_number });
      showToast(`Token ${token.id} → Table ${table.table_number}`);
      setAssignTableSel(prev => { const n = { ...prev }; delete n[token.id]; return n; });
      await fetchTokens(); await fetchTables();
    } catch(err) { showToast('Failed to assign table'); }
    finally { setAssigningToken(null); }
  };
  const completeToken = async (token) => {
    try { await apiClient.put(`/api/tokens/${token.id}/complete`); showToast(`Table ${token.table_number} is free`); await fetchTokens(); await fetchTables(); }
    catch(err) { showToast('Failed to complete token'); }
  };
  const dismissToken = async (tokenId) => {
    try { await apiClient.delete(`/api/tokens/${tokenId}`); await fetchTokens(); } catch(err) {}
  };

  // ── Menu availability toggle ──────────────────────────────────────────────
  const toggleAvailability = async (item) => {
    setTogglingId(item.id);
    const newValue = !(item.is_stocked ?? item.is_available);
    try {
      await apiClient.put(`/api/menu-items/${item.id}/availability`, { is_available: newValue });
      setMenuItems(prev => prev.map(m => m.id === item.id ? { ...m, is_stocked: newValue, is_available: newValue } : m));
      showToast(newValue ? `${item.name} is back in stock` : `${item.name} marked out of stock`);
    } catch(err) { showToast(`Failed to update ${item.name}`); }
    finally { setTogglingId(null); }
  };

  // ── Order helpers ─────────────────────────────────────────────────────────
  const createOrder = async () => {
    if (!selectedTable || selectedItems.length === 0) { showToast('Select a table and items'); return; }
    if (isSubmitting) return;
    setIsSubmitting(true);
    setShowNewOrder(false);
    const tableId = selectedTable;
    const items = selectedItems.map(item => ({
      menu_item_id: item.id,
      quantity: item.quantity || 1,
      special_instructions: item.special_instructions,
    }));
    const itemsForKOT = selectedItems.map(item => ({
      kdsId: item.id, name: item.name, qty: item.quantity || 1,
      note: item.special_instructions || null,
    }));
    const savedName  = customerName.trim();
    const savedPhone = customerPhone.replace(/\D/g, '');
    setSelectedItems([]); setSelectedTable(null);
    setCustomerName(''); setCustomerPhone('');
    try {
      const res = await apiClient.post('/api/orders', {
        table_id: tableId,
        items,
        notes: '',
        customer_name:  savedName  || undefined,
        customer_phone: savedPhone || undefined,
      });
      const newOrder = res.data.order;
      await fetchOrders(); await fetchTables();
      const table = tables.find(t => t.id === tableId);
      printConsolidated({
        orderNumber:  newOrder.order_number,
        tableNumber:  table?.table_number ?? null,
        tableSection: table?.section ?? null,
        serviceType:  'Dine-in',
        captainName:  user?.full_name ?? null,
        specialNotes: null,
        items:        itemsForKOT,
      });
    } catch(err) { showToast('Error creating order: ' + err.message); }
    finally { setIsSubmitting(false); }
  };

  const cancelOrder = async (orderId, tableId) => {
    try {
      await apiClient.delete(`/api/orders/${orderId}`);
      if (tableId) await apiClient.put(`/api/tables/${tableId}/status`, { status: 'available' });
      fetchData();
    } catch(err) { showToast('Error cancelling order: ' + err.message); }
  };
  const markOrderReady = async (orderId) => {
    try { await apiClient.put(`/api/orders/${orderId}/status`, { status: 'completed' }); fetchData(); }
    catch(err) { showToast('Error updating order: ' + err.message); }
  };

  // ── Menu upload ───────────────────────────────────────────────────────────
  const parseExcelFile = (file) => {
    setUploadStatus('parsing'); setUploadErrors([]); setUploadRows([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook  = XLSX.read(e.target.result, { type: 'array' });
        const sheetName = workbook.SheetNames.includes('WhatsApp Catalog') ? 'WhatsApp Catalog' : workbook.SheetNames[0];
        const rawRows   = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        if (rawRows.length === 0) { setUploadErrors(['The selected sheet appears to be empty.']); setUploadStatus('idle'); return; }
        const mapped   = rawRows.map(mapExcelRowToMenuItem);
        const nonEmpty = mapped.filter(r => r.id || r.name);
        setUploadRows(nonEmpty);
        setUploadErrors(nonEmpty.flatMap((r, i) => validateRow(r, i)));
        setUploadStatus('preview');
      } catch(err) { setUploadErrors([`Could not read the file: ${err.message}`]); setUploadStatus('idle'); }
    };
    reader.readAsArrayBuffer(file);
  };
  const handleFileSelect = (file) => {
    if (!file) return;
    const ok = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
    if (!ok) { setUploadErrors(['Please upload an Excel file (.xlsx, .xls) or CSV.']); return; }
    setUploadFile(file); parseExcelFile(file);
  };
  const handleDrop = (e) => { e.preventDefault(); setUploadDragOver(false); handleFileSelect(e.dataTransfer.files[0]); };
  const handleConfirmUpload = async () => {
    if (uploadErrors.length > 0) { showToast('Fix the errors before uploading'); return; }
    setUploadStatus('uploading');
    try {
      const res = await apiClient.post('/api/menu/upload', { items: uploadRows });
      setUploadResult(res.data); setUploadStatus('done'); await fetchMenuItems();
      showToast(`Menu updated — ${res.data.upserted} items saved`);
    } catch(err) { setUploadErrors([`Upload failed: ${err.response?.data?.error || err.message}`]); setUploadStatus('preview'); }
  };
  const handleResetUpload = () => {
    setUploadFile(null); setUploadRows([]); setUploadErrors([]);
    setUploadStatus('idle'); setUploadResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Spinner size={40} />
          <p style={{ marginTop: 16, color: C.textSub, fontSize: 14 }}>Loading manager portal…</p>
        </div>
      </div>
    );
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const inputStyle = {
    width: "100%", fontSize: 12, padding: "8px 10px", borderRadius: 8,
    border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.text,
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Toast msg={toastMsg} />

      {/* ── Reject modal ─────────────────────────────────────────────────── */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ ...CARD, maxWidth: 400, width: "100%", padding: 0, overflow: "hidden" }}>
            <div style={{ background: C.dangerLight, borderBottom: `0.5px solid ${C.dangerBorder}`, padding: "16px 20px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, color: C.dangerDark, margin: 0 }}>Reject large party request</h3>
              <p style={{ fontSize: 12, color: C.danger, margin: "2px 0 0" }}>{rejectModal.tokenName} · {rejectModal.pax} people</p>
            </div>
            <div style={{ padding: "20px 20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 5, display: "block" }}>
                  Reason <span style={{ color: C.textMuted, fontWeight: 400 }}>(optional — sent to customer)</span>
                </label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="e.g. Not enough space tonight, try reserving for tomorrow"
                  rows={3} style={{ ...inputStyle, resize: "none", lineHeight: 1.6 }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="secondary" onClick={() => setRejectModal(null)} style={{ flex: 1 }}>Cancel</Btn>
                <Btn variant="danger" onClick={confirmReject} style={{ flex: 1 }}>Reject &amp; notify</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Free table modal ─────────────────────────────────────────────── */}
      {freeTableModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ ...CARD, maxWidth: 400, width: "100%", padding: 0, overflow: "hidden" }}>
            <div style={{ background: C.primaryLight, borderBottom: `0.5px solid ${C.primaryBorder}`, padding: "16px 20px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, color: C.primaryDark, margin: 0 }}>Free table {freeTableModal.tableNumber}</h3>
              <p style={{ fontSize: 12, color: C.textSub, margin: "2px 0 0" }}>What happened with this table?</p>
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {freeTableModal.order ? (
                <>
                  <div style={{ background: C.surfaceBg, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.textSub, marginBottom: 4 }}>
                    <div style={{ fontWeight: 500, color: C.text, marginBottom: 4 }}>Order #{freeTableModal.order.order_number?.slice(-4)}</div>
                    <div>Status: <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{freeTableModal.order.status}</span></div>
                    <div>Amount: <span style={{ fontWeight: 500 }}>₹{freeTableModal.order.total_amount?.toFixed(2) ?? "—"}</span></div>
                  </div>
                  <button onClick={() => confirmFreeTable('complete')} style={{ display: "flex", alignItems: "center", gap: 12, background: C.successLight, border: `0.5px solid ${C.successBorder}`, borderRadius: 8, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div><div style={{ fontSize: 12, fontWeight: 500, color: C.successDark }}>Order completed</div><div style={{ fontSize: 11, color: C.success }}>Guests paid and left</div></div>
                  </button>
                  <button onClick={() => confirmFreeTable('cancel')} style={{ display: "flex", alignItems: "center", gap: 12, background: C.dangerLight, border: `0.5px solid ${C.dangerBorder}`, borderRadius: 8, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ fontSize: 20 }}>❌</span>
                    <div><div style={{ fontSize: 12, fontWeight: 500, color: C.dangerDark }}>Cancel order</div><div style={{ fontSize: 11, color: C.danger }}>Guests left or mistake — void the order</div></div>
                  </button>
                </>
              ) : (
                <button onClick={() => confirmFreeTable(null)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.successLight, border: `0.5px solid ${C.successBorder}`, borderRadius: 8, padding: "10px 14px", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 20 }}>🟢</span>
                  <div><div style={{ fontSize: 12, fontWeight: 500, color: C.successDark }}>Mark available</div><div style={{ fontSize: 11, color: C.success }}>No active order — just free the table</div></div>
                </button>
              )}
              <button onClick={() => setFreeTableModal(null)} style={{ fontSize: 12, color: C.textMuted, background: "none", border: "none", cursor: "pointer", padding: "6px 0", textAlign: "center" }}>Never mind</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Table status modal ────────────────────────────────────────────── */}
      {tableStatusModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ ...CARD, maxWidth: 400, width: "100%", padding: 0, overflow: "hidden" }}>
            <div style={{ background: C.warningLight, borderBottom: `0.5px solid ${C.warningBorder}`, padding: "16px 20px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, color: C.warningDark, margin: 0 }}>Set status — Table {tableStatusModal.tableNumber}</h3>
              <p style={{ fontSize: 12, color: C.warning, margin: "2px 0 0" }}>Choose the new status for this table</p>
            </div>
            <div style={{ padding: "20px 20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Status selector */}
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { value: 'reserved', label: '🔒 Reserved', color: C.warningDark, bg: C.warningLight, border: C.warningBorder },
                  { value: 'dirty',    label: '🧹 Cleaning', color: C.dangerDark,  bg: C.dangerLight,  border: C.dangerBorder  },
                ].map(opt => (
                  <button key={opt.value} onClick={() => setPendingStatus(opt.value)}
                    style={{
                      flex: 1, padding: "10px 8px", borderRadius: 8, cursor: "pointer",
                      fontSize: 12, fontWeight: 500, textAlign: "center",
                      background: pendingStatus === opt.value ? opt.bg : C.surfaceBg,
                      border: pendingStatus === opt.value ? `1.5px solid ${opt.color}` : `0.5px solid ${C.border}`,
                      color: pendingStatus === opt.value ? opt.color : C.textSub,
                      transition: "all .15s",
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Duration picker — only for reserved */}
              {pendingStatus === 'reserved' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 8, display: "block" }}>
                    Reserve for how long?
                  </label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {RESERVATION_DURATIONS.map(d => (
                      <button key={d} onClick={() => setReservationDuration(d)}
                        style={{
                          padding: "5px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 500,
                          background: reservationDuration === d ? C.primary : C.surfaceBg,
                          color:      reservationDuration === d ? "#fff"     : C.textSub,
                          border:     reservationDuration === d ? `0.5px solid ${C.primaryDark}` : `0.5px solid ${C.border}`,
                          transition: "all .15s",
                        }}>
                        {d} min
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: C.textMuted, margin: "8px 0 0" }}>
                    Table will auto-release at {format(new Date(Date.now() + reservationDuration * 60 * 1000), 'HH:mm')}
                  </p>
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="secondary" onClick={() => setTableStatusModal(null)} style={{ flex: 1 }}>Cancel</Btn>
                <Btn variant="warning" onClick={confirmTableStatus} disabled={settingTableStatus} style={{ flex: 1 }}>
                  {settingTableStatus ? <Spinner size={14} /> : 'Confirm'}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Order detail modal ───────────────────────────────────────────── */}
      {selectedOrder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
          <div style={{ ...CARD, maxWidth: 500, width: "100%", padding: 0, overflow: "hidden" }}>
            <div style={{ background: C.primaryLight, borderBottom: `0.5px solid ${C.primaryBorder}`, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, color: C.primaryDark, margin: 0 }}>Order #{selectedOrder.order_number?.slice(-4)}</h3>
              <button onClick={() => setSelectedOrder(null)} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: C.textMuted }}>✕</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Table",   value: tables.find(t => t.id === selectedOrder.table_id)?.table_number || 'N/A' },
                  { label: "Status",  value: selectedOrder.status, capitalize: true },
                  { label: "Time",    value: safeFormat(selectedOrder.created_at, 'HH:mm:ss') },
                  { label: "Payment", value: selectedOrder.payment_status || 'Unpaid', capitalize: true },
                ].map(r => (
                  <div key={r.label} style={{ background: C.surfaceBg, borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>{r.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, textTransform: r.capitalize ? "capitalize" : undefined }}>{r.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Items</div>
                {selectedOrder.order_items?.map((item, idx) => {
                  const statusMap = { pending: { color: C.danger, bg: C.dangerLight }, in_progress: { color: C.warning, bg: C.warningLight }, ready: { color: C.success, bg: C.successLight } };
                  const s = statusMap[item.status] ?? { color: C.textMuted, bg: C.surfaceBg };
                  return (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `0.5px solid ${C.border}` }}>
                      <span style={{ fontSize: 12, color: C.text }}>{item.quantity}× {item.menu_item?.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, textTransform: "capitalize" }}>{item.status}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: `0.5px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Total</div>
                  <div style={{ fontSize: 24, fontWeight: 500, color: C.primary }}>₹{selectedOrder.total_amount?.toFixed(2)}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn variant="danger" onClick={() => { cancelOrder(selectedOrder.id, selectedOrder.table_id); setSelectedOrder(null); }}>Cancel order</Btn>
                  {selectedOrder.status === 'in_progress' && (
                    <Btn variant="success" onClick={() => { markOrderReady(selectedOrder.id); setSelectedOrder(null); }}>Mark ready</Btn>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          NEW ORDER MODAL — 2-step: customer details → item selection
          Max-height + overflow-y so long menus scroll cleanly.
      ══════════════════════════════════════════════════════════════════════ */}
      {showNewOrder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
          <div style={{
            ...CARD, maxWidth: 640, width: "100%",
            maxHeight: "88vh",
            display: "flex", flexDirection: "column",
            padding: 0, overflow: "hidden",
          }}>
            {/* ── Modal header (sticky) ──────────────────────────────────── */}
            <div style={{
              background: C.primaryLight, borderBottom: `0.5px solid ${C.primaryBorder}`,
              padding: "16px 20px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              flexShrink: 0,
            }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 500, color: C.primaryDark, margin: 0 }}>
                  {orderStep === 1 ? 'Customer details' : 'Select items'}
                  {selectedTable && orderStep === 2 ? ` — Table ${tables.find(t => t.id === selectedTable)?.table_number}` : ''}
                </h3>
                {/* Step indicator */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  {[1, 2].map(s => (
                    <React.Fragment key={s}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%",
                        background: s <= orderStep ? C.primary : C.border,
                        color: s <= orderStep ? "#fff" : C.textMuted,
                        fontSize: 10, fontWeight: 500,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{s}</div>
                      {s < 2 && <div style={{ width: 28, height: 1, background: orderStep > 1 ? C.primary : C.border }} />}
                    </React.Fragment>
                  ))}
                  <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 4 }}>
                    {orderStep === 1 ? 'Customer info' : 'Order items'}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowNewOrder(false)} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: C.textMuted }}>✕</button>
            </div>

            {/* ── Modal body (scrollable) ────────────────────────────────── */}
            <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>

              {/* Step 1: Customer details */}
              {orderStep === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ background: C.primaryLight, border: `0.5px solid ${C.primaryBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.primaryDark }}>
                    Collecting customer details enables direct WhatsApp communication and order tracking.
                  </div>

                  {/* Table selector — if not pre-selected */}
                  {!selectedTable && (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 6, display: "block" }}>
                        Table <span style={{ color: C.danger }}>*</span>
                      </label>
                      <select
                        value={selectedTable || ''}
                        onChange={e => setSelectedTable(e.target.value || null)}
                        style={{ ...inputStyle }}>
                        <option value="">— choose a table —</option>
                        {tables.filter(t => getTableStatus(t).status === 'available').map(t => (
                          <option key={t.id} value={t.id}>
                            Table {t.table_number}{t.capacity ? ` (${t.capacity} seats)` : ''}{t.section ? ` · ${t.section}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Customer name */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 6, display: "block" }}>
                      Customer name <span style={{ color: C.danger }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={e => { setCustomerName(e.target.value); setCustomerNameErr(''); }}
                      placeholder="e.g. Ravi Kumar"
                      style={{ ...inputStyle, border: `0.5px solid ${customerNameErr ? C.danger : C.border}` }}
                      onKeyDown={e => e.key === 'Enter' && validateAndProceedToItems()}
                    />
                    {customerNameErr && <p style={{ fontSize: 11, color: C.danger, margin: "4px 0 0" }}>{customerNameErr}</p>}
                  </div>

                  {/* WhatsApp number */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 6, display: "block" }}>
                      WhatsApp number <span style={{ color: C.danger }}>*</span>
                    </label>
                    <div style={{ position: "relative" }}>
                      <span style={{
                        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                        fontSize: 12, color: C.textSub, pointerEvents: "none",
                      }}>+91</span>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={e => { setCustomerPhone(e.target.value); setCustomerPhoneErr(''); }}
                        placeholder="98765 43210"
                        style={{
                          ...inputStyle, paddingLeft: 36,
                          border: `0.5px solid ${customerPhoneErr ? C.danger : C.border}`,
                        }}
                        onKeyDown={e => e.key === 'Enter' && validateAndProceedToItems()}
                      />
                    </div>
                    {customerPhoneErr && <p style={{ fontSize: 11, color: C.danger, margin: "4px 0 0" }}>{customerPhoneErr}</p>}
                    <p style={{ fontSize: 11, color: C.textMuted, margin: "4px 0 0" }}>
                      Order updates and KOT will be sent to this number via WhatsApp.
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                    <Btn variant="secondary" onClick={() => setShowNewOrder(false)} style={{ flex: 1 }}>Cancel</Btn>
                    <Btn onClick={validateAndProceedToItems} disabled={!selectedTable && tables.filter(t => getTableStatus(t).status === 'available').length === 0} style={{ flex: 1 }}>
                      Next — choose items →
                    </Btn>
                  </div>
                </div>
              )}

              {/* Step 2: Item selection */}
              {orderStep === 2 && (
                <div>
                  {/* Customer summary pill */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
                    background: C.successLight, border: `0.5px solid ${C.successBorder}`,
                    borderRadius: 8, padding: "8px 12px",
                  }}>
                    <span style={{ fontSize: 18 }}>👤</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: C.successDark }}>{customerName}</div>
                      <div style={{ fontSize: 11, color: C.success }}>+91 {customerPhone}</div>
                    </div>
                    <button onClick={() => setOrderStep(1)} style={{ marginLeft: "auto", fontSize: 11, color: C.primary, background: "none", border: "none", cursor: "pointer" }}>Edit</button>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Select items</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
                    {menuItems.map(item => {
                      const isSelected = !!selectedItems.find(i => i.id === item.id);
                      return (
                        <button key={item.id}
                          onClick={() => {
                            if (isSelected) setSelectedItems(selectedItems.filter(i => i.id !== item.id));
                            else setSelectedItems([...selectedItems, { ...item, quantity: 1 }]);
                          }}
                          style={{
                            padding: "10px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                            transition: "all .15s",
                            border: `0.5px solid ${isSelected ? C.primary : C.border}`,
                            background: isSelected ? C.primaryLight : C.cardBg,
                          }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{item.name}</div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: C.primary, marginTop: 2 }}>₹{item.price?.toFixed(2)}</div>
                        </button>
                      );
                    })}
                  </div>

                  {selectedItems.length > 0 && (
                    <div style={{ background: C.surfaceBg, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: C.textSub }}>
                      <strong style={{ color: C.text }}>{selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} selected</strong>
                      {' '}· ₹{selectedItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0).toFixed(2)} subtotal
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn variant="secondary" onClick={() => setOrderStep(1)} style={{ flex: 1 }}>← Back</Btn>
                    <Btn onClick={createOrder} disabled={isSubmitting || selectedItems.length === 0} style={{ flex: 1 }}>
                      {isSubmitting ? 'Creating…' : `Create order (${selectedItems.length} items)`}
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ background: C.cardBg, borderBottom: `0.5px solid ${C.border}` }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 500, color: C.text, margin: 0 }}>Manager portal</h1>
              <p style={{ fontSize: 13, color: C.textMuted, margin: "2px 0 0" }}>Manage tables, orders and kitchen operations</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: C.textSub }}>👤 {user?.full_name || user?.email}</span>
              <Btn onClick={() => openNewOrderModal(null)}>+ New order</Btn>
              <Btn variant="danger" onClick={logout}>Logout</Btn>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px" }}>

        {/* ── Stats strip ───────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Approval needed", value: pendingApprTokens.length,  colorStyle: { bg: C.accentLight,  border: C.accentBorder,  color: C.accentDark  } },
            { label: "Waiting",         value: waitingTokens.length,       colorStyle: { bg: C.warningLight, border: C.warningBorder, color: C.warningDark } },
            { label: "Seated",          value: seatedTokens.length,        colorStyle: { bg: C.successLight, border: C.successBorder, color: C.successDark } },
            { label: "Takeaway",        value: takeawayTokens.length,      colorStyle: { bg: C.primaryLight, border: C.primaryBorder, color: C.primaryDark } },
            { label: "Tables free",     value: freeTablesCount,            colorStyle: { bg: "#F5F5F3",      border: C.border,        color: "#444441"     } },
          ].map(s => <StatCard key={s.label} {...s} />)}
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 3, marginBottom: 20, background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 10, padding: 4, width: "fit-content" }}>
          {[
            { key: 'queue',  label: `Queue${(waitingTokens.length + pendingApprTokens.length) ? ` (${waitingTokens.length + pendingApprTokens.length})` : ''}` },
            { key: 'tables', label: 'Tables' },
            { key: 'orders', label: 'Active orders' },
            { key: 'menu',   label: 'Menu'   },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: "6px 16px", borderRadius: 7, fontSize: 12,
              fontWeight: activeTab === tab.key ? 500 : 400,
              cursor: "pointer", transition: "all .15s",
              background:   activeTab === tab.key ? C.primary     : "transparent",
              color:        activeTab === tab.key ? "#fff"        : C.textMuted,
              border:       activeTab === tab.key ? `0.5px solid ${C.primaryDark}` : "0.5px solid transparent",
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════
            TAB: QUEUE
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'queue' && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {pendingApprTokens.length > 0 && (
              <div>
                <SectionLabel>Pending approval — {pendingApprTokens.length} large {pendingApprTokens.length === 1 ? 'party' : 'parties'}</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pendingApprTokens.map(token => {
                    const combo = token.meta?.combo ?? [];
                    const isProc = processingId === token.id;
                    const tableLines = combo.length > 0 ? combo.map(t => `Table ${t[0]} (${t[2]}/${t[1]} seats)`).join(' + ') : `${token.pax} seats across multiple tables`;
                    return (
                      <div key={token.id} style={{ ...CARD, display: "flex", alignItems: "flex-start", gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.accentLight, color: C.accentDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500, flexShrink: 0 }}>
                          {String(token.id).replace('T-', '')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{token.id}</span>
                            <Pill label="Needs approval" variant="purple" />
                          </div>
                          <p style={{ fontSize: 12, color: C.textSub, margin: "0 0 2px" }}>{token.name} · <strong>{token.pax} people</strong> · Arrived {safeFormat(token.arrived_at, 'HH:mm')}</p>
                          {token.phone && <p style={{ fontSize: 11, color: C.textMuted, margin: "0 0 8px" }}>+{token.phone}</p>}
                          <div style={{ background: C.accentLight, border: `0.5px solid ${C.accentBorder}`, borderRadius: 7, padding: "6px 10px", fontSize: 11, color: C.accentDark, marginBottom: 10 }}>
                            <strong>Proposed split: </strong>{tableLines}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <Btn variant="success" onClick={() => approveToken(token)} disabled={isProc}>
                              {isProc ? <Spinner size={14} /> : '✅ Approve'}
                            </Btn>
                            <Btn variant="danger" onClick={() => openRejectModal(token)} disabled={isProc}>❌ Reject</Btn>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <SectionLabel>Waiting for table — {waitingTokens.length} token{waitingTokens.length !== 1 ? 's' : ''}</SectionLabel>
              {waitingTokens.length === 0 ? (
                <div style={{ ...CARD, textAlign: "center", padding: "32px 20px", color: C.textMuted, fontSize: 13 }}>No customers waiting right now.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {waitingTokens.map(token => {
                    const avail    = availableTablesFor(token.pax);
                    const isAssign = assigningToken === token.id;
                    return (
                      <div key={token.id} style={{ ...CARD, display: "flex", alignItems: "flex-start", gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.warningLight, color: C.warningDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500, flexShrink: 0 }}>
                          {String(token.id).replace('T-', '')}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{token.id}</span>
                            <Pill label="Waiting" variant="amber" />
                          </div>
                          <p style={{ fontSize: 12, color: C.textSub, margin: "0 0 8px" }}>
                            {token.name} · {token.pax} {token.pax === 1 ? 'person' : 'people'} · Arrived {safeFormat(token.arrived_at, 'HH:mm')}
                          </p>
                          {token.phone && <p style={{ fontSize: 11, color: C.textMuted, margin: "0 0 8px" }}>+{token.phone}</p>}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <select value={assignTableSel[token.id] || ''} onChange={e => setAssignTableSel(prev => ({ ...prev, [token.id]: e.target.value }))}
                              disabled={avail.length === 0}
                              style={{ fontSize: 12, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", background: C.cardBg, color: C.text, outline: "none" }}>
                              <option value="">{avail.length === 0 ? 'No tables available' : '— assign table —'}</option>
                              {avail.map(t => <option key={t.id} value={t.id}>Table {t.table_number}{t.capacity ? ` (${t.capacity} seats)` : ''}{t.section ? ` · ${t.section}` : ''}</option>)}
                            </select>
                            <Btn onClick={() => assignTable(token)} disabled={!assignTableSel[token.id] || isAssign} variant="success">
                              {isAssign ? <><Spinner size={12} /> Assigning…</> : '✓ Assign + notify'}
                            </Btn>
                            <button onClick={() => dismissToken(token.id)} style={{ fontSize: 14, color: C.textMuted, background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }} title="Dismiss">✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {seatedTokens.length > 0 && (
              <div>
                <SectionLabel>Seated — {seatedTokens.length}</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
                  {seatedTokens.map(token => (
                    <div key={token.id} style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.successLight, color: C.successDark, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 12, flexShrink: 0 }}>
                          {String(token.id).replace('T-', '')}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{token.id}</span>
                            <Pill label={`Table ${token.table_number}`} variant="teal" />
                          </div>
                          <p style={{ fontSize: 11, color: C.textMuted, margin: "1px 0 0" }}>{token.name} · {token.pax} pax</p>
                        </div>
                      </div>
                      <Btn variant="ghost" onClick={() => completeToken(token)} style={{ fontSize: 11, padding: "5px 10px" }}>Free table</Btn>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {takeawayTokens.length > 0 && (
              <div>
                <SectionLabel>Takeaway — {takeawayTokens.length}</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
                  {takeawayTokens.map(token => (
                    <div key={token.id} style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.primaryLight, color: C.primaryDark, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 12, flexShrink: 0 }}>
                          {String(token.id).replace('T-', '')}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{token.id}</span>
                            <Pill label="Takeaway" variant="blue" />
                          </div>
                          <p style={{ fontSize: 11, color: C.textMuted, margin: "1px 0 0" }}>{token.name} · {safeFormat(token.arrived_at, 'HH:mm')}</p>
                        </div>
                      </div>
                      <Btn variant="ghost" onClick={() => dismissToken(token.id)} style={{ fontSize: 11, padding: "5px 10px" }}>Done</Btn>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: TABLES
            Enhanced: shows countdown for reserved tables, "Set status"
            button for available tables, "Release" for reserved/cleaning.
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'tables' && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, color: C.text, margin: 0 }}>Table allocation</h2>
              <span style={{ fontSize: 11, color: C.textMuted }}>
                Available tables can be reserved or marked for cleaning. Reserved tables auto-release after the set duration.
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 10 }}>
              {tables.map(table => {
                const { status, order, token } = getTableStatus(table);
                const s = TABLE_STATUS[status] ?? TABLE_STATUS.available;
                const countdown = reservationExpiry[table.id] ? reservationCountdown(reservationExpiry[table.id]) : null;
                const isBlockedForOrder = status === 'occupied' || status === 'reserved' || status === 'dirty';

                return (
                  <div key={table.id} style={{
                    background: s.bg,
                    border: `0.5px solid ${s.text}22`,
                    borderRadius: 12, padding: "14px 14px 12px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: s.text }}>Table {table.table_number}</div>
                    <div style={{ fontSize: 22, margin: "4px 0" }}>
                      {status === 'available' ? '🪑' : status === 'occupied' ? '🍽️' : status === 'reserved' ? '🔒' : '🧹'}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 500, color: s.text }}>{s.label}</div>

                    {/* Reservation countdown */}
                    {countdown && (
                      <div style={{
                        fontSize: 11, fontWeight: 500, color: C.warningDark,
                        background: C.warningLight, border: `0.5px solid ${C.warningBorder}`,
                        padding: "2px 8px", borderRadius: 6, marginTop: 2,
                      }}>
                        ⏱ {countdown}
                      </div>
                    )}
                    {status === 'reserved' && !countdown && (
                      <div style={{ fontSize: 10, color: C.warningDark, background: C.warningLight, padding: "2px 7px", borderRadius: 6 }}>Reserved</div>
                    )}

                    {token && <div style={{ fontSize: 10, color: s.text, background: `${s.text}18`, padding: "2px 7px", borderRadius: 6 }}>Token: {token.id}</div>}
                    {order  && <div style={{ fontSize: 10, color: s.text, background: `${s.text}18`, padding: "2px 7px", borderRadius: 6 }}>Order: {order.order_number?.slice(-4)}</div>}

                    {/* Action buttons */}
                    <div style={{ width: "100%", marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                      {status === 'available' && (
                        <>
                          <button
                            onClick={() => openNewOrderModal(table.id)}
                            style={{
                              fontSize: 10, fontWeight: 500, padding: "4px 10px", borderRadius: 6,
                              border: `0.5px solid ${s.text}44`, background: "rgba(255,255,255,0.6)",
                              color: s.text, cursor: "pointer", width: "100%",
                            }}>
                            + New order
                          </button>
                          <button
                            onClick={() => openTableStatusModal(table)}
                            style={{
                              fontSize: 10, fontWeight: 500, padding: "4px 10px", borderRadius: 6,
                              border: `0.5px solid ${C.warningBorder}`, background: C.warningLight,
                              color: C.warningDark, cursor: "pointer", width: "100%",
                            }}>
                            Set status
                          </button>
                        </>
                      )}
                      {status === 'occupied' && (
                        <button
                          onClick={() => openFreeTableModal(table)}
                          style={{
                            fontSize: 10, fontWeight: 500, padding: "4px 10px", borderRadius: 6,
                            border: `0.5px solid ${s.text}44`, background: "rgba(255,255,255,0.6)",
                            color: s.text, cursor: "pointer", width: "100%",
                          }}>
                          Mark available
                        </button>
                      )}
                      {(status === 'reserved' || status === 'dirty') && (
                        <button
                          onClick={() => releaseTable(table)}
                          style={{
                            fontSize: 10, fontWeight: 500, padding: "4px 10px", borderRadius: 6,
                            border: `0.5px solid ${C.successBorder}`, background: C.successLight,
                            color: C.successDark, cursor: "pointer", width: "100%",
                          }}>
                          Release now
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              {Object.entries(TABLE_STATUS).map(([k, v]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textSub }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: v.text, display: "inline-block" }} />
                  {v.label}
                </div>
              ))}
              <span style={{ fontSize: 11, color: C.textMuted, marginLeft: "auto" }}>
                Reserved tables show a countdown and auto-release when time expires.
              </span>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: ORDERS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: C.text, margin: "0 0 16px" }}>Active orders</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {orders.filter(o => ACTIVE_ORDER_STATUSES.includes(o.status)).map(order => {
                const table = tables.find(t => t.id === order.table_id);
                return (
                  <div key={order.id} style={{ ...CARD }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 16, alignItems: "start" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 2 }}>Order #{order.order_number?.slice(-4)}</div>
                        <div style={{ fontSize: 12, color: C.textSub }}>Table {table?.table_number || 'N/A'}{table?.section ? ` · ${table.section}` : ''}</div>
                        {order.customer_name && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>👤 {order.customer_name}</div>}
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{safeFormat(order.created_at, 'HH:mm:ss')}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Items</div>
                        {order.order_items?.map((item, idx) => {
                          const sm = { pending: "amber", in_progress: "amber", ready: "green" };
                          return (
                            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontSize: 12, color: C.textSub }}>
                              {item.quantity}× {item.menu_item?.name}
                              <Pill label={item.status} variant={sm[item.status] ?? "gray"} />
                            </div>
                          );
                        })}
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 500, color: C.primary }}>₹{order.total_amount?.toFixed(2)}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, textTransform: "capitalize" }}>Status: {order.status}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <Btn variant="ghost" onClick={() => setSelectedOrder(order)} style={{ fontSize: 11 }}>View details</Btn>
                        {order.status === 'in_progress' && <Btn variant="success" onClick={() => markOrderReady(order.id)} style={{ fontSize: 11 }}>Mark ready</Btn>}
                        <Btn variant="danger" onClick={() => cancelOrder(order.id, order.table_id)} style={{ fontSize: 11 }}>Cancel</Btn>
                      </div>
                    </div>
                  </div>
                );
              })}
              {orders.filter(o => ACTIVE_ORDER_STATUSES.includes(o.status)).length === 0 && (
                <div style={{ ...CARD, textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>No active orders.</div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: MENU
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'menu' && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 500, color: C.text, margin: 0 }}>Menu management</h2>
                <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>Toggle items in/out of stock instantly, or upload the catalog Excel to update prices, names and images.</p>
              </div>
              <button
                onClick={async () => { setDownloadingTpl(true); await downloadCatalogTemplate(apiClient, showToast, menuItems); setDownloadingTpl(false); }}
                disabled={downloadingTpl}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.textSub, cursor: "pointer" }}>
                {downloadingTpl ? <Spinner size={14} /> : '↓'} Download template
              </button>
            </div>

            {uploadStatus === 'idle' && (
              <div
                onDragOver={e => { e.preventDefault(); setUploadDragOver(true); }}
                onDragLeave={() => setUploadDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `1px dashed ${uploadDragOver ? C.primary : C.border}`,
                  borderRadius: 12, padding: "40px 20px", textAlign: "center", cursor: "pointer",
                  background: uploadDragOver ? C.primaryLight : C.cardBg, transition: "all .2s",
                }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                <p style={{ fontSize: 13, fontWeight: 500, color: C.text, margin: "0 0 4px" }}>Drop your catalog Excel here</p>
                <p style={{ fontSize: 11, color: C.textMuted, margin: 0 }}>or click to browse — .xlsx, .xls, or .csv</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={e => handleFileSelect(e.target.files[0])} />
              </div>
            )}

            {uploadStatus === 'parsing' && (
              <div style={{ ...CARD, textAlign: "center", padding: "40px 20px" }}>
                <Spinner size={32} />
                <p style={{ fontSize: 13, color: C.textSub, marginTop: 12 }}>Reading file…</p>
              </div>
            )}

            {uploadStatus === 'preview' && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.primaryLight, border: `0.5px solid ${C.primaryBorder}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, color: C.primaryDark, fontWeight: 500 }}>
                    {uploadFile?.name} — {uploadRows.length} rows
                  </div>
                  <button onClick={handleResetUpload} style={{ fontSize: 12, color: C.textMuted, background: "none", border: "none", cursor: "pointer" }}>✕ Choose different file</button>
                </div>
                {uploadErrors.length > 0 && (
                  <AlertBanner type="error">
                    <strong>{uploadErrors.length} issue{uploadErrors.length !== 1 ? 's' : ''} found</strong> — fix in Excel and re-upload
                    <ul style={{ listStyle: "disc", paddingLeft: 18, marginTop: 6 }}>
                      {uploadErrors.map((e, i) => <li key={i} style={{ marginTop: 2 }}>{e}</li>)}
                    </ul>
                  </AlertBanner>
                )}
                <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ borderBottom: `0.5px solid ${C.border}`, background: C.surfaceBg }}>
                        {["ID","Name","Slot","Price","Description","Image URL"].map((h, i) => (
                          <th key={h} style={{ textAlign: i >= 3 ? "right" : "left", padding: "10px 14px", fontSize: 11, fontWeight: 500, color: C.textMuted, width: ["6%","18%","12%","8%","28%","28%"][i] }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadRows.map((row, i) => {
                        const hasError = uploadErrors.some(e => e.includes(`Row ${i + 1}`));
                        return (
                          <tr key={i} style={{ borderBottom: `0.5px solid ${C.border}`, background: hasError ? C.dangerLight : "transparent" }}>
                            <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 11, color: C.textMuted }}>{row.id}</td>
                            <td style={{ padding: "8px 14px", fontWeight: 500, color: C.text }}>{row.name}</td>
                            <td style={{ padding: "8px 14px" }}><span style={{ fontSize: 10, background: C.surfaceBg, color: C.textSub, padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>{SLOT_DB_TO_LABEL[row.time_slot] || row.time_slot}</span></td>
                            <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 500, color: C.text }}>₹{row.price.toFixed(2)}</td>
                            <td style={{ padding: "8px 14px", color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.description}</td>
                            <td style={{ padding: "8px 14px" }}>
                              {row.image_url
                                ? <a href={row.image_url} target="_blank" rel="noopener noreferrer" style={{ color: C.primary, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{row.image_url.replace(/^https?:\/\//, '').slice(0, 40)}…</a>
                                : <span style={{ color: C.textMuted }}>—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <Btn variant="secondary" onClick={handleResetUpload}>Cancel</Btn>
                  <Btn onClick={handleConfirmUpload} disabled={uploadErrors.length > 0}>Confirm &amp; upload {uploadRows.length} items</Btn>
                </div>
              </div>
            )}

            {uploadStatus === 'uploading' && (
              <div style={{ ...CARD, textAlign: "center", padding: "40px 20px" }}>
                <Spinner size={32} />
                <p style={{ fontSize: 13, fontWeight: 500, color: C.text, marginTop: 12 }}>Saving to database…</p>
                <p style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Updating Meta catalog in the background</p>
              </div>
            )}

            {uploadStatus === 'done' && uploadResult && (
              <div style={{ background: C.successLight, border: `0.5px solid ${C.successBorder}`, borderRadius: 12, padding: "28px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: C.successDark, marginBottom: 4 }}>Menu updated successfully</div>
                <div style={{ fontSize: 12, color: C.success, marginBottom: 16 }}>
                  {uploadResult.upserted} item{uploadResult.upserted !== 1 ? 's' : ''} saved
                  {uploadResult.skipped > 0 ? ` · ${uploadResult.skipped} skipped` : ''}
                  {uploadResult.purged  > 0 ? ` · ${uploadResult.purged} removed`  : ''}
                  {' '}· WhatsApp catalog updated
                </div>
                <Btn variant="success" onClick={handleResetUpload}>Upload another file</Btn>
              </div>
            )}

            {/* Current menu table */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>Current menu <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400 }}>({menuItems.length} items · all slots)</span></div>
                <span style={{ fontSize: 11, color: C.textMuted }}>Toggle to mark in/out of stock instantly</span>
              </div>
              {menuItems.length === 0 ? (
                <div style={{ ...CARD, textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>No menu items yet. Upload the catalog Excel to get started.</div>
              ) : (
                <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `0.5px solid ${C.border}`, background: C.surfaceBg }}>
                        {["Name","Slot","Price","Image","In stock"].map((h, i) => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: i >= 2 ? "right" : "left", fontSize: 11, fontWeight: 500, color: C.textMuted }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...menuItems].sort((a, b) => {
                        const aS = a.is_stocked ?? a.is_available ?? true;
                        const bS = b.is_stocked ?? b.is_available ?? true;
                        if (aS !== bS) return aS ? -1 : 1;
                        return (a.name || '').localeCompare(b.name || '');
                      }).map(item => {
                        const inStock  = item.is_stocked ?? item.is_available;
                        const isToggle = togglingId === item.id;
                        return (
                          <tr key={item.id} style={{ borderBottom: `0.5px solid ${C.border}`, opacity: inStock ? 1 : 0.55 }}>
                            <td style={{ padding: "10px 14px" }}>
                              <span style={{ fontWeight: 500, color: C.text }}>{item.name}</span>
                              {!inStock && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: C.danger, background: C.dangerLight, padding: "1px 6px", borderRadius: 20 }}>Out of stock</span>}
                            </td>
                            <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 10, background: C.surfaceBg, color: C.textSub, padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>{SLOT_DB_TO_LABEL[item.time_slot] || item.time_slot}</span></td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 500, color: C.text }}>₹{Number(item.price).toFixed(2)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>
                              {item.image_url
                                ? <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                                    <img src={item.image_url} alt={item.name} style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", border: `0.5px solid ${C.border}` }} onError={e => { e.target.style.display = 'none'; }} />
                                    <a href={item.image_url} target="_blank" rel="noopener noreferrer" style={{ color: C.primary, fontSize: 10 }}>View</a>
                                  </div>
                                : <span style={{ color: C.textMuted }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>
                              <button onClick={() => toggleAvailability(item)} disabled={isToggle}
                                title={inStock ? 'In stock — tap to mark out of stock' : 'Out of stock — tap to mark in stock'}
                                style={{
                                  position: "relative", display: "inline-flex", width: 36, height: 20, borderRadius: 10,
                                  background: isToggle ? C.borderStrong : inStock ? C.success : C.border,
                                  border: "none", cursor: "pointer", padding: 0, flexShrink: 0, transition: "background .2s",
                                }}>
                                {isToggle
                                  ? <Spinner size={12} />
                                  : <span style={{ position: "absolute", top: 3, left: inStock ? 19 : 3, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
