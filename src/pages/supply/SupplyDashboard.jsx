import { resolveSupplyApiBase } from '../../config/api';
import { Link } from 'react-router-dom';

const navItems = [
  ['Orders', '/supply/orders'],
  ['Picking List', '/supply/picking-list'],
  ['Route Sheet', '/supply/route-sheet'],
  ['Clients', '/supply/clients'],
  ['Catalog', '/supply/catalog'],
  ['Payment Claims', '/supply/payment-claims'],
  ['Invoices', '/supply/invoices'],
  ['Statements', '/supply/statements'],
  ['Analytics', '/supply/analytics'],
  ['Settings', '/supply/settings'],
];

export default function SupplyDashboard() {
  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <h1 style={styles.title}>Munafe Supply</h1>
          <p style={styles.subtitle}>Run orders, credit, delivery, and client operations from one place.</p>
        </div>
      </section>

      <section style={styles.grid}>
        {navItems.map(([label, to]) => (
          <Link key={to} to={to} style={styles.tile}>
            <span style={styles.tileLabel}>{label}</span>
            <span style={styles.tileArrow}>Open</span>
          </Link>
        ))}
      </section>
    </main>
  );
}

const styles = {
  page: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: 24,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: '#0f172a',
  },
  subtitle: {
    margin: '6px 0 0',
    color: '#64748b',
    fontSize: 14,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: 12,
  },
  tile: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 76,
    padding: 16,
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    background: '#fff',
    color: '#0f172a',
    textDecoration: 'none',
  },
  tileLabel: {
    fontWeight: 700,
  },
  tileArrow: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: 700,
  },
};
