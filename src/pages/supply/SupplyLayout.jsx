// ============================================================================
// Munafe Supply — shared layout (Autom8 brand chrome + grouped sidebar IA)
// ============================================================================

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import BrandHeader from '../../components/BrandHeader';
import { C, FONTS } from '../../theme/brand';
import {
  getSupplyNavSectionsForRole,
  getSupplyRoleFromStorage,
  getSupplyUserLabel,
  isSupplyPathAllowed,
} from './supplyRoles';

export default function SupplyLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [role] = useState(() => getSupplyRoleFromStorage());
  const [label] = useState(() => getSupplyUserLabel());
  const [businessName] = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('supply_user') || '{}');
      return u.business_name || u.name || 'Munafe Supply';
    } catch {
      return 'Munafe Supply';
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const sections = getSupplyNavSectionsForRole(role);

  useEffect(() => {
    const token = localStorage.getItem('supply_token');
    if (!token) {
      navigate('/supply/login', { replace: true });
      return;
    }
    if (!isSupplyPathAllowed(location.pathname, role)) {
      navigate('/supply/dashboard', { replace: true });
    }
  }, [location.pathname, navigate, role]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const logout = () => {
    localStorage.removeItem('supply_token');
    localStorage.removeItem('supply_refresh_token');
    localStorage.removeItem('supply_user');
    navigate('/supply/login', { replace: true });
  };

  const headerBtn = {
    fontSize: 12,
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: 8,
    border: '0.5px solid rgba(255,255,255,0.35)',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    textDecoration: 'none',
    cursor: 'pointer',
    fontFamily: FONTS.body,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: FONTS.body, color: C.text }}>
      <style>{layoutCss}</style>

      <BrandHeader
        brandTo="/supply/dashboard"
        title={businessName}
        subtitle={`Supply portal · ${role}${label ? ` · ${label}` : ''}`}
        right={
          <>
            <button
              type="button"
              className="supply-mobile-menu"
              style={headerBtn}
              onClick={() => setMobileOpen((v) => !v)}
            >
              Menu
            </button>
            <button
              type="button"
              onClick={logout}
              style={{
                ...headerBtn,
                border: `0.5px solid ${C.dangerBorder}`,
                background: C.dangerLight,
                color: C.dangerDark,
              }}
            >
              Sign out
            </button>
          </>
        }
      />

      <div className="supply-body">
        {mobileOpen && (
          <button
            type="button"
            className="supply-backdrop"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside className={`supply-aside${mobileOpen ? ' is-open' : ''}`}>
          <nav className="supply-nav">
            {sections.map((section) => (
              <div key={section.id} className="supply-section">
                {section.label && <div className="supply-section-label">{section.label}</div>}
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `supply-link${isActive ? ' is-active' : ''}`}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <main className="supply-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const layoutCss = `
.supply-body {
  display: flex;
  align-items: flex-start;
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
  min-height: calc(100vh - 64px);
}
.supply-aside {
  width: 220px;
  flex-shrink: 0;
  margin: 16px 0 16px 16px;
  padding: 14px 10px;
  background: ${C.cardBg};
  border: 0.5px solid ${C.border};
  border-radius: 12px;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  z-index: 20;
}
.supply-nav {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.supply-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.supply-section-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: ${C.textMuted};
  padding: 4px 10px 6px;
  font-family: ${FONTS.body};
}
.supply-link {
  display: block;
  padding: 8px 10px;
  border-radius: 8px;
  color: ${C.textSub};
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  font-family: ${FONTS.body};
}
.supply-link:hover {
  background: ${C.surfaceBg};
  color: ${C.text};
}
.supply-link.is-active {
  background: ${C.primaryLight};
  color: ${C.primaryDark};
  font-weight: 600;
  border: 0.5px solid ${C.primaryBorder};
}
.supply-main {
  flex: 1;
  min-width: 0;
  padding: 16px 16px 32px;
}
.supply-backdrop {
  display: none;
}
.supply-mobile-menu {
  display: none;
}
@media (max-width: 900px) {
  .supply-mobile-menu { display: inline-flex !important; }
  .supply-aside {
    position: fixed;
    left: 12px;
    top: 72px;
    margin: 0;
    width: min(280px, calc(100vw - 24px));
    max-height: calc(100vh - 96px);
    transform: translateX(-120%);
    transition: transform .2s ease;
    box-shadow: 0 12px 40px rgba(22, 21, 18, 0.18);
  }
  .supply-aside.is-open { transform: translateX(0); }
  .supply-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    border: 0;
    background: rgba(22, 21, 18, 0.35);
    z-index: 15;
    cursor: pointer;
  }
  .supply-main { padding: 12px 12px 28px; }
}
`;
