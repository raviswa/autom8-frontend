import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || '';

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
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/supply/auth/me')
      .then(data => setForm(data.supplier || {}))
      .catch(err => setError(err.message));
  }, []);

  const set = key => event => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm(current => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await apiFetch('/api/supply/profile/profile', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      setForm(data.supplier || form);
      setMessage('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={styles.page}>
      <h1 style={styles.title}>Settings</h1>
      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <section style={styles.form}>
        <Field label="Business name" value={form.business_name || ''} onChange={set('business_name')} />
        <Field label="Phone" value={form.phone || ''} onChange={set('phone')} />
        <Field label="WABA phone" value={form.waba_phone || ''} onChange={set('waba_phone')} />
        <Field label="GSTIN" value={form.gstin || ''} onChange={set('gstin')} />
        <Field label="Ordering open" type="time" value={(form.ordering_open_time || '18:00').slice(0, 5)} onChange={set('ordering_open_time')} />
        <Field label="Ordering cutoff" type="time" value={(form.ordering_cutoff_time || '22:00').slice(0, 5)} onChange={set('ordering_cutoff_time')} />
        <label style={styles.check}>
          <input type="checkbox" checked={Boolean(form.always_open)} onChange={set('always_open')} />
          Always open
        </label>
        <button type="button" style={styles.button} onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </section>
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
  page: { maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: "'Inter', system-ui, sans-serif" },
  title: { margin: '0 0 18px', fontSize: 26, color: '#0f172a' },
  form: { display: 'grid', gap: 12 },
  field: { display: 'grid', gap: 5 },
  label: { fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase' },
  input: { padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 },
  check: { display: 'flex', gap: 8, alignItems: 'center', color: '#334155', fontSize: 14 },
  button: { width: 150, padding: 10, border: 0, borderRadius: 8, background: '#2563eb', color: '#fff', fontWeight: 700 },
  error: { marginBottom: 12, padding: 12, borderRadius: 8, background: '#fef2f2', color: '#b91c1c' },
  success: { marginBottom: 12, padding: 12, borderRadius: 8, background: '#ecfdf5', color: '#047857' },
};
