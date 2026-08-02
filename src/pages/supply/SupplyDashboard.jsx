import { Link } from 'react-router-dom';
import { C, FONTS } from '../../theme/brand';
import {
  getSupplyNavSectionsForRole,
  getSupplyRoleFromStorage,
  getSupplyUserLabel,
} from './supplyRoles';

/**
 * Home — loop overview + role-visible shortcuts (sidebar is primary nav).
 */
export default function SupplyDashboard() {
  const role = getSupplyRoleFromStorage();
  const label = getSupplyUserLabel();
  const sections = getSupplyNavSectionsForRole(role).filter((s) => s.id !== 'home');

  return (
    <div style={styles.page}>
      <section style={styles.header}>
        <h1 style={styles.title}>Home</h1>
        <p style={styles.subtitle}>
          {label ? `Welcome, ${label}. ` : ''}
          Run the supply loop: catalog & clients → orders → fulfilment → money.
        </p>
        <p style={styles.role}>
          Signed in as <strong style={{ color: C.primaryDark, textTransform: 'capitalize' }}>{role}</strong>
        </p>
      </section>

      <section style={styles.loop}>
        {['1. Catalog & pricing', '2. Orders come in', '3. Fulfil & deliver', '4. Invoice & get paid'].map((step, i) => (
          <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {i > 0 && <span style={styles.arrow}>→</span>}
            <div style={styles.step}>{step}</div>
          </div>
        ))}
      </section>

      <section style={styles.groups}>
        {sections.map((section) => (
          <div key={section.id} style={styles.group}>
            <h2 style={styles.groupTitle}>{section.label || 'More'}</h2>
            <div style={styles.grid}>
              {section.items.map((item) => (
                <Link key={item.to} to={item.to} style={styles.tile}>
                  <span style={styles.tileLabel}>{item.label}</span>
                  <span style={styles.tileArrow}>Open</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 960,
    margin: '0 auto',
  },
  header: { marginBottom: 18 },
  title: {
    margin: 0,
    fontFamily: FONTS.heading,
    fontSize: 26,
    fontWeight: 600,
    color: C.text,
  },
  subtitle: {
    margin: '8px 0 0',
    color: C.textSub,
    fontSize: 14,
    maxWidth: 560,
    lineHeight: 1.45,
  },
  role: {
    margin: '10px 0 0',
    fontSize: 13,
    color: C.textMuted,
  },
  loop: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginBottom: 24,
    padding: 14,
    background: C.cardBg,
    border: `0.5px solid ${C.border}`,
    borderRadius: 12,
  },
  step: {
    fontSize: 12,
    fontWeight: 600,
    color: C.primaryDark,
    padding: '6px 10px',
    background: C.primaryLight,
    border: `0.5px solid ${C.primaryBorder}`,
    borderRadius: 999,
  },
  arrow: { color: C.textMuted, fontWeight: 600, fontSize: 13 },
  groups: { display: 'grid', gap: 20 },
  group: {},
  groupTitle: {
    margin: '0 0 10px',
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: C.textMuted,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 10,
  },
  tile: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 64,
    padding: 14,
    border: `0.5px solid ${C.border}`,
    borderRadius: 10,
    background: C.cardBg,
    color: C.text,
    textDecoration: 'none',
  },
  tileLabel: { fontWeight: 600, fontSize: 14 },
  tileArrow: { color: C.primary, fontSize: 12, fontWeight: 600 },
};
