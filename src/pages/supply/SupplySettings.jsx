import { resolveSupplyApiBase } from '../../config/api';
import { useEffect, useState } from 'react';
import { C, FONTS } from '../../theme/brand';
import {
  canEditSupplyProfile,
  canManageSupplyStaff,
  getSupplyRoleFromStorage,
} from './supplyRoles';

const API = resolveSupplyApiBase();
const ROLES = ['owner', 'manager', 'warehouse', 'delivery', 'accounts'];

function token() {
  return localStorage.getItem('supply_token') || '';
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function SupplySettings() {
  const role = getSupplyRoleFromStorage();
  const canEdit = canEditSupplyProfile(role);
  const canStaff = canManageSupplyStaff(role);

  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [staff, setStaff] = useState([]);
  const [staffError, setStaffError] = useState('');
  const [staffMessage, setStaffMessage] = useState('');
  const [invite, setInvite] = useState({ name: '', email: '', phone: '', role: 'warehouse' });
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    apiFetch('/api/supply/auth/me')
      .then((data) => {
        setForm(data.supplier || {});
        if (data.role || data.staff_role) {
          try {
            const existing = JSON.parse(localStorage.getItem('supply_user') || '{}');
            localStorage.setItem('supply_user', JSON.stringify({
              ...existing,
              ...data.supplier,
              role: data.role || data.staff_role,
              staff_role: data.staff_role || data.role,
              staff_id: data.staff?.id || existing.staff_id || null,
              staff_name: data.staff?.name || existing.staff_name || null,
            }));
          } catch { /* ignore */ }
        }
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!canStaff) return;
    apiFetch('/api/supply/staff')
      .then((data) => setStaff(data.staff || []))
      .catch((err) => setStaffError(err.message));
  }, [canStaff]);

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await apiFetch('/api/supply/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setForm(data.supplier || form);
      try {
        const existing = JSON.parse(localStorage.getItem('supply_user') || '{}');
        localStorage.setItem('supply_user', JSON.stringify({
          ...existing,
          ...(data.supplier || {}),
          manager_money_access: Boolean(data.supplier?.manager_money_access),
        }));
      } catch { /* ignore */ }
      setMessage('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const loadStaff = async () => {
    const data = await apiFetch('/api/supply/staff');
    setStaff(data.staff || []);
  };

  const inviteStaff = async (e) => {
    e.preventDefault();
    setInviting(true);
    setStaffError('');
    setStaffMessage('');
    try {
      await apiFetch('/api/supply/staff', {
        method: 'POST',
        body: JSON.stringify(invite),
      });
      setInvite({ name: '', email: '', phone: '', role: 'warehouse' });
      setStaffMessage('Invite sent. They will receive a password-set email.');
      await loadStaff();
    } catch (err) {
      setStaffError(err.message);
    } finally {
      setInviting(false);
    }
  };

  const setStaffRole = async (id, nextRole) => {
    setStaffError('');
    try {
      await apiFetch(`/api/supply/staff/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ role: nextRole }),
      });
      await loadStaff();
    } catch (err) {
      setStaffError(err.message);
    }
  };

  const deactivateStaff = async (id) => {
    if (!window.confirm('Deactivate this staff account?')) return;
    setStaffError('');
    try {
      await apiFetch(`/api/supply/staff/${id}`, { method: 'DELETE' });
      await loadStaff();
    } catch (err) {
      setStaffError(err.message);
    }
  };

  return (
    <main style={styles.page}>
      <div style={styles.topRow}>
        <h1 style={styles.title}>Settings</h1>
      </div>
      <p style={styles.roleLine}>Signed in as <strong>{role}</strong></p>

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <section style={styles.form}>
        <h2 style={styles.sectionTitle}>Business profile</h2>
        {!canEdit && (
          <p style={styles.hint}>Only owners can edit business settings. Contact your admin for changes.</p>
        )}
        <Field label="Business name" value={form.business_name || ''} onChange={set('business_name')} disabled={!canEdit} />
        <Field label="Phone" value={form.phone || ''} onChange={set('phone')} disabled={!canEdit} />
        <Field label="WABA phone" value={form.waba_phone || ''} onChange={set('waba_phone')} disabled={!canEdit} />
        <Field label="GSTIN" value={form.gstin || ''} onChange={set('gstin')} disabled={!canEdit} />
        <Field
          label="Ordering open"
          type="time"
          value={(form.ordering_open_time || '18:00').slice(0, 5)}
          onChange={set('ordering_open_time')}
          disabled={!canEdit}
        />
        <Field
          label="Ordering cutoff"
          type="time"
          value={(form.ordering_cutoff_time || '22:00').slice(0, 5)}
          onChange={set('ordering_cutoff_time')}
          disabled={!canEdit}
        />
        <label style={styles.check}>
          <input type="checkbox" checked={Boolean(form.always_open)} onChange={set('always_open')} disabled={!canEdit} />
          Always open
        </label>
        <label style={styles.check}>
          <input
            type="checkbox"
            checked={Boolean(form.manager_money_access)}
            onChange={set('manager_money_access')}
            disabled={!canEdit}
          />
          Allow managers to access Money (claims, invoices, statements)
        </label>
        <p style={styles.hint}>
          Off by default. When on, staff with the manager role can open the Money section; accounts and owner always can.
        </p>
        {canEdit && (
          <button type="button" style={styles.button} onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        )}
      </section>

      {canStaff && (
        <section style={styles.staffSection}>
          <h2 style={styles.sectionTitle}>Staff</h2>
          <p style={styles.hint}>Invite warehouse, delivery, accounts, or managers. Each gets their own login.</p>
          {staffError && <div style={styles.error}>{staffError}</div>}
          {staffMessage && <div style={styles.success}>{staffMessage}</div>}

          <form onSubmit={inviteStaff} style={styles.inviteForm}>
            <Field
              label="Name"
              value={invite.name}
              onChange={(e) => setInvite((c) => ({ ...c, name: e.target.value }))}
              required
            />
            <Field
              label="Email"
              type="email"
              value={invite.email}
              onChange={(e) => setInvite((c) => ({ ...c, email: e.target.value }))}
              required
            />
            <Field
              label="Phone"
              value={invite.phone}
              onChange={(e) => setInvite((c) => ({ ...c, phone: e.target.value }))}
            />
            <label style={styles.field}>
              <span style={styles.label}>Role</span>
              <select
                style={styles.input}
                value={invite.role}
                onChange={(e) => setInvite((c) => ({ ...c, role: e.target.value }))}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <button type="submit" style={styles.button} disabled={inviting}>
              {inviting ? 'Inviting…' : 'Invite staff'}
            </button>
          </form>

          <div style={styles.staffList}>
            {staff.length === 0 && <p style={styles.hint}>No staff rows yet. Invite someone, or run the owner backfill SQL after deploy.</p>}
            {staff.map((row) => (
              <div key={row.id} style={styles.staffRow}>
                <div>
                  <div style={styles.staffName}>{row.name}</div>
                  <div style={styles.staffMeta}>{row.email} · {row.is_active ? 'active' : 'inactive'}</div>
                </div>
                <div style={styles.staffActions}>
                  <select
                    style={styles.roleSelect}
                    value={row.role}
                    disabled={!row.is_active}
                    onChange={(e) => setStaffRole(row.id, e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  {row.is_active && (
                    <button type="button" style={styles.dangerBtn} onClick={() => deactivateStaff(row.id)}>
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Field({ label, ...props }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <input style={styles.input} {...props} />
    </label>
  );
}

const styles = {
  page: { maxWidth: 720, margin: '0 auto', fontFamily: FONTS.body },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { margin: 0, fontSize: 24, fontFamily: FONTS.heading, fontWeight: 600, color: C.text },
  roleLine: { margin: '0 0 16px', color: C.textMuted, fontSize: 13 },
  sectionTitle: { margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: C.text },
  form: { display: 'grid', gap: 12, marginBottom: 28 },
  field: { display: 'grid', gap: 5 },
  label: { fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' },
  input: {
    padding: '9px 11px',
    border: `0.5px solid ${C.border}`,
    borderRadius: 8,
    fontSize: 14,
    background: C.cardBg,
    color: C.text,
    fontFamily: FONTS.body,
  },
  check: { display: 'flex', gap: 8, alignItems: 'center', color: C.textSub, fontSize: 14 },
  button: {
    width: 160,
    padding: 10,
    border: `0.5px solid ${C.primaryDark}`,
    borderRadius: 8,
    background: C.primary,
    color: '#fff',
    fontWeight: 600,
    fontFamily: FONTS.body,
    cursor: 'pointer',
  },
  error: { marginBottom: 12, padding: 12, borderRadius: 8, background: C.dangerLight, border: `0.5px solid ${C.dangerBorder}`, color: C.dangerDark },
  success: { marginBottom: 12, padding: 12, borderRadius: 8, background: C.successLight, border: `0.5px solid ${C.successBorder}`, color: C.successDark },
  hint: { margin: '0 0 12px', color: C.textMuted, fontSize: 13 },
  staffSection: { borderTop: `0.5px solid ${C.border}`, paddingTop: 20 },
  inviteForm: { display: 'grid', gap: 10, marginBottom: 20 },
  staffList: { display: 'grid', gap: 10 },
  staffRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    padding: 12,
    border: `0.5px solid ${C.border}`,
    borderRadius: 10,
    background: C.cardBg,
  },
  staffName: { fontWeight: 600, color: C.text },
  staffMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  staffActions: { display: 'flex', gap: 8, alignItems: 'center' },
  roleSelect: {
    padding: '6px 8px',
    borderRadius: 8,
    border: `0.5px solid ${C.border}`,
    fontSize: 13,
    background: C.cardBg,
    color: C.text,
  },
  dangerBtn: {
    padding: '6px 10px',
    border: `0.5px solid ${C.dangerBorder}`,
    borderRadius: 8,
    background: C.dangerLight,
    color: C.dangerDark,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
