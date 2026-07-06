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
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useKOTPrint } from '../components/KOTPrint';
import { kotRef } from '../App';
import { format } from 'date-fns';
import DateRangeApply, { formatDateDMY } from '../components/DateRangeApply';
import BrandHeader from '../components/BrandHeader';

// ─── Design tokens ────────────────────────────────────────────────────────────
import { C, FONTS } from '../theme/brand'; 

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

const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'in_progress', 'ready'];

const CATALOG_TEMPLATE_HEADERS = [
  'id', 'title', 'description', 'price', 'category', 'custom_label_0', 'image_link', 'is_available',
  'prep_time_fixed', 'batch_size', 'time_per_batch', 'kitchen_station', 'packing_time', 'holds_well', 'fulfillment_section',
];
const CATALOG_TEMPLATE_COL_WIDTHS = [
  { wch: 8 }, { wch: 28 }, { wch: 40 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 48 }, { wch: 12 },
  { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 16 },
];
const CATALOG_COLUMN_HELP = [
  ['Column guide'],
  [''],
  ['custom_label_0 — menu slot: Morning Tiffin, Lunch, Evening Snacks, Dinner (blank = all day)'],
  ['prep_time_fixed — fixed prep minutes before batch cooking (default 5)'],
  ['batch_size / time_per_batch — batch cook timing for scheduled orders'],
  ['kitchen_station — tawa, steamer, kadai, beverages, assembly, cold'],
  ['packing_time — minutes per item for takeaway packing'],
  ['holds_well — TRUE if item can wait without quality loss'],
  ['fulfillment_section — counter id when multi-counter mode is on (default main)'],
];

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
  snacks:         'Evening Snacks',
  dinner_tiffin:  'Dinner Tiffin',
  dinner:         'Dinner',
};

const WEB_SLOT_OPTIONS = ['tiffin', 'lunch', 'dinner', 'anytime'];
const WEB_SLOT_LABEL = {
  tiffin: 'Breakfast/Tiffin',
  lunch: 'Lunch',
  dinner: 'Dinner',
  anytime: 'All time',
};

function normalizeWebSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) return ['anytime'];
  const clean = [...new Set(slots.map(s => String(s || '').toLowerCase().trim()))]
    .filter(Boolean)
    .filter(s => WEB_SLOT_OPTIONS.includes(s));
  return clean.length ? clean : ['anytime'];
}

// Reservation duration options (minutes)
const RESERVATION_DURATIONS = [30, 60, 90, 120];
const TABLE_SECTIONS = ['Main Hall', 'Terrace', 'Private Room', 'Counter', 'Outdoor'];

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

function tokenWaitMinutes(arrivedAt) {
  if (!arrivedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(arrivedAt).getTime()) / 60000));
}

const TOKEN_AGE_STYLES = {
  fresh:   { cardBorder: C.border,        avatarBg: C.warningLight, avatarColor: C.warningDark },
  caution: { cardBorder: C.warningBorder, avatarBg: '#FFF3CD',      avatarColor: '#856404'     },
  warning: { cardBorder: '#F0A500',       avatarBg: '#FFE4B5',      avatarColor: '#B45309'     },
  critical:{ cardBorder: C.dangerBorder,  avatarBg: C.dangerLight,  avatarColor: C.dangerDark  },
};

function tokenAgeStyle(arrivedAt) {
  const mins = tokenWaitMinutes(arrivedAt);
  if (mins >= 90) return TOKEN_AGE_STYLES.critical;
  if (mins >= 45) return TOKEN_AGE_STYLES.warning;
  if (mins >= 20) return TOKEN_AGE_STYLES.caution;
  return TOKEN_AGE_STYLES.fresh;
}

function tableCapacity(capacity) {
  const seats = Number(capacity);
  return Number.isFinite(seats) && seats > 0 ? seats : 4;
}

const LARGE_PARTY_THRESHOLD = 8;

/** Greedy multi-table combo — mirrors backend dineInAutoAssign.pickTableCombo */
function pickTableCombo(availableTables, pax) {
  const party = Math.max(1, parseInt(pax, 10) || 1);
  const sorted = [...availableTables].sort((a, b) => tableCapacity(b.capacity) - tableCapacity(a.capacity));
  const combo = [];
  let remaining = party;
  for (const t of sorted) {
    if (remaining <= 0) break;
    const cap = tableCapacity(t.capacity);
    const seatsUsed = Math.min(cap, remaining);
    combo.push([t.table_number, cap, seatsUsed]);
    remaining -= seatsUsed;
  }
  if (remaining > 0) return null;
  return combo;
}

function formatSeatLabel(capacity) {
  return `${tableCapacity(capacity)}-seater`;
}

function formatMenuCategory(category) {
  const c = (category || '').trim();
  if (!c || c === 'General') return '';
  return c;
}

function displayMenuCategory(category) {
  return formatMenuCategory(category) || 'Uncategorized';
}

function formatMenuSlot(timeSlot) {
  if (!timeSlot || timeSlot === 'all') return null;
  return SLOT_DB_TO_LABEL[timeSlot] || timeSlot.replace(/_/g, ' ');
}

function menuSlotsAreMeaningful(items) {
  const slots = new Set(
    (items || []).map(i => i.time_slot).filter(s => s && s !== 'all')
  );
  return slots.size > 0;
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

function StatCard({ label, value, colorStyle, hint }) {
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
      {hint && (
        <div style={{ fontSize: 10, color: colorStyle.color, opacity: 0.65, marginTop: 6, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
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
const IMAGE_SOURCE_EXAMPLES = [
  ['How to add dish images'],
  [''],
  ['Paste a direct image URL in the image_link column. These free sources work well:'],
  ['• Unsplash — https://images.unsplash.com/photo-...?w=800'],
  ['• Pexels   — https://images.pexels.com/photos/.../photo.jpeg?w=800'],
  [''],
  ['Tips:'],
  ['• Use a direct image URL (ends in .jpg, .jpeg, .png, or .webp, or has ?w=)'],
  ['• Right-click an image on Unsplash/Pexels → "Copy image address"'],
  ['• Leave image_link blank if you have no photo yet — item will still save'],
  [''],
  ['Example URLs you can copy:'],
  ['https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800'],
  ['https://images.pexels.com/photos/2232/vegetables-market-sell-produce.jpg?w=800'],
];

function exportCategoryForTemplate(category) {
  const c = (category || '').trim();
  return c && c !== 'General' ? c : '';
}

async function downloadCatalogTemplate(apiClient, showToast, currentMenuItems = []) {
  const fromApiItems = (items) =>
    items.map(item => [
      item.id, item.title, item.description, item.price,
      exportCategoryForTemplate(item.category),
      item.custom_label_0 || '',
      item.image_link, item.is_available,
      item.prep_time_fixed ?? 5,
      item.batch_size ?? 1,
      item.time_per_batch ?? 10,
      item.kitchen_station || 'assembly',
      item.packing_time ?? 1,
      item.holds_well ?? 'FALSE',
      item.fulfillment_section || 'main',
    ]);

  const slotLabel = (item) => {
    const db = item.time_slot;
    if (!db || db === 'all') return '';
    return SLOT_DB_TO_LABEL[db] || String(db).replace(/_/g, ' ');
  };

  const fromStateItems = (items) =>
    items.map(item => [
      item.retailer_id || item.id || '',
      item.name || '',
      item.description || '',
      Number(item.price) || 0,
      exportCategoryForTemplate(item.category),
      slotLabel(item),
      item.image_url || '',
      (item.is_stocked ?? item.is_available ?? true) ? 'TRUE' : 'FALSE',
      item.prep_time_fixed ?? 5,
      item.batch_size ?? 1,
      item.time_per_batch ?? 10,
      item.kitchen_station || 'assembly',
      item.packing_time ?? 1,
      item.holds_well ? 'TRUE' : 'FALSE',
      item.fulfillment_section || 'main',
    ]);

  const writeAndDownload = (rows, count, source) => {
    const catalogSheet = XLSX.utils.aoa_to_sheet([CATALOG_TEMPLATE_HEADERS, ...rows]);
    catalogSheet['!cols'] = CATALOG_TEMPLATE_COL_WIDTHS;
    const helpSheet = XLSX.utils.aoa_to_sheet([...IMAGE_SOURCE_EXAMPLES, [''], ...CATALOG_COLUMN_HELP]);
    helpSheet['!cols'] = [{ wch: 72 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, catalogSheet, 'WhatsApp Catalog');
    XLSX.utils.book_append_sheet(wb, helpSheet, 'Column guide');
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

  const stockedItems = (currentMenuItems || []).filter(
    i => i.is_stocked !== false && (i.retailer_id || i.id)
  );
  if (stockedItems.length > 0) {
    writeAndDownload(fromStateItems(stockedItems), stockedItems.length, 'local snapshot');
    return;
  }

  const stubRow = [
    'M001', 'Idli', 'Soft steamed idlis with sambar and chutney', 50, 'Tiffin', 'Morning Tiffin',
    'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800', 'TRUE',
    5, 1, 10, 'steamer', 1, 'FALSE', 'main',
  ];
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
  let category    = String(row['category'] || row['Category'] || '').trim();
  if (!category && row['custom_label_0']) {
    category = String(row['custom_label_0']).trim();
  }
  const image_url   = String(row['image_link'] || row['image_url'] || row['Image Link'] || row['Image URL'] || '').trim();
  const availRaw    = row['is_available'] ?? row['Is Available'] ?? row['is_stocked'] ?? '';
  const is_available = availRaw === '' ? undefined : !['false', '0', 'no'].includes(String(availRaw).toLowerCase().trim());
  const customSlot  = String(row['custom_label_0'] || row['Custom Label 0'] || '').trim();
  let time_slot = 'all';
  if (customSlot) {
    time_slot = SLOT_LABEL_TO_DB[customSlot.toLowerCase()] || customSlot.toLowerCase().replace(/\s+/g, '_');
  }
  return {
    id, name, description, price, category, time_slot, image_url,
    prep_time_fixed: row['prep_time_fixed'],
    batch_size: row['batch_size'],
    time_per_batch: row['time_per_batch'],
    kitchen_station: row['kitchen_station'],
    packing_time: row['packing_time'],
    holds_well: row['holds_well'],
    fulfillment_section: row['fulfillment_section'],
    custom_label_0: customSlot,
    ...(is_available !== undefined ? { is_available } : {}),
  };
}
function validateRow(row, index) {
  const errors = [];
  if (!row.id)        errors.push(`Row ${index + 1}: missing id`);
  if (!row.name)      errors.push(`Row ${index + 1}: missing name/title`);
  if (row.price <= 0) errors.push(`Row ${index + 1} (${row.name || row.id}): price must be > 0`);
  if (!row.category)  errors.push(`Row ${index + 1} (${row.name || row.id}): missing category (e.g. Tiffin, Beverages, Snacks)`);
  if (row.image_url && !/^https?:\/\//i.test(row.image_url)) {
    errors.push(`Row ${index + 1} (${row.name || row.id}): image_link must start with http:// or https://`);
  }
  return errors;
}

function todayDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function formatINR(amount) {
  const n = Number(amount) || 0;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const SERVICE_LABELS = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  other: 'Other',
};

function tokenFulfillmentKind(token) {
  const type = String(token.type || '').toLowerCase();
  const meta = token.meta || {};
  const isScheduled = type.includes('scheduled') || Boolean(meta.scheduled_at || meta.kitchen_start_at);
  const isDelivery = type.includes('delivery') || meta.service_type === 'delivery';
  if (isDelivery) return isScheduled ? 'scheduled_delivery' : 'live_delivery';
  return isScheduled ? 'scheduled_takeaway' : 'live_takeaway';
}

const FULFILLMENT_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'dine_in', label: 'Dine-in' },
  { key: 'live_takeaway', label: 'Live takeaway' },
  { key: 'live_delivery', label: 'Live delivery' },
];

function approvalTypeLabel(type) {
  if (type === 'scheduled_delivery') return 'Scheduled delivery';
  if (type === 'scheduled_takeaway') return 'Scheduled take-away';
  if (type === 'large_party') return 'Large party';
  return type || 'Approval';
}

// ============================================================================
// COMPONENT
// ============================================================================
export default function ManagerPortal() {
  const { user, apiClient, logout } = useAuth();
  const { updates } = useWebSocket();
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

  const [showWalkInModal,   setShowWalkInModal]   = useState(false);
  const [walkInName,        setWalkInName]        = useState('');
  const [walkInPhone,       setWalkInPhone]       = useState('');
  const [walkInPax,         setWalkInPax]         = useState(2);
  const [walkInSubmitting,  setWalkInSubmitting]  = useState(false);

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
  const [togglingSpecialId, setTogglingSpecialId] = useState(null);
  const [menuSearch,     setMenuSearch]     = useState('');
  const [menuCategory,   setMenuCategory]   = useState('all');
  const [categorySlots,  setCategorySlots]  = useState({});
  const [kitchenStatus,  setKitchenStatus]  = useState(null);
  const [kitchenToggling,setKitchenToggling]= useState(false);
  const [kitchenBusyToggling, setKitchenBusyToggling] = useState(false);
  const [kdsItems,       setKdsItems]       = useState([]);
  const [scheduledBoard, setScheduledBoard] = useState([]);
  const [ordersFilter,   setOrdersFilter]   = useState('all');
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [approvalDraftFrom, setApprovalDraftFrom] = useState(todayDateStr());
  const [approvalDraftTo, setApprovalDraftTo] = useState(todayDateStr());
  const [approvalAppliedFrom, setApprovalAppliedFrom] = useState(null);
  const [approvalAppliedTo, setApprovalAppliedTo] = useState(null);
  const [approvalLoading,setApprovalLoading]= useState(false);
  const [showApprovalHistory, setShowApprovalHistory] = useState(false);
  const [tablesSubView, setTablesSubView] = useState('floor');
  const [tableEditingId, setTableEditingId] = useState(null);
  const [tableEditBuf, setTableEditBuf] = useState({});
  const [tableAdding, setTableAdding] = useState(false);
  const [tableNewRow, setTableNewRow] = useState({ table_number: '', capacity: 4, section: '' });
  const [tableCrudSaving, setTableCrudSaving] = useState(null);
  const [tableDeleting, setTableDeleting] = useState(null);
  const [metaLastSync, setMetaLastSync] = useState(null);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [salesReport, setSalesReport] = useState(null);
  const [salesDraftFrom, setSalesDraftFrom] = useState(todayDateStr());
  const [salesDraftTo, setSalesDraftTo] = useState(todayDateStr());
  const [salesAppliedFrom, setSalesAppliedFrom] = useState(null);
  const [salesAppliedTo, setSalesAppliedTo] = useState(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const fileInputRef = useRef(null);

  const showToast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3500); };

  // ── Fetchers ─────────────────────────────────────────────────────────────
  const fetchTokens    = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/tokens');
      setTokens(r.data.tokens || r.data || []);
    } catch (e) {
      console.error('[ManagerPortal] fetchTokens failed:', e.response?.data || e.message);
      if (e.response?.status === 401) {
        setToastMsg('Queue unavailable — no restaurant linked to your account. Contact admin.');
        setTimeout(() => setToastMsg(''), 5000);
      }
    }
  }, [apiClient]);
  const fetchTables    = useCallback(async () => { try { const r = await apiClient.get('/api/tables');     setTables(r.data.tables || r.data || []); } catch(e) {} }, [apiClient]);
  const fetchOrders    = useCallback(async () => { try { const r = await apiClient.get('/api/orders');     setOrders(r.data.orders || r.data || []); } catch(e) {} }, [apiClient]);
  const fetchKdsFeed   = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/kds/feed', { params: { status: 'all' } });
      setKdsItems(r.data.items || []);
    } catch (e) { /* KDS may be unavailable for some roles */ }
  }, [apiClient]);
  const fetchScheduledBoard = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/kds/scheduled');
      setScheduledBoard(r.data.orders || []);
    } catch (e) { /* non-fatal */ }
  }, [apiClient]);
  const fetchApprovalHistory = useCallback(async (from, to) => {
    setApprovalLoading(true);
    try {
      const r = await apiClient.get('/api/tokens/approvals/history', { params: { from, to } });
      setApprovalHistory(r.data.history || []);
    } catch (e) {
      setApprovalHistory([]);
      showToast(e.response?.data?.error || 'Could not load approval history');
    } finally {
      setApprovalLoading(false);
    }
  }, [apiClient]);
  const fetchMenuItems = useCallback(async () => { try { const r = await apiClient.get('/api/menu-items?ignore_slot=true'); setMenuItems(r.data.items || r.data || []); } catch(e) {} }, [apiClient]);
  const fetchCategorySlots = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/catalog/menu-categories/slots');
      const map = {};
      for (const row of r.data.categories || []) {
        if (row?.name) map[row.name] = normalizeWebSlots(row.applicable_slots);
      }
      setCategorySlots(map);
    } catch (e) {
      console.error('[ManagerPortal] fetchCategorySlots failed:', e.response?.data || e.message);
    }
  }, [apiClient]);
  const fetchKitchenStatus = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/catalog/kitchen-status');
      setKitchenStatus(r.data);
    } catch (e) {
      console.error('[ManagerPortal] fetchKitchenStatus failed:', e.response?.data || e.message);
    }
  }, [apiClient]);
  const fetchCatalogStatus = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/catalog/status');
      setMetaLastSync(r.data.lastSync || r.data.lastMetaSync || null);
    } catch (e) { /* non-fatal */ }
  }, [apiClient]);
  const fetchSalesReport = useCallback(async (from, to) => {
    setSalesLoading(true);
    try {
      const r = await apiClient.get('/api/reports/sales', { params: { from, to } });
      setSalesReport(r.data.report || null);
    } catch (e) {
      setSalesReport(null);
      showToast(e.response?.data?.error || 'Could not load sales report');
    } finally {
      setSalesLoading(false);
    }
  }, [apiClient]);
  const fetchData      = useCallback(async () => {
    await Promise.all([
      fetchTables(), fetchOrders(), fetchTokens(), fetchMenuItems(), fetchCategorySlots(), fetchKitchenStatus(),
      fetchKdsFeed(), fetchScheduledBoard(), fetchCatalogStatus(),
    ]);
    setLoading(false);
  }, [fetchTables, fetchOrders, fetchTokens, fetchMenuItems, fetchCategorySlots, fetchKitchenStatus, fetchKdsFeed, fetchScheduledBoard, fetchCatalogStatus]);

  useEffect(() => {
    fetchData();
    const full  = setInterval(fetchData, 15000);
    const quick = setInterval(async () => {
      await fetchTokens();
      await fetchTables();
      await fetchOrders();
      await fetchKdsFeed();
      await fetchScheduledBoard();
    }, 8000);
    return () => { clearInterval(full); clearInterval(quick); };
  }, [fetchData, fetchTokens, fetchTables, fetchOrders, fetchKdsFeed, fetchScheduledBoard]);

  useEffect(() => {
    const latest = updates[0];
    if (!latest) return;
    if (['TOKEN_NEW', 'TOKEN_ASSIGNED', 'TOKEN_APPROVED', 'TOKEN_COMPLETED', 'TOKEN_REJECTED', 'ORDER_NEW', 'SCHEDULED_KDS_DISPATCH'].includes(latest.type)) {
      fetchTokens();
      fetchTables();
      fetchOrders();
      fetchKdsFeed();
      fetchScheduledBoard();
    }
  }, [updates, fetchTokens, fetchTables, fetchOrders, fetchKdsFeed, fetchScheduledBoard]);

  const applyApprovalHistory = () => {
    setApprovalAppliedFrom(approvalDraftFrom);
    setApprovalAppliedTo(approvalDraftTo);
    fetchApprovalHistory(approvalDraftFrom, approvalDraftTo);
  };

  const applySalesReport = () => {
    setSalesAppliedFrom(salesDraftFrom);
    setSalesAppliedTo(salesDraftTo);
    fetchSalesReport(salesDraftFrom, salesDraftTo);
  };

  const setApprovalToday = () => {
    const t = todayDateStr();
    setApprovalDraftFrom(t);
    setApprovalDraftTo(t);
    setApprovalAppliedFrom(t);
    setApprovalAppliedTo(t);
    fetchApprovalHistory(t, t);
  };

  const setSalesToday = () => {
    const t = todayDateStr();
    setSalesDraftFrom(t);
    setSalesDraftTo(t);
    setSalesAppliedFrom(t);
    setSalesAppliedTo(t);
    fetchSalesReport(t, t);
  };

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
    return status === 'available' && tableCapacity(t.capacity) >= pax;
  });
  const availableTablesForCombo = () => tables.filter(t => {
    const { status } = getTableStatus(t);
    return status === 'available' && tableCapacity(t.capacity) > 0;
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
    estimate_display: t.estimate_display || null,
    estimated_wait_minutes: t.estimated_wait_minutes ?? null,
    waitlist_depth_at_issue: t.waitlist_depth_at_issue ?? null,
  });

  const normTokens         = tokens.map(normaliseToken);
  const waitingTokens      = normTokens.filter(t => t.status === 'waiting');
  const seatedTokens       = normTokens.filter(t => t.status === 'seated');
  const takeawayTokens     = normTokens.filter(t => t.status === 'takeaway');
  const pendingApprTokens  = normTokens.filter(t => t.status === 'pending_approval');
  const pendingScheduledApprTokens = pendingApprTokens.filter(t =>
    t.type === 'scheduled_delivery' || t.type === 'scheduled_takeaway'
      || tokenFulfillmentKind(t).startsWith('scheduled_'),
  );
  const pendingLargePartyTokens = pendingApprTokens.filter(t => !pendingScheduledApprTokens.includes(t));
  const liveTakeawayTokens = takeawayTokens.filter(t => tokenFulfillmentKind(t) === 'live_takeaway');
  const liveDeliveryTokens = takeawayTokens.filter(t => tokenFulfillmentKind(t) === 'live_delivery');
  const scheduledTakeawayTokens = takeawayTokens.filter(t => tokenFulfillmentKind(t) === 'scheduled_takeaway');
  const scheduledDeliveryTokens = takeawayTokens.filter(t => tokenFulfillmentKind(t) === 'scheduled_delivery');
  const activeDineInOrders = orders.filter(o => ACTIVE_ORDER_STATUSES.includes(o.status) && o.table_id);
  const scheduledPrepOrders = scheduledBoard.filter(o => ['todays_future', 'present', 'future'].includes(o.bucket));
  const scheduledTodayPrep = scheduledPrepOrders.filter(o => ['todays_future', 'present'].includes(o.bucket));
  const scheduledFutureBookings = scheduledPrepOrders.filter(o => o.bucket === 'future');
  const scheduledTabCount = pendingScheduledApprTokens.length + scheduledTakeawayTokens.length
    + scheduledDeliveryTokens.length + scheduledPrepOrders.length;
  const activeKdsItems = kdsItems.filter(i => ['pending', 'in_progress', 'ready'].includes(i.status));
  const freeTablesCount    = tables.filter(t => getTableStatus(t).status === 'available').length;

  const showMenuSlotColumn = menuSlotsAreMeaningful(menuItems);
  const menuCategories = [...new Set(menuItems.map(i => formatMenuCategory(i.category)).filter(Boolean))].sort();
  const filteredMenuItems = [...menuItems]
    .filter(item => {
      if (menuCategory !== 'all' && formatMenuCategory(item.category) !== menuCategory) return false;
      if (menuSearch.trim()) {
        const q = menuSearch.trim().toLowerCase();
        if (!(item.name || '').toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aS = a.is_stocked ?? a.is_available ?? true;
      const bS = b.is_stocked ?? b.is_available ?? true;
      if (aS !== bS) return aS ? -1 : 1;
      const catCmp = displayMenuCategory(a.category).localeCompare(displayMenuCategory(b.category));
      if (catCmp !== 0) return catCmp;
      return (a.name || '').localeCompare(b.name || '');
    });
  const groupedMenuItems = filteredMenuItems.reduce((acc, item) => {
    const cat = displayMenuCategory(item.category);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  const groupedMenuCategories = Object.keys(groupedMenuItems).sort();

  const syncMetaCatalog = async () => {
    if (metaSyncing) return;
    setMetaSyncing(true);
    try {
      const r = await apiClient.post('/api/catalog/sync');
      const synced = r.data.synced ?? r.data.total ?? 0;
      showToast(`Meta catalog synced — ${synced} item${synced !== 1 ? 's' : ''} updated`);
      await Promise.all([fetchMenuItems(), fetchCatalogStatus()]);
    } catch (e) {
      showToast(e.response?.data?.error || 'Meta catalog sync failed');
    } finally {
      setMetaSyncing(false);
    }
  };

  const toggleKitchen = async () => {
    if (!kitchenStatus || kitchenToggling) return;
    const nextOpen = !kitchenStatus.is_open;
    const label = nextOpen ? 'open kitchen for WhatsApp orders' : 'close kitchen for WhatsApp orders';
    if (!window.confirm(`${nextOpen ? 'Open' : 'Close'} the kitchen? Customers will ${nextOpen ? 'be able to' : 'not be able to'} order via WhatsApp.`)) return;
    setKitchenToggling(true);
    try {
      await apiClient.post('/api/catalog/kitchen-toggle', { open: nextOpen });
      showToast(nextOpen ? 'Kitchen is now open' : 'Kitchen is now closed');
      await Promise.all([fetchKitchenStatus(), fetchMenuItems()]);
    } catch (e) {
      showToast(e.response?.data?.error || `Failed to ${label}`);
    } finally {
      setKitchenToggling(false);
    }
  };

  const toggleKitchenBusy = async () => {
    if (!kitchenStatus || kitchenBusyToggling) return;
    const nextBusy = !kitchenStatus.kitchen_busy;
    setKitchenBusyToggling(true);
    try {
      await apiClient.post('/api/catalog/kitchen-busy-toggle', { busy: nextBusy });
      showToast(nextBusy ? 'Kitchen marked busy — customers will see a delay note' : 'Kitchen marked normal');
      await fetchKitchenStatus();
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to update kitchen busy status');
    } finally {
      setKitchenBusyToggling(false);
    }
  };

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

  const startTableEdit = (t) => {
    setTableEditingId(t.id);
    setTableEditBuf({ table_number: t.table_number, capacity: t.capacity ?? 4, section: t.section ?? '' });
    setTableAdding(false);
  };

  const cancelTableEdit = () => { setTableEditingId(null); setTableEditBuf({}); };

  const saveTableEdit = async (id) => {
    if (!tableEditBuf.table_number) { showToast('Table number is required'); return; }
    setTableCrudSaving(id);
    try {
      await apiClient.put(`/api/tables/${id}`, {
        table_number: parseInt(tableEditBuf.table_number, 10),
        capacity: parseInt(tableEditBuf.capacity, 10) || 4,
        section: tableEditBuf.section || null,
      });
      showToast(`Table ${tableEditBuf.table_number} updated`);
      setTableEditingId(null);
      await fetchTables();
    } catch (e) {
      showToast(e.response?.data?.error || 'Update failed');
    } finally {
      setTableCrudSaving(null);
    }
  };

  const deleteTableCrud = async (t) => {
    if (!window.confirm(`Delete Table ${t.table_number}? This cannot be undone.`)) return;
    setTableDeleting(t.id);
    try {
      await apiClient.delete(`/api/tables/${t.id}`);
      showToast(`Table ${t.table_number} deleted`);
      await fetchTables();
    } catch (e) {
      showToast(e.response?.data?.error || 'Delete failed');
    } finally {
      setTableDeleting(null);
    }
  };

  const addTableCrud = async () => {
    if (!tableNewRow.table_number) { showToast('Table number is required'); return; }
    setTableCrudSaving('new');
    try {
      await apiClient.post('/api/tables', {
        table_number: parseInt(tableNewRow.table_number, 10),
        capacity: parseInt(tableNewRow.capacity, 10) || 4,
        section: tableNewRow.section || null,
      });
      showToast(`Table ${tableNewRow.table_number} added`);
      setTableAdding(false);
      setTableNewRow({ table_number: '', capacity: 4, section: '' });
      await fetchTables();
    } catch (e) {
      showToast(e.response?.data?.error || 'Add failed');
    } finally {
      setTableCrudSaving(null);
    }
  };

  const bulkAddTables = async () => {
    const count = parseInt(window.prompt('How many tables to add? (numbered from the next available slot)'), 10);
    if (!count || count < 1 || count > 50) return;
    const maxNum = tables.reduce((m, t) => Math.max(m, t.table_number || 0), 0);
    setTableCrudSaving('bulk');
    let added = 0;
    for (let i = 1; i <= count; i++) {
      try {
        await apiClient.post('/api/tables', { table_number: maxNum + i, capacity: 4 });
        added += 1;
      } catch { /* skip duplicate numbers */ }
    }
    showToast(`Added ${added} table${added === 1 ? '' : 's'}`);
    setTableCrudSaving(null);
    await fetchTables();
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

  const addWalkInToQueue = async () => {
    if (!walkInName.trim()) { showToast('Customer name is required'); return; }
    const digits = walkInPhone.replace(/\D/g, '');
    if (!digits || digits.length < 10) { showToast('Enter a valid 10-digit phone'); return; }
    const partySize = Math.max(1, parseInt(walkInPax, 10) || 1);
    setWalkInSubmitting(true);
    try {
      await apiClient.post('/api/tokens', {
        name: walkInName.trim(),
        phone: digits,
        type: 'dinein',
        pax: partySize,
        restaurant_id: user?.restaurant_id,
      });
      showToast(
        partySize > LARGE_PARTY_THRESHOLD
          ? `${walkInName.trim()} added — large party pending approval`
          : `${walkInName.trim()} added to queue`,
      );
      setShowWalkInModal(false);
      setWalkInName('');
      setWalkInPhone('');
      setWalkInPax(2);
      await fetchTokens();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add walk-in');
    } finally {
      setWalkInSubmitting(false);
    }
  };

  const promoteLargeParty = async (token) => {
    setProcessingId(token.id);
    try {
      await apiClient.put(`/api/tokens/${token.id}/promote-large-party`);
      showToast(`${token.id} moved to large party approval`);
      await fetchTokens();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to promote large party');
    } finally {
      setProcessingId(null);
    }
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
    } catch(err) { showToast(err.response?.data?.error || `Failed to update ${item.name}`); }
    finally { setTogglingId(null); }
  };

  const toggleSpecialToday = async (item) => {
    setTogglingSpecialId(item.id);
    const newValue = !item.is_special_today;
    try {
      await apiClient.put(`/api/menu-items/${item.id}/special-today`, { is_special_today: newValue });
      setMenuItems(prev => prev.map(m => m.id === item.id ? { ...m, is_special_today: newValue } : m));
      showToast(newValue ? `${item.name} marked as today's special` : `${item.name} removed from today's specials`);
    } catch (err) { showToast(err.response?.data?.error || `Failed to update ${item.name}`); }
    finally { setTogglingSpecialId(null); }
  };

  const saveCategorySlots = async (category, slots) => {
    const applicable_slots = normalizeWebSlots(slots);
    try {
      await apiClient.put(`/api/catalog/menu-categories/${encodeURIComponent(category)}/slots`, {
        applicable_slots,
      });
      setCategorySlots(prev => ({ ...prev, [category]: applicable_slots }));
      showToast(`Saved slots for ${category}`);
    } catch (err) {
      showToast(err.response?.data?.error || `Failed to save slots for ${category}`);
    }
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
      const purged = res.data.purged ? ` · ${res.data.purged} old items removed` : '';
      showToast(`Catalog replaced — ${res.data.upserted} items saved${purged}`);
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

      {/* ── Add walk-in modal ────────────────────────────────────────────── */}
      {showWalkInModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div style={{ ...CARD, maxWidth: 400, width: "100%", padding: 0, overflow: "hidden" }}>
            <div style={{ background: C.primaryLight, borderBottom: `0.5px solid ${C.primaryBorder}`, padding: "16px 20px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, color: C.primaryDark, margin: 0 }}>Add walk-in to queue</h3>
              <p style={{ fontSize: 12, color: C.textSub, margin: "2px 0 0" }}>For WhatsApp bookings that failed to sync</p>
            </div>
            <div style={{ padding: "20px 20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 5, display: "block" }}>Customer name</label>
                <input value={walkInName} onChange={e => setWalkInName(e.target.value)} placeholder="Ravi Sharma" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 5, display: "block" }}>WhatsApp phone</label>
                <input value={walkInPhone} onChange={e => setWalkInPhone(e.target.value)} placeholder="917305362067" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: C.textSub, marginBottom: 5, display: "block" }}>Party size</label>
                <input type="number" min={1} max={50} value={walkInPax} onChange={e => setWalkInPax(e.target.value)} style={inputStyle} />
                {Math.max(1, parseInt(walkInPax, 10) || 1) > LARGE_PARTY_THRESHOLD && (
                  <p style={{ fontSize: 11, color: C.accentDark, margin: '6px 0 0' }}>
                    Large party ({LARGE_PARTY_THRESHOLD + 1}+) — tables will be proposed for approval.
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="secondary" onClick={() => setShowWalkInModal(false)} style={{ flex: 1 }}>Cancel</Btn>
                <Btn variant="primary" onClick={addWalkInToQueue} disabled={walkInSubmitting} style={{ flex: 1 }}>
                  {walkInSubmitting ? <Spinner size={14} /> : 'Add to queue'}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}

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
                            Table {t.table_number} ({tableCapacity(t.capacity)} seats){t.section ? ` · ${t.section}` : ''}
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
<BrandHeader
  title="Manager portal"
  subtitle="Manage tables, orders and kitchen operations"
  right={
    <>
              {kitchenStatus && (
                <button
                  onClick={toggleKitchen}
                  disabled={kitchenToggling}
                  title={
                    kitchenStatus.is_open
                      ? 'Kitchen is open — WhatsApp customers can order. Tap to close.'
                      : `Kitchen is closed${kitchenStatus.schedule_open ? '' : ` · schedule resumes ${kitchenStatus.next_open_label}`}. Tap to open.`
                  }
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8,
                    cursor: kitchenToggling ? 'wait' : 'pointer',
                    border: `0.5px solid ${kitchenStatus.is_open ? C.successBorder : C.dangerBorder}`,
                    background: kitchenStatus.is_open ? C.successLight : C.dangerLight,
                    color: kitchenStatus.is_open ? C.successDark : C.dangerDark,
                    opacity: kitchenToggling ? 0.7 : 1,
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: kitchenStatus.is_open ? C.success : C.danger,
                    display: 'inline-block',
                  }} />
                  Kitchen: {kitchenToggling ? 'Updating…' : kitchenStatus.is_open ? 'Open' : 'Closed'}
                </button>
              )}
              {kitchenStatus && (
                <button
                  onClick={toggleKitchenBusy}
                  disabled={kitchenBusyToggling}
                  title={
                    kitchenStatus.kitchen_busy
                      ? 'Kitchen is busy — customers see a high-volume delay note. Tap to mark normal.'
                      : 'Mark kitchen busy during rush — adds delay note to takeaway/delivery confirmations.'
                  }
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 8,
                    cursor: kitchenBusyToggling ? 'wait' : 'pointer',
                    border: `0.5px solid ${kitchenStatus.kitchen_busy ? '#f59e0b' : C.border}`,
                    background: kitchenStatus.kitchen_busy ? '#fffbeb' : C.cardBg,
                    color: kitchenStatus.kitchen_busy ? '#b45309' : C.textMuted,
                    opacity: kitchenBusyToggling ? 0.7 : 1,
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: kitchenStatus.kitchen_busy ? '#f59e0b' : C.border,
                    display: 'inline-block',
                  }} />
                  {kitchenBusyToggling ? 'Updating…' : kitchenStatus.kitchen_busy ? 'Busy kitchen' : 'Mark busy'}
                </button>
              )}
              <Link
                to="/settings?tab=kitchen#scheduled-ordering"
                style={{
                  fontSize: 11, fontWeight: 500, color: C.primaryDark, textDecoration: 'none',
                  padding: '6px 10px', borderRadius: 8, border: `0.5px solid ${C.primaryBorder}`,
                  background: C.primaryLight,
                }}
              >
                Kitchen hours →
              </Link>
              <span style={{ fontSize: 12, color: C.textSub }}>👤 {user?.full_name || user?.email}</span>
              <Link
                to="/settings"
                style={{
                  fontSize: 12, fontWeight: 500, color: C.primaryDark, textDecoration: 'none',
                  padding: '6px 12px', borderRadius: 8, border: `0.5px solid ${C.primaryBorder}`,
                  background: C.primaryLight,
                }}
              >
                👥 Team
              </Link>
              <Btn onClick={() => openNewOrderModal(null)}>+ New order</Btn>
              <Btn variant="danger" onClick={logout}>Logout</Btn>
              </>
  }
   />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px" }}>

        {/* ── Stats strip ───────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, marginBottom: 20 }}>
          {[
            {
              label: "Kitchen",
              value: kitchenStatus ? (kitchenStatus.is_open ? 'Open' : 'Closed') : '—',
              colorStyle: kitchenStatus?.is_open
                ? { bg: C.successLight, border: C.successBorder, color: C.successDark }
                : { bg: C.dangerLight,  border: C.dangerBorder,  color: C.dangerDark  },
              hint: kitchenStatus
                ? (kitchenStatus.is_open
                    ? [
                        kitchenStatus.current_slot_label ? `${kitchenStatus.current_slot_label} menu live` : 'Manual override active',
                        kitchenStatus.takeaway_ready_range ? `Takeaway ${kitchenStatus.takeaway_ready_range}` : null,
                        kitchenStatus.delivery_ready_range ? `Delivery ${kitchenStatus.delivery_ready_range}` : null,
                      ].filter(Boolean).join(' · ')
                    : `WhatsApp ordering paused${kitchenStatus.schedule_open ? '' : ` · opens ${kitchenStatus.next_open_label}`}`)
                : null,
            },
            {
              label: "Approval needed",
              value: pendingApprTokens.length,
              colorStyle: { bg: C.accentLight,  border: C.accentBorder,  color: C.accentDark  },
              hint: pendingApprTokens.length === 0
                ? 'Scheduled orders and large parties (8+) appear under Scheduled / Queue'
                : pendingScheduledApprTokens.length > 0
                  ? `${pendingScheduledApprTokens.length} scheduled · see Scheduled tab`
                  : 'Large parties waiting for your table split decision',
            },
            { label: "Waiting",         value: waitingTokens.length,       colorStyle: { bg: C.warningLight, border: C.warningBorder, color: C.warningDark } },
            { label: "Seated",          value: seatedTokens.length,        colorStyle: { bg: C.successLight, border: C.successBorder, color: C.successDark } },
            { label: "Takeaway",        value: takeawayTokens.length,      colorStyle: { bg: C.primaryLight, border: C.primaryBorder, color: C.primaryDark } },
            { label: "Tables free",     value: freeTablesCount,            colorStyle: { bg: "#F5F5F3",      border: C.border,        color: "#444441"     } },
          ].map(s => <StatCard key={s.label} {...s} />)}
        </div>

        {/* ── Tab bar ───────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 3, marginBottom: 20, background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 10, padding: 4, width: "fit-content" }}>
          {[
            { key: 'queue',  label: `Queue${(waitingTokens.length + pendingLargePartyTokens.length) ? ` (${waitingTokens.length + pendingLargePartyTokens.length})` : ''}` },
            { key: 'scheduled', label: `Scheduled${scheduledTabCount ? ` (${scheduledTabCount})` : ''}` },
            { key: 'tables', label: 'Tables' },
            { key: 'orders', label: `Active orders${(activeDineInOrders.length + liveTakeawayTokens.length + liveDeliveryTokens.length) ? ` (${activeDineInOrders.length + liveTakeawayTokens.length + liveDeliveryTokens.length})` : ''}` },
            { key: 'reports', label: 'Reports' },
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

            {pendingLargePartyTokens.length > 0 && (
              <div>
                <SectionLabel>Pending approval — large party — {pendingLargePartyTokens.length}</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pendingLargePartyTokens.map(token => {
                    const combo = token.meta?.combo ?? [];
                    const isProc = processingId === token.id;
                    const isScheduledDelivery = token.type === 'scheduled_delivery';
                    const isScheduledTakeaway = token.type === 'scheduled_takeaway';
                    const isLargeParty = !isScheduledDelivery && !isScheduledTakeaway;
                    const tableLines = combo.length > 0 ? combo.map(t => `Table ${t[0]} (${t[2]}/${t[1]} seats)`).join(' + ') : `${token.pax} seats across multiple tables`;
                    const schedLabel = token.meta?.scheduled_at_label || token.meta?.scheduled_at || '—';
                    const kitchenLabel = token.meta?.kitchen_start_at_label || token.meta?.kitchen_start_at || '—';
                    const orderPreview = (token.meta?.order_text || '').slice(0, 160);
                    const totalLabel = token.meta?.total != null ? `₹${Number(token.meta.total).toFixed(0)}` : null;
                    return (
                      <div key={token.id} style={{ ...CARD, display: "flex", alignItems: "flex-start", gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.accentLight, color: C.accentDark, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500, flexShrink: 0 }}>
                          {String(token.id).replace('T-', '')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{token.id}</span>
                            <Pill
                              label={
                                isScheduledTakeaway ? 'Scheduled take-away'
                                  : isScheduledDelivery ? 'Scheduled delivery'
                                  : 'Needs approval'
                              }
                              variant="purple"
                            />
                          </div>
                          <p style={{ fontSize: 12, color: C.textSub, margin: "0 0 2px" }}>
                            {token.name}
                            {isLargeParty ? <> · <strong>{token.pax} people</strong></> : null}
                            {' · Arrived '}{safeFormat(token.arrived_at, 'HH:mm')}
                          </p>
                          {token.phone && <p style={{ fontSize: 11, color: C.textMuted, margin: "0 0 8px" }}>+{token.phone}</p>}
                          {(isScheduledTakeaway || isScheduledDelivery) && (
                            <div style={{ background: C.accentLight, border: `0.5px solid ${C.accentBorder}`, borderRadius: 7, padding: "8px 10px", fontSize: 11, color: C.accentDark, marginBottom: 10 }}>
                              {isScheduledTakeaway ? (
                                <>
                                  <div><strong>Pickup:</strong> {schedLabel}</div>
                                  <div><strong>Kitchen start:</strong> {kitchenLabel}</div>
                                </>
                              ) : (
                                <>
                                  <div><strong>Deliver by:</strong> {schedLabel}</div>
                                  <div><strong>Address:</strong> {(token.meta?.delivery_address || '—').slice(0, 100)}</div>
                                </>
                              )}
                              {totalLabel && <div><strong>Total:</strong> {totalLabel}</div>}
                              {orderPreview && <div style={{ marginTop: 6 }}><strong>Order:</strong> {orderPreview}</div>}
                            </div>
                          )}
                          {isLargeParty && (
                            <div style={{ background: C.accentLight, border: `0.5px solid ${C.accentBorder}`, borderRadius: 7, padding: "6px 10px", fontSize: 11, color: C.accentDark, marginBottom: 10 }}>
                              <strong>Proposed split: </strong>{tableLines}
                            </div>
                          )}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <SectionLabel>Waiting for table — {waitingTokens.length} token{waitingTokens.length !== 1 ? 's' : ''}</SectionLabel>
                <Btn variant="primary" onClick={() => setShowWalkInModal(true)}>+ Add walk-in</Btn>
              </div>
              {waitingTokens.length === 0 ? (
                <div style={{ ...CARD, textAlign: "center", padding: "32px 20px", color: C.textMuted, fontSize: 13 }}>
                  No customers waiting right now.
                  <div style={{ marginTop: 12 }}>
                    <Btn variant="primary" onClick={() => setShowWalkInModal(true)}>+ Add walk-in manually</Btn>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {waitingTokens.map(token => {
                    const isLargeParty = token.pax > LARGE_PARTY_THRESHOLD;
                    const avail    = isLargeParty ? [] : availableTablesFor(token.pax);
                    const combo    = isLargeParty ? pickTableCombo(availableTablesForCombo(), token.pax) : null;
                    const tableLines = combo?.length
                      ? combo.map(t => `Table ${t[0]} (${t[2]}/${t[1]} seats)`).join(' + ')
                      : null;
                    const isAssign = assigningToken === token.id;
                    const isPromote = processingId === token.id;
                    const age      = tokenAgeStyle(token.arrived_at);
                    const waitMins = tokenWaitMinutes(token.arrived_at);
                    return (
                      <div key={token.id} style={{ ...CARD, display: "flex", alignItems: "flex-start", gap: 16, border: `0.5px solid ${age.cardBorder}` }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: age.avatarBg, color: age.avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 500, flexShrink: 0 }}>
                          {String(token.id).replace('T-', '')}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{token.id}</span>
                            <Pill label="Waiting" variant="amber" />
                            {waitMins >= 20 && (
                              <Pill
                                label={waitMins >= 90 ? `${waitMins}m — urgent` : `${waitMins}m waiting`}
                                variant={waitMins >= 90 ? 'red' : waitMins >= 45 ? 'amber' : 'gray'}
                              />
                            )}
                          </div>
                          <p style={{ fontSize: 12, color: C.textSub, margin: "0 0 8px" }}>
                            {token.name} · {token.pax} {token.pax === 1 ? 'person' : 'people'} · Arrived {safeFormat(token.arrived_at, 'HH:mm')}
                          </p>
                          {token.phone && <p style={{ fontSize: 11, color: C.textMuted, margin: "0 0 8px" }}>+{token.phone}</p>}
                          {token.estimate_display && token.status === 'waiting' && !isLargeParty && (
                            <div style={{ marginBottom: 8 }}>
                              <span style={{
                                display: 'inline-block',
                                background: '#FFF4E0',
                                color: '#BA7517',
                                fontSize: 11,
                                fontWeight: 500,
                                padding: '4px 10px',
                                borderRadius: 6,
                                border: '0.5px solid #E8D4A8',
                              }}>
                                ~{token.estimate_display}
                              </span>
                              <p style={{ fontSize: 10, color: C.textMuted, margin: '4px 0 0' }}>est. at arrival</p>
                            </div>
                          )}
                          {isLargeParty && (
                            <div style={{ background: C.accentLight, border: `0.5px solid ${C.accentBorder}`, borderRadius: 7, padding: "6px 10px", fontSize: 11, color: C.accentDark, marginBottom: 10 }}>
                              <strong>Large party — </strong>
                              {tableLines ? <>proposed split: {tableLines}</> : 'not enough free tables for this party size'}
                            </div>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {isLargeParty ? (
                              <Btn
                                variant="success"
                                onClick={() => promoteLargeParty(token)}
                                disabled={isPromote || !combo}
                              >
                                {isPromote ? <><Spinner size={12} /> Moving…</> : '→ Send for large party approval'}
                              </Btn>
                            ) : (
                              <>
                            <select value={assignTableSel[token.id] || ''} onChange={e => setAssignTableSel(prev => ({ ...prev, [token.id]: e.target.value }))}
                              disabled={avail.length === 0}
                              style={{ fontSize: 12, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", background: C.cardBg, color: C.text, outline: "none" }}>
                              <option value="">{avail.length === 0 ? 'No tables available' : '— assign table —'}</option>
                              {avail.map(t => <option key={t.id} value={t.id}>Table {t.table_number} ({tableCapacity(t.capacity)} seats){t.section ? ` · ${t.section}` : ''}</option>)}
                            </select>
                            <Btn onClick={() => assignTable(token)} disabled={!assignTableSel[token.id] || isAssign} variant="success">
                              {isAssign ? <><Spinner size={12} /> Assigning…</> : '✓ Assign + notify'}
                            </Btn>
                              </>
                            )}
                            <button onClick={() => dismissToken(token.id)} style={{ fontSize: 14, color: C.textMuted, background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }} title="Dismiss">✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {waitingTokens.length > 0 && (
                <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', fontSize: 10, color: C.textMuted }}>
                  <span>Wait time:</span>
                  <span style={{ color: C.warningDark }}>● 20+ min</span>
                  <span style={{ color: '#B45309' }}>● 45+ min</span>
                  <span style={{ color: C.dangerDark }}>● 90+ min — urgent</span>
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
                <SectionLabel>Takeaway &amp; delivery — {takeawayTokens.length}</SectionLabel>
                {liveTakeawayTokens.length > 0 && (
                  <>
                    <p style={{ fontSize: 11, color: C.textMuted, margin: '0 0 8px' }}>Live takeaway</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10, marginBottom: 14 }}>
                      {liveTakeawayTokens.map(token => (
                        <div key={token.id} style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 38, height: 38, borderRadius: "50%", background: C.primaryLight, color: C.primaryDark, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 500, fontSize: 12 }}>{String(token.id).replace('T-', '')}</div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 500 }}>{token.id}</span>
                                <Pill label="Live takeaway" variant="blue" />
                              </div>
                              <p style={{ fontSize: 11, color: C.textMuted, margin: "1px 0 0" }}>{token.name} · {safeFormat(token.arrived_at, 'HH:mm')}</p>
                            </div>
                          </div>
                          <Btn variant="ghost" onClick={() => dismissToken(token.id)} style={{ fontSize: 11, padding: "5px 10px" }}>Done</Btn>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {liveDeliveryTokens.length > 0 && (
                  <>
                    <p style={{ fontSize: 11, color: C.textMuted, margin: '0 0 8px' }}>Live delivery</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10, marginBottom: 14 }}>
                      {liveDeliveryTokens.map(token => (
                        <div key={token.id} style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{token.id}</span>
                              <Pill label="Live delivery" variant="amber" />
                            </div>
                            <p style={{ fontSize: 11, color: C.textMuted, margin: "4px 0 0" }}>{token.name} · {(token.meta?.delivery_address || '—').slice(0, 80)}</p>
                          </div>
                          <Btn variant="ghost" onClick={() => dismissToken(token.id)} style={{ fontSize: 11, padding: "5px 10px" }}>Done</Btn>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <SectionLabel>Approval history</SectionLabel>
                <Btn variant="ghost" onClick={() => setShowApprovalHistory(v => !v)} style={{ fontSize: 11 }}>
                  {showApprovalHistory ? 'Hide history' : 'Show history'}
                </Btn>
              </div>
              {showApprovalHistory && (
                <div style={{ ...CARD, marginBottom: 0 }}>
                  <DateRangeApply
                    draftFrom={approvalDraftFrom}
                    draftTo={approvalDraftTo}
                    onDraftFromChange={setApprovalDraftFrom}
                    onDraftToChange={setApprovalDraftTo}
                    onApply={applyApprovalHistory}
                    onToday={setApprovalToday}
                    loading={approvalLoading}
                  />
                  <div style={{ marginBottom: 12 }} />
                  {approvalAppliedFrom == null ? (
                    <p style={{ fontSize: 12, color: C.textMuted }}>Choose a date range and click Apply.</p>
                  ) : approvalLoading ? (
                    <p style={{ fontSize: 12, color: C.textMuted }}>Loading…</p>
                  ) : approvalHistory.length === 0 ? (
                    <p style={{ fontSize: 12, color: C.textMuted }}>No approval decisions in this period.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                      {approvalHistory.map(row => (
                        <div key={`${row.token_id}-${row.decided_at}`} style={{ borderTop: `0.5px solid ${C.border}`, paddingTop: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{row.token_id}</span>
                            <Pill label={approvalTypeLabel(row.type)} variant="purple" />
                            <Pill label={row.decision} variant={row.decision === 'approved' ? 'teal' : 'red'} />
                            <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 'auto' }}>{safeFormat(row.decided_at, 'HH:mm')} · {row.decided_at?.slice(0, 10)}</span>
                          </div>
                          <p style={{ fontSize: 11, color: C.textSub, margin: '4px 0 0' }}>{row.name}{row.pax ? ` · ${row.pax} pax` : ''}</p>
                          {row.scheduled_at_label && <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0' }}>Slot: {row.scheduled_at_label}</p>}
                          {row.order_preview && <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0' }}>{row.order_preview}</p>}
                          {row.rejection_reason && <p style={{ fontSize: 11, color: C.dangerDark, margin: '2px 0 0' }}>Reason: {row.rejection_reason}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: SCHEDULED
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'scheduled' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h2 style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: 500, color: C.text, margin: 0 }}>Scheduled orders</h2>
                <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0' }}>Pre-booked takeaway and delivery — approvals, prep slots, and future dates.</p>
              </div>
              <Link to="/dashboard/kitchen" style={{ fontSize: 12, color: C.primaryDark, textDecoration: 'none' }}>Open kitchen display →</Link>
            </div>

            {pendingScheduledApprTokens.length > 0 && (
              <div>
                <SectionLabel>Pending approval — {pendingScheduledApprTokens.length}</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pendingScheduledApprTokens.map(token => {
                    const combo = token.meta?.combo ?? [];
                    const isProc = processingId === token.id;
                    const isScheduledDelivery = token.type === 'scheduled_delivery';
                    const isScheduledTakeaway = token.type === 'scheduled_takeaway';
                    const schedLabel = token.meta?.scheduled_at_label || token.meta?.scheduled_at || '—';
                    const kitchenLabel = token.meta?.kitchen_start_at_label || token.meta?.kitchen_start_at || '—';
                    const orderPreview = (token.meta?.order_text || '').slice(0, 160);
                    const totalLabel = token.meta?.total != null ? `₹${Number(token.meta.total).toFixed(0)}` : null;
                    return (
                      <div key={token.id} style={{ ...CARD, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.accentLight, color: C.accentDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, flexShrink: 0 }}>
                          {String(token.id).replace('T-', '')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{token.id}</span>
                            <Pill label={isScheduledTakeaway ? 'Scheduled take-away' : isScheduledDelivery ? 'Scheduled delivery' : 'Scheduled'} variant="purple" />
                          </div>
                          <p style={{ fontSize: 12, color: C.textSub, margin: '0 0 2px' }}>
                            {token.name} · Arrived {safeFormat(token.arrived_at, 'HH:mm')}
                          </p>
                          {token.phone && <p style={{ fontSize: 11, color: C.textMuted, margin: '0 0 8px' }}>+{token.phone}</p>}
                          <div style={{ background: C.accentLight, border: `0.5px solid ${C.accentBorder}`, borderRadius: 7, padding: '8px 10px', fontSize: 11, color: C.accentDark, marginBottom: 10 }}>
                            {isScheduledTakeaway ? (
                              <>
                                <div><strong>Pickup:</strong> {schedLabel}</div>
                                <div><strong>Kitchen start:</strong> {kitchenLabel}</div>
                              </>
                            ) : (
                              <>
                                <div><strong>Deliver by:</strong> {schedLabel}</div>
                                <div><strong>Address:</strong> {(token.meta?.delivery_address || '—').slice(0, 100)}</div>
                              </>
                            )}
                            {totalLabel && <div><strong>Total:</strong> {totalLabel}</div>}
                            {orderPreview && <div style={{ marginTop: 6 }}><strong>Order:</strong> {orderPreview}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
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

            {(scheduledTakeawayTokens.length + scheduledDeliveryTokens.length) > 0 && (
              <div>
                <SectionLabel>Approved — awaiting kitchen slot — {scheduledTakeawayTokens.length + scheduledDeliveryTokens.length}</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
                  {[...scheduledTakeawayTokens, ...scheduledDeliveryTokens].map(token => {
                    const isDelivery = tokenFulfillmentKind(token) === 'scheduled_delivery';
                    return (
                      <div key={token.id} style={{ ...CARD, border: `0.5px solid ${C.accentBorder}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{token.id}</span>
                          <Pill label={isDelivery ? 'Scheduled delivery' : 'Scheduled take-away'} variant="purple" />
                        </div>
                        <p style={{ fontSize: 11, color: C.textSub, margin: 0 }}>{token.name}</p>
                        <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>
                          {isDelivery ? 'Deliver' : 'Pickup'}: {token.meta?.scheduled_at_label || '—'}
                        </p>
                        {token.meta?.kitchen_start_at_label && (
                          <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0' }}>Kitchen: {token.meta.kitchen_start_at_label}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {scheduledTodayPrep.length > 0 && (
              <div>
                <SectionLabel>Today&apos;s prep — {scheduledTodayPrep.length}</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {scheduledTodayPrep.map(order => {
                    const isDelivery = (order.service_type || '').includes('delivery');
                    return (
                      <div key={`today-${order.booking_id}`} style={{ ...CARD, border: `0.5px solid ${C.accentBorder}` }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Pill label={isDelivery ? 'Scheduled delivery' : 'Scheduled take-away'} variant="purple" />
                          <span style={{ fontWeight: 500 }}>{order.token_number}</span>
                          {order.bucket === 'present' && <Pill label="In kitchen window" variant="amber" />}
                          {order.bucket === 'todays_future' && <Pill label="Scheduled bookings" variant="blue" />}
                        </div>
                        <p style={{ fontSize: 12, color: C.textSub, margin: '4px 0 0' }}>{order.customer_name}</p>
                        <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0' }}>
                          {isDelivery ? 'Deliver' : 'Pickup'} {safeFormat(order.scheduled_slot_at, 'HH:mm')} · Kitchen {safeFormat(order.kitchen_start_at, 'HH:mm')}
                        </p>
                        {order.order_text && <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>{order.order_text.slice(0, 140)}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {scheduledFutureBookings.length > 0 && (
              <div>
                <SectionLabel>Later dates — {scheduledFutureBookings.length}</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {scheduledFutureBookings.map(order => {
                    const isDelivery = (order.service_type || '').includes('delivery');
                    return (
                      <div key={`future-${order.booking_id}`} style={{ ...CARD }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <Pill label={isDelivery ? 'Scheduled delivery' : 'Scheduled take-away'} variant="purple" />
                          <span style={{ fontWeight: 500 }}>{order.token_number}</span>
                        </div>
                        <p style={{ fontSize: 12, color: C.textSub, margin: '4px 0 0' }}>{order.customer_name}</p>
                        <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0' }}>
                          {order.scheduled_slot_at ? safeFormat(order.scheduled_slot_at, 'EEE d MMM · HH:mm') : '—'}
                        </p>
                        {order.order_text && <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>{order.order_text.slice(0, 120)}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {scheduledTabCount === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '40px 20px', color: C.textMuted, fontSize: 13 }}>
                No scheduled orders right now.
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: 500, color: C.text, margin: 0 }}>Tables</h2>
              <div style={{ display: 'flex', gap: 3, background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: 3 }}>
                {[
                  { key: 'floor', label: 'Live floor' },
                  { key: 'configure', label: 'Configure tables' },
                ].map(({ key, label }) => (
                  <button key={key} onClick={() => setTablesSubView(key)} style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', border: 'none',
                    background: tablesSubView === key ? C.primaryLight : 'transparent',
                    color: tablesSubView === key ? C.primaryDark : C.textMuted,
                    fontWeight: tablesSubView === key ? 500 : 400,
                  }}>{label}</button>
                ))}
              </div>
            </div>

            {tablesSubView === 'floor' && (
              <>
            <p style={{ fontSize: 11, color: C.textMuted, margin: '0 0 16px' }}>
              Reserve, clean, assign, and free tables. Switch to <strong>Configure tables</strong> to add, edit, or remove tables.
            </p>

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
                    <div style={{
                      fontSize: 10, color: s.text, fontWeight: 500,
                      background: `${s.text}14`, padding: "2px 8px", borderRadius: 8,
                    }}>
                      {formatSeatLabel(table.capacity)}
                    </div>
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
              </>
            )}

            {tablesSubView === 'configure' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: C.text, margin: 0 }}>
                      {tables.length} table{tables.length !== 1 ? 's' : ''} configured
                    </p>
                    <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>
                      Add or edit table numbers, seat capacity, and section. Occupied tables cannot be deleted.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn variant="secondary" onClick={bulkAddTables} disabled={tableCrudSaving === 'bulk'}>
                      {tableCrudSaving === 'bulk' ? 'Adding…' : '+ Bulk add'}
                    </Btn>
                    <Btn onClick={() => { setTableAdding(true); setTableEditingId(null); }}>+ Add table</Btn>
                  </div>
                </div>

                {tableAdding && (
                  <div style={{ ...CARD, marginBottom: 12, background: C.primaryLight, border: `0.5px solid ${C.primaryBorder}` }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.primaryDark, marginBottom: 12 }}>New table</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 12 }}>
                      <label style={{ fontSize: 11, color: C.textMuted }}>
                        Table number *
                        <input type="number" min="1" value={tableNewRow.table_number} onChange={(e) => setTableNewRow(p => ({ ...p, table_number: e.target.value }))}
                          style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 12 }} />
                      </label>
                      <label style={{ fontSize: 11, color: C.textMuted }}>
                        Capacity (seats)
                        <input type="number" min="1" value={tableNewRow.capacity} onChange={(e) => setTableNewRow(p => ({ ...p, capacity: e.target.value }))}
                          style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 12 }} />
                      </label>
                      <label style={{ fontSize: 11, color: C.textMuted }}>
                        Section
                        <select value={tableNewRow.section} onChange={(e) => setTableNewRow(p => ({ ...p, section: e.target.value }))}
                          style={{ display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 12 }}>
                          <option value="">— none —</option>
                          {TABLE_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn onClick={addTableCrud} disabled={tableCrudSaving === 'new'}>{tableCrudSaving === 'new' ? 'Saving…' : 'Save table'}</Btn>
                      <Btn variant="ghost" onClick={() => setTableAdding(false)}>Cancel</Btn>
                    </div>
                  </div>
                )}

                {tables.length === 0 && !tableAdding ? (
                  <div style={{ ...CARD, textAlign: 'center', padding: '40px 24px', color: C.textMuted }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🪑</div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: C.text }}>No tables configured yet</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>Add tables one by one or use Bulk add.</p>
                  </div>
                ) : (
                  <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: C.cardBg }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: C.surfaceBg }}>
                          {['Table', 'Capacity', 'Section', 'Live status', ''].map(h => (
                            <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...tables].sort((a, b) => (a.table_number || 0) - (b.table_number || 0)).map((t, i) => {
                          const isEditing = tableEditingId === t.id;
                          const liveStatus = getTableStatus(t).status;
                          const isOccupied = liveStatus === 'occupied' || t.status === 'occupied';
                          return (
                            <tr key={t.id} style={{ borderTop: i > 0 ? `0.5px solid ${C.border}` : 'none', background: isEditing ? C.primaryLight : 'transparent' }}>
                              <td style={{ padding: '10px 12px' }}>
                                {isEditing ? (
                                  <input type="number" value={tableEditBuf.table_number} onChange={(e) => setTableEditBuf(p => ({ ...p, table_number: e.target.value }))}
                                    style={{ width: 72, padding: '6px 8px', borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 12 }} />
                                ) : (
                                  <span style={{ fontWeight: 500 }}>Table {t.table_number}</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', color: C.textSub }}>
                                {isEditing ? (
                                  <input type="number" value={tableEditBuf.capacity} onChange={(e) => setTableEditBuf(p => ({ ...p, capacity: e.target.value }))}
                                    style={{ width: 72, padding: '6px 8px', borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 12 }} />
                                ) : `${t.capacity ?? 4} seats`}
                              </td>
                              <td style={{ padding: '10px 12px', color: C.textSub }}>
                                {isEditing ? (
                                  <select value={tableEditBuf.section} onChange={(e) => setTableEditBuf(p => ({ ...p, section: e.target.value }))}
                                    style={{ padding: '6px 8px', borderRadius: 6, border: `0.5px solid ${C.border}`, fontSize: 12 }}>
                                    <option value="">— none —</option>
                                    {TABLE_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                ) : (t.section || '—')}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <Pill label={TABLE_STATUS[liveStatus]?.label || liveStatus} variant={liveStatus === 'available' ? 'teal' : liveStatus === 'occupied' ? 'blue' : 'amber'} />
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                    <Btn onClick={() => saveTableEdit(t.id)} disabled={tableCrudSaving === t.id}>{tableCrudSaving === t.id ? 'Saving…' : 'Save'}</Btn>
                                    <Btn variant="ghost" onClick={cancelTableEdit}>Cancel</Btn>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                    <Btn variant="ghost" onClick={() => startTableEdit(t)} style={{ fontSize: 11 }}>Edit</Btn>
                                    <Btn variant="danger" onClick={() => deleteTableCrud(t)} disabled={isOccupied || tableDeleting === t.id} style={{ fontSize: 11 }}>
                                      {tableDeleting === t.id ? '…' : isOccupied ? 'In use' : 'Delete'}
                                    </Btn>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: ORDERS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: 500, color: C.text, margin: 0 }}>Active orders</h2>
              <Link to="/dashboard/kitchen" style={{ fontSize: 12, color: C.primaryDark, textDecoration: 'none' }}>Open kitchen display →</Link>
            </div>
            <AlertBanner type="info">
              Dine-in table orders and live takeaway/delivery tokens appear here. Scheduled pre-bookings are on the <strong>Scheduled</strong> tab.
            </AlertBanner>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {FULFILLMENT_FILTERS.map(f => (
                <button key={f.key} onClick={() => setOrdersFilter(f.key)} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  border: `0.5px solid ${ordersFilter === f.key ? C.primary : C.border}`,
                  background: ordersFilter === f.key ? C.primaryLight : C.cardBg,
                  color: ordersFilter === f.key ? C.primaryDark : C.textMuted,
                }}>{f.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {(ordersFilter === 'all' || ordersFilter === 'dine_in') && activeDineInOrders.map(order => {
                const table = tables.find(t => t.id === order.table_id);
                return (
                  <div key={order.id} style={{ ...CARD }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <Pill label="Dine-in" variant="teal" />
                      <span style={{ fontSize: 14, fontWeight: 500 }}>Order #{order.order_number?.slice(-4)}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 16, alignItems: "start" }}>
                      <div>
                        <div style={{ fontSize: 12, color: C.textSub }}>Table {table?.table_number || 'N/A'}{table?.section ? ` · ${table.section}` : ''}</div>
                        {order.customer_name && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{order.customer_name}</div>}
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{safeFormat(order.created_at, 'HH:mm:ss')}</div>
                      </div>
                      <div>
                        {order.order_items?.map((item, idx) => (
                          <div key={idx} style={{ fontSize: 12, color: C.textSub, marginBottom: 3 }}>
                            {item.quantity}× {item.menu_item?.name}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 500, color: C.primary }}>₹{order.total_amount?.toFixed(2)}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2, textTransform: "capitalize" }}>{order.status}</div>
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

              {(ordersFilter === 'all' || ordersFilter === 'live_takeaway') && liveTakeawayTokens.map(token => (
                <div key={`lt-${token.id}`} style={{ ...CARD, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Pill label="Live takeaway" variant="blue" /><span style={{ fontWeight: 500 }}>{token.id}</span>
                    </div>
                    <p style={{ fontSize: 12, color: C.textSub, margin: '4px 0 0' }}>{token.name} · {safeFormat(token.arrived_at, 'HH:mm')}</p>
                    {token.meta?.order_text && <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>{token.meta.order_text.slice(0, 120)}</p>}
                  </div>
                  <Btn variant="ghost" onClick={() => dismissToken(token.id)} style={{ fontSize: 11 }}>Done</Btn>
                </div>
              ))}

              {(ordersFilter === 'all' || ordersFilter === 'live_delivery') && liveDeliveryTokens.map(token => (
                <div key={`ld-${token.id}`} style={{ ...CARD }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Pill label="Live delivery" variant="amber" /><span style={{ fontWeight: 500 }}>{token.id}</span>
                  </div>
                  <p style={{ fontSize: 12, color: C.textSub, margin: '4px 0 0' }}>{token.name}</p>
                  <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0' }}>{(token.meta?.delivery_address || '—').slice(0, 120)}</p>
                  {token.meta?.order_text && <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>{token.meta.order_text.slice(0, 120)}</p>}
                  <div style={{ marginTop: 8 }}><Btn variant="ghost" onClick={() => dismissToken(token.id)} style={{ fontSize: 11 }}>Done</Btn></div>
                </div>
              ))}

              {ordersFilter === 'all' && activeKdsItems.length > 0 && (
                <div>
                  <SectionLabel>In kitchen now — {activeKdsItems.length} item{activeKdsItems.length !== 1 ? 's' : ''}</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 10 }}>
                    {activeKdsItems.slice(0, 12).map(item => (
                      <div key={item.id} style={{ ...CARD, padding: '12px 14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{item.order_item?.menu_item?.name || item.item_name || 'Item'}</div>
                        <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>
                          ×{item.order_item?.quantity || 1} · {item.token_number || item.service_type || 'KDS'} · {item.status}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {((ordersFilter === 'all' && activeDineInOrders.length + liveTakeawayTokens.length + liveDeliveryTokens.length === 0 && activeKdsItems.length === 0)
                || (ordersFilter === 'dine_in' && activeDineInOrders.length === 0)
                || (ordersFilter === 'live_takeaway' && liveTakeawayTokens.length === 0)
                || (ordersFilter === 'live_delivery' && liveDeliveryTokens.length === 0)
              ) && (
                <div style={{ ...CARD, textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>
                  No active orders for this filter.
                  {takeawayTokens.length > 0 && ordersFilter === 'dine_in' && (
                    <p style={{ fontSize: 12, marginTop: 8 }}>You have {takeawayTokens.length} takeaway/delivery token{takeawayTokens.length !== 1 ? 's' : ''} — switch filter to All or Takeaway.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            TAB: REPORTS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'reports' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: 500, color: C.text, margin: 0 }}>Sales reports</h2>
              <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0' }}>
                Completed dine-in POS orders plus paid WhatsApp prepay bookings for the selected date range (IST).
              </p>
            </div>
            <div style={{ ...CARD }}>
              <DateRangeApply
                draftFrom={salesDraftFrom}
                draftTo={salesDraftTo}
                onDraftFromChange={setSalesDraftFrom}
                onDraftToChange={setSalesDraftTo}
                onApply={applySalesReport}
                onToday={setSalesToday}
                loading={salesLoading}
              />
              <div style={{ marginBottom: 16 }} />
              {salesAppliedFrom == null ? (
                <p style={{ fontSize: 12, color: C.textMuted }}>Choose a date range and click Apply.</p>
              ) : salesLoading ? (
                <p style={{ fontSize: 12, color: C.textMuted }}>Loading sales data…</p>
              ) : !salesReport ? (
                <p style={{ fontSize: 12, color: C.textMuted }}>No sales data for {formatDateDMY(salesAppliedFrom)}{salesAppliedFrom !== salesAppliedTo ? ` – ${formatDateDMY(salesAppliedTo)}` : ''}.</p>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
                    {[
                      { label: 'Total revenue', value: formatINR(salesReport.totalRevenue) },
                      { label: 'Orders', value: salesReport.totalOrders },
                      { label: 'Avg order value', value: formatINR(salesReport.avgOrderValue) },
                      { label: 'Dine-in (POS)', value: formatINR(salesReport.dineInRevenue) },
                      { label: 'WhatsApp prepay', value: formatINR(salesReport.prepayRevenue) },
                    ].map(s => (
                      <div key={s.label} style={{ background: C.surfaceBg, borderRadius: 8, padding: '12px 14px', border: `0.5px solid ${C.border}` }}>
                        <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 500, color: C.text }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {salesReport.serviceBreakdown && (
                    <div style={{ marginBottom: 20 }}>
                      <SectionLabel>By channel</SectionLabel>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
                        {Object.entries(salesReport.serviceBreakdown).filter(([, v]) => v.orders > 0).map(([key, v]) => (
                          <div key={key} style={{ ...CARD, padding: '12px 14px' }}>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{SERVICE_LABELS[key] || key}</div>
                            <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>{v.orders} order{v.orders !== 1 ? 's' : ''} · {formatINR(v.revenue)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(salesReport.daily || []).length > 1 && (
                    <div style={{ marginBottom: 20 }}>
                      <SectionLabel>Daily breakdown</SectionLabel>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: `0.5px solid ${C.border}` }}>
                              <th style={{ textAlign: 'left', padding: '8px 10px', color: C.textMuted, fontWeight: 500 }}>Date</th>
                              <th style={{ textAlign: 'right', padding: '8px 10px', color: C.textMuted, fontWeight: 500 }}>Orders</th>
                              <th style={{ textAlign: 'right', padding: '8px 10px', color: C.textMuted, fontWeight: 500 }}>Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {salesReport.daily.map(row => (
                              <tr key={row.date} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                                <td style={{ padding: '8px 10px' }}>{row.date}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{row.orders}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatINR(row.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <p style={{ fontSize: 11, color: C.textMuted, margin: 0 }}>
                    {salesReport.completedTableOrders ?? 0} completed POS orders · {salesReport.paidPrepayBookings ?? 0} paid prepay bookings
                    {salesReport.from === salesReport.to ? ` · ${salesReport.from}` : ` · ${salesReport.from} to ${salesReport.to}`}
                  </p>
                </>
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
                <h2 style={{ fontFamily: FONTS.heading, fontSize: 16, fontWeight: 500, color: C.text, margin: 0 }}>Menu management</h2>

                <p style={{ fontSize: 12, color: C.textMuted, margin: "4px 0 0" }}>
                  Pull from Meta to upsert WhatsApp catalog items, toggle stock, or upload Excel to <strong>fully replace</strong> the menu. See the <strong>Column guide</strong> sheet for scheduling columns.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={syncMetaCatalog}
                  disabled={metaSyncing}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.primaryBorder}`, background: C.primaryLight, color: C.primaryDark, cursor: metaSyncing ? 'wait' : 'pointer' }}>
                  {metaSyncing ? <Spinner size={14} /> : '↻'} Pull from Meta
                </button>
                <button
                  onClick={async () => { setDownloadingTpl(true); await downloadCatalogTemplate(apiClient, showToast, menuItems); setDownloadingTpl(false); }}
                  disabled={downloadingTpl}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 8, border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.textSub, cursor: "pointer" }}>
                  {downloadingTpl ? <Spinner size={14} /> : '↓'} Download template
                </button>
              </div>
            </div>

            <div style={{ ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 12, color: C.textSub }}>
                <strong>Meta catalog:</strong>{' '}
                {metaLastSync ? `Last sync ${new Date(metaLastSync).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'Not synced yet'}
              </div>
              <span style={{ fontSize: 11, color: C.textMuted }}>Excel upload replaces all items · Meta pull updates by product ID</span>
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
                        {["ID","Name","Category","Price","Description","Image URL"].map((h, i) => (
                          <th key={h} style={{ textAlign: i >= 3 ? "right" : "left", padding: "10px 14px", fontSize: 11, fontWeight: 500, color: C.textMuted, width: ["6%","18%","14%","8%","26%","28%"][i] }}>{h}</th>
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
                            <td style={{ padding: "8px 14px" }}><span style={{ fontSize: 10, background: C.surfaceBg, color: C.textSub, padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>{row.category || '—'}</span></td>
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
                <div style={{ fontSize: 15, fontWeight: 500, color: C.successDark, marginBottom: 4 }}>Catalog replaced successfully</div>
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
                  Current menu{' '}
                  <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400 }}>
                    ({filteredMenuItems.length}{filteredMenuItems.length !== menuItems.length ? ` of ${menuItems.length}` : ''} items)
                  </span>
                </div>
                <span style={{ fontSize: 11, color: C.textMuted }}>Toggle to mark in/out of stock instantly</span>
              </div>

              {menuItems.length > 0 && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    type="search"
                    value={menuSearch}
                    onChange={e => setMenuSearch(e.target.value)}
                    placeholder="Search menu items…"
                    style={{
                      flex: '1 1 220px', minWidth: 180, fontSize: 12, padding: '8px 12px',
                      borderRadius: 8, border: `0.5px solid ${C.border}`, outline: 'none',
                    }}
                  />
                  <select
                    value={menuCategory}
                    onChange={e => setMenuCategory(e.target.value)}
                    style={{
                      fontSize: 12, padding: '8px 12px', borderRadius: 8,
                      border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.text,
                    }}
                  >
                    <option value="all">All categories</option>
                    {menuCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}

              {menuItems.length === 0 ? (
                <div style={{ ...CARD, textAlign: "center", padding: "40px 20px", color: C.textMuted, fontSize: 13 }}>No menu items yet. Upload the catalog Excel to get started.</div>
              ) : filteredMenuItems.length === 0 ? (
                <div style={{ ...CARD, textAlign: "center", padding: "32px 20px", color: C.textMuted, fontSize: 13 }}>
                  No items match your search. Try a different term or category.
                </div>
              ) : (
                <div style={{ ...CARD, padding: 0, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `0.5px solid ${C.border}`, background: C.surfaceBg }}>
                        {(showMenuSlotColumn
                          ? ["Name", "Category", "Slot", "Price", "Image", "In stock", "Special today"]
                          : ["Name", "Category", "Price", "Image", "In stock", "Special today"]
                        ).map((h, i) => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: i >= (showMenuSlotColumn ? 3 : 2) ? "right" : "left", fontSize: 11, fontWeight: 500, color: C.textMuted }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupedMenuCategories.map(cat => (
                        <React.Fragment key={cat}>
                          <tr style={{ background: C.surfaceBg }}>
                            <td
                              colSpan={showMenuSlotColumn ? 7 : 6}
                              style={{ padding: "8px 14px", fontSize: 11, fontWeight: 600, color: C.textSub, letterSpacing: '0.04em', textTransform: 'uppercase' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                                <span>{cat} ({groupedMenuItems[cat].length})</span>
                                {cat !== 'Uncategorized' && (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 10, color: C.textMuted, textTransform: 'none', letterSpacing: 0 }}>Category slots:</span>
                                  {WEB_SLOT_OPTIONS.map(slot => {
                                    const current = normalizeWebSlots(categorySlots[cat] || ['anytime']);
                                    const active = current.includes(slot);
                                    return (
                                      <button
                                        key={`${cat}-${slot}`}
                                        onClick={() => {
                                          const next = active ? current.filter(s => s !== slot) : [...current, slot];
                                          saveCategorySlots(cat, next);
                                        }}
                                        style={{
                                          fontSize: 10,
                                          padding: '3px 8px',
                                          borderRadius: 999,
                                          border: `0.5px solid ${active ? C.primary : C.border}`,
                                          background: active ? C.primaryLight : C.cardBg,
                                          color: active ? C.primaryDark : C.textSub,
                                          textTransform: 'none',
                                          letterSpacing: 0,
                                          cursor: 'pointer',
                                        }}
                                      >
                                        {WEB_SLOT_LABEL[slot] || slot}
                                      </button>
                                    );
                                  })}
                                </div>
                                )}
                              </div>
                            </td>
                          </tr>
                          {groupedMenuItems[cat].map(item => {
                        const inStock  = item.is_stocked ?? item.is_available;
                        const isToggle = togglingId === item.id;
                        const isSpecialToggle = togglingSpecialId === item.id;
                        const isSpecial = !!item.is_special_today;
                        const slotLabel = formatMenuSlot(item.time_slot);
                        return (
                          <tr key={item.id} style={{ borderBottom: `0.5px solid ${C.border}`, opacity: inStock ? 1 : 0.55 }}>
                            <td style={{ padding: "10px 14px" }}>
                              <span style={{ fontWeight: 500, color: C.text }}>{item.name}</span>
                              {!inStock && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: C.danger, background: C.dangerLight, padding: "1px 6px", borderRadius: 20 }}>Out of stock</span>}
                              {isSpecial && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: '#b45309', background: '#fef3c7', padding: "1px 6px", borderRadius: 20 }}>⭐ Special</span>}
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <span style={{ fontSize: 10, background: C.primaryLight, color: C.primaryDark, padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>
                                {displayMenuCategory(item.category)}
                              </span>
                            </td>
                            {showMenuSlotColumn && (
                              <td style={{ padding: "10px 14px" }}>
                                {slotLabel
                                  ? <span style={{ fontSize: 10, background: C.surfaceBg, color: C.textSub, padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>{slotLabel}</span>
                                  : <span style={{ color: C.textMuted }}>—</span>}
                              </td>
                            )}
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
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>
                              <button onClick={() => toggleSpecialToday(item)} disabled={isSpecialToggle}
                                title={isSpecial ? "Remove from today's specials" : "Mark as today's special"}
                                style={{
                                  position: "relative", display: "inline-flex", width: 36, height: 20, borderRadius: 10,
                                  background: isSpecialToggle ? C.borderStrong : isSpecial ? '#f59e0b' : C.border,
                                  border: "none", cursor: "pointer", padding: 0, flexShrink: 0, transition: "background .2s",
                                }}>
                                {isSpecialToggle
                                  ? <Spinner size={12} />
                                  : <span style={{ position: "absolute", top: 3, left: isSpecial ? 19 : 3, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />}
                              </button>
                            </td>
                          </tr>
                        );
                          })}
                        </React.Fragment>
                      ))}
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
