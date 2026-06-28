import { resolveSupplyApiBase } from '../../config/api';
import { useEffect, useState } from 'react';

const API = resolveSupplyApiBase();

function token() {
  return localStorage.getItem('supply_token') || '';
}

async function apiFetch(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function SupplyAnalytics() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/supply/statements/credit-book')
      .then(data => setSummary(data.summary || data))
      .catch(err => setError(err.message));
  }, []);

  return (
    <main style={styles.page}>
      <h1 style={styles.title}>Analytics</h1>
      {error && <div style={styles.error}>{error}</div>}
      <section style={styles.grid}>
        <Metric label="Total outstanding" value={summary?.total_outstanding} prefix="Rs " />
        <Metric label="Overdue clients" value={summary?.overdue_count} />
        <Metric label="Active clients" value={summary?.client_count || summary?.total_clients} />
      </section>
    </main>
  );
}

function Metric({ label, value, prefix = '' }) {
  return (
    <div style={styles.card}>
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{prefix}{Number(value || 0).toLocaleString('en-IN')}</div>
    </div>
  );
}

const styles = {
  page: { maxWidth: 1000, margin: '0 auto', padding: 24, fontFamily: "'Inter', system-ui, sans-serif" },
  title: { margin: '0 0 18px', fontSize: 26, color: '#0f172a' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 },
  card: { border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', padding: 16 },
  label: { color: '#64748b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' },
  value: { marginTop: 8, fontSize: 24, fontWeight: 800, color: '#0f172a' },
  error: { marginBottom: 12, padding: 12, borderRadius: 8, background: '#fef2f2', color: '#b91c1c' },
};
