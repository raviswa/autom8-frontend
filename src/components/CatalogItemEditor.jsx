// ============================================================================
// Shared add/edit slide-out for catalog / menu items across LOBs.
// Excel remains for bulk upload; images support URL paste or direct upload.
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C, FONTS } from '../theme/brand';
import {
  formatBundleComponents,
  getSchemaForLob,
  normalizeLobType,
  parseBundleComponents,
} from '../config/catalogSchemas';
import { isPackagedLob as checkPackagedLob } from '../config/dashboardProfiles';
import { prepareCatalogImage, uploadCatalogImage } from '../helpers/catalogImageUpload';
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
  how_to_use: '',
  how_to_store: '',
  days_to_empty: '',
  allergens: '',
  bundle_components_text: '',
  low_stock_alert_units: '5',
  current_stock: '',
  // Restaurant
  time_slot: 'all',
  prep_time_fixed: '5',
  batch_size: '1',
  time_per_batch: '10',
  kitchen_station: '',
  packing_time: '1',
  holds_well: false,
  fulfillment_section: 'main',
  // Retail
  condition: '',
  original_mrp: '',
  warranty_days: '',
  colour: '',
  // PSL
  flavour_group: '',
  scoop_count: '1',
  crust_options: '',
  toppings_allowed: false,
  topping_extra_price: '',
};

const PSL_ITEM_TYPES = ['PRODUCT', 'PIZZA', 'CUP', 'CONE', 'SUNDAE', 'FLAVOUR', 'ADDON', 'BUNDLE'];
const FOOD_ITEM_TYPES = ['PRODUCT', 'BUNDLE'];

function itemToForm(item) {
  if (!item) return { ...BLANK };
  const components = item.bundle_components
    || item.meta?.bundle_components
    || null;
  const rawType = String(item.item_type || 'PRODUCT').toUpperCase();
  return {
    ...BLANK,
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
    item_type: rawType || 'PRODUCT',
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
    how_to_use: item.how_to_use || '',
    how_to_store: item.how_to_store || '',
    days_to_empty: item.days_to_empty != null ? String(item.days_to_empty) : '',
    allergens: item.allergens || '',
    bundle_components_text: formatBundleComponents(components),
    low_stock_alert_units: item.low_stock_alert_units != null ? String(item.low_stock_alert_units) : '5',
    current_stock: '',
    time_slot: item.time_slot || 'all',
    prep_time_fixed: item.prep_time_fixed != null ? String(item.prep_time_fixed) : '5',
    batch_size: item.batch_size != null ? String(item.batch_size) : '1',
    time_per_batch: item.time_per_batch != null ? String(item.time_per_batch) : '10',
    kitchen_station: item.kitchen_station || '',
    packing_time: item.packing_time != null ? String(item.packing_time) : '1',
    holds_well: !!item.holds_well,
    fulfillment_section: item.fulfillment_section || 'main',
    condition: item.condition || '',
    original_mrp: item.original_mrp != null ? String(item.original_mrp) : '',
    warranty_days: item.warranty_days != null ? String(item.warranty_days) : '',
    colour: item.colour || '',
    flavour_group: item.flavour_group || '',
    scoop_count: item.scoop_count != null ? String(item.scoop_count) : '1',
    crust_options: item.crust_options || '',
    toppings_allowed: !!item.toppings_allowed,
    topping_extra_price: item.topping_extra_price != null ? String(item.topping_extra_price) : '',
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

function ImageUrlField({
  label,
  value,
  onChange,
  apiClient,
  showToast,
  uploading,
  setUploading,
}) {
  const inputRef = useRef(null);

  const onPick = async (file) => {
    if (!file || !apiClient) return;
    setUploading(true);
    try {
      const { file: prepared } = await prepareCatalogImage(file);
      const uploaded = await uploadCatalogImage(apiClient, prepared, file.name);
      if (!uploaded?.url) throw new Error('Upload returned no URL');
      onChange(uploaded.url);
      showToast?.('Image uploaded — click Save item to keep it');
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Image upload failed';
      showToast?.(msg, 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <FormField
      label={label}
      hint="Landscape photo · auto-compressed under 1MB, or paste a direct https URL."
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          disabled={uploading}
        />
        <button
          type="button"
          disabled={uploading || !apiClient}
          onClick={() => inputRef.current?.click()}
          style={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 12px',
            borderRadius: 8,
            cursor: uploading ? 'wait' : 'pointer',
            border: `0.5px solid ${C.primaryBorder || C.border}`,
            background: C.primaryLight || C.surfaceBg,
            color: C.primaryDark || C.text,
            whiteSpace: 'nowrap',
          }}
        >
          {uploading ? '…' : 'Upload'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>
      <UrlPreview url={value} />
    </FormField>
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
  lobType = 'restaurant',
  onClose,
  onSaved,
  apiClient,
  showToast,
}) {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploadingSlot, setUploadingSlot] = useState(null);

  const schemaLob = useMemo(() => normalizeLobType(lobType, 'restaurant'), [lobType]);
  const packaged = checkPackagedLob(lobType);
  const isFood = schemaLob === 'food_products';
  const isRestaurant = schemaLob === 'restaurant';
  const isRetail = schemaLob === 'retail' || String(lobType || '').toLowerCase() === 'jewellery';
  const isPsl = schemaLob === 'psl';
  const isB2b = schemaLob === 'b2b';
  const showGallery = isFood || isRetail || packaged;
  const showStockHints = isFood || packaged;

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(mode === 'edit' ? itemToForm(item) : { ...BLANK, item_type: isPsl ? 'PRODUCT' : 'PRODUCT' });
  }, [open, mode, item, isPsl]);

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
      is_available: !!form.is_available,
    };

    if (showGallery) {
      payload.image_url_2 = form.image_url_2.trim() || null;
      payload.image_url_3 = form.image_url_3.trim() || null;
      payload.image_url_4 = form.image_url_4.trim() || null;
      payload.image_url_5 = form.image_url_5.trim() || null;
    }

    if (isFood || isPsl) {
      payload.item_type = form.item_type;
      payload.variant_group_id = form.variant_group_id.trim() || null;
      payload.pack_size_label = form.pack_size_label.trim() || null;
      payload.size_label = form.pack_size_label.trim() || null;
    }

    if (isFood || isPsl || isRetail) {
      payload.weight_grams = form.weight_grams !== '' ? parseInt(form.weight_grams, 10) || null : null;
    }

    if (isFood) {
      payload.availability_status = form.availability_status || null;
      payload.launch_at = form.launch_at || null;
      payload.deposit_amount = form.deposit_amount !== ''
        ? parseFloat(String(form.deposit_amount).replace(/[^\d.]/g, '')) || null
        : null;
      payload.shelf_life_days = form.shelf_life_days !== ''
        ? parseInt(form.shelf_life_days, 10) || null
        : null;
      payload.made_on_date = form.made_on_date || null;
      payload.ingredients = form.ingredients.trim() || null;
      payload.how_to_use = form.how_to_use.trim() || null;
      payload.how_to_store = form.how_to_store.trim() || null;
      payload.days_to_empty = form.days_to_empty !== ''
        ? (() => {
            const n = parseInt(form.days_to_empty, 10);
            return Number.isFinite(n) && n > 0 && n <= 3650 ? n : null;
          })()
        : null;
      payload.allergens = form.allergens.trim() || null;
      payload.bundle_components = components;
      payload.low_stock_alert_units = form.low_stock_alert_units !== ''
        ? parseInt(form.low_stock_alert_units, 10)
        : null;
      if (mode === 'create' && form.current_stock !== '') {
        payload.current_stock = Math.max(0, parseInt(form.current_stock, 10) || 0);
      }
    }

    if (isRestaurant) {
      payload.time_slot = form.time_slot || 'all';
      payload.custom_label_0 = form.time_slot && form.time_slot !== 'all' ? form.time_slot : null;
      payload.prep_time_fixed = form.prep_time_fixed !== '' ? parseInt(form.prep_time_fixed, 10) || 5 : 5;
      payload.batch_size = form.batch_size !== '' ? parseInt(form.batch_size, 10) || 1 : 1;
      payload.time_per_batch = form.time_per_batch !== '' ? parseInt(form.time_per_batch, 10) || 10 : 10;
      payload.kitchen_station = form.kitchen_station.trim() || null;
      payload.packing_time = form.packing_time !== '' ? parseFloat(form.packing_time) || 1 : 1;
      payload.holds_well = !!form.holds_well;
      payload.fulfillment_section = form.fulfillment_section.trim() || 'main';
    }

    if (isRetail) {
      payload.condition = form.condition.trim() || null;
      payload.original_mrp = form.original_mrp !== ''
        ? parseFloat(String(form.original_mrp).replace(/[^\d.]/g, '')) || null
        : null;
      payload.warranty_days = form.warranty_days !== '' ? parseInt(form.warranty_days, 10) || null : null;
      payload.colour = form.colour.trim() || null;
      payload.ingredients = form.ingredients.trim() || null;
      payload.how_to_use = form.how_to_use.trim() || null;
      payload.how_to_store = form.how_to_store.trim() || null;
      payload.shelf_life_days = form.shelf_life_days !== ''
        ? parseInt(form.shelf_life_days, 10) || null
        : null;
      payload.days_to_empty = form.days_to_empty !== ''
        ? (() => {
            const n = parseInt(form.days_to_empty, 10);
            return Number.isFinite(n) && n > 0 && n <= 3650 ? n : null;
          })()
        : null;
    }

    if (isPsl) {
      payload.flavour_group = form.flavour_group.trim() || null;
      payload.scoop_count = form.scoop_count !== '' ? Math.max(1, parseInt(form.scoop_count, 10) || 1) : 1;
      payload.crust_options = form.crust_options.trim() || null;
      payload.toppings_allowed = !!form.toppings_allowed;
      payload.topping_extra_price = form.topping_extra_price !== ''
        ? parseFloat(String(form.topping_extra_price).replace(/[^\d.]/g, '')) || null
        : null;
      if (form.item_type === 'BUNDLE') payload.bundle_components = components;
    }

    if (packaged && !isFood && mode === 'create' && form.current_stock !== '') {
      payload.current_stock = Math.max(0, parseInt(form.current_stock, 10) || 0);
    }

    void isB2b;
    return payload;
  };

  const validate = (payload) => {
    const schema = getSchemaForLob(lobType);
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

  const itemTypes = isPsl ? PSL_ITEM_TYPES : FOOD_ITEM_TYPES;
  const titlePlaceholder = isRestaurant
    ? 'e.g. Idli (2 pcs)'
    : isRetail
      ? 'e.g. iPhone 12 (64GB)'
      : isPsl
        ? 'e.g. Margherita'
        : 'e.g. Mango Pickle';

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
          <input style={inputStyle} value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder={titlePlaceholder} />
        </FormField>
        <FormField label="Description">
          <textarea
            style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Short description"
          />
        </FormField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormField label={form.item_type === 'FLAVOUR' ? 'Price (₹)' : 'Price (₹) *'}>
            <input style={inputStyle} type="number" min={0} step="0.01" value={form.price} onChange={(e) => setField('price', e.target.value)} />
          </FormField>
          <FormField label="Category *">
            <input style={inputStyle} value={form.category} onChange={(e) => setField('category', e.target.value)} placeholder={isRestaurant ? 'Tiffin' : 'Category'} />
          </FormField>
        </div>
        <FormField label="SKU" hint="Leave blank on create to auto-generate.">
          <input
            style={inputStyle}
            value={form.retailer_id}
            onChange={(e) => setField('retailer_id', e.target.value)}
            placeholder="SKU"
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

        {(isFood || isPsl) && (
          <>
            <SectionTitle>{isPsl ? 'Type / variant' : 'Pack / variant'}</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Item type">
                <select style={inputStyle} value={form.item_type} onChange={(e) => setField('item_type', e.target.value)}>
                  {itemTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label={isPsl ? 'Size label' : 'Pack size'}>
                <input style={inputStyle} value={form.pack_size_label} onChange={(e) => setField('pack_size_label', e.target.value)} placeholder={isPsl ? 'Medium' : '250g'} />
              </FormField>
            </div>
            <FormField label="Variant group ID" hint={isPsl ? 'Same ID across pizza sizes' : 'Same ID across pack sizes'}>
              <input style={inputStyle} value={form.variant_group_id} onChange={(e) => setField('variant_group_id', e.target.value)} />
            </FormField>
            {isFood && (
              <FormField label="Weight (grams)" hint="Used for courier rate quotes. Blank = packaging / store estimate.">
                <input style={inputStyle} type="number" min={0} value={form.weight_grams} onChange={(e) => setField('weight_grams', e.target.value)} />
              </FormField>
            )}
            {isPsl && (
              <FormField label="Weight (grams)" hint="Optional parcel weight for courier quotes.">
                <input style={inputStyle} type="number" min={0} value={form.weight_grams} onChange={(e) => setField('weight_grams', e.target.value)} />
              </FormField>
            )}
            {(form.item_type === 'BUNDLE') && (
              <FormField label="Bundle components *" hint="Format: SKU:qty,SKU:qty">
                <input
                  style={inputStyle}
                  value={form.bundle_components_text}
                  onChange={(e) => setField('bundle_components_text', e.target.value)}
                  placeholder="MP-100:3"
                />
              </FormField>
            )}
          </>
        )}

        {isPsl && (
          <>
            <SectionTitle>Pizza / ice cream</SectionTitle>
            <FormField label="Flavour group" hint="Required for CUP/CONE/SUNDAE/FLAVOUR">
              <input style={inputStyle} value={form.flavour_group} onChange={(e) => setField('flavour_group', e.target.value)} placeholder="GRP-A" />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Scoop count">
                <input style={inputStyle} type="number" min={1} value={form.scoop_count} onChange={(e) => setField('scoop_count', e.target.value)} />
              </FormField>
              <FormField label="Topping extra (₹)">
                <input style={inputStyle} type="number" min={0} value={form.topping_extra_price} onChange={(e) => setField('topping_extra_price', e.target.value)} />
              </FormField>
            </div>
            <FormField label="Crust options" hint="Comma-separated, e.g. Thin,Thick,Stuffed">
              <input style={inputStyle} value={form.crust_options} onChange={(e) => setField('crust_options', e.target.value)} />
            </FormField>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
              <input
                type="checkbox"
                checked={form.toppings_allowed}
                onChange={(e) => setField('toppings_allowed', e.target.checked)}
              />
              Toppings allowed
            </label>
          </>
        )}

        {isRestaurant && (
          <>
            <SectionTitle>Kitchen</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Menu slot">
                <select style={inputStyle} value={form.time_slot} onChange={(e) => setField('time_slot', e.target.value)}>
                  <option value="all">All day</option>
                  <option value="morning_tiffin">Morning Tiffin</option>
                  <option value="lunch">Lunch</option>
                  <option value="evening_snacks">Evening Snacks</option>
                  <option value="dinner_tiffin">Dinner</option>
                </select>
              </FormField>
              <FormField label="Kitchen station">
                <input style={inputStyle} value={form.kitchen_station} onChange={(e) => setField('kitchen_station', e.target.value)} placeholder="tawa / steamer / sweets_counter" />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <FormField label="Prep (min)">
                <input style={inputStyle} type="number" min={0} value={form.prep_time_fixed} onChange={(e) => setField('prep_time_fixed', e.target.value)} />
              </FormField>
              <FormField label="Batch size">
                <input style={inputStyle} type="number" min={1} value={form.batch_size} onChange={(e) => setField('batch_size', e.target.value)} />
              </FormField>
              <FormField label="Min / batch">
                <input style={inputStyle} type="number" min={1} value={form.time_per_batch} onChange={(e) => setField('time_per_batch', e.target.value)} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Packing time (min)">
                <input style={inputStyle} type="number" min={0} step="0.5" value={form.packing_time} onChange={(e) => setField('packing_time', e.target.value)} />
              </FormField>
              <FormField label="Fulfillment section">
                <input style={inputStyle} value={form.fulfillment_section} onChange={(e) => setField('fulfillment_section', e.target.value)} placeholder="main" />
              </FormField>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
              <input
                type="checkbox"
                checked={form.holds_well}
                onChange={(e) => setField('holds_well', e.target.checked)}
              />
              Holds well
            </label>
          </>
        )}

        {isRetail && (
          <>
            <SectionTitle>Retail details</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Condition">
                <input style={inputStyle} value={form.condition} onChange={(e) => setField('condition', e.target.value)} placeholder="New / Refurbished" />
              </FormField>
              <FormField label="Colour">
                <input style={inputStyle} value={form.colour} onChange={(e) => setField('colour', e.target.value)} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="Original MRP (₹)">
                <input style={inputStyle} type="number" min={0} value={form.original_mrp} onChange={(e) => setField('original_mrp', e.target.value)} />
              </FormField>
              <FormField label="Warranty (days)">
                <input style={inputStyle} type="number" min={0} value={form.warranty_days} onChange={(e) => setField('warranty_days', e.target.value)} />
              </FormField>
            </div>
            <FormField label="Weight (grams)" hint="Used for courier rate quotes. Blank = packaging / store estimate.">
              <input style={inputStyle} type="number" min={0} value={form.weight_grams} onChange={(e) => setField('weight_grams', e.target.value)} />
            </FormField>
            <SectionTitle>Trust</SectionTitle>
            <FormField label="Ingredients">
              <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={form.ingredients} onChange={(e) => setField('ingredients', e.target.value)} />
            </FormField>
            <FormField label="How to use" hint="Shown on the storefront product page.">
              <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={form.how_to_use} onChange={(e) => setField('how_to_use', e.target.value)} placeholder="e.g. Mix 1 tsp with warm water" />
            </FormField>
            <FormField label="How to store">
              <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={form.how_to_store} onChange={(e) => setField('how_to_store', e.target.value)} placeholder="e.g. Cool dry place, away from sunlight" />
            </FormField>
            <FormField label="Shelf life (days)">
              <input style={inputStyle} type="number" min={0} value={form.shelf_life_days} onChange={(e) => setField('shelf_life_days', e.target.value)} />
            </FormField>
            <FormField label="Days to empty" hint="Typical days until a unit runs out — used for WhatsApp refill reminders.">
              <input style={inputStyle} type="number" min={1} value={form.days_to_empty || ''} onChange={(e) => setField('days_to_empty', e.target.value)} placeholder="e.g. 30" />
            </FormField>
          </>
        )}

        {/* Trust before Images so how_to_* fields are visible without scrolling past gallery URLs */}
        {isFood && (
          <>
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
            <FormField label="How to use">
              <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={form.how_to_use} onChange={(e) => setField('how_to_use', e.target.value)} placeholder="e.g. Best with hot rice or dosa" />
            </FormField>
            <FormField label="How to store" hint="Shown on the storefront product page.">
              <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={form.how_to_store} onChange={(e) => setField('how_to_store', e.target.value)} placeholder="e.g. Cool dry place; refrigerate after opening" />
            </FormField>
            <FormField label="Days to empty" hint="Typical days until a unit runs out — used for WhatsApp refill reminders.">
              <input style={inputStyle} type="number" min={1} value={form.days_to_empty || ''} onChange={(e) => setField('days_to_empty', e.target.value)} placeholder="e.g. 45" />
            </FormField>
          </>
        )}

        <SectionTitle>Images</SectionTitle>
        <ImageUrlField
          label="Primary image"
          value={form.image_url}
          onChange={(v) => setField('image_url', v)}
          apiClient={apiClient}
          showToast={showToast}
          uploading={uploadingSlot === 'image_url'}
          setUploading={(busy) => setUploadingSlot(busy ? 'image_url' : null)}
        />
        {showGallery && [
          ['image_url_2', 'Gallery image 2'],
          ['image_url_3', 'Gallery image 3'],
          ['image_url_4', 'Gallery image 4'],
          ['image_url_5', 'Gallery image 5'],
        ].map(([key, label]) => (
          <ImageUrlField
            key={key}
            label={label}
            value={form[key]}
            onChange={(v) => setField(key, v)}
            apiClient={apiClient}
            showToast={showToast}
            uploading={uploadingSlot === key}
            setUploading={(busy) => setUploadingSlot(busy ? key : null)}
          />
        ))}

        {isFood && (
          <>
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
          </>
        )}

        {showStockHints && mode === 'create' && (
          <>
            <SectionTitle>Initial stock</SectionTitle>
            <FormField label="Current stock (optional)" hint="Leave blank if you’ll use Record batch later. Edits never overwrite stock.">
              <input style={inputStyle} type="number" min={0} value={form.current_stock} onChange={(e) => setField('current_stock', e.target.value)} />
            </FormField>
          </>
        )}

        {mode === 'edit' && showStockHints && item?.current_stock != null && (
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
