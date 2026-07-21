// ============================================================================
// AUTOM8 FRONTEND - MENU MANAGEMENT PAGE
// Emerald + gold theme · Excel upload · time-limited discounts
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import BrandHeader from '../components/BrandHeader';
import { C, FONTS } from '../theme/brand';
import { getSchemaForLob } from '../config/catalogSchemas';
import { MENU_SLOT_OPTIONS, normalizeMenuSlots, toggleMenuSlot } from '../helpers/menuSlots';

const SLOT_OPTIONS = MENU_SLOT_OPTIONS;
const normalizeSlots = normalizeMenuSlots;

const CARD = {
  background: C.cardBg,
  border: `0.5px solid ${C.border}`,
  borderRadius: 12,
  padding: 16,
};

const IMAGE_SOURCE_EXAMPLES = [
  ['How to add dish images'],
  [''],
  ['Paste a direct image URL in the image_link column.'],
  ['• Unsplash — https://images.unsplash.com/photo-...?w=800'],
  ['• Pexels   — https://images.pexels.com/photos/.../photo.jpeg?w=800'],
  [''],
  ['Tips:'],
  ['• Use a direct image URL (ends in .jpg / .png / .webp, or has ?w=)'],
  ['• Leave image_link blank if you have no photo yet'],
];

function Spinner({ size = 20 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: `2px solid ${C.border}`, borderTopColor: C.primary,
      borderRadius: '50%', animation: 'spin .7s linear infinite',
    }} />
  );
}

function Toast({ msg, type = 'success' }) {
  if (!msg) return null;
  const bg = type === 'error' ? C.dangerLight : type === 'warning' ? C.warningLight : C.successLight;
  const border = type === 'error' ? C.dangerBorder : type === 'warning' ? C.warningBorder : C.successBorder;
  const color = type === 'error' ? C.dangerDark : type === 'warning' ? C.warningDark : C.successDark;
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 100, background: bg, border: `0.5px solid ${border}`, color,
      padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500,
      boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxWidth: '90vw',
    }}>
      {msg}
    </div>
  );
}

function daysLeft(endsAt) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function isDiscountActive(item) {
  const pct = Number(item.discount_percent);
  if (!(pct > 0 && pct <= 100) || !item.discount_ends_at) return false;
  return new Date(item.discount_ends_at).getTime() > Date.now();
}

function effectivePrice(item) {
  const base = Number(item.price || 0);
  if (!isDiscountActive(item)) return base;
  return Math.max(0, Math.round(base * (1 - Number(item.discount_percent) / 100)));
}

export default function MenuPage() {
  const { apiClient, user } = useAuth();
  const isOwner = user?.role === 'owner' || user?.role === 'brand_owner';
  const canEdit = isOwner || user?.role === 'manager';
  const backPath = user?.role === 'manager' ? '/dashboard/manager' : '/dashboard/owner';
  const backLabel = user?.role === 'manager' ? '← Back to manager portal' : '← Back to dashboard';

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categorySlots, setCategorySlots] = useState({});
  const [lobType, setLobType] = useState('restaurant');
  const [businessName, setBusinessName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [toast, setToast] = useState({ msg: '', type: 'success' });
  const toastTimer = useRef(null);

  // Upload
  const fileInputRef = useRef(null);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadRows, setUploadRows] = useState([]);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [uploadResult, setUploadResult] = useState(null);
  const [downloadingTpl, setDownloadingTpl] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Discount draft per item: { [id]: { percent, days } }
  const [discountDraft, setDiscountDraft] = useState({});
  const [discountSaving, setDiscountSaving] = useState(null);

  const schema = useMemo(() => getSchemaForLob(lobType), [lobType]);

  const showToast = useCallback((msg, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast({ msg: '', type: 'success' }), 3500);
  }, []);

  const fetchMenu = useCallback(async () => {
    try {
      const params = new URLSearchParams({ ignore_slot: 'true' });
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      const response = await apiClient.get(`/api/menu-items?${params.toString()}`);
      const menuItems = response.data.items || [];
      setItems(menuItems);
      const uniqueCategories = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
      setCategories(uniqueCategories);
    } catch (err) {
      console.error('Failed to fetch menu:', err);
      showToast('Failed to load menu', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiClient, selectedCategory, showToast]);

  const fetchCategorySlots = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/catalog/menu-categories/slots');
      const map = {};
      for (const row of response.data.categories || []) {
        map[row.name] = normalizeSlots(row.applicable_slots);
      }
      setCategorySlots(map);
    } catch (err) {
      console.error('Failed to fetch category slots:', err);
    }
  }, [apiClient]);

  const fetchBusinessMeta = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/dashboard/waba');
      const rest = r.data?.restaurant || {};
      setLobType(rest.lob_type || 'restaurant');
      setBusinessName(rest.display_name || rest.name || '');
      setLogoUrl(rest.logo_url || '');
    } catch (_e) { /* ignore */ }
  }, [apiClient]);

  useEffect(() => {
    fetchMenu();
    fetchCategorySlots();
    fetchBusinessMeta();
  }, [fetchMenu, fetchCategorySlots, fetchBusinessMeta]);

  const toggleAvailability = async (itemId, currentStatus) => {
    try {
      await apiClient.put(`/api/menu-items/${itemId}/availability`, {
        is_available: !currentStatus,
      });
      setItems(prev =>
        prev.map(item =>
          item.id === itemId ? { ...item, is_available: !currentStatus } : item
        )
      );
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to toggle availability', 'error');
    }
  };

  const toggleTodaySpecial = async (item) => {
    try {
      const isNext = !Boolean(item.is_todays_special || item.is_special_today);
      let specialNote = item.special_note || '';
      if (isNext) {
        const raw = window.prompt('Optional special note:', specialNote);
        if (raw == null) return;
        specialNote = raw;
      }
      await apiClient.put(`/api/menu-items/${item.id}/special-today`, {
        is_todays_special: isNext,
        special_note: (specialNote || '').trim() || null,
      });
      setItems(prev => prev.map(row =>
        row.id === item.id
          ? { ...row, is_todays_special: isNext, is_special_today: isNext, special_note: (specialNote || '').trim() || null }
          : row
      ));
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update special', 'error');
    }
  };

  const saveCategorySlots = async (category, slots) => {
    try {
      const applicable_slots = normalizeSlots(slots);
      await apiClient.put(`/api/catalog/menu-categories/${encodeURIComponent(category)}/slots`, {
        applicable_slots,
      });
      setCategorySlots(prev => ({ ...prev, [category]: applicable_slots }));
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save slots', 'error');
    }
  };

  const saveItemSlotsOverride = async (item) => {
    const current = normalizeSlots(item.applicable_slots || categorySlots[item.category] || ['anytime']);
    const input = window.prompt(
      'Override slots for this item (tiffin,lunch,dinner and/or anytime). Leave blank to clear.',
      item.applicable_slots ? current.join(',') : ''
    );
    if (input == null) return;
    const trimmed = input.trim();
    const payload = trimmed
      ? normalizeSlots(trimmed.split(',').map(s => s.trim()))
      : null;
    try {
      await apiClient.put(`/api/catalog/menu-items/${item.id}/slots`, {
        applicable_slots: payload,
      });
      setItems(prev => prev.map(row =>
        row.id === item.id ? { ...row, applicable_slots: payload } : row
      ));
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save slot override', 'error');
    }
  };

  const setDraft = (itemId, field, value) => {
    setDiscountDraft(prev => ({
      ...prev,
      [itemId]: {
        percent: prev[itemId]?.percent ?? '',
        days: prev[itemId]?.days ?? '',
        [field]: value,
      },
    }));
  };

  const ensureDraft = (item) => {
    if (discountDraft[item.id]) return discountDraft[item.id];
    const active = isDiscountActive(item);
    return {
      percent: active ? String(Math.round(Number(item.discount_percent))) : '',
      days: active ? String(daysLeft(item.discount_ends_at) || '') : '',
    };
  };

  const saveDiscount = async (item, { clear = false } = {}) => {
    const draft = ensureDraft(item);
    setDiscountSaving(item.id);
    try {
      let body;
      if (clear) {
        body = { clear: true };
      } else {
        const pct = Math.round(Number(draft.percent));
        const days = Math.floor(Number(draft.days));
        if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
          showToast('Enter a discount % between 1 and 100', 'error');
          return;
        }
        if (!Number.isFinite(days) || days < 1 || days > 365) {
          showToast('Enter duration in days (1–365)', 'error');
          return;
        }
        body = { discount_percent: pct, duration_days: days };
      }
      const res = await apiClient.put(`/api/menu-items/${item.id}/discount`, body);
      const d = res.data || {};
      setItems(prev => prev.map(row =>
        row.id === item.id
          ? {
              ...row,
              discount_percent: d.discount_percent,
              discount_ends_at: d.discount_ends_at,
            }
          : row
      ));
      setDiscountDraft(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      showToast(clear
        ? 'Discount cleared'
        : `${d.discount_percent}% off for next ${body.duration_days} days`);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save discount', 'error');
    } finally {
      setDiscountSaving(null);
    }
  };

  // ── Excel upload ──────────────────────────────────────────────────────────
  const parseExcelFile = (file) => {
    setUploadStatus('parsing');
    setUploadErrors([]);
    setUploadRows([]);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'array' });
        const sheetName = workbook.SheetNames.includes('WhatsApp Catalog')
          ? 'WhatsApp Catalog'
          : workbook.SheetNames[0];
        const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        if (rawRows.length === 0) {
          setUploadErrors(['The selected sheet appears to be empty.']);
          setUploadStatus('idle');
          return;
        }
        const mapped = rawRows.map(schema.mapRow);
        const nonEmpty = mapped.filter(r => r.id || r.name);
        setUploadRows(nonEmpty);
        setUploadErrors(nonEmpty.flatMap((r, i) => schema.validateRow(r, i + 1)));
        setUploadStatus('preview');
      } catch (err) {
        setUploadErrors([`Could not read the file: ${err.message}`]);
        setUploadStatus('idle');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    const ok = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
    if (!ok) {
      setUploadErrors(['Please upload an Excel file (.xlsx, .xls) or CSV.']);
      return;
    }
    setUploadFile(file);
    parseExcelFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setUploadDragOver(false);
    handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleConfirmUpload = async () => {
    if (uploadErrors.length > 0) {
      showToast('Fix the errors before uploading', 'error');
      return;
    }
    setUploadStatus('uploading');
    try {
      const res = await apiClient.post('/api/menu/upload', { items: uploadRows });
      setUploadResult(res.data);
      setUploadStatus('done');
      await fetchMenu();
      const purged = res.data.purged ? ` · ${res.data.purged} old items removed` : '';
      const warnings = (res.data.warnings || []).join(' ');
      showToast(
        warnings
          ? `Uploaded ${res.data.upserted} items${purged}. ${warnings}`
          : `Catalog replaced — ${res.data.upserted} items saved${purged}`,
        warnings ? 'warning' : 'success',
      );
    } catch (err) {
      setUploadErrors([`Upload failed: ${err.response?.data?.error || err.message}`]);
      setUploadStatus('preview');
    }
  };

  const handleResetUpload = () => {
    setUploadFile(null);
    setUploadRows([]);
    setUploadErrors([]);
    setUploadStatus('idle');
    setUploadResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = async () => {
    setDownloadingTpl(true);
    try {
      const catalogSheet = XLSX.utils.aoa_to_sheet([
        schema.templateHeaders,
        ...schema.templateExamples,
      ]);
      catalogSheet['!cols'] = schema.templateColWidths;
      const helpSheet = XLSX.utils.aoa_to_sheet([
        ...IMAGE_SOURCE_EXAMPLES,
        [''],
        ...(schema.columnHelp || []),
      ]);
      helpSheet['!cols'] = [{ wch: 72 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, catalogSheet, 'WhatsApp Catalog');
      XLSX.utils.book_append_sheet(wb, helpSheet, 'Column guide');
      XLSX.writeFile(wb, 'catalog_template.xlsx');
      showToast('Template downloaded');
    } catch (err) {
      showToast(err.message || 'Template download failed', 'error');
    } finally {
      setDownloadingTpl(false);
    }
  };

  const filteredItems = items.filter(item =>
    item.name?.toLowerCase().includes(searchTerm.toLowerCase())
    || item.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedItems = filteredItems.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const specialCount = useMemo(
    () => items.filter(i => i.is_todays_special || i.is_special_today).length,
    [items]
  );

  const restaurantLob = !lobType || lobType === 'restaurant';

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ textAlign: 'center' }}>
          <Spinner size={36} />
          <p style={{ marginTop: 14, color: C.textSub, fontSize: 14 }}>Loading menu…</p>
        </div>
      </div>
    );
  }

  const chip = (active) => ({
    padding: '7px 14px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    border: `0.5px solid ${active ? C.primary : C.border}`,
    background: active ? C.primary : C.cardBg,
    color: active ? '#fff' : C.textSub,
  });

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONTS.body }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Toast msg={toast.msg} type={toast.type} />

      <BrandHeader
        title="Menu Management"
        subtitle={businessName
          ? `${businessName} · upload catalog, toggle stock, set discounts`
          : 'Upload catalog, toggle stock, set time-limited discounts'}
        logoUrl={logoUrl}
        logoAlt={businessName ? `${businessName} logo` : 'Business logo'}
        right={
          <Link
            to={backPath}
            style={{ fontSize: 12, color: '#fff', textDecoration: 'none', fontWeight: 500 }}
          >
            {backLabel}
          </Link>
        }
      />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px 48px' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total items', value: items.length, color: C.primary },
            { label: 'Available', value: items.filter(i => i.is_available).length, color: C.success },
            { label: 'Unavailable', value: items.filter(i => !i.is_available).length, color: C.danger },
            { label: 'Categories', value: categories.length, color: C.gold },
          ].map(s => (
            <div key={s.label} style={{ ...CARD, textAlign: 'center', padding: '14px 12px' }}>
              <div style={{ fontFamily: FONTS.heading, fontSize: 28, fontWeight: 600, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Upload strip */}
        {canEdit && (
          <div style={{ ...CARD, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontFamily: FONTS.heading, fontSize: 15, fontWeight: 600, color: C.text }}>
                  Catalog upload
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>
                  Download the Excel template for your business type, fill it in, then upload to <strong>replace</strong> the full menu.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  disabled={downloadingTpl}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.textSub,
                  }}
                >
                  {downloadingTpl ? '…' : '↓ Download template'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowUpload(s => !s); if (showUpload) handleResetUpload(); }}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `0.5px solid ${C.primaryBorder}`, background: C.primaryLight, color: C.primaryDark,
                  }}
                >
                  {showUpload ? 'Hide upload' : 'Upload Excel'}
                </button>
              </div>
            </div>

            {showUpload && (
              <div style={{ marginTop: 16 }}>
                {uploadStatus === 'idle' && (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setUploadDragOver(true); }}
                    onDragLeave={() => setUploadDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `1px dashed ${uploadDragOver ? C.primary : C.border}`,
                      borderRadius: 12, padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
                      background: uploadDragOver ? C.primaryLight : C.surfaceBg,
                    }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Drop your catalog Excel here</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>.xlsx, .xls, or .csv</div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      style={{ display: 'none' }}
                      onChange={(e) => handleFileSelect(e.target.files[0])}
                    />
                  </div>
                )}

                {uploadStatus === 'parsing' && (
                  <div style={{ textAlign: 'center', padding: 32 }}>
                    <Spinner size={28} />
                    <p style={{ fontSize: 13, color: C.textSub, marginTop: 10 }}>Reading file…</p>
                  </div>
                )}

                {uploadStatus === 'preview' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 600, color: C.primaryDark,
                        background: C.primaryLight, border: `0.5px solid ${C.primaryBorder}`,
                        borderRadius: 20, padding: '4px 12px',
                      }}>
                        {uploadFile?.name} — {uploadRows.length} rows
                      </span>
                      <button type="button" onClick={handleResetUpload} style={{ fontSize: 12, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>
                        ✕ Choose different file
                      </button>
                    </div>
                    {uploadErrors.length > 0 && (
                      <div style={{
                        background: C.dangerLight, border: `0.5px solid ${C.dangerBorder}`,
                        borderRadius: 8, padding: '10px 12px', color: C.dangerDark, fontSize: 12, marginBottom: 10,
                      }}>
                        <strong>{uploadErrors.length} issue{uploadErrors.length !== 1 ? 's' : ''}</strong> — fix in Excel and re-upload
                        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                          {uploadErrors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    )}
                    <div style={{ overflowX: 'auto', border: `0.5px solid ${C.border}`, borderRadius: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: C.surfaceBg }}>
                            {(schema.previewColumns || []).map(col => (
                              <th key={col.key} style={{ textAlign: 'left', padding: '8px 10px', color: C.textMuted, fontWeight: 600 }}>{col.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {uploadRows.slice(0, 40).map((row, i) => (
                            <tr key={i} style={{ borderTop: `0.5px solid ${C.border}` }}>
                              {(schema.previewColumns || []).map(col => (
                                <td key={col.key} style={{ padding: '8px 10px', color: C.text }}>
                                  {col.image && row[col.key]
                                    ? <img src={row[col.key]} alt="" style={{ height: 28, borderRadius: 4 }} onError={(e) => { e.target.style.display = 'none'; }} />
                                    : String(row[col.key] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {uploadRows.length > 40 && (
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>Showing first 40 of {uploadRows.length} rows</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={handleConfirmUpload}
                        disabled={uploadErrors.length > 0}
                        style={{
                          fontSize: 13, fontWeight: 600, padding: '10px 16px', borderRadius: 8, cursor: uploadErrors.length ? 'not-allowed' : 'pointer',
                          border: 'none', background: uploadErrors.length ? C.border : C.primary, color: '#fff',
                        }}
                      >
                        Confirm &amp; replace menu ({uploadRows.length})
                      </button>
                      <button type="button" onClick={handleResetUpload} style={{
                        fontSize: 13, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                        border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.textSub,
                      }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {uploadStatus === 'uploading' && (
                  <div style={{ textAlign: 'center', padding: 32 }}>
                    <Spinner size={28} />
                    <p style={{ fontSize: 13, color: C.textSub, marginTop: 10 }}>Uploading…</p>
                  </div>
                )}

                {uploadStatus === 'done' && (
                  <div style={{
                    background: C.successLight, border: `0.5px solid ${C.successBorder}`,
                    borderRadius: 8, padding: '12px 14px', color: C.successDark, fontSize: 13,
                  }}>
                    Upload complete — {uploadResult?.upserted ?? 0} items saved.
                    <button type="button" onClick={handleResetUpload} style={{
                      marginLeft: 12, fontSize: 12, color: C.primary, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
                    }}>
                      Upload another
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {specialCount > 3 && (
          <div style={{
            marginBottom: 16, padding: '10px 12px', borderRadius: 8,
            border: `0.5px solid ${C.warningBorder}`, background: C.warningLight,
            color: C.warningDark, fontSize: 13,
          }}>
            Too many specials dilutes the highlight. Consider narrowing to your top picks.
          </div>
        )}

        {/* Search + categories */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search menu items…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1, minWidth: 200, padding: '10px 12px', borderRadius: 8, fontSize: 13,
              border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.text, outline: 'none',
            }}
          />
          <button type="button" onClick={() => setSelectedCategory('all')} style={chip(selectedCategory === 'all')}>All</button>
          {categories.map(cat => (
            <button key={cat} type="button" onClick={() => setSelectedCategory(cat)} style={chip(selectedCategory === cat)}>
              {cat}
            </button>
          ))}
        </div>

        {/* Items by category */}
        {Object.entries(groupedItems).map(([category, categoryItems]) => (
          <div key={category} style={{ marginBottom: 28 }}>
            <h2 style={{
              fontFamily: FONTS.heading, fontSize: 18, fontWeight: 600, color: C.text,
              margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 4, height: 20, background: C.primary, borderRadius: 2, display: 'inline-block' }} />
              {category}
              <span style={{ fontSize: 12, fontWeight: 500, color: C.textMuted }}>({categoryItems.length})</span>
            </h2>

            {canEdit && restaurantLob && (
              <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>Applicable slots:</span>
                {SLOT_OPTIONS.map(slot => {
                  const current = normalizeSlots(categorySlots[category] || ['anytime']);
                  const active = current.includes(slot);
                  return (
                    <button
                      key={`${category}-${slot}`}
                      type="button"
                      onClick={() => saveCategorySlots(category, toggleMenuSlot(current, slot))}
                      style={{
                        padding: '3px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
                        border: `0.5px solid ${active ? C.primary : C.border}`,
                        background: active ? C.primary : C.cardBg,
                        color: active ? '#fff' : C.textSub,
                      }}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {categoryItems.map(item => {
                const activeDiscount = isDiscountActive(item);
                const draft = ensureDraft(item);
                const sale = effectivePrice(item);
                const left = daysLeft(item.discount_ends_at);

                return (
                  <div
                    key={item.id}
                    style={{
                      ...CARD, padding: 0, overflow: 'hidden',
                      opacity: item.is_available ? 1 : 0.65,
                    }}
                  >
                    {item.image_url && (
                      <div style={{ height: 140, overflow: 'hidden', background: C.surfaceBg }}>
                        <img
                          src={item.image_url}
                          alt={item.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      </div>
                    )}
                    <div style={{ padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{item.name}</h3>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {activeDiscount ? (
                            <>
                              <div style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>₹{sale}</div>
                              <div style={{ fontSize: 11, color: C.textMuted, textDecoration: 'line-through' }}>₹{Number(item.price || 0).toFixed(0)}</div>
                            </>
                          ) : (
                            <div style={{ fontSize: 15, fontWeight: 700, color: C.primary }}>₹{Number(item.price || 0).toFixed(2)}</div>
                          )}
                        </div>
                      </div>

                      {item.description && (
                        <p style={{ margin: '0 0 10px', fontSize: 12, color: C.textMuted, lineHeight: 1.45,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {item.description}
                        </p>
                      )}

                      {activeDiscount && (
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: C.successDark, background: C.successLight,
                          border: `0.5px solid ${C.successBorder}`, borderRadius: 6, padding: '4px 8px', marginBottom: 10,
                        }}>
                          {Math.round(Number(item.discount_percent))}% off for the next {left} day{left === 1 ? '' : 's'}
                          {item.discount_ends_at ? ` · ends ${new Date(item.discount_ends_at).toLocaleDateString()}` : ''}
                        </div>
                      )}
                      {!activeDiscount && item.discount_ends_at && Number(item.discount_percent) > 0 && (
                        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>Discount expired</div>
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                          background: item.is_available ? C.successLight : C.dangerLight,
                          color: item.is_available ? C.successDark : C.dangerDark,
                        }}>
                          {item.is_available ? 'Available' : 'Unavailable'}
                        </span>
                        {(item.is_todays_special || item.is_special_today) && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                            background: C.goldLight, color: C.goldDark,
                          }}>
                            Special
                          </span>
                        )}
                      </div>

                      {canEdit && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                          <button
                            type="button"
                            onClick={() => toggleAvailability(item.id, item.is_available)}
                            style={{
                              fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                              border: `0.5px solid ${item.is_available ? C.dangerBorder : C.successBorder}`,
                              background: item.is_available ? C.dangerLight : C.successLight,
                              color: item.is_available ? C.dangerDark : C.successDark,
                            }}
                          >
                            {item.is_available ? 'Mark unavailable' : 'Mark available'}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleTodaySpecial(item)}
                            style={{
                              fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                              border: `0.5px solid ${(item.is_todays_special || item.is_special_today) ? C.goldBorder : C.border}`,
                              background: (item.is_todays_special || item.is_special_today) ? C.goldLight : C.surfaceBg,
                              color: (item.is_todays_special || item.is_special_today) ? C.goldDark : C.textSub,
                            }}
                          >
                            {(item.is_todays_special || item.is_special_today) ? '★ Special' : '☆ Mark special'}
                          </button>
                          {restaurantLob && (
                            <button
                              type="button"
                              onClick={() => saveItemSlotsOverride(item)}
                              style={{
                                fontSize: 11, fontWeight: 500, padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                                border: 'none', background: 'none', color: C.primary, textDecoration: 'underline',
                              }}
                            >
                              Override slots
                            </button>
                          )}
                        </div>
                      )}

                      {item.special_note && (item.is_todays_special || item.is_special_today) && (
                        <p style={{
                          fontSize: 11, margin: '0 0 10px', padding: '6px 8px', borderRadius: 6,
                          background: C.goldLight, border: `0.5px solid ${C.goldBorder}`, color: C.goldDark,
                        }}>
                          {item.special_note}
                        </p>
                      )}

                      {/* Discount controls */}
                      {canEdit && (
                        <div style={{
                          marginTop: 4, paddingTop: 10, borderTop: `0.5px solid ${C.border}`,
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Discount · X% for next Y days
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              placeholder="%"
                              value={draft.percent}
                              onChange={(e) => setDraft(item.id, 'percent', e.target.value)}
                              style={{
                                width: 64, padding: '6px 8px', borderRadius: 6, fontSize: 12,
                                border: `0.5px solid ${C.border}`, background: C.cardBg,
                              }}
                            />
                            <span style={{ fontSize: 12, color: C.textMuted }}>off for</span>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              placeholder="days"
                              value={draft.days}
                              onChange={(e) => setDraft(item.id, 'days', e.target.value)}
                              style={{
                                width: 72, padding: '6px 8px', borderRadius: 6, fontSize: 12,
                                border: `0.5px solid ${C.border}`, background: C.cardBg,
                              }}
                            />
                            <span style={{ fontSize: 12, color: C.textMuted }}>days</span>
                            <button
                              type="button"
                              disabled={discountSaving === item.id}
                              onClick={() => saveDiscount(item)}
                              style={{
                                fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                                border: 'none', background: C.primary, color: '#fff',
                              }}
                            >
                              {discountSaving === item.id ? '…' : 'Apply'}
                            </button>
                            {(activeDiscount || Number(item.discount_percent) > 0) && (
                              <button
                                type="button"
                                disabled={discountSaving === item.id}
                                onClick={() => saveDiscount(item, { clear: true })}
                                style={{
                                  fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                                  border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.textSub,
                                }}
                              >
                                Clear
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredItems.length === 0 && (
          <div style={{ ...CARD, textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
            <div style={{ fontFamily: FONTS.heading, fontSize: 18, fontWeight: 600, color: C.text }}>No menu items yet</div>
            <p style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}>
              Download the Excel template and upload your catalog to get started.
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={() => { setShowUpload(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                style={{
                  marginTop: 14, fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 8,
                  border: 'none', background: C.primary, color: '#fff', cursor: 'pointer',
                }}
              >
                Upload Excel catalog
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
