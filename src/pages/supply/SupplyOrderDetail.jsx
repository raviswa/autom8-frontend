import { resolveSupplyApiBase } from '../../config/api';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

const API = resolveSupplyApiBase();

export default function SupplyOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('supply_token') || '';
    fetch(`${API}/api/supply/orders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Request failed');
        setOrder(data);
      })
      .catch(err => setError(err.message));
  }, [id]);

  return (
    <main style={styles.page}>
      <Link to="/supply/orders" style={styles.back}>Back to orders</Link>
      {error && <div style={styles.error}>{error}</div>}
      {!error && !order && <p>Loading...</p>}
      {order && (
        <>
          <h1 style={styles.title}>{order.order_number}</h1>
          <p style={styles.meta}>{order.supply_clients?.name} - {order.status}</p>
          <section style={styles.card}>
            {(order.supply_order_items || []).map(item => (
              <div key={item.id} style={styles.row}>
                <span>{item.item_name}</span>
                <span>{item.qty_ordered} {item.unit}</span>
                <strong>Rs {Number(item.line_total || 0).toFixed(2)}</strong>
              </div>
            ))}
            <div style={styles.total}>Total: Rs {Number(order.total_amount || 0).toFixed(2)}</div>
          </section>
        </>
      )}
    </main>
  );
}

const styles = {
  page: { maxWidth: 760, margin: '0 auto', padding: 24, fontFamily: "'Inter', system-ui, sans-serif" },
  back: { color: '#2563eb', textDecoration: 'none', fontWeight: 700, fontSize: 13 },
  title: { margin: '14px 0 4px', fontSize: 26, color: '#0f172a' },
  meta: { color: '#64748b', marginTop: 0 },
  card: { border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', padding: 14 },
  row: { display: 'grid', gridTemplateColumns: '1fr 110px 110px', gap: 8, padding: '10px 0', borderBottom: '1px solid #f1f5f9' },
  total: { textAlign: 'right', marginTop: 14, fontWeight: 800, color: '#0f172a' },
  error: { marginTop: 12, padding: 12, borderRadius: 8, background: '#fef2f2', color: '#b91c1c' },
};
