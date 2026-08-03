// ============================================================================
// Shared add/edit slide-out for food_products catalog items.
// Excel remains for bulk upload; images are URL fields only.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { C, FONTS } from '../theme/brand';
import {
  formatBundleComponents,
  getSchemaForLob,
  parseBundleComponents,
} from '../config/catalogSchemas';

const BLANK = {
  name: '',
  description: '',
  price: '',
  category: '',
  retailer_id: '',
  image_url: '',
  image_url_2: '',
  image_url_3: '',
  image_url_4: '',
  image_url_5: '',
  item_type: 'PRODUCT',
  variant_group_id: '',
  pack_size_label: '',
  weight_grams: '',
  is_available: true,
  availability_status: '',
  launch_at: '',
  deposit_amount: '',
  shelf_life_days: '',
  made_on_date: '',
  ingredients: '',
  allergens: '',
  bundle_components_text: '',
  low_stock_alert_units: '5',
  current_stock: '',
};

function itemToForm(item) {
  if (!item) return { ...BLANK };
  const components = item.bundle_components
    || item.meta?.bundle_components
    || null;
  return {
    name: item.name || '',
    description: item.description || '',
    price: item.price != null ? String(item.price) : '',
    category: item.category || '',
    retailer_id: item.retailer_id || '',
    image_url: item.image_url || '',
    image_url_2: item.image_url_2 || '',
    image_url_3: item.image_url_3 || '',
    image_url_4: item.image_url_4 || '',
    image_url_5: item.image_url_5 || '',
    item_type: String(item.item_type || 'PRODUCT').toUpperCase() === 'BUNDLE' ? 'BUNDLE' : 'PRODUCT',
    variant_group_id: item.variant_group_id || '',
    pack_size_label: item.pack_size_label || item.size_label || '',
    weight_grams: item.weight_grams != null ? String(item.weight_grams) : '',
    is_available: !!(item.is_available ?? item.is_stocked),
    availability_status: item.availability_status || '',
    launch_at: item.launch_at ? String(item.launch_at).slice(0, 10) : '',
    deposit_amount: item.deposit_amount != null ? String(item.deposit_amount) : '',
    shelf_life_days: item.shelf_life_days != null ? String(item.shelf_life_days) : '',
    made_on_date: item.made_on_date ? String(item.made_on_date).slice(0, 10) : '',
    ingredients: item.ingredients || '',
    allergens: item.allergens || '',
    bundle_components_text: formatBundleComponents(components),
    low_stock_alert_units: item.low_stock_alert_units != null ? String(item.low_stock_alert_units) : '5',
    current_stock: '',
  };
}

function FormField({ label, hint, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.textSub }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>{hint}</span> : null}
    </label>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      marginTop: 8,
      paddingTop: 12,
      borderTop: `0.5px solid ${C.border}`,
    }}>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  borderRadius: 8,
  fontSize: 13,
  border: `0.5px solid ${C.border}`,
  background: C.cardBg,
  color: C.text,
  outline: 'none',
  fontFamily: FONTS.body,
};

function UrlPreview({ url }) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return (
    <img
      src={url}
      alt=""
      style={{
        width: 44, height: 44, borderRadius: 6, objectFit: 'cover',
        border: `0.5px solid ${C.border}`, marginTop: 6,
      }}
      onError={(e) => { e.target.style.display = 'none'; }}
    />
  );
}

/**
 * @param {{
 *   open: boolean,
 *   mode: 'create'|'edit',
 *   item?: object|null,
 *   lobType?: string,
 *   onClose: () => void,
 *   onSaved: (item: object) => void,
 *   apiClient: object,
 *   showToast: (msg: string, type?: string) => void,
 * }} props
 */
export default function CatalogItemEditor({
  open,
  mode = 'create',
  item = null,
  lobType = 'food_products',
  onClose,
  onSaved,
  apiClient,
  showToast,
}) {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(mode === 'edit' ? itemToForm(item) : { ...BLANK });
  }, [open, mode, item]);

  if (!open) return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const buildPayload = () => {
    const components = parseBundleComponents(form.bundle_components_text);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price: parseFloat(String(form.price).replace(/[^\d.]/g, '')) || 0,
      category: form.category.trim() || 'General',
      retailer_id: form.retailer_id.trim() || undefined,
      image_url: form.image_url.trim() || null,
      image_url_2: form.image_url_2.trim() || null,
      image_url_3: form.image_url_3.trim() || null,
      image_url_4: form.image_url_4.trim() || null,
      image_url_5: form.image_url_5.trim() || null,
      item_type: form.item_type,
      variant_group_id: form.variant_group_id.trim() || null,
      pack_size_label: form.pack_size_label.trim() || null,
      weight_grams: form.weight_grams !== '' ? parseInt(form.weight_grams, 10) || null : null,
      is_available: !!form.is_available,
      availability_status: form.availability_status || null,
      launch_at: form.launch_at || null,
      deposit_amount: form.deposit_amount !== ''
        ? parseFloat(String(form.deposit_amount).replace(/[^\d.]/g, '')) || null
        : null,
      shelf_life_days: form.shelf_life_days !== ''
        ? parseInt(form.shelf_life_days, 10) || null
        : null,
      made_on_date: form.made_on_date || null,
      ingredients: form.ingredients.trim() || null,
      allergens: form.allergens.trim() || null,
      bundle_components: components,
      low_stock_alert_units: form.low_stock_alert_units !== ''
        ? parseInt(form.low_stock_alert_units, 10)
        : null,
    };
    if (mode === 'create' && form.current_stock !== '') {
      payload.current_stock = Math.max(0, parseInt(form.current_stock, 10) || 0);
    }
    return payload;
  };

  const validate = (payload) => {
    const schema = getSchemaForLob(lobType || 'food_products');
    const draft = {
      ...payload,
      id: payload.retailer_id,
      name: payload.name,
      price: payload.price,
    };
    const rawErrors = schema.validateRow ? schema.validateRow(draft, 1) : [];
    return (rawErrors || []).map((msg) => String(msg).replace(/^Row\s+\d+\s*(\([^)]*\))?:\s*/i, '').trim());
  };

  const handleSave = async () => {
    setError('');
    const payload = buildPayload();
    const errors = validate(payload);
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    try {
      const res = mode === 'edit'
        ? await apiClient.put(`/api/menu-items/${item.id}`, payload)
        : await apiClient.post('/api/menu-items', payload);
      const saved = res.data?.item;
      const warnings = res.data?.warnings;
      if (warnings?.length) showToast(warnings[0], 'warning');
      else showToast(mode === 'edit' ? 'Item updated' : 'Item added');
      onSaved?.(saved || payload);
      onClose?.();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Save failed';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.35)' }} />
      <div style={{
        width: 'min(480px, 100vw)',
        background: C.cardBg,
        height: '100%',
        overflowY: 'auto',
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        fontFamily: FONTS.body,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontFamily: FONTS.heading, fontSize: 18, fontWeight: 600, color: C.text }}>
            {mode === 'edit' ? 'Edit item' : 'Add item'}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', fontSize: 18,
              color: C.textMuted, cursor: 'pointer', lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {error ? (
          <div style={{
            fontSize: 12, color: C.dangerDark, background: C.dangerLight,
            border: `0.5px solid ${C.dangerBorder}`, borderRadius: 8, padding: '8px 10px',
          }}>
            {error}
          </div>
        ) : null}

        <SectionTitle>Basics</SectionTitle>
        <FormField label="Title *">
          <input style={inputStyle} value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. Mango Pickle" />
        </FormField>
        <FormField label="Description">
          <textarea
            style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Short product description"
          />
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Price (₹) *">
            <input style={inputStyle} type="number" min={1} step="0.01" value={form.price} onChange={(e) => setField('price', e.target.value)} />
          </FormField>
          <FormField label="Category">
            <input style={inputStyle} value={form.category} onChange={(e) => setField('category', e.target.value)} placeholder="Pickles" />
          </FormField>
        </div>
        <FormField label="SKU" hint="Leave blank on create to auto-generate from title + pack size.">
          <input
            style={inputStyle}
            value={form.retailer_id}
            onChange={(e) => setField('retailer_id', e.target.value)}
            placeholder="MP-250"
            disabled={mode === 'edit'}
          />
        </FormField>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
          <input
            type="checkbox"
            checked={form.is_available}
            onChange={(e) => setField('is_available', e.target.checked)}
          />
          Available for sale
        </label>

        <SectionTitle>Pack / variant</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Item type">
            <select style={inputStyle} value={form.item_type} onChange={(e) => setField('item_type', e.target.value)}>
              <option value="PRODUCT">PRODUCT</option>
              <option value="BUNDLE">BUNDLE</option>
            </select>
          </FormField>
          <FormField label="Pack size">
            <input style={inputStyle} value={form.pack_size_label} onChange={(e) => setField('pack_size_label', e.target.value)} placeholder="250g" />
          </FormField>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Variant group ID" hint="Same ID across pack sizes (e.g. MANGO-PICKLE)">
            <input style={inputStyle} value={form.variant_group_id} onChange={(e) => setField('variant_group_id', e.target.value)} />
          </FormField>
          <FormField label="Weight (grams)">
            <input style={inputStyle} type="number" min={0} value={form.weight_grams} onChange={(e) => setField('weight_grams', e.target.value)} />
          </FormField>
        </div>

        {form.item_type === 'BUNDLE' && (
          <FormField label="Bundle components *" hint="Format: SKU:qty,SKU:qty — e.g. MP-100:3,GARLIC-100:3">
            <input
              style={inputStyle}
              value={form.bundle_components_text}
              onChange={(e) => setField('bundle_components_text', e.target.value)}
              placeholder="MP-100:3"
            />
          </FormField>
        )}

        <SectionTitle>Images (URLs)</SectionTitle>
        {[
          ['image_url', 'Primary image URL'],
          ['image_url_2', 'Gallery image 2'],
          ['image_url_3', 'Gallery image 3'],
          ['image_url_4', 'Gallery image 4'],
          ['image_url_5', 'Gallery image 5'],
        ].map(([key, label]) => (
          <FormField key={key} label={label}>
            <input
              style={inputStyle}
              value={form[key]}
              onChange={(e) => setField(key, e.target.value)}
              placeholder="https://…"
            />
            <UrlPreview url={form[key]} />
          </FormField>
        ))}

        <SectionTitle>Trust</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Shelf life (days)">
            <input style={inputStyle} type="number" min={0} value={form.shelf_life_days} onChange={(e) => setField('shelf_life_days', e.target.value)} />
          </FormField>
          <FormField label="Made on">
            <input style={inputStyle} type="date" value={form.made_on_date} onChange={(e) => setField('made_on_date', e.target.value)} />
          </FormField>
        </div>
        <FormField label="Ingredients">
          <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={form.ingredients} onChange={(e) => setField('ingredients', e.target.value)} />
        </FormField>
        <FormField label="Allergens">
          <input style={inputStyle} value={form.allergens} onChange={(e) => setField('allergens', e.target.value)} />
        </FormField>

        <SectionTitle>Availability</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label="Status">
            <select style={inputStyle} value={form.availability_status} onChange={(e) => setField('availability_status', e.target.value)}>
              <option value="">(default)</option>
              <option value="in_stock">in_stock</option>
              <option value="sold_out">sold_out</option>
              <option value="coming_soon">coming_soon</option>
              <option value="preorder">preorder</option>
            </select>
          </FormField>
          <FormField label="Launch date">
            <input style={inputStyle} type="date" value={form.launch_at} onChange={(e) => setField('launch_at', e.target.value)} />
          </FormField>
        </div>
        <FormField label="Preorder deposit (₹)">
          <input style={inputStyle} type="number" min={0} value={form.deposit_amount} onChange={(e) => setField('deposit_amount', e.target.value)} />
        </FormField>

        <SectionTitle>Alerts</SectionTitle>
        <FormField label="Low stock alert units" hint="Alert when remaining units are at or below this (default 5).">
          <input style={inputStyle} type="number" min={0} value={form.low_stock_alert_units} onChange={(e) => setField('low_stock_alert_units', e.target.value)} />
        </FormField>

        {mode === 'create' && (
          <>
            <SectionTitle>Initial stock</SectionTitle>
            <FormField label="Current stock (optional)" hint="Leave blank if you’ll use Record batch later. Edits never overwrite stock.">
              <input style={inputStyle} type="number" min={0} value={form.current_stock} onChange={(e) => setField('current_stock', e.target.value)} />
            </FormField>
          </>
        )}

        {mode === 'edit' && item?.current_stock != null && (
          <div style={{ fontSize: 12, color: C.textMuted }}>
            Current stock: <strong style={{ color: C.text }}>{item.current_stock}</strong>
            {' '}— change via Record batch, not this form.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingBottom: 24 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1, padding: '11px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.textSub, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1.4, padding: '11px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: 'none', background: C.primary, color: '#fff', cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : (mode === 'edit' ? 'Save changes' : 'Add item')}
          </button>
        </div>
      </div>
    </div>
  );
}
