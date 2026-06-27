// ============================================================================
// MUNAFE SUPPLY — CATALOG MANAGEMENT
// src/pages/supply/SupplyCatalog.jsx
//
// Route: /supply/catalog   (supplier-auth protected)
//
// Features:
//  - List all catalog items grouped by category
//  - Add / edit item (inline slide-out form)
//  - Bulk availability toggle (morning stock-check workflow)
//  - Soft delete
//  - GST defaults auto-populated by category
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { C, CARD, SECTION_LABEL, PILL_VARIANTS } from '../../styles/theme';
import { resolveApiBase } from '../../config/api';

const API = resolveApiBase();

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Vegetables', 'Fruits', 'Dairy', 'Eggs & Poultry',
  'Meat & Seafood', 'Dry Goods', 'Oils & Fats', 'Spices', 'Packaging', 'Other',
];

const GST_DEFAULTS = {
  'Vegetables': 0, 'Fruits': 0, 'Dairy': 0, 'Eggs & Poultry': 0,
  'Meat & Seafood': 0, 'Dry Goods': 0,
  'Oils & Fats': 5, 'Spices': 5, 'Other': 5,
  'Packaging': 18,
};

const GST_OPTIONS = [0, 5, 12, 18];

const UNITS = ['kg', 'g', 'litre', 'ml', 'dozen', 'piece', 'bunch', 'bag', 'crate', 'sack'];

const BLANK_FORM = {
  name: '', category: 'Vegetables', unit: 'kg',
  default_price: '', hsn_code: '', gst_rate: 0,
  min_order_qty: '', display_order: '', is_available: true,
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function supplyToken() { return localStorage.getItem('supply_token') || ''; }

function Pill({ label, color = 'gray' }) {
  const v = PILL_VARIANTS[color] || PILL_VARIANTS.gray;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600,
      color: v.color, background: v.bg, border: `1px solid ${v.border}`,
    }}>{label}</span>
  );
}

function Spinner({ size = 18 }) {
  return (
    <div style={{
      width: size, height: size, border: `2px solid ${C.primaryLight}`,
      borderTop: `2px solid ${C.primary}`, borderRadius: '50%',
      animation: 'spin 0.7s linear infinite', display: 'inline-block',
    }} />
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SupplyCatalog({ onLogout }) {
  const [items,        setItems]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [toast,        setToast]        = useState(null);   // { msg, type }

  // Panel / selection state
  const [panelOpen,    setPanelOpen]    = useState(false);
  const [editItem,     setEditItem]     = useState(null);   // null = new item
  const [form,         setForm]         = useState(BLANK_FORM);
  const [bulkMode,     setBulkMode]     = useState(false);
  const [bulkSelected, setBulkSelected] = useState({});    // id → boolean
  const [bulkSaving,   setBulkSaving]   = useState(false);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/supply/catalog`, {
        headers: { Authorization: `Bearer ${supplyToken()}` },
      });
      if (res.status === 401) { onLogout?.(); return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load catalog');
      setItems(json.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // ── Toast helper ─────────────────────────────────────────────────────────────

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Panel open/close ─────────────────────────────────────────────────────────

  function openNew() {
    setEditItem(null);
    setForm(BLANK_FORM);
    setPanelOpen(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setForm({
      name:          item.name,
      category:      item.category,
      unit:          item.unit,
      default_price: item.default_price,
      hsn_code:      item.hsn_code || '',
      gst_rate:      item.gst_rate,
      min_order_qty: item.min_order_qty || '',
      display_order: item.display_order || '',
      is_available:  item.is_available,
    });
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditItem(null);
    setForm(BLANK_FORM);
  }

  // ── Form field changes ────────────────────────────────────────────────────────

  function handleField(key, value) {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Auto-populate GST when category changes
      if (key === 'category') next.gst_rate = GST_DEFAULTS[value] ?? 0;
      return next;
    });
  }

  // ── Save (add or edit) ────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) { showToast('Name is required', 'error'); return; }
    if (!form.default_price || isNaN(Number(form.default_price))) {
      showToast('Default price must be a number', 'error'); return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        default_price: Number(form.default_price),
        gst_rate:      Number(form.gst_rate),
        min_order_qty: form.min_order_qty !== '' ? Number(form.min_order_qty) : 0,
        display_order: form.display_order !== '' ? Number(form.display_order) : 0,
      };

      const url    = editItem ? `${API}/api/supply/catalog/${editItem.id}` : `${API}/api/supply/catalog`;
      const method = editItem ? 'PUT' : 'POST';

      const res  = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supplyToken()}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');

      showToast(editItem ? 'Item updated' : 'Item added');
      closePanel();
      fetchItems();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Quick availability toggle (single item) ───────────────────────────────────

  async function toggleAvailability(item) {
    try {
      const res = await fetch(`${API}/api/supply/catalog/bulk-availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supplyToken()}` },
        body: JSON.stringify({ items: [{ id: item.id, is_available: !item.is_available }] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ── Soft delete ───────────────────────────────────────────────────────────────

  async function handleDelete(item) {
    if (!window.confirm(`Remove "${item.name}" from catalog?`)) return;
    try {
      const res = await fetch(`${API}/api/supply/catalog/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${supplyToken()}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast('Item removed');
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // ── Bulk availability ─────────────────────────────────────────────────────────

  function toggleBulkSelect(id) {
    setBulkSelected(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function selectAll(avail) {
    const next = {};
    items.forEach(i => { next[i.id] = true; });
    setBulkSelected(next);
  }

  async function saveBulk(is_available) {
    const ids = Object.entries(bulkSelected).filter(([, v]) => v).map(([id]) => id);
    if (!ids.length) { showToast('Select at least one item', 'error'); return; }
    setBulkSaving(true);
    try {
      const res = await fetch(`${API}/api/supply/catalog/bulk-availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supplyToken()}` },
        body: JSON.stringify({ items: ids.map(id => ({ id, is_available })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(`Marked ${ids.length} item(s) ${is_available ? 'available' : 'unavailable'}`);
      setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, is_available } : i));
      setBulkSelected({});
      setBulkMode(false);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBulkSaving(false);
    }
  }

  // ── Group items by category ───────────────────────────────────────────────────

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat);
    if (catItems.length) acc[cat] = catItems;
    return acc;
  }, {});

  const bulkCount = Object.values(bulkSelected).filter(Boolean).length;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, padding: '0 0 60px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{
        background: C.cardBg, borderBottom: `1px solid ${C.border}`,
        padding: '16px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Catalog</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
            {items.length} item{items.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setBulkMode(m => !m); setBulkSelected({}); }}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: bulkMode ? C.warningLight : C.surfaceBg,
              border: `1px solid ${bulkMode ? C.warningBorder : C.border}`,
              color: bulkMode ? C.warningDark : C.textSub,
            }}
          >
            {bulkMode ? 'Cancel' : 'Bulk Edit'}
          </button>
          <button
            onClick={openNew}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: C.primary, border: 'none', color: '#fff',
            }}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkMode && (
        <div style={{
          background: C.primaryLight, borderBottom: `1px solid ${C.primaryBorder}`,
          padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 13, color: C.primaryDark, fontWeight: 600 }}>
            {bulkCount} selected
          </span>
          <button onClick={() => selectAll(true)} style={linkBtn}>Select all</button>
          <button onClick={() => setBulkSelected({})} style={linkBtn}>Clear</button>
          <div style={{ flex: 1 }} />
          {bulkSaving ? <Spinner /> : (
            <>
              <button
                onClick={() => saveBulk(true)}
                style={{ ...actionBtn, background: C.success, color: '#fff' }}
              >
                ✓ Mark Available
              </button>
              <button
                onClick={() => saveBulk(false)}
                style={{ ...actionBtn, background: C.danger, color: '#fff' }}
              >
                ✗ Mark Unavailable
              </button>
            </>
          )}
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px' }}>

        {error && (
          <div style={{
            padding: '12px 16px', background: C.dangerLight, border: `1px solid ${C.dangerBorder}`,
            borderRadius: 8, color: C.dangerDark, fontSize: 13, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spinner size={32} /></div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.textMuted }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No catalog items yet</div>
            <div style={{ fontSize: 13 }}>Add your first item to get started</div>
            <button onClick={openNew} style={{ ...actionBtn, background: C.primary, color: '#fff', marginTop: 20 }}>
              + Add First Item
            </button>
          </div>
        ) : (
          Object.entries(grouped).map(([category, catItems]) => (
            <div key={category} style={{ marginBottom: 28 }}>
              <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>
                {category} · {catItems.length}
              </div>
              <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
                {catItems.map((item, idx) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    isLast={idx === catItems.length - 1}
                    bulkMode={bulkMode}
                    checked={!!bulkSelected[item.id]}
                    onCheck={() => toggleBulkSelect(item.id)}
                    onEdit={() => openEdit(item)}
                    onDelete={() => handleDelete(item)}
                    onToggleAvail={() => toggleAvailability(item)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Slide-out form panel */}
      {panelOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          {/* Backdrop */}
          <div
            onClick={closePanel}
            style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }}
          />
          {/* Panel */}
          <div style={{
            width: 420, background: C.cardBg, height: '100%',
            overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                {editItem ? 'Edit Item' : 'Add Item'}
              </div>
              <button onClick={closePanel} style={{ ...iconBtn, fontSize: 18 }}>✕</button>
            </div>

            <FormField label="Item Name *">
              <input
                style={inputStyle}
                value={form.name}
                onChange={e => handleField('name', e.target.value)}
                placeholder="e.g. Tomatoes"
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Category *">
                <select style={inputStyle} value={form.category}
                  onChange={e => handleField('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </FormField>
              <FormField label="Unit *">
                <select style={inputStyle} value={form.unit}
                  onChange={e => handleField('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Default Price (₹) *">
                <input
                  style={inputStyle} type="number" min="0" step="0.01"
                  value={form.default_price}
                  onChange={e => handleField('default_price', e.target.value)}
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="GST Rate">
                <select style={inputStyle} value={form.gst_rate}
                  onChange={e => handleField('gst_rate', Number(e.target.value))}>
                  {GST_OPTIONS.map(r => <option key={r} value={r}>{r}%</option>)}
                </select>
              </FormField>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Min Order Qty">
                <input
                  style={inputStyle} type="number" min="0" step="0.001"
                  value={form.min_order_qty}
                  onChange={e => handleField('min_order_qty', e.target.value)}
                  placeholder="0"
                />
              </FormField>
              <FormField label="Display Order">
                <input
                  style={inputStyle} type="number" min="0"
                  value={form.display_order}
                  onChange={e => handleField('display_order', e.target.value)}
                  placeholder="0"
                />
              </FormField>
            </div>

            <FormField label="HSN Code">
              <input
                style={inputStyle}
                value={form.hsn_code}
                onChange={e => handleField('hsn_code', e.target.value)}
                placeholder="Optional"
              />
            </FormField>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_available}
                onChange={e => handleField('is_available', e.target.checked)}
              />
              <span style={{ fontSize: 13, color: C.text }}>Available today</span>
            </label>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  background: C.primary, color: '#fff',
                  border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  opacity: saving ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {saving && <Spinner size={14} />}
                {editItem ? 'Save Changes' : 'Add Item'}
              </button>
              <button onClick={closePanel} style={{ ...actionBtn, background: C.surfaceBg, color: C.textSub, border: `1px solid ${C.border}` }}>
                Cancel
              </button>
            </div>

            {editItem && (
              <button
                onClick={() => { handleDelete(editItem); closePanel(); }}
                style={{ ...actionBtn, background: C.dangerLight, color: C.dangerDark, border: `1px solid ${C.dangerBorder}`, width: '100%' }}
              >
                Remove from Catalog
              </button>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          background: toast.type === 'error' ? C.danger : C.success,
          color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── ItemRow ───────────────────────────────────────────────────────────────────

function ItemRow({ item, isLast, bulkMode, checked, onCheck, onEdit, onDelete, onToggleAvail }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
      background: checked ? C.primaryLight : C.cardBg,
      transition: 'background 0.15s',
    }}>
      {bulkMode && (
        <input type="checkbox" checked={checked} onChange={onCheck}
          style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
      )}

      {/* Availability dot */}
      <div
        onClick={!bulkMode ? onToggleAvail : undefined}
        title={item.is_available ? 'Available — click to mark unavailable' : 'Unavailable — click to mark available'}
        style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
          background: item.is_available ? C.success : C.dangerBorder,
          border: `2px solid ${item.is_available ? C.successBorder : C.dangerBorder}`,
        }}
      />

      {/* Item info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
          {item.unit}
          {item.min_order_qty > 0 ? ` · Min ${item.min_order_qty}` : ''}
          {item.hsn_code ? ` · HSN ${item.hsn_code}` : ''}
        </div>
      </div>

      {/* GST pill */}
      {item.gst_rate > 0 && (
        <Pill label={`GST ${item.gst_rate}%`} color="amber" />
      )}

      {/* Price */}
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, minWidth: 70, textAlign: 'right' }}>
        ₹{Number(item.default_price).toFixed(2)}
      </div>

      {/* Actions */}
      {!bulkMode && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onEdit} style={iconBtn} title="Edit">✏️</button>
          <button onClick={onDelete} style={{ ...iconBtn, color: C.danger }} title="Remove">🗑</button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FormField({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSub, marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Shared micro-styles ───────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
  border: `1px solid ${C.border}`, background: C.cardBg, color: C.text,
  outline: 'none', boxSizing: 'border-box',
};

const actionBtn = {
  padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', border: 'none',
};

const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  padding: '4px 6px', borderRadius: 6, fontSize: 14, color: C.textSub,
};

const linkBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 12, color: C.primaryDark, fontWeight: 600, padding: 0,
};
