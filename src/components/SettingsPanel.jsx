/**
 * SettingsPanel.jsx — Owner settings for Munafe
 *
 * 5 tabs:
 *   Tables      — add / edit / delete physical tables
 *   Restaurant  — display name, address, contact, cuisine, hours
 *   Services    — toggle which service types are active
 *   Kitchen     — dining duration, payment mode, workflow
 *   WhatsApp    — WA number, WABA ID, manager phone, access token
 *
 * Uses the same design tokens (C) as ManagerPortal.jsx.
 * Drop into /settings — owner sees all tabs; manager sees Staff (Team) only.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription, FEATURES } from '../contexts/SubscriptionContext';

// ─── Design tokens (matches ManagerPortal) ────────────────────────────────────
const C = {
  primary:       '#378ADD', primaryDark:  '#185FA5', primaryLight: '#E6F1FB', primaryBorder:'#B5D4F4',
  success:       '#1D9E75', successLight: '#E1F5EE', successBorder:'#9FE1CB', successDark:  '#085041',
  warning:       '#BA7517', warningLight: '#FAEEDA', warningBorder:'#FAC775', warningDark:  '#633806',
  danger:        '#A32D2D', dangerLight:  '#FCEBEB', dangerBorder: '#F7C1C1', dangerDark:   '#791F1F',
  pageBg:        '#F5F5F3', cardBg:       '#ffffff', surfaceBg:    '#F5F5F3',
  border:        '#E8E8E5', borderStrong: '#D0D0CC',
  text:          '#111111', textSub:      '#555555', textMuted:    '#999999',
};

const CARD = {
  background: C.cardBg,
  border: `0.5px solid ${C.border}`,
  borderRadius: 12,
  padding: '24px',
};

// ─── Service options ──────────────────────────────────────────────────────────
const SERVICES = [
  { id: 'dine_in',        label: 'Dine-In',          icon: '🪑', desc: 'Walk-in table service via WhatsApp' },
  { id: 'takeaway',       label: 'Takeaway',          icon: '🛍️', desc: 'Counter pickup orders'              },
  { id: 'delivery',       label: 'Door Delivery',     icon: '🛵', desc: 'Delivery to customer address'       },
  { id: 'reserve_table',  label: 'Table Reservation', icon: '📅', desc: 'Advance booking with deposit'       },
];

const WORKFLOWS = [
  { value: 'KOT_only',         label: 'Paper KOT only'    },
  { value: 'KDS_only',         label: 'Digital KDS only'  },
  { value: 'Both_KOT_and_KDS', label: 'KOT + KDS hybrid'  },
];

const SECTIONS = ['Main Hall', 'Terrace', 'Private Room', 'Counter', 'Outdoor'];

// ─── Primitives ───────────────────────────────────────────────────────────────
function Spinner({ size = 18 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `2px solid ${C.border}`, borderTop: `2px solid ${C.primary}`,
      animation: 'spin .7s linear infinite', display: 'inline-block',
    }} />
  );
}

function Toast({ msg, type = 'success' }) {
  if (!msg) return null;
  const bg = type === 'error' ? '#7F1D1D' : type === 'warning' ? '#92400E' : '#1A1A18';
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 100,
      background: bg, color: '#fff', fontSize: 12, fontWeight: 500,
      padding: '10px 16px', borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,.25)',
    }}>
      {msg}
    </div>
  );
}

function Label({ children, required }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
      {children}{required && <span style={{ color: C.danger, marginLeft: 2 }}>*</span>}
    </label>
  );
}

const inputStyle = {
  width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8,
  border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.text,
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

function Input({ value, onChange, placeholder, type = 'text', disabled }) {
  return (
    <input
      type={type} value={value ?? ''} placeholder={placeholder}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, opacity: disabled ? 0.5 : 1 }}
    />
  );
}

function Select({ value, onChange, options, disabled }) {
  return (
    <select
      value={value ?? ''} disabled={disabled}
      onChange={e => onChange(e.target.value)}
      style={{ ...inputStyle, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}

function Btn({ children, onClick, variant = 'primary', disabled, style: s, loading }) {
  const variants = {
    primary:   { background: C.primary,      color: '#fff',        border: `0.5px solid ${C.primaryDark}`  },
    secondary: { background: C.surfaceBg,    color: C.text,        border: `0.5px solid ${C.border}`       },
    danger:    { background: C.dangerLight,  color: C.danger,      border: `0.5px solid ${C.dangerBorder}` },
    ghost:     { background: 'transparent',  color: C.textMuted,   border: `0.5px solid ${C.border}`       },
    success:   { background: C.successLight, color: C.successDark, border: `0.5px solid ${C.successBorder}`},
  };
  const v = variants[variant] ?? variants.primary;
  return (
    <button
      onClick={onClick} disabled={disabled || loading}
      style={{
        fontSize: 12, padding: '7px 14px', borderRadius: 8, fontWeight: 500,
        cursor: (disabled || loading) ? 'not-allowed' : 'pointer',
        opacity: (disabled || loading) ? 0.55 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        ...v, ...s,
      }}
    >
      {loading && <Spinner size={12} />}
      {children}
    </button>
  );
}

function SectionTitle({ children, id }) {
  return (
    <div id={id} style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, marginTop: 20, paddingTop: 16, borderTop: `0.5px solid ${C.border}` }}>
      {children}
    </div>
  );
}

function SaveBar({ onSave, loading, saved }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10,
      marginTop: 24, padding: '12px 0', borderTop: `0.5px solid ${C.border}`,
      position: 'sticky', bottom: 0, zIndex: 5,
      background: `linear-gradient(to top, ${C.cardBg} 85%, transparent)`,
    }}>
      {saved && <span style={{ fontSize: 11, color: C.success }}>✓ Saved</span>}
      <Btn onClick={onSave} loading={loading}>Save changes</Btn>
    </div>
  );
}

// ─── TABLE STATUS BADGE ───────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    available: { bg: C.successLight, color: C.successDark, label: 'Available' },
    occupied:  { bg: C.primaryLight, color: C.primaryDark, label: 'Occupied'  },
    reserved:  { bg: C.warningLight, color: C.warningDark, label: 'Reserved'  },
    dirty:     { bg: C.dangerLight,  color: C.dangerDark,  label: 'Cleaning'  },
  };
  const s = map[status] ?? map.available;
  return (
    <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1 — TABLES
// Full CRUD: add, edit inline, delete (blocked if occupied)
// ═════════════════════════════════════════════════════════════════════════════
function TabTables({ apiClient, showToast }) {
  const [tables,    setTables]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editBuf,   setEditBuf]   = useState({});
  const [adding,    setAdding]    = useState(false);
  const [newRow,    setNewRow]    = useState({ table_number: '', capacity: 4, section: '' });
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get('/api/tables');
      setTables((r.data.tables ?? r.data ?? []).sort((a, b) => a.table_number - b.table_number));
    } catch { showToast('Failed to load tables', 'error'); }
    finally { setLoading(false); }
  }, [apiClient, showToast]);

  useEffect(() => { load(); }, [load]);

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditBuf({ table_number: t.table_number, capacity: t.capacity ?? 4, section: t.section ?? '' });
  };
  const cancelEdit = () => { setEditingId(null); setEditBuf({}); };

  const saveEdit = async (id) => {
    if (!editBuf.table_number) return showToast('Table number is required', 'error');
    setSaving(id);
    try {
      await apiClient.put(`/api/tables/${id}`, {
        table_number: parseInt(editBuf.table_number),
        capacity:     parseInt(editBuf.capacity) || 4,
        section:      editBuf.section || null,
      });
      showToast(`Table ${editBuf.table_number} updated`);
      setEditingId(null);
      await load();
    } catch (e) { showToast(e.response?.data?.error ?? 'Update failed', 'error'); }
    finally { setSaving(null); }
  };

  const deleteTable = async (t) => {
    if (!window.confirm(`Delete Table ${t.table_number}? This cannot be undone.`)) return;
    setDeleting(t.id);
    try {
      await apiClient.delete(`/api/tables/${t.id}`);
      showToast(`Table ${t.table_number} deleted`);
      await load();
    } catch (e) { showToast(e.response?.data?.error ?? 'Delete failed', 'error'); }
    finally { setDeleting(null); }
  };

  const addTable = async () => {
    if (!newRow.table_number) return showToast('Table number is required', 'error');
    setSaving('new');
    try {
      await apiClient.post('/api/tables', {
        table_number: parseInt(newRow.table_number),
        capacity:     parseInt(newRow.capacity) || 4,
        section:      newRow.section || null,
      });
      showToast(`Table ${newRow.table_number} added`);
      setAdding(false);
      setNewRow({ table_number: '', capacity: 4, section: '' });
      await load();
    } catch (e) { showToast(e.response?.data?.error ?? 'Add failed', 'error'); }
    finally { setSaving(null); }
  };

  const bulkAdd = async () => {
    const count = parseInt(window.prompt('How many tables to add? (will number from the next available slot)'));
    if (!count || count < 1 || count > 50) return;
    const maxNum = tables.reduce((m, t) => Math.max(m, t.table_number), 0);
    setSaving('bulk');
    let added = 0;
    for (let i = 1; i <= count; i++) {
      try {
        await apiClient.post('/api/tables', { table_number: maxNum + i, capacity: 4 });
        added++;
      } catch {}
    }
    showToast(`Added ${added} table${added !== 1 ? 's' : ''}`);
    setSaving(null);
    await load();
  };

  if (loading) return <div style={{ padding: 32, textAlign: 'center' }}><Spinner size={28} /></div>;

  const colStyle = { padding: '10px 12px', fontSize: 12, color: C.textSub, textAlign: 'left' };
  const thStyle  = { ...colStyle, fontSize: 10, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', background: C.surfaceBg };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
            {tables.length} table{tables.length !== 1 ? 's' : ''} configured
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            Changes here are reflected immediately in the manager portal.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" onClick={bulkAdd} loading={saving === 'bulk'}>+ Bulk add</Btn>
          <Btn onClick={() => { setAdding(true); setEditingId(null); }}>+ Add table</Btn>
        </div>
      </div>

      {/* Add row */}
      {adding && (
        <div style={{ ...CARD, marginBottom: 12, background: C.primaryLight, border: `0.5px solid ${C.primaryBorder}` }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: C.primaryDark, marginBottom: 12 }}>New table</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <Label required>Table number</Label>
              <Input value={newRow.table_number} onChange={v => setNewRow(p => ({ ...p, table_number: v }))} placeholder="e.g. 7" type="number" />
            </div>
            <div>
              <Label>Capacity (seats)</Label>
              <Input value={newRow.capacity} onChange={v => setNewRow(p => ({ ...p, capacity: v }))} type="number" />
            </div>
            <div>
              <Label>Section</Label>
              <Select value={newRow.section} onChange={v => setNewRow(p => ({ ...p, section: v }))} options={[{ value: '', label: '— none —' }, ...SECTIONS.map(s => ({ value: s, label: s }))]} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={addTable} loading={saving === 'new'}>Save table</Btn>
            <Btn variant="ghost" onClick={() => setAdding(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Table list */}
      {tables.length === 0 && !adding ? (
        <div style={{ ...CARD, textAlign: 'center', padding: '40px 24px', color: C.textMuted }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🪑</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 4 }}>No tables configured yet</div>
          <div style={{ fontSize: 12 }}>Add tables one by one or use Bulk add to set up your floor plan.</div>
        </div>
      ) : (
        <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Table', 'Capacity', 'Section', 'Status', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tables.map((t, i) => {
                const isEditing = editingId === t.id;
                const isOccupied = t.status === 'occupied';
                return (
                  <tr key={t.id} style={{ borderTop: i > 0 ? `0.5px solid ${C.border}` : 'none', background: isEditing ? C.primaryLight : 'transparent' }}>
                    <td style={colStyle}>
                      {isEditing
                        ? <Input value={editBuf.table_number} onChange={v => setEditBuf(p => ({ ...p, table_number: v }))} type="number" />
                        : <span style={{ fontWeight: 500, color: C.text }}>Table {t.table_number}</span>}
                    </td>
                    <td style={colStyle}>
                      {isEditing
                        ? <Input value={editBuf.capacity} onChange={v => setEditBuf(p => ({ ...p, capacity: v }))} type="number" />
                        : `${t.capacity ?? 4} seats`}
                    </td>
                    <td style={colStyle}>
                      {isEditing
                        ? <Select value={editBuf.section} onChange={v => setEditBuf(p => ({ ...p, section: v }))} options={[{ value: '', label: '— none —' }, ...SECTIONS.map(s => ({ value: s, label: s }))]} />
                        : (t.section || <span style={{ color: C.textMuted }}>—</span>)}
                    </td>
                    <td style={colStyle}><StatusBadge status={t.status ?? 'available'} /></td>
                    <td style={{ ...colStyle, textAlign: 'right' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Btn onClick={() => saveEdit(t.id)} loading={saving === t.id}>Save</Btn>
                          <Btn variant="ghost" onClick={cancelEdit}>Cancel</Btn>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Btn variant="ghost" onClick={() => startEdit(t)}>Edit</Btn>
                          <Btn
                            variant="danger"
                            onClick={() => deleteTable(t)}
                            loading={deleting === t.id}
                            disabled={isOccupied}
                            style={{ fontSize: 11 }}
                          >
                            {isOccupied ? 'In use' : 'Delete'}
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

      <div style={{ marginTop: 12, fontSize: 11, color: C.textMuted }}>
        Occupied tables cannot be deleted. Free the table from the manager portal first.
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2 — RESTAURANT
// Display name, address, contact, cuisine, opening hours
// ═════════════════════════════════════════════════════════════════════════════

function parseGoogleMapsCoords(input) {
  if (!input || typeof input !== 'string') return null;
  const text = input.trim();
  let m = text.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: m[1], lng: m[2] };
  m = text.match(/[?&](?:ll|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: m[1], lng: m[2] };
  m = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: m[1], lng: m[2] };
  m = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: m[1], lng: m[2] };
  m = text.match(/place\/[^/]+\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: m[1], lng: m[2] };
  return null;
}

function isMapsUrl(text) {
  return typeof text === 'string' && /google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(text);
}

function notifySaveResult(showToast, response, successMsg) {
  const warning = response?.data?.warning;
  if (warning) {
    showToast(warning, 'warning');
    return;
  }
  showToast(successMsg);
}

function TabRestaurant({ apiClient, showToast }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [resolvingPickup, setResolvingPickup] = useState(false);

  useEffect(() => {
    apiClient.get('/api/dashboard/waba').then(r => {
      const d = r.data.restaurant ?? {};
      const lat = d.pickup_latitude;
      const lng = d.pickup_longitude;
      setForm({
        display_name:  d.display_name  ?? d.name ?? '',
        legal_name:    d.legal_name    ?? '',
        address_line1: d.address_line1 ?? d.address ?? '',
        address_line2: d.address_line2 ?? '',
        city:          d.city          ?? '',
        state:         d.state         ?? '',
        postal_code:   d.postal_code   ?? '',
        country:       d.country       ?? 'India',
        contact_phone: d.contact_phone ?? d.phone ?? '',
        contact_email: d.contact_email ?? d.email ?? '',
        website_url:   d.website_url   ?? d.website ?? '',
        cuisine_type:  d.cuisine_type  ?? '',
        gstin:         d.gstin         ?? '',
        logo_url:      d.logo_url      ?? '',
        restaurant_type:   d.restaurant_type ?? 'restaurant',
        lob_type:          d.lob_type ?? 'restaurant',   // ← add this line
        allow_manager_menu_upload: d.allow_manager_menu_upload ?? false,
        pickup_address:    d.pickup_address ?? '',
        pickup_maps_link:  d.google_maps_url || (lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : ''),
        pickup_latitude:   lat ?? '',
        pickup_longitude:  lng ?? '',
        pickup_coords_source: lat && lng ? 'saved' : '',
      });
    }).catch(() => showToast('Failed to load restaurant info', 'error'));
  }, [apiClient, showToast]);

  const set = (k, v) => { setSaved(false); setForm(p => ({ ...p, [k]: v })); };

  const applyMapsLink = (link) => {
    const coords = parseGoogleMapsCoords(link);
    setSaved(false);
    if (coords) {
      setForm(p => ({
        ...p,
        pickup_maps_link: link,
        pickup_latitude: coords.lat,
        pickup_longitude: coords.lng,
        pickup_coords_source: 'maps_url',
      }));
      return true;
    }
    setForm(p => ({
      ...p,
      pickup_maps_link: link,
      ...(link.trim() ? { pickup_latitude: '', pickup_longitude: '', pickup_coords_source: '' } : {}),
    }));
    return false;
  };

  const resolvePickupCoords = async (silent = false) => {
    const mapsLink = form?.pickup_maps_link?.trim() || '';
    const address = form?.pickup_address?.trim() || '';
    const addressIsMapsUrl = isMapsUrl(address);

    if (!address && !mapsLink) {
      if (!silent) showToast('Enter a pickup address or paste a Google Maps link', 'error');
      return null;
    }
    if (addressIsMapsUrl && !mapsLink) {
      if (!silent) {
        showToast('Paste that Google Maps link in the Maps link field above, not the address field', 'warning');
      }
    }

    for (const candidate of [mapsLink, addressIsMapsUrl ? address : ''].filter(Boolean)) {
      const fromLink = parseGoogleMapsCoords(candidate);
      if (fromLink) {
        setForm(p => ({
          ...p,
          pickup_maps_link: mapsLink || candidate,
          pickup_latitude: fromLink.lat,
          pickup_longitude: fromLink.lng,
          pickup_coords_source: 'maps_url',
        }));
        if (!silent) showToast('Location picked up from Google Maps link');
        return { lat: parseFloat(fromLink.lat), lng: parseFloat(fromLink.lng), source: 'maps_url' };
      }
    }

    setResolvingPickup(true);
    try {
      const r = await apiClient.post('/api/restaurants/resolve-pickup', {
        maps_url: mapsLink || (addressIsMapsUrl ? address : null),
        pickup_address: addressIsMapsUrl ? null : address,
        city: form.city,
        state: form.state,
      });
      const coords = { lat: r.data.lat, lng: r.data.lng, source: r.data.source || 'geocode' };
      setForm(p => ({
        ...p,
        pickup_latitude: coords.lat,
        pickup_longitude: coords.lng,
        pickup_coords_source: coords.source,
        pickup_maps_link: p.pickup_maps_link || `https://maps.google.com/?q=${coords.lat},${coords.lng}`,
      }));
      if (!silent) showToast('Pickup location resolved from address');
      return coords;
    } catch (e) {
      if (!silent) showToast(e.response?.data?.error ?? 'Could not resolve location', 'error');
      return null;
    } finally {
      setResolvingPickup(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      let lat = form.pickup_latitude;
      let lng = form.pickup_longitude;
      let coordsWarning = false;
      if (form.restaurant_type === 'cloud_kitchen' && (!lat || !lng)) {
        const resolved = await resolvePickupCoords(true);
        if (resolved) {
          lat = resolved.lat;
          lng = resolved.lng;
        } else {
          coordsWarning = true;
        }
      }
      const { pickup_maps_link, pickup_coords_source, ...toSave } = form;
      const res = await apiClient.put('/api/restaurants/me', {
        ...toSave,
        pickup_latitude: lat || null,
        pickup_longitude: lng || null,
        maps_url: pickup_maps_link || undefined,
      });
      setSaved(true);
      if (coordsWarning) {
        showToast('Saved. Pickup coordinates are not set yet — use Resolve location or a pin link for accurate delivery distance.', 'warning');
      } else {
        notifySaveResult(showToast, res, 'Restaurant details saved');
      }
    } catch (e) { showToast(e.response?.data?.error ?? 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  if (!form) return <div style={{ padding: 32, textAlign: 'center' }}><Spinner size={28} /></div>;

  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Btn onClick={save} loading={saving}>{saved ? '✓ Saved' : 'Save restaurant details'}</Btn>
      </div>
      <div style={grid2}>
        <div><Label required>Display name</Label><Input value={form.display_name} onChange={v => set('display_name', v)} placeholder="Murugan Idli Shop" /></div>
        <div><Label>Legal / registered name</Label><Input value={form.legal_name} onChange={v => set('legal_name', v)} placeholder="Murugan Food Pvt. Ltd." /></div>
      </div>

      <SectionTitle>Address</SectionTitle>
      <div style={{ marginBottom: 12 }}><Label>Address line 1</Label><Input value={form.address_line1} onChange={v => set('address_line1', v)} placeholder="12, Anna Salai" /></div>
      <div style={{ marginBottom: 12 }}><Label>Address line 2</Label><Input value={form.address_line2} onChange={v => set('address_line2', v)} placeholder="Near Central Station" /></div>
      <div style={{ ...grid2, marginBottom: 12 }}>
        <div><Label>City</Label><Input value={form.city} onChange={v => set('city', v)} placeholder="Chennai" /></div>
        <div><Label>State</Label><Input value={form.state} onChange={v => set('state', v)} placeholder="Tamil Nadu" /></div>
      </div>
      <div style={grid2}>
        <div><Label>Postal code</Label><Input value={form.postal_code} onChange={v => set('postal_code', v)} placeholder="600002" /></div>
        <div><Label>Country</Label><Input value={form.country} onChange={v => set('country', v)} /></div>
      </div>

      <SectionTitle>Contact</SectionTitle>
      <div style={grid2}>
        <div><Label>Contact phone</Label><Input value={form.contact_phone} onChange={v => set('contact_phone', v)} placeholder="044-2345XXXX" /></div>
        <div><Label>Contact email</Label><Input value={form.contact_email} onChange={v => set('contact_email', v)} type="email" placeholder="hello@restaurant.com" /></div>
      </div>
      <div style={{ marginTop: 12 }}><Label>Website URL</Label><Input value={form.website_url} onChange={v => set('website_url', v)} placeholder="https://yoursite.com" /></div>

      <SectionTitle>Brand</SectionTitle>
      <div style={grid2}>
        <div><Label>Cuisine type</Label><Input value={form.cuisine_type} onChange={v => set('cuisine_type', v)} placeholder="South Indian, North Indian…" /></div>
        <div><Label>GSTIN</Label><Input value={form.gstin} onChange={v => set('gstin', v)} placeholder="22AAAAA0000A1Z5" /></div>
      </div>
      <div style={{ marginTop: 12 }}><Label>Logo URL</Label><Input value={form.logo_url} onChange={v => set('logo_url', v)} placeholder="https://…/logo.png" /></div>
      {form.logo_url && (
        <img src={form.logo_url} alt="Logo preview" style={{ marginTop: 8, height: 48, borderRadius: 6, border: `0.5px solid ${C.border}` }} onError={e => e.target.style.display = 'none'} />
      )}

      <SectionTitle>Outlet type</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          { value: 'restaurant', label: 'Restaurant', desc: 'Dine-in venue — customers can find you on Google Maps.' },
          { value: 'cloud_kitchen', label: 'Cloud kitchen', desc: 'Delivery / takeaway hub — show pickup address on order confirmations.' },
        ].map(opt => (
          <button key={opt.value}
            onClick={() => set('restaurant_type', opt.value)}
            style={{
              padding: '14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              background: form.restaurant_type === opt.value ? C.primaryLight : C.cardBg,
              border: `0.5px solid ${form.restaurant_type === opt.value ? C.primary : C.border}`,
            }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: form.restaurant_type === opt.value ? C.primaryDark : C.text, marginBottom: 4 }}>
              {form.restaurant_type === opt.value ? '◉ ' : '○ '}{opt.label}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{opt.desc}</div>
          </button>
        ))}
      </div>

<SectionTitle>Business type</SectionTitle>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
  {[
    { value: 'restaurant',     label: 'Restaurant / Tiffin',     desc: 'Dine-in, takeaway, delivery — time-slot menu.' },
    { value: 'psl',            label: 'Pizza & Ice Cream',       desc: 'Sizes, flavours, toppings — variant-based menu.' },
    { value: 'food_products',  label: 'Packaged Food / Home Baker', desc: 'Pack sizes, shelf life, ingredients.' },
    { value: 'jewellery',      label: 'Gold Jewellery',          desc: 'Live gold rate, purity, making charges.' },
    { value: 'retail',         label: 'Retail / Electronics',    desc: 'Condition, brand, warranty, multi-image.' },
    { value: 'b2b',            label: 'B2B Supply',              desc: 'MOQ, unit of measure, wholesale pricing.' },
  ].map(opt => (
    <button key={opt.value}
      onClick={() => set('lob_type', opt.value)}
      style={{
        padding: '14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
        background: form.lob_type === opt.value ? C.primaryLight : C.cardBg,
        border: `0.5px solid ${form.lob_type === opt.value ? C.primary : C.border}`,
      }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: form.lob_type === opt.value ? C.primaryDark : C.text, marginBottom: 4 }}>
        {form.lob_type === opt.value ? '◉ ' : '○ '}{opt.label}
      </div>
      <div style={{ fontSize: 11, color: C.textMuted }}>{opt.desc}</div>
    </button>
  ))}
</div>

      

      <SectionTitle>Staff permissions</SectionTitle>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px', borderRadius: 10, marginBottom: 16,
        background: C.surfaceBg, border: `0.5px solid ${C.border}`,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>
            Allow managers to upload/replace the menu
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            When off, only you (the owner) can upload or replace the catalog via Excel.
            Managers can still toggle individual items in/out of stock from the Manager Portal.
          </div>
        </div>
        <div
          onClick={() => set('allow_manager_menu_upload', !form.allow_manager_menu_upload)}
          style={{
            width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative',
            background: form.allow_manager_menu_upload ? C.success : C.border,
            transition: 'background .2s', flexShrink: 0, marginLeft: 16,
          }}
        >
          <div style={{
            position: 'absolute', top: 3, left: form.allow_manager_menu_upload ? 21 : 3,
            width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s',
          }} />
        </div>
      </div>

      {form.restaurant_type === 'cloud_kitchen' && (
        <>
          <SectionTitle>Pickup location (takeaway &amp; delivery)</SectionTitle>
          <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12, lineHeight: 1.55 }}>
            Open Google Maps → find your kitchen pin → <strong>Share</strong> → copy link and paste below.
            We extract coordinates automatically for pickup directions and delivery distance.
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label>Google Maps link</Label>
            <Input
              value={form.pickup_maps_link}
              onChange={v => applyMapsLink(v)}
              placeholder="https://maps.google.com/... or https://maps.app.goo.gl/..."
            />
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              Paste the share link from Google Maps. Coordinates are read from the URL when possible.
            </div>
          </div>
          <div style={{
            fontSize: 12, color: C.textSub, marginBottom: 12, lineHeight: 1.6,
            padding: '10px 12px', background: C.primaryLight, borderRadius: 8,
            border: `0.5px solid ${C.primaryBorder}`,
          }}>
            <strong>Tip:</strong> Prefer a full <code style={{ fontSize: 11 }}>maps.google.com</code> link — coordinates are picked up instantly.
            Short links (<code style={{ fontSize: 11 }}>maps.app.goo.gl</code>) often won&apos;t parse; enter your pickup address above and tap <strong>Resolve location</strong>, or open the long URL from Share in Google Maps.
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label required>Pickup address (shown to customers)</Label>
            <Input
              value={form.pickup_address}
              onChange={v => set('pickup_address', v)}
              placeholder="12, 2nd Floor, Gopalan Mall Road, HSR Layout"
            />
            {isMapsUrl(form.pickup_address) && (
              <div style={{ fontSize: 11, color: C.warningDark, marginTop: 4 }}>
                This looks like a Maps link — paste it in the Google Maps link field above for best results.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <Btn variant="secondary" onClick={() => resolvePickupCoords(false)} loading={resolvingPickup}>
              Resolve location
            </Btn>
            {form.pickup_latitude && form.pickup_longitude && (
              <span style={{
                fontSize: 11, color: C.successDark, background: C.successLight,
                border: `0.5px solid ${C.successBorder}`, padding: '4px 10px', borderRadius: 20,
              }}>
                ✓ {Number(form.pickup_latitude).toFixed(5)}, {Number(form.pickup_longitude).toFixed(5)}
                {form.pickup_coords_source === 'maps_url' ? ' · from Maps link' : form.pickup_coords_source === 'geocode' ? ' · from address' : ''}
              </span>
            )}
          </div>
        </>
      )}

      <SaveBar onSave={save} loading={saving} saved={saved} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3 — SERVICES
// Toggle which customer-facing services are active (within paid plan).
// ═════════════════════════════════════════════════════════════════════════════
function TabServices({ apiClient, showToast, refreshSubscription }) {
  const [paidFeatures,    setPaidFeatures]    = useState(null);
  const [enabledServices, setEnabledServices] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    apiClient.get('/api/subscription').then(r => {
      const paid = r.data.paid_features ?? r.data.features ?? [];
      const enabled = r.data.enabled_services
        ?? SERVICES.map(s => s.id).filter(id => (r.data.enabled_features ?? r.data.features ?? []).includes(id));
      setPaidFeatures(paid);
      setEnabledServices(enabled);
    }).catch(() => {
      apiClient.get('/api/dashboard/waba').then(r => {
        const feats = r.data.restaurant?.subscribed_features ?? [];
        setPaidFeatures(feats);
        setEnabledServices(SERVICES.map(s => s.id).filter(id => feats.includes(id)));
      }).catch(() => showToast('Failed to load services', 'error'));
    });
  }, [apiClient, showToast]);

  const toggle = (id) => {
    setSaved(false);
    setEnabledServices(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  };

  const save = async () => {
    if (enabledServices.length < 1) return showToast('At least one service must be active', 'error');
    setSaving(true);
    try {
      await apiClient.put('/api/restaurants/me', { enabled_services: enabledServices });
      setSaved(true);
      showToast('Service configuration saved');
      if (refreshSubscription) await refreshSubscription();
    } catch (e) { showToast(e.response?.data?.error ?? 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  if (!paidFeatures || !enabledServices) {
    return <div style={{ padding: 32, textAlign: 'center' }}><Spinner size={28} /></div>;
  }

  const availableServices = SERVICES.filter(svc => paidFeatures.includes(svc.id));
  const lockedServices    = SERVICES.filter(svc => !paidFeatures.includes(svc.id));

  return (
    <div>
      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 16, lineHeight: 1.6 }}>
        Enabled services appear as options when a customer messages your WhatsApp number.
        Disabling a service removes it from the customer-facing menu immediately.
        Only services on your paid plan can be toggled here.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {availableServices.map(svc => {
          const on = enabledServices.includes(svc.id);
          return (
            <button
              key={svc.id}
              onClick={() => toggle(svc.id)}
              style={{
                padding: '16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                transition: 'all .15s', background: on ? C.primaryLight : C.cardBg,
                border: `0.5px solid ${on ? C.primary : C.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 20 }}>{svc.icon}</span>
                <div style={{
                  width: 36, height: 20, borderRadius: 10, position: 'relative',
                  background: on ? C.success : C.border, transition: 'background .2s',
                }}>
                  <span style={{
                    position: 'absolute', top: 3, left: on ? 19 : 3,
                    width: 14, height: 14, borderRadius: '50%', background: '#fff',
                    transition: 'left .2s',
                  }} />
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: on ? C.primaryDark : C.text }}>{svc.label}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{svc.desc}</div>
            </button>
          );
        })}
      </div>

      {lockedServices.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Not on your plan
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {lockedServices.map(svc => (
              <div
                key={svc.id}
                style={{
                  padding: '16px', borderRadius: 10, textAlign: 'left',
                  background: C.surfaceBg, border: `0.5px dashed ${C.border}`,
                  opacity: 0.75,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 20, filter: 'grayscale(1)' }}>{svc.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, padding: '2px 8px', borderRadius: 20, background: C.border }}>
                    Upgrade
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.textMuted }}>{svc.label}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{svc.desc}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 8 }}>
                  Contact Autom8 to add this service to your subscription.
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SaveBar onSave={save} loading={saving} saved={saved} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4 — KITCHEN
// Dining duration, payment mode, workflow, slot timings
// ═════════════════════════════════════════════════════════════════════════════
function TabKitchen({ apiClient, showToast, paidFeatures = [] }) {
  const SLOT_OPTIONS = ['tiffin', 'lunch', 'dinner', 'anytime'];
  const normalizeSlots = (slots) => {
    if (!Array.isArray(slots) || !slots.length) return ['anytime'];
    const clean = [...new Set(slots.map(s => String(s || '').toLowerCase().trim()))]
      .filter(Boolean)
      .filter(s => SLOT_OPTIONS.includes(s));
    return clean.length ? clean : ['anytime'];
  };
  const hasPaid = (f) => paidFeatures.includes(f);
  const hasAnyPaid = (...fs) => fs.some(f => paidFeatures.includes(f));
  const showDineIn = hasPaid(FEATURES.DINE_IN);
  const showTakeaway = hasPaid(FEATURES.TAKEAWAY);
  const showDelivery = hasPaid(FEATURES.DELIVERY);
  const showOrderModes = hasAnyPaid(FEATURES.TAKEAWAY, FEATURES.DELIVERY);

  const defaultTiers = [
    { max_km: 3, charge: 20 },
    { max_km: 5, charge: 30 },
    { max_km: 8, charge: 40 },
    { max_km: 12, charge: 50 },
    { max_km: '', charge: 60 },
  ];
  const [form,      setForm]      = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  // Multi-counter section management
  const [sections,  setSections]  = useState([]);   // [{ id, name }]
  const [catMap,    setCatMap]    = useState({});    // { categoryName: sectionId }
  const [catSlots,  setCatSlots]  = useState({});    // { categoryName: ['tiffin',..] }
  const [menuCats,  setMenuCats]  = useState([]);    // distinct categories from menu_items
  const [newSecName, setNewSecName] = useState('');

  useEffect(() => {
    Promise.all([
      apiClient.get('/api/dashboard/waba'),
      apiClient.get('/api/menu-items?ignore_slot=true').catch(() => ({ data: { items: [] } })),
      apiClient.get('/api/catalog/menu-categories/slots').catch(() => ({ data: { categories: [] } })),
    ]).then(([wabaRes, menuRes, catRes]) => {
      const d = wabaRes.data.restaurant ?? {};
      setForm({
        dining_duration_minutes: d.dining_duration_minutes ?? 45,
        payment_mode:            d.payment_mode ?? 'prepay',
        kitchen_workflow:        d.kitchen_workflow ?? 'KOT_only',
        takeaway_fulfillment_mode: d.takeaway_fulfillment_mode ?? 'single_counter',
        parcel_charge_per_item:    d.parcel_charge_per_item ?? 0,
        takeaway_ready_range:      d.takeaway_ready_range ?? '',
        delivery_ready_range:      d.delivery_ready_range ?? '',
        delivery_charge_default:   d.delivery_charge_default ?? 30,
        delivery_charge_tiers:     Array.isArray(d.delivery_charge_tiers) && d.delivery_charge_tiers.length
          ? d.delivery_charge_tiers.map(t => ({
              max_km: t.max_km == null ? '' : t.max_km,
              charge: t.charge ?? 0,
            }))
          : defaultTiers,
        min_delivery_order_amount: d.min_delivery_order_amount ?? 0,
        min_takeaway_order_amount: d.min_takeaway_order_amount ?? 0,
        scheduled_delivery_enabled: !!d.scheduled_delivery_enabled,
        scheduled_takeaway_enabled: !!d.scheduled_takeaway_enabled,
        max_delivery_radius_km:     d.max_delivery_radius_km ?? 0,
        has_breakfast: d.opening_hours?.breakfast !== false,
        breakfast_start: d.opening_hours?.breakfast_start ?? '06:00',
        breakfast_end:   d.opening_hours?.breakfast_end   ?? '11:00',
        has_lunch:    d.opening_hours?.lunch  !== false,
        lunch_start:  d.opening_hours?.lunch_start  ?? '12:00',
        lunch_end:    d.opening_hours?.lunch_end    ?? '15:00',
        has_snacks:   d.opening_hours?.snacks !== false,
        snacks_start: d.opening_hours?.snacks_start ?? '15:00',
        snacks_end:   d.opening_hours?.snacks_end   ?? '19:00',
        has_dinner:   d.opening_hours?.dinner !== false,
        dinner_start: d.opening_hours?.dinner_start ?? '19:00',
        dinner_end:   d.opening_hours?.dinner_end   ?? '23:00',
        lob_type: d.lob_type ?? 'restaurant',
        shiprocket_connected: !!d.shiprocket_connected,
        shiprocket_api_key: '',
        shiprocket_has_key: !!d.shiprocket_connected,
        intra_city_charge: d.intra_city_charge ?? '',
        outstation_charge: d.outstation_charge ?? '',
        free_delivery_above: d.free_delivery_above ?? '',
        cod_enabled_city: !!d.cod_enabled_city,
        cod_enabled_outstation: !!d.cod_enabled_outstation,
      });
      // Fulfillment sections
      const secs = d.fulfillment_sections ?? [];
      setSections(secs);
      // Build category→section map from menu items
      const items  = menuRes.data.items ?? [];
      const cats   = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
      setMenuCats(cats);
      // Pre-populate map from existing item fulfillment_section values
      const map = {};
      items.forEach(i => {
        if (i.category && i.fulfillment_section && i.fulfillment_section !== 'main') {
          map[i.category] = i.fulfillment_section;
        }
      });
      setCatMap(map);

      const slotMap = {};
      (catRes.data.categories || []).forEach(row => {
        if (row?.name) slotMap[row.name] = normalizeSlots(row.applicable_slots);
      });
      cats.forEach(cat => {
        if (!slotMap[cat]) slotMap[cat] = ['anytime'];
      });
      setCatSlots(slotMap);
    }).catch(() => showToast('Failed to load kitchen config', 'error'));
  }, [apiClient, showToast]);

  const set = (k, v) => { setSaved(false); setForm(p => ({ ...p, [k]: v })); };

  const addSection = () => {
    const name = newSecName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (sections.find(s => s.id === id)) return showToast('Section already exists', 'error');
    setSections(p => [...p, { id, name }]);
    setNewSecName('');
  };

  const removeSection = (id) => {
    setSections(p => p.filter(s => s.id !== id));
    setCatMap(p => { const m = { ...p }; Object.keys(m).forEach(k => { if (m[k] === id) delete m[k]; }); return m; });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put('/api/restaurants/me', {
        dining_duration_minutes:    parseInt(form.dining_duration_minutes),
        payment_mode:               form.payment_mode,
        kitchen_workflow:           form.kitchen_workflow,
        takeaway_fulfillment_mode:  form.takeaway_fulfillment_mode,
        parcel_charge_per_item:     parseFloat(form.parcel_charge_per_item) || 0,
        takeaway_ready_range:       (form.takeaway_ready_range || '').trim() || null,
        delivery_ready_range:       (form.delivery_ready_range || '').trim() || null,
        delivery_charge_default:    parseFloat(form.delivery_charge_default) || 30,
        delivery_charge_tiers:      (form.delivery_charge_tiers || []).map(t => ({
          max_km: t.max_km === '' || t.max_km == null ? null : parseFloat(t.max_km),
          charge: parseFloat(t.charge) || 0,
        })),
        min_delivery_order_amount:  parseFloat(form.min_delivery_order_amount) || 0,
        min_takeaway_order_amount:  parseFloat(form.min_takeaway_order_amount) || 0,
        scheduled_delivery_enabled: !!form.scheduled_delivery_enabled,
        scheduled_takeaway_enabled: !!form.scheduled_takeaway_enabled,
        max_delivery_radius_km:     parseFloat(form.max_delivery_radius_km) || 0,
        fulfillment_sections:       sections,
        opening_hours: {
          breakfast: form.has_breakfast, breakfast_start: form.breakfast_start, breakfast_end: form.breakfast_end,
          lunch: form.has_lunch, lunch_start: form.lunch_start, lunch_end: form.lunch_end,
          snacks: form.has_snacks, snacks_start: form.snacks_start, snacks_end: form.snacks_end,
          dinner: form.has_dinner, dinner_start: form.dinner_start, dinner_end: form.dinner_end,
        },
        shiprocket_connected: !!form.shiprocket_connected,
        ...(form.shiprocket_api_key?.trim() ? { shiprocket_api_key: form.shiprocket_api_key.trim() } : {}),
        intra_city_charge: parseFloat(form.intra_city_charge) || 0,
        outstation_charge: parseFloat(form.outstation_charge) || 0,
        free_delivery_above: parseFloat(form.free_delivery_above) || 0,
        cod_enabled_city: !!form.cod_enabled_city,
        cod_enabled_outstation: !!form.cod_enabled_outstation,
      });
      // Bulk-update menu_items.fulfillment_section per category mapping
      if (form.takeaway_fulfillment_mode === 'multi_counter' && Object.keys(catMap).length) {
        for (const [cat, secId] of Object.entries(catMap)) {
          await apiClient.put('/api/menu-items/bulk-section', {
            category: cat, fulfillment_section: secId,
          }).catch(() => {});
        }
      }

      // Persist category slot defaults for web menu "Available Now" logic
      for (const [cat, slots] of Object.entries(catSlots)) {
        await apiClient.put(`/api/catalog/menu-categories/${encodeURIComponent(cat)}/slots`, {
          applicable_slots: normalizeSlots(slots),
        }).catch(() => {});
      }

      setSaved(true);
      notifySaveResult(showToast, res, 'Kitchen settings saved');
    } catch (e) { showToast(e.response?.data?.error ?? 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  if (!form) return <div style={{ padding: 32, textAlign: 'center' }}><Spinner size={28} /></div>;

  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
  const ToggleRow = ({ label, checked, onToggle }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `0.5px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.text }}>{label}</span>
      <div onClick={onToggle} style={{ width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative', background: checked ? C.success : C.border, transition: 'background .2s' }}>
        <div style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
      </div>
    </div>
  );

  return (
    <div>
      {showDineIn && (
        <div style={grid2}>
          <div>
            <Label>Max dining time (minutes)</Label>
            <Input value={form.dining_duration_minutes} onChange={v => set('dining_duration_minutes', v)} type="number" placeholder="45" />
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              Typical: 45 min (casual), 75 min (sit-down), 90 min (fine dining). Tables auto-release after this time.
            </div>
          </div>
          <div>
            <Label>Payment mode</Label>
            <Select value={form.payment_mode} onChange={v => set('payment_mode', v)} options={[
              { value: 'prepay',   label: 'Pre-pay (order confirmation)' },
              { value: 'postpay',  label: 'Post-pay (pay when leaving)'  },
              { value: 'partial',  label: 'Partial deposit'              },
            ]} />
          </div>
        </div>
      )}

      {!showDineIn && (
        <div style={{ marginBottom: 16 }}>
          <Label>Payment mode</Label>
          <Select value={form.payment_mode} onChange={v => set('payment_mode', v)} options={[
            { value: 'prepay',   label: 'Pre-pay (Razorpay link on order)' },
            { value: 'postpay',  label: 'Post-pay (pay on delivery / pickup)' },
          ]} />
        </div>
      )}

      {showOrderModes && (
        <>
      {/* ── Takeaway & delivery pricing ───────────────────────────────────── */}
      <SectionTitle>Takeaway &amp; delivery</SectionTitle>
      <div style={{ marginBottom: 16 }}>
        <Label>Parcel / packaging charge (₹ per item)</Label>
        <Input
          value={form.parcel_charge_per_item}
          onChange={v => set('parcel_charge_per_item', v)}
          type="number"
          placeholder="0"
        />
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
          Added per cart quantity for takeaway and door delivery, before GST. Set 0 to disable (e.g. 10, 15, or 20).
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {showTakeaway && (
        <div>
          <Label>Takeaway ready time (mins range)</Label>
          <Input
            value={form.takeaway_ready_range}
            onChange={v => set('takeaway_ready_range', v)}
            placeholder="20-30"
          />
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            Shown as &quot;Usually ready in …&quot; on takeaway confirmation.
          </div>
        </div>
        )}
        {showDelivery && (
        <div>
          <Label>Delivery time (mins range)</Label>
          <Input
            value={form.delivery_ready_range}
            onChange={v => set('delivery_ready_range', v)}
            placeholder="25-35"
          />
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            Kitchen prep time only. Drive time from Google Maps (with traffic) is added automatically when the customer shares their location.
          </div>
        </div>
        )}
      </div>

      {(showTakeaway || showDelivery) && (
        <>
          <SectionTitle id="scheduled-ordering">Scheduled ordering</SectionTitle>
          <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12, lineHeight: 1.55 }}>
            Let customers pick a date and time via the WhatsApp calendar before they order.
            Delivery slots can require manager approval when enabled below.
          </div>
          {showDelivery && (
            <>
              <ToggleRow
                label="Scheduled delivery"
                checked={form.scheduled_delivery_enabled}
                onToggle={() => set('scheduled_delivery_enabled', !form.scheduled_delivery_enabled)}
              />
              <div style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 12px' }}>
                Calendar picker before address. Manager approval before payment when a future slot is chosen.
              </div>
            </>
          )}
          {showTakeaway && (
            <>
              <ToggleRow
                label="Scheduled take-away"
                checked={form.scheduled_takeaway_enabled}
                onToggle={() => set('scheduled_takeaway_enabled', !form.scheduled_takeaway_enabled)}
              />
              <div style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 16px' }}>
                Pickup date and time via WhatsApp calendar before the menu. Works when the kitchen is closed too.
              </div>
            </>
          )}
        </>
      )}

      {showDelivery && (
        <>
          <SectionTitle>Delivery charges</SectionTitle>
          <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12, lineHeight: 1.55 }}>
            For direct WhatsApp orders (no Swiggy/Zomato). Charge is based on distance from your pickup coordinates to the customer&apos;s shared location.
            Road distance is used when <code>GOOGLE_MAPS_API_KEY</code> is set on the server; otherwise straight-line distance is used.
          </div>
          <div style={{
            fontSize: 12, color: C.textSub, marginBottom: 12, lineHeight: 1.6,
            padding: '10px 12px', background: C.warningLight, borderRadius: 8,
            border: `0.5px solid ${C.warningBorder}`,
          }}>
            <strong>Tip:</strong> Ask customers to tap <strong>Share location</strong> on WhatsApp (not just type an address) so delivery charge and radius checks are accurate.
            Set your kitchen pin under <strong>Restaurant → Cloud kitchen</strong> using a full Google Maps link.
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label>Default charge when distance unknown (₹)</Label>
            <Input value={form.delivery_charge_default} onChange={v => set('delivery_charge_default', v)} type="number" placeholder="30" />
          </div>
          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase' }}>Distance tiers</div>
          {(form.delivery_charge_tiers || []).map((tier, i) => (
            <div key={i} style={{ ...grid2, marginBottom: 8, alignItems: 'end' }}>
              <div>
                <Label>{i < (form.delivery_charge_tiers.length - 1) ? `Up to (km)` : `Beyond previous (km — leave blank)`}</Label>
                <Input
                  value={tier.max_km}
                  onChange={v => {
                    const tiers = [...form.delivery_charge_tiers];
                    tiers[i] = { ...tiers[i], max_km: v };
                    set('delivery_charge_tiers', tiers);
                  }}
                  type="number"
                  placeholder={i === form.delivery_charge_tiers.length - 1 ? 'blank = rest' : '3'}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Label>Charge (₹)</Label>
                  <Input
                    value={tier.charge}
                    onChange={v => {
                      const tiers = [...form.delivery_charge_tiers];
                      tiers[i] = { ...tiers[i], charge: v };
                      set('delivery_charge_tiers', tiers);
                    }}
                    type="number"
                    placeholder="30"
                  />
                </div>
                {(form.delivery_charge_tiers || []).length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      const tiers = [...form.delivery_charge_tiers];
                      tiers.splice(i, 1);
                      set('delivery_charge_tiers', tiers);
                    }}
                    style={{
                      padding: '10px 12px', marginBottom: 2, borderRadius: 8, cursor: 'pointer',
                      border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.textSub,
                      fontSize: 12,
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const tiers = [...(form.delivery_charge_tiers || defaultTiers)];
              if (tiers.length === 0) {
                set('delivery_charge_tiers', [{ max_km: 3, charge: 30 }, { max_km: '', charge: 40 }]);
                return;
              }
              const catchAll = tiers[tiers.length - 1];
              tiers.splice(tiers.length - 1, 0, { max_km: '', charge: catchAll.charge || 40 });
              set('delivery_charge_tiers', tiers);
            }}
            style={{
              padding: '8px 14px', marginBottom: 16, borderRadius: 8, cursor: 'pointer',
              border: `0.5px solid ${C.border}`, background: C.cardBg, color: C.primary,
              fontSize: 12, fontWeight: 600,
            }}
          >
            + Add distance tier
          </button>
          <div style={{ ...grid2, marginBottom: 16 }}>
            <div>
              <Label>Minimum order — delivery (₹)</Label>
              <Input value={form.min_delivery_order_amount} onChange={v => set('min_delivery_order_amount', v)} type="number" placeholder="150" />
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>Items subtotal before charges. e.g. ₹150 for cloud kitchens.</div>
            </div>
            {showTakeaway && (
            <div>
              <Label>Minimum order — takeaway (₹)</Label>
              <Input value={form.min_takeaway_order_amount} onChange={v => set('min_takeaway_order_amount', v)} type="number" placeholder="0" />
            </div>
            )}
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label>Max delivery radius (km)</Label>
            <Input value={form.max_delivery_radius_km} onChange={v => set('max_delivery_radius_km', v)} type="number" placeholder="8" />
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              Orders beyond this distance are declined when location is known. Set 0 for no limit. Uses road distance when Google Maps API is configured.
            </div>
          </div>
        </>
      )}

      {showDelivery && ['food_products', 'retail', 'psl', 'b2b'].includes(form.lob_type) && (
        <>
          <SectionTitle>Outstation shipping</SectionTitle>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
            Pincode-based delivery: same-city uses intra-city charge; other pincodes use Shiprocket rates when connected, otherwise the flat outstation charge.
          </div>
          <ToggleRow
            label="Shiprocket connected (auto rates for outstation)"
            checked={form.shiprocket_connected}
            onToggle={() => set('shiprocket_connected', !form.shiprocket_connected)}
          />
          {form.shiprocket_connected && (
            <div style={{ marginBottom: 12 }}>
              <Label>Shiprocket API token</Label>
              <Input
                value={form.shiprocket_api_key}
                onChange={v => set('shiprocket_api_key', v)}
                type="password"
                placeholder={form.shiprocket_has_key ? 'Saved — enter only to replace' : 'Paste Shiprocket API token'}
              />
            </div>
          )}
          <div style={grid2}>
            <div>
              <Label>Intra-city charge (₹)</Label>
              <Input value={form.intra_city_charge} onChange={v => set('intra_city_charge', v)} type="number" placeholder="49" />
            </div>
            <div>
              <Label>Outstation flat charge (₹)</Label>
              <Input value={form.outstation_charge} onChange={v => set('outstation_charge', v)} type="number" placeholder="99" />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label>Free delivery above (₹ cart total, 0 = disabled)</Label>
            <Input value={form.free_delivery_above} onChange={v => set('free_delivery_above', v)} type="number" placeholder="999" />
          </div>
          <ToggleRow
            label="COD enabled — same city"
            checked={form.cod_enabled_city}
            onToggle={() => set('cod_enabled_city', !form.cod_enabled_city)}
          />
          <ToggleRow
            label="COD enabled — outstation"
            checked={form.cod_enabled_outstation}
            onToggle={() => set('cod_enabled_outstation', !form.cod_enabled_outstation)}
          />
        </>
      )}

      {showTakeaway && (
        <>
      <SectionTitle>Takeaway fulfillment</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          { value: 'single_counter', label: 'Everything from one window',
            desc: 'One staff member packs and hands over the complete order at a single counter.' },
          { value: 'multi_counter', label: 'Multiple sections',
            desc: 'Sweets, savouries, beverages, kitchen — customer collects from each section independently.' },
        ].map(opt => (
          <button key={opt.value}
            onClick={() => set('takeaway_fulfillment_mode', opt.value)}
            style={{
              padding: '14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
              background: form.takeaway_fulfillment_mode === opt.value ? C.primaryLight : C.cardBg,
              border: `0.5px solid ${form.takeaway_fulfillment_mode === opt.value ? C.primary : C.border}`,
              transition: 'all .15s',
            }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: form.takeaway_fulfillment_mode === opt.value ? C.primaryDark : C.text, marginBottom: 4 }}>
              {form.takeaway_fulfillment_mode === opt.value ? '◉ ' : '○ '}{opt.label}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{opt.desc}</div>
          </button>
        ))}
      </div>

      {/* ── Section management (only shown in multi_counter mode) ─────────── */}
      {form.takeaway_fulfillment_mode === 'multi_counter' && (
        <div style={{ background: C.surfaceBg, border: `0.5px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 12 }}>Fulfillment sections</div>

          {/* Existing sections */}
          {sections.length === 0 && (
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
              No sections yet. Add at least one (e.g. "Sweets & Savouries", "Kitchen", "Beverages").
            </div>
          )}
          {sections.map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `0.5px solid ${C.border}` }}>
              <div>
                <span style={{ fontSize: 13, color: C.text }}>{s.name}</span>
                <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 8 }}>id: {s.id}</span>
              </div>
              <Btn variant="danger" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => removeSection(s.id)}>Remove</Btn>
            </div>
          ))}

          {/* Add new section */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={newSecName}
              onChange={e => setNewSecName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSection()}
              placeholder="e.g. Sweets & Savouries"
              style={{ ...{ fontSize: 13, padding: '7px 10px', borderRadius: 8, border: `0.5px solid ${C.border}`, flex: 1, fontFamily: 'inherit' } }}
            />
            <Btn onClick={addSection}>+ Add</Btn>
          </div>

          {/* Category → section mapping */}
          {menuCats.length > 0 && sections.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Assign menu categories to sections
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
                New orders will automatically route each item to its section based on category.
                Items not assigned here go to the first section as fallback.
              </div>
              {menuCats.map(cat => (
                <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: `0.5px solid ${C.border}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: C.text }}>{cat}</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {SLOT_OPTIONS.map(slot => {
                        const current = normalizeSlots(catSlots[cat] || ['anytime']);
                        const active = current.includes(slot);
                        return (
                          <button
                            key={`${cat}-${slot}`}
                            type="button"
                            onClick={() => {
                              const next = active ? current.filter(s => s !== slot) : [...current, slot];
                              setCatSlots(p => ({ ...p, [cat]: normalizeSlots(next) }));
                            }}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 999,
                              border: `0.5px solid ${active ? C.primary : C.border}`,
                              background: active ? C.primaryLight : C.cardBg,
                              color: active ? C.primaryDark : C.textSub,
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <select
                    value={catMap[cat] || ''}
                    onChange={e => setCatMap(p => ({ ...p, [cat]: e.target.value || undefined }))}
                    style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: `0.5px solid ${C.border}`, background: C.cardBg, marginLeft: 10 }}
                  >
                    <option value="">— unassigned —</option>
                    {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

        </>
      )}

        </>
      )}

      <SectionTitle>Kitchen workflow</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {WORKFLOWS.map(w => (
          <button key={w.value} onClick={() => set('kitchen_workflow', w.value)} style={{
            padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
            background: form.kitchen_workflow === w.value ? C.primaryLight : C.cardBg,
            border: `0.5px solid ${form.kitchen_workflow === w.value ? C.primary : C.border}`,
            color: form.kitchen_workflow === w.value ? C.primaryDark : C.textSub,
            transition: 'all .15s', textAlign: 'left',
          }}>
            {w.label}
          </button>
        ))}
      </div>

      <SectionTitle>Service slots</SectionTitle>
      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12, lineHeight: 1.55, padding: '10px 12px', background: C.primaryLight, borderRadius: 8, border: `0.5px solid ${C.primaryBorder}` }}>
        These hours control when WhatsApp customers can order. Toggle each meal period on or off and set open/close times.
        For a 6am idli shop, enable <strong>Breakfast</strong> below.
      </div>
      <ToggleRow label="Breakfast / morning tiffin" checked={form.has_breakfast} onToggle={() => set('has_breakfast', !form.has_breakfast)} />
      {form.has_breakfast && (
        <div style={{ ...grid2, margin: '10px 0' }}>
          <div><Label>Opens</Label><Input type="time" value={form.breakfast_start} onChange={v => set('breakfast_start', v)} /></div>
          <div><Label>Closes</Label><Input type="time" value={form.breakfast_end} onChange={v => set('breakfast_end', v)} /></div>
        </div>
      )}
      <ToggleRow label="Lunch service" checked={form.has_lunch} onToggle={() => set('has_lunch', !form.has_lunch)} />
      {form.has_lunch && (
        <div style={{ ...grid2, margin: '10px 0' }}>
          <div><Label>Opens</Label><Input type="time" value={form.lunch_start} onChange={v => set('lunch_start', v)} /></div>
          <div><Label>Closes</Label><Input type="time" value={form.lunch_end} onChange={v => set('lunch_end', v)} /></div>
        </div>
      )}
      <ToggleRow label="Evening snacks" checked={form.has_snacks} onToggle={() => set('has_snacks', !form.has_snacks)} />
      {form.has_snacks && (
        <div style={{ ...grid2, margin: '10px 0' }}>
          <div><Label>Opens</Label><Input type="time" value={form.snacks_start} onChange={v => set('snacks_start', v)} /></div>
          <div><Label>Closes</Label><Input type="time" value={form.snacks_end} onChange={v => set('snacks_end', v)} /></div>
        </div>
      )}
      <ToggleRow label="Dinner service" checked={form.has_dinner} onToggle={() => set('has_dinner', !form.has_dinner)} />
      {form.has_dinner && (
        <div style={{ ...grid2, margin: '10px 0' }}>
          <div><Label>Opens</Label><Input type="time" value={form.dinner_start} onChange={v => set('dinner_start', v)} /></div>
          <div><Label>Closes</Label><Input type="time" value={form.dinner_end} onChange={v => set('dinner_end', v)} /></div>
        </div>
      )}

      <SaveBar onSave={save} loading={saving} saved={saved} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 5 — WHATSAPP
// WA number, WABA ID, phone number ID, manager phone, access token
// ═════════════════════════════════════════════════════════════════════════════
function TabWhatsApp({ apiClient, showToast }) {
  const [form,   setForm]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get('/api/dashboard/waba'),
      apiClient.get('/api/restaurants/integration').catch(() => ({ data: {} })),
    ]).then(([wabaRes, intRes]) => {
      const d   = wabaRes.data.restaurant ?? {};
      const int = intRes.data.integration ?? {};
      setForm({
        whatsapp_number:  d.whatsapp_number  ?? '',
        waba_id:          d.waba_id          ?? '',
        phone_number_id:  int.phone_number_id ?? '',
        manager_phone:    d.manager_phone    ?? '',
        access_token:     int.access_token   ?? '',
        webhook_secret:   int.webhook_secret ?? '',
      });
    }).catch(() => showToast('Failed to load WhatsApp config', 'error'));
  }, [apiClient, showToast]);

  const set = (k, v) => { setSaved(false); setForm(p => ({ ...p, [k]: v })); };

  const save = async () => {
    if (!form.whatsapp_number) return showToast('WhatsApp number is required', 'error');
    setSaving(true);
    try {
      // Update restaurant row
      await apiClient.put('/api/restaurants/me', {
        whatsapp_number: form.whatsapp_number,
        waba_id:         form.waba_id        || null,
        manager_phone:   form.manager_phone  || null,
      });
      // Update integration row (phone_number_id + access_token live here)
      if (form.phone_number_id || form.access_token) {
        await apiClient.put('/api/restaurants/integration', {
          provider:       'meta',
          channel:        'whatsapp',
          phone_number_id: form.phone_number_id || null,
          access_token:   form.access_token    || null,
          webhook_secret:  form.webhook_secret  || null,
        });
      }
      setSaved(true);
      showToast('WhatsApp settings saved');
    } catch (e) { showToast(e.response?.data?.error ?? 'Save failed', 'error'); }
    finally { setSaving(false); }
  };

  if (!form) return <div style={{ padding: 32, textAlign: 'center' }}><Spinner size={28} /></div>;

  const hint = (text) => <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.5 }}>{text}</div>;

  return (
    <div>
      <div style={{ background: '#EAF3DE', border: '0.5px solid #A7E3C0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#3B6D11', marginBottom: 20, lineHeight: 1.7 }}>
        📖 All values come from <strong>Meta for Developers</strong> and <strong>Meta Business Manager</strong>.
        Changes here take effect on the next incoming message — no restart needed.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <Label required>WhatsApp number</Label>
          <Input value={form.whatsapp_number} onChange={v => set('whatsapp_number', v)} placeholder="919444000000" />
          {hint('Country code + number, no + or spaces.')}
        </div>
        <div>
          <Label>Manager phone</Label>
          <Input value={form.manager_phone} onChange={v => set('manager_phone', v)} placeholder="919876543210" />
          {hint('Primary on-call number. All active managers/owners in Team with WhatsApp also receive ops alerts.')}
        </div>
        <div>
          <Label>WABA ID</Label>
          <Input value={form.waba_id} onChange={v => set('waba_id', v)} placeholder="1234567890" />
          {hint('Business Manager → Accounts → WhatsApp Accounts → ID.')}
        </div>
        <div>
          <Label>Phone Number ID</Label>
          <Input value={form.phone_number_id} onChange={v => set('phone_number_id', v)} placeholder="1234567890" />
          {hint('developers.facebook.com → Your App → WhatsApp → API Setup.')}
        </div>
      </div>

      <SectionTitle>API credentials</SectionTitle>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <Label>Meta System Access Token</Label>
          <button onClick={() => setShowToken(p => !p)} style={{ fontSize: 11, color: C.primary, background: 'none', border: 'none', cursor: 'pointer' }}>
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
        <input
          type={showToken ? 'text' : 'password'}
          value={form.access_token}
          onChange={e => set('access_token', e.target.value)}
          placeholder="EAAxxxxxx…"
          style={inputStyle}
        />
        {hint('System user token from Business Manager → Settings → System Users. Permanent — never expires.')}
      </div>
      <div>
        <Label>Webhook verify token</Label>
        <Input value={form.webhook_secret} onChange={v => set('webhook_secret', v)} placeholder="your_webhook_secret" />
        {hint('Must match the token set in your Meta app\'s webhook configuration.')}
      </div>

      <SaveBar onSave={save} loading={saving} saved={saved} />
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// TAB 6 — STAFF
// Onboard employees, edit details, set roles, collect WA numbers, terminate
// ═════════════════════════════════════════════════════════════════════════════

const STAFF_NOTIFY_ROLES = ['manager', 'captain', 'owner'];

function phoneDigitsMatch(a, b) {
  const da = String(a || '').replace(/\D/g, '');
  const db = String(b || '').replace(/\D/g, '');
  if (!da || !db) return false;
  if (da === db) return true;
  return da.slice(-10) === db.slice(-10);
}

function validateStaffWhatsApp(raw, role) {
  const digits = String(raw || '').replace(/\D/g, '');
  const required = STAFF_NOTIFY_ROLES.includes(role);

  if (!digits) {
    if (required) {
      return 'WhatsApp number is required for this role (12 digits with country code, e.g. 919876543210).';
    }
    return null;
  }
  if (digits.length === 10) {
    return 'Enter the full number with country code (e.g. 917305362067), not just the 10-digit mobile.';
  }
  if (digits.length < 11 || digits.length > 15) {
    return 'WhatsApp number must be 11–15 digits including country code (e.g. 919876543210).';
  }
  return null;
}

function TabStaff({ apiClient, showToast }) {
  const [employees, setEmployees] = useState([]);
  const [roles,     setRoles]     = useState([]);
  const [managerPhone, setManagerPhone] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [filter,    setFilter]    = useState('active');
  // Edit state — id of employee currently being edited + its draft values
  const [editingId,   setEditingId]   = useState(null);
  const [editForm,    setEditForm]    = useState({});
  const [editSaving,  setEditSaving]  = useState(false);
  const [resetSending, setResetSending] = useState(null);

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', whatsapp_number: '', role: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, roleRes, wabaRes] = await Promise.all([
        apiClient.get('/api/staff'),
        apiClient.get('/api/staff/roles'),
        apiClient.get('/api/dashboard/waba').catch(() => ({ data: {} })),
      ]);
      setEmployees(empRes.data.employees ?? []);
      setRoles(roleRes.data.roles ?? []);
      setManagerPhone(wabaRes.data.restaurant?.manager_phone ?? '');
    } catch { showToast('Failed to load staff', 'error'); }
    finally { setLoading(false); }
  }, [apiClient, showToast]);

  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setEF = (k, v) => setEditForm(p => ({ ...p, [k]: v }));

  // ── Open inline edit form ────────────────────────────────────────────────
  const startEdit = (emp) => {
    setEditingId(emp.id);
    setEditForm({
      full_name:       emp.full_name       ?? '',
      phone:           emp.phone           ?? '',
      whatsapp_number: emp.whatsapp_number ?? '',
      role:            emp.role            ?? '',
    });
    setShowForm(false); // close add form if open
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  // ── Save edited employee ─────────────────────────────────────────────────
  const saveEdit = async (emp) => {
    if (!editForm.full_name?.trim()) return showToast('Name is required', 'error');
    if (!editForm.role)              return showToast('Role is required', 'error');
    const waErr = validateStaffWhatsApp(editForm.whatsapp_number, editForm.role);
    if (waErr) return showToast(waErr, 'error');
    const normalizedWa = editForm.whatsapp_number
      ? String(editForm.whatsapp_number).replace(/\D/g, '')
      : null;
    setEditSaving(true);
    try {
      await apiClient.put(`/api/staff/${emp.id}`, {
        full_name:       editForm.full_name.trim(),
        phone:           editForm.phone           || null,
        whatsapp_number: normalizedWa,
        role:            editForm.role,
      });
      showToast(`${editForm.full_name} updated`);
      cancelEdit();
      await load();
    } catch (e) {
      showToast(e.response?.data?.error ?? 'Failed to save changes', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const onboard = async () => {
    if (!form.full_name) return showToast('Name is required', 'error');
    if (!form.email)     return showToast('Email is required', 'error');
    if (!form.role)      return showToast('Role is required', 'error');
    const waErr = validateStaffWhatsApp(form.whatsapp_number, form.role);
    if (waErr) return showToast(waErr, 'error');
    const payload = {
      ...form,
      whatsapp_number: form.whatsapp_number
        ? String(form.whatsapp_number).replace(/\D/g, '')
        : '',
    };
    setSaving(true);
    try {
      await apiClient.post('/api/staff', payload);
      showToast(`${form.full_name} added${form.whatsapp_number ? ' — WhatsApp invite sent' : ''}`);
      setShowForm(false);
      setForm({ full_name: '', email: '', phone: '', whatsapp_number: '', role: '' });
      await load();
    } catch (e) { showToast(e.response?.data?.error ?? 'Failed to add employee', 'error'); }
    finally { setSaving(false); }
  };

  const removeEmployee = async (emp) => {
    const isAlertNumber = managerPhone && emp.whatsapp_number && phoneDigitsMatch(emp.whatsapp_number, managerPhone);
    if (isAlertNumber) {
      const proceed = window.confirm(
        `${emp.full_name}'s WhatsApp is the outlet Manager phone (Settings → WhatsApp).\n\n` +
        `Removing them will clear that number and stop ops alerts until you set a new Manager phone.\n\nContinue?`,
      );
      if (!proceed) return;
    }
    const note = window.prompt(`Reason for removing ${emp.full_name}?`, 'Left the team');
    if (note === null) return;
    try {
      const res = await apiClient.put(`/api/staff/${emp.id}/terminate`, { termination_note: note || 'Left the team' });
      if (res.data?.manager_phone_cleared) {
        setManagerPhone('');
        showToast(`${emp.full_name} removed. Manager phone cleared — set a new one under Settings → WhatsApp.`, 'error');
      } else {
        showToast(`${emp.full_name} has been deactivated`);
      }
      await load();
    } catch (e) { showToast(e.response?.data?.error ?? 'Failed to remove employee', 'error'); }
  };

  const sendPasswordReset = async (emp) => {
    setResetSending(emp.id);
    try {
      const res = await apiClient.post(`/api/staff/${emp.id}/send-password-reset`);
      showToast(res.data?.message ?? `Reset email sent to ${emp.email}`);
    } catch (e) {
      showToast(e.response?.data?.error ?? 'Failed to send reset email', 'error');
    } finally {
      setResetSending(null);
    }
  };

  const ROLE_COLORS = {
    owner:         { bg: '#FEF3C7', color: '#92400E' },
    manager:       { bg: C.primaryLight, color: C.primaryDark },
    kitchen_staff: { bg: '#F0FDF4', color: '#166534' },
    captain:       { bg: '#EFF6FF', color: '#1E40AF' },
    waiter:        { bg: '#FDF4FF', color: '#7E22CE' },
    marketing:     { bg: '#FFF7ED', color: '#9A3412' },
  };

  const NOTIFY_ROLES = STAFF_NOTIFY_ROLES;

  const active     = employees.filter(e => e.is_active);
  const terminated = employees.filter(e => !e.is_active);
  const displayed  = filter === 'active' ? active : terminated;

  if (loading) return <div style={{ padding: 32, textAlign: 'center' }}><Spinner size={28} /></div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
            {active.length} active · {terminated.length} removed
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            Captains get takeaway WhatsApp alerts. Managers/owners get ops alerts via Settings → Manager phone plus their Team WhatsApp. Kitchen and wait staff use the kitchen display only.
          </div>
        </div>
        <Btn onClick={() => setShowForm(s => !s)}>+ Add employee</Btn>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ ...{background: C.primaryLight, border: `0.5px solid ${C.primaryBorder}`, borderRadius: 10, padding: 20, marginBottom: 16} }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.primaryDark, marginBottom: 14 }}>New employee</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><Label required>Full name</Label><Input value={form.full_name} onChange={v => setF('full_name', v)} placeholder="Senthil Kumar" /></div>
            <div>
              <Label required>Role</Label>
              <Select
                value={form.role}
                onChange={v => setF('role', v)}
                options={[{ value: '', label: '— select role —' }, ...roles.map(r => ({ value: r.value, label: r.label }))]}
              />
              {form.role && (
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                  {roles.find(r => r.value === form.role)?.description}
                </div>
              )}
            </div>
            <div><Label required>Login email</Label><Input value={form.email} onChange={v => setF('email', v)} type="email" placeholder="senthil@restaurant.com" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={v => setF('phone', v)} placeholder="9876543210" /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <Label required={NOTIFY_ROLES.includes(form.role)}>
              WhatsApp number
              {NOTIFY_ROLES.includes(form.role) && <span style={{ color: C.success, marginLeft: 6, fontSize: 10 }}>● Required for notifications</span>}
            </Label>
            <Input
              value={form.whatsapp_number}
              onChange={v => setF('whatsapp_number', v)}
              placeholder="919876543210"
            />
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              12 digits including country code (India: 91 + 10-digit mobile). No + or spaces needed.
            </div>
            {form.role && (
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                {{
                  manager:       'Receives ops alerts (with Settings → Manager phone and other active managers)',
                  kitchen_staff: 'Uses kitchen display only — no operational WhatsApp alerts',
                  captain:       'Receives: new takeaway assignment + ready-for-pickup alerts',
                  waiter:        'Uses kitchen display only — no operational WhatsApp alerts',
                  marketing:     'Campaigns only — not live operational alerts',
                  owner:         'Receives all manager ops alerts + billing alerts',
                }[form.role] ?? ''}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={onboard} loading={saving}>Add employee</Btn>
            <Btn variant="ghost" onClick={() => setShowForm(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[['active', `Active (${active.length})`], ['terminated', `Removed (${terminated.length})`]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{
            fontSize: 12, padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
            background: filter === v ? C.text : C.surfaceBg,
            color:      filter === v ? '#fff' : C.textMuted,
            border:     `0.5px solid ${filter === v ? C.text : C.border}`,
          }}>{l}</button>
        ))}
      </div>

      {/* Employee list */}
      {displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: C.textMuted, fontSize: 13 }}>
          {filter === 'active' ? 'No active employees yet. Add your first team member.' : 'No removed employees.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayed.map(emp => {
            const rc        = ROLE_COLORS[emp.role] ?? { bg: C.surfaceBg, color: C.text };
            const isEditing = editingId === emp.id;
            return (
              <div key={emp.id} style={{ background: C.cardBg, border: `0.5px solid ${isEditing ? C.primary : C.border}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color .15s' }}>

                {/* ── Employee summary row ── */}
                <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{emp.full_name}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: rc.bg, color: rc.color }}>
                        {emp.role.replace('_', ' ')}
                      </span>
                      {!emp.is_active && <span style={{ fontSize: 10, color: C.danger }}>● Deactivated</span>}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>
                      {emp.email}
                      {emp.phone          && <span style={{ marginLeft: 10 }}>📞 {emp.phone}</span>}
                      {emp.whatsapp_number && <span style={{ marginLeft: 10 }}>📱 {emp.whatsapp_number}</span>}
                    </div>
                    {emp.terminated_at && (
                      <div style={{ fontSize: 11, color: C.danger, marginTop: 3 }}>
                        Removed {new Date(emp.terminated_at).toLocaleDateString('en-IN')} · {emp.termination_note}
                      </div>
                    )}
                    {emp.is_active && emp.last_login && (
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
                        Last login: {new Date(emp.last_login).toLocaleDateString('en-IN')}
                      </div>
                    )}
                  </div>

                  {emp.is_active && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Btn
                        variant="ghost"
                        style={{ fontSize: 11 }}
                        onClick={() => isEditing ? cancelEdit() : startEdit(emp)}
                      >
                        {isEditing ? 'Cancel' : 'Edit'}
                      </Btn>
                      <Btn
                        variant="ghost"
                        style={{ fontSize: 11 }}
                        loading={resetSending === emp.id}
                        onClick={() => sendPasswordReset(emp)}
                      >
                        Reset password
                      </Btn>
                      <Btn variant="danger" style={{ fontSize: 11 }} onClick={() => removeEmployee(emp)}>
                        Remove
                      </Btn>
                    </div>
                  )}
                </div>

                {/* ── Inline edit form (slides open) ── */}
                {isEditing && (
                  <div style={{ borderTop: `0.5px solid ${C.border}`, background: C.primaryLight, padding: '16px 16px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.primaryDark, marginBottom: 12 }}>
                      Edit employee details
                      <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 400, marginLeft: 8 }}>Email cannot be changed (used for login)</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <Label required>Full name</Label>
                        <Input value={editForm.full_name} onChange={v => setEF('full_name', v)} placeholder="Senthil Kumar" />
                      </div>
                      <div>
                        <Label required>Role</Label>
                        <Select
                          value={editForm.role}
                          onChange={v => setEF('role', v)}
                          options={roles.map(r => ({ value: r.value, label: r.label }))}
                        />
                        {editForm.role && (
                          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
                            {roles.find(r => r.value === editForm.role)?.description}
                          </div>
                        )}
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <Input value={editForm.phone} onChange={v => setEF('phone', v)} placeholder="9876543210" />
                      </div>
                      <div>
                        <Label required={NOTIFY_ROLES.includes(editForm.role)}>
                          WhatsApp number
                          {NOTIFY_ROLES.includes(editForm.role) && (
                            <span style={{ color: C.success, marginLeft: 6, fontSize: 10 }}>● Required for notifications</span>
                          )}
                        </Label>
                        <Input value={editForm.whatsapp_number} onChange={v => setEF('whatsapp_number', v)} placeholder="919876543210" />
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
                          12 digits with country code (e.g. 917305362067).
                        </div>
                        {editForm.role && (
                          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>
                            {{
                              manager:       'Receives ops alerts (Settings → Manager phone + active managers)',
                              kitchen_staff: 'Kitchen display only — no ops WhatsApp',
                              captain:       'Receives: takeaway assignment + ready-for-pickup',
                              waiter:        'Kitchen display only — no ops WhatsApp',
                              marketing:     'Campaigns only',
                              owner:         'All manager ops alerts + billing',
                            }[editForm.role] ?? ''}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn onClick={() => saveEdit(emp)} loading={editSaving}>Save changes</Btn>
                      <Btn variant="ghost" onClick={cancelEdit}>Cancel</Btn>
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ROOT — SettingsPanel
// ═════════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'tables',     label: '🪑 Tables'      },
  { id: 'restaurant', label: '🍽️ Restaurant'  },
  { id: 'services',   label: '🚀 Services'    },
  { id: 'kitchen',    label: '🍳 Kitchen'     },
  { id: 'whatsapp',   label: '💬 WhatsApp'    },
  { id: 'staff',      label: '👥 Staff'       },
  // Brand tab — only visible when user is brand_owner (injected below via filteredTabs)
  { id: 'brand',      label: '🔗 Brand',  brandOnly: true },
];

// ═════════════════════════════════════════════════════════════════════════════
// TAB: Brand (brand_owner only)
// ═════════════════════════════════════════════════════════════════════════════
function TabBrand({ apiClient, showToast, user }) {
  const brandId = user?.brand_id ?? user?.brand?.id ?? null;

  const [brand,   setBrand]   = useState(null);
  const [outlets, setOutlets] = useState([]);
  const [saving,  setSaving]  = useState(false);
  const [pushing, setPushing] = useState(false);
  const [form,    setForm]    = useState({});
  const [newOutlet, setNewOutlet] = useState({ name: '', city: '', outlet_code: '', whatsapp_number: '', phone_number_id: '', access_token: '', table_count: 0 });
  const [showOutletForm, setShowOutletForm] = useState(false);
  const [activeSection, setActiveSection] = useState('brand'); // brand | outlets | waba

  useEffect(() => {
    if (!brandId) return;
    apiClient.get(`/api/brands/${brandId}`).then(r => {
      setBrand(r.data.brand);
      setForm({ name: r.data.brand.name, legal_name: r.data.brand.legal_name ?? '', logo_url: r.data.brand.logo_url ?? '', waba_id: r.data.brand.waba_id ?? '', meta_business_id: r.data.brand.meta_business_id ?? '', contact_phone: r.data.brand.contact_phone ?? '' });
    }).catch(() => {});
    apiClient.get(`/api/brands/${brandId}/outlets`).then(r => setOutlets(r.data.outlets ?? [])).catch(() => {});
  }, [brandId]);

  async function saveBrand() {
    if (!brandId) return;
    setSaving(true);
    try {
      await apiClient.put(`/api/brands/${brandId}`, form);
      showToast('Brand settings saved');
    } catch (e) {
      showToast(e.response?.data?.error ?? 'Save failed', 'error');
    } finally { setSaving(false); }
  }

  async function addOutlet() {
    if (!newOutlet.name.trim()) return;
    setSaving(true);
    try {
      await apiClient.post(`/api/brands/${brandId}/outlets`, newOutlet);
      const r = await apiClient.get(`/api/brands/${brandId}/outlets`);
      setOutlets(r.data.outlets ?? []);
      setNewOutlet({ name: '', city: '', outlet_code: '', whatsapp_number: '', phone_number_id: '', access_token: '', table_count: 0 });
      setShowOutletForm(false);
      showToast('Outlet added');
    } catch (e) {
      showToast(e.response?.data?.error ?? 'Failed to add outlet', 'error');
    } finally { setSaving(false); }
  }

  async function deactivateOutlet(id, name) {
    if (!window.confirm(`Deactivate "${name}"? This will disable the outlet but not delete its data.`)) return;
    try {
      await apiClient.delete(`/api/brands/${brandId}/outlets/${id}`);
      setOutlets(prev => prev.map(o => o.id === id ? { ...o, is_active: false } : o));
      showToast(`${name} deactivated`);
    } catch (e) {
      showToast(e.response?.data?.error ?? 'Failed', 'error');
    }
  }

  if (!brandId) return <p style={{ color: C.textMuted, fontSize: 13, padding: 20 }}>No brand assigned to this account.</p>;

  const F = (label, key, opts = {}) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type={opts.type ?? 'text'}
        value={form[key] ?? ''}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={opts.placeholder ?? ''}
        style={{ width: '100%', padding: '8px 10px', border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 13 }}
      />
    </div>
  );

  const sectionBtns = [
    { id: 'brand',   label: 'Brand' },
    { id: 'outlets', label: 'Outlets' },
    { id: 'waba',    label: 'WABA' },
  ];

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 18, background: C.pageBg, border: `0.5px solid ${C.border}`, borderRadius: 8, padding: 3, width: 'fit-content' }}>
        {sectionBtns.map(b => (
          <button key={b.id} onClick={() => setActiveSection(b.id)} style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: activeSection === b.id ? 500 : 400,
            background: activeSection === b.id ? C.primary : 'transparent',
            color: activeSection === b.id ? '#fff' : C.textMuted, border: 'none',
          }}>{b.label}</button>
        ))}
      </div>

      {/* Brand info */}
      {activeSection === 'brand' && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 14px' }}>Brand Details</p>
          {F('Brand display name *', 'name')}
          {F('Legal / registered name', 'legal_name')}
          {F('Logo URL', 'logo_url', { placeholder: 'https://…' })}
          {F('Contact phone', 'contact_phone')}
          <button onClick={saveBrand} disabled={saving}
            style={{ padding: '8px 22px', background: saving ? '#aaa' : C.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save brand'}
          </button>
        </div>
      )}

      {/* Outlets */}
      {activeSection === 'outlets' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{outlets.length} outlet{outlets.length !== 1 ? 's' : ''}</p>
            <button onClick={() => setShowOutletForm(p => !p)}
              style={{ padding: '6px 14px', background: C.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              {showOutletForm ? '✕ Cancel' : '+ Add outlet'}
            </button>
          </div>

          {showOutletForm && (
            <div style={{ background: '#F4F4F0', padding: 16, borderRadius: 10, marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                {[['Outlet name *', 'name'], ['City', 'city'], ['Short code', 'outlet_code'], ['WhatsApp number', 'whatsapp_number'], ['Meta phone_number_id', 'phone_number_id'], ['Tables to auto-create', 'table_count']].map(([lbl, key]) => (
                  <div key={key}>
                    <label style={{ fontSize: 11, color: C.textMuted, display: 'block', marginBottom: 3 }}>{lbl}</label>
                    <input type={key === 'table_count' ? 'number' : 'text'}
                      value={newOutlet[key]} onChange={e => setNewOutlet(p => ({ ...p, [key]: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', border: `0.5px solid ${C.border}`, borderRadius: 7, fontSize: 13 }} />
                  </div>
                ))}
              </div>
              <button onClick={addOutlet} disabled={saving}
                style={{ padding: '7px 18px', background: C.success, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                {saving ? 'Adding…' : 'Add outlet'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {outlets.map(outlet => (
              <div key={outlet.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: C.pageBg, borderRadius: 10, border: `0.5px solid ${C.border}` }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{outlet.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: C.textMuted }}>{[outlet.outlet_code, outlet.city, outlet.whatsapp_number].filter(Boolean).join(' · ')}</p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: outlet.is_active ? 'rgba(29,158,117,.1)' : '#eee', color: outlet.is_active ? C.success : C.textMuted }}>{outlet.is_active ? 'Active' : 'Inactive'}</span>
                  {outlet.is_active && (
                    <button onClick={() => deactivateOutlet(outlet.id, outlet.name)}
                      style={{ padding: '4px 12px', background: 'transparent', border: `0.5px solid ${C.danger}`, color: C.danger, borderRadius: 7, fontSize: 11, cursor: 'pointer' }}>
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WABA */}
      {activeSection === 'waba' && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 4px' }}>WhatsApp Business Account</p>
          <p style={{ fontSize: 12, color: C.textMuted, margin: '0 0 16px' }}>
            One WABA is shared across all outlets. Each outlet has its own phone number registered under this WABA.
          </p>
          {F('WABA ID', 'waba_id', { placeholder: '567890123456789' })}
          {F('Meta Business Manager ID', 'meta_business_id', { placeholder: '123456789' })}
          <div style={{ background: '#FFF8EC', border: '0.5px solid #F4D78A', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#7A5A00' }}>
            💡 The shared access token for this WABA is set per-outlet via Settings → WhatsApp tab in each outlet's Settings page.
          </div>
          <button onClick={saveBrand} disabled={saving}
            style={{ padding: '8px 22px', background: saving ? '#aaa' : C.primary, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: saving ? 'default' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save WABA settings'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SettingsPanel() {
  const { apiClient, user } = useAuth();
  const { refresh: refreshSubscription, paidFeatures } = useSubscription();
  const [searchParams] = useSearchParams();
  const isBrandOwner = user?.role === 'brand_owner';
  const isManagerOnly = user?.role === 'manager';
  const hasAnyPaid = (...fs) => fs.some(f => paidFeatures.includes(f));
  const [activeTab, setActiveTab] = useState(isManagerOnly ? 'staff' : 'tables');
  const [toast, setToast] = useState({ msg: '', type: 'success' });
  const toastTimer = useRef(null);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some(t => t.id === tab)) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    if (activeTab !== 'kitchen') return;
    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    if (!hash) return;
    const t = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
    return () => window.clearTimeout(t);
  }, [activeTab]);

  const filteredTabs = TABS.filter(t => {
    if (isManagerOnly) return t.id === 'staff';
    if (t.brandOnly && !isBrandOwner) return false;
    if (t.id === 'tables' && !hasAnyPaid(FEATURES.DINE_IN, FEATURES.RESERVE_TABLE)) return false;
    return true;
  });

  useEffect(() => {
    if (!isManagerOnly && !filteredTabs.some(t => t.id === activeTab)) {
      setActiveTab(filteredTabs[0]?.id || 'restaurant');
    }
  }, [activeTab, filteredTabs, isManagerOnly]);

  const dashboardPath = isBrandOwner ? '/dashboard/brand' : '/dashboard/owner';

  const showToast = useCallback((msg, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => {
      setToast({ msg: '', type: 'success' });
      toastTimer.current = null;
    }, 3500);
  }, []);

  const tabContent = {
    tables:     <TabTables     apiClient={apiClient} showToast={showToast} />,
    restaurant: <TabRestaurant apiClient={apiClient} showToast={showToast} />,
    services:   <TabServices   apiClient={apiClient} showToast={showToast} refreshSubscription={refreshSubscription} />,
    kitchen:    <TabKitchen    apiClient={apiClient} showToast={showToast} paidFeatures={paidFeatures} />,
    whatsapp:   <TabWhatsApp   apiClient={apiClient} showToast={showToast} />,
    staff:      <TabStaff      apiClient={apiClient} showToast={showToast} />,
    brand:      <TabBrand      apiClient={apiClient} showToast={showToast} user={user} />,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Toast msg={toast.msg} type={toast.type} />

      {/* Header */}
      <div style={{ background: C.cardBg, borderBottom: `0.5px solid ${C.border}`, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
        <h1 style={{ fontSize: 18, fontWeight: 500, color: C.text, margin: 0 }}>
          {isManagerOnly ? 'Team' : 'Settings'}
        </h1>
        <p style={{ fontSize: 12, color: C.textMuted, margin: '2px 0 0' }}>
          {isManagerOnly
            ? 'Onboard staff and manage WhatsApp numbers for operational alerts'
            : 'Manage your restaurant configuration'}
        </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!isManagerOnly && (
            <Link
              to={dashboardPath}
              style={{ fontSize: 12, color: C.primaryDark, textDecoration: 'none', fontWeight: 500 }}
            >
              ← Back to dashboard
            </Link>
          )}
          {isManagerOnly && (
            <Link
              to="/dashboard/manager"
              style={{ fontSize: 12, color: C.primaryDark, textDecoration: 'none', fontWeight: 500 }}
            >
              ← Back to manager portal
            </Link>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
        {!isManagerOnly && (
        <div style={{ display: 'flex', gap: 3, marginBottom: 20, background: C.cardBg, border: `0.5px solid ${C.border}`, borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
          {filteredTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: activeTab === tab.id ? 500 : 400,
              cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
              background:   activeTab === tab.id ? C.primary     : 'transparent',
              color:        activeTab === tab.id ? '#fff'        : C.textMuted,
              border:       activeTab === tab.id ? `0.5px solid ${C.primaryDark}` : '0.5px solid transparent',
            }}>
              {tab.label}
            </button>
          ))}
        </div>
        )}

        {/* Content card */}
        <div style={CARD}>
          {tabContent[activeTab]}
        </div>
      </div>
    </div>
  );
}
