/**
 * Munafe Supply — navigation IA + role matrix (§3 tree).
 *
 * Groups: Orders / Clients / Catalog / Money (+ Home, Analytics, Settings).
 * Drill-ins (order detail, client account, ratecard) are NOT nav items.
 *
 * Roles: owner | manager | warehouse | delivery | accounts
 *
 * Manager → Money is owner-configurable via suppliers.manager_money_access
 * (default false). Stored on supply_user after login /me.
 */

export const SUPPLY_ROLES = ['owner', 'manager', 'warehouse', 'delivery', 'accounts'];

const MONEY_BASE_ROLES = ['owner', 'accounts'];

function managerMoneyEnabledFromStorage() {
  try {
    const user = JSON.parse(localStorage.getItem('supply_user') || '{}');
    return user.manager_money_access === true;
  } catch {
    return false;
  }
}

function moneyRoles() {
  const roles = [...MONEY_BASE_ROLES];
  if (managerMoneyEnabledFromStorage()) roles.push('manager');
  return roles;
}

/** Flat items used for path → role checks and section rendering. */
export function getSupplyNavSectionsDefinition() {
  return [
    {
      id: 'home',
      label: null,
      items: [
        { label: 'Home', to: '/supply/dashboard', roles: ['owner', 'manager', 'warehouse', 'delivery', 'accounts'] },
      ],
    },
    {
      id: 'orders',
      label: 'Orders',
      items: [
        { label: 'Orders', to: '/supply/orders', roles: ['owner', 'manager', 'warehouse', 'delivery', 'accounts'] },
        { label: 'Picking List', to: '/supply/picking-list', roles: ['owner', 'manager', 'warehouse'] },
        { label: 'Route Sheet', to: '/supply/route-sheet', roles: ['owner', 'manager', 'delivery'] },
      ],
    },
    {
      id: 'clients',
      label: 'Clients',
      items: [
        { label: 'Clients', to: '/supply/clients', roles: ['owner', 'manager'] },
      ],
    },
    {
      id: 'catalog',
      label: 'Catalog',
      items: [
        { label: 'Catalog', to: '/supply/catalog', roles: ['owner', 'manager'] },
      ],
    },
    {
      id: 'money',
      label: 'Money',
      items: [
        { label: 'Payment Claims', to: '/supply/payment-claims', roles: moneyRoles() },
        { label: 'Invoices', to: '/supply/invoices', roles: moneyRoles() },
        { label: 'Statements', to: '/supply/statements', roles: moneyRoles() },
      ],
    },
    {
      id: 'insights',
      label: null,
      items: [
        { label: 'Analytics', to: '/supply/analytics', roles: ['owner', 'manager'] },
        { label: 'Settings', to: '/supply/settings', roles: ['owner'] },
      ],
    },
  ];
}

/** @deprecated use getSupplyNavSectionsDefinition — kept for clarity at call sites */
export const SUPPLY_NAV_SECTIONS = null;

export function getSupplyRoleFromStorage() {
  try {
    const raw = localStorage.getItem('supply_user');
    if (!raw) return 'owner';
    const user = JSON.parse(raw);
    return String(user.role || user.staff_role || 'owner').toLowerCase();
  } catch {
    return 'owner';
  }
}

export function getSupplyUserLabel() {
  try {
    const user = JSON.parse(localStorage.getItem('supply_user') || '{}');
    return user.staff_name || user.business_name || user.name || '';
  } catch {
    return '';
  }
}

function roleAllowed(roles, role) {
  const key = String(role || 'owner').toLowerCase();
  if (key === 'owner') return true;
  return roles.includes(key);
}

/** Sections with only the items visible to this role (empty sections omitted). */
export function getSupplyNavSectionsForRole(role) {
  return getSupplyNavSectionsDefinition()
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => roleAllowed(item.roles, role)),
    }))
    .filter((section) => section.items.length > 0);
}

/** Flat list of allowed nav destinations (legacy helper). */
export function getSupplyNavForRole(role) {
  return getSupplyNavSectionsForRole(role).flatMap((s) => s.items);
}

/**
 * Whether a path is allowed for this role.
 * Drill-ins inherit parent list permissions.
 */
export function isSupplyPathAllowed(pathname, role) {
  const path = String(pathname || '');
  const key = String(role || 'owner').toLowerCase();
  if (key === 'owner') return true;

  const money = moneyRoles();
  const prefixes = [
    { match: '/supply/orders', roles: ['owner', 'manager', 'warehouse', 'delivery', 'accounts'] },
    { match: '/supply/picking-list', roles: ['owner', 'manager', 'warehouse'] },
    { match: '/supply/route-sheet', roles: ['owner', 'manager', 'delivery'] },
    { match: '/supply/clients', roles: ['owner', 'manager'] },
    { match: '/supply/catalog', roles: ['owner', 'manager'] },
    { match: '/supply/payment-claims', roles: money },
    { match: '/supply/invoices', roles: money },
    { match: '/supply/statements', roles: money },
    { match: '/supply/analytics', roles: ['owner', 'manager'] },
    { match: '/supply/settings', roles: ['owner'] },
    { match: '/supply/dashboard', roles: ['owner', 'manager', 'warehouse', 'delivery', 'accounts'] },
  ];

  if (/\/supply\/orders\/picking\//.test(path)) {
    return roleAllowed(['owner', 'manager', 'warehouse'], key);
  }
  if (/\/supply\/orders\/route\//.test(path)) {
    return roleAllowed(['owner', 'manager', 'delivery'], key);
  }

  for (const { match, roles } of prefixes) {
    if (path === match || path.startsWith(`${match}/`)) {
      return roleAllowed(roles, key);
    }
  }
  return false;
}

export function canManageSupplyStaff(role) {
  return String(role || '').toLowerCase() === 'owner';
}

export function canEditSupplyProfile(role) {
  return String(role || '').toLowerCase() === 'owner';
}
