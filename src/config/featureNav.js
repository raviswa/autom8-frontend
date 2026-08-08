/**
 * Canonical feature routes — one destination per capability across LOBs.
 * Owner / Manager / Account chips deep-link here only (no duplicate UIs).
 */

import { isB2bLob, isPackagedLob } from './dashboardProfiles';

export const FEATURE_ROUTES = {
  ownerHome: '/dashboard/owner',
  managerHome: '/dashboard/manager',
  catalog: '/dashboard/menu',
  kitchen: '/dashboard/kitchen',
  packing: '/dashboard/packing',
  captain: '/dashboard/captain',
  business: '/settings?tab=restaurant',
  fulfillment: '/settings?tab=kitchen',
  fulfillmentHours: '/settings?tab=kitchen#scheduled-ordering',
  services: '/settings?tab=services',
  promotions: '/settings?tab=promotions',
  team: '/settings?tab=staff',
  whatsapp: '/account?tab=whatsapp',
  billing: '/billing',
  account: '/account',
};

/** @param {string|null|undefined} lobType */
export function catalogLabel(lobType) {
  return isPackagedLob(lobType) || isB2bLob(lobType) ? 'Catalog' : 'Menu';
}

/** @param {string|null|undefined} lobType */
export function fulfillmentHoursLabel(lobType) {
  return isPackagedLob(lobType) || isB2bLob(lobType) ? 'Order hours' : 'Kitchen hours';
}

/** @param {string|null|undefined} lobType */
export function businessSettingsLabel(lobType) {
  return isPackagedLob(lobType) || isB2bLob(lobType) ? 'Business' : 'Settings';
}

/**
 * Owner dashboard nav chips — one entry per feature cluster.
 * @param {{ lobType?: string, hasTakeaway?: boolean }} opts
 */
export function ownerNavChips({ lobType, hasTakeaway = false } = {}) {
  const packaged = isPackagedLob(lobType);
  const b2b = isB2bLob(lobType);
  const chips = [
    { id: 'manager', to: FEATURE_ROUTES.managerHome, label: 'Manager' },
  ];

  if (!packaged && !b2b) {
    chips.push({ id: 'kitchen', to: FEATURE_ROUTES.kitchen, label: 'Kitchen' });
  }

  chips.push({ id: 'packing', to: FEATURE_ROUTES.packing, label: 'Packing' });

  // Restaurant always; packaged only when takeaway is enabled; never B2B
  if (!b2b && (!packaged || hasTakeaway)) {
    chips.push({ id: 'captain', to: FEATURE_ROUTES.captain, label: 'Captain' });
  }

  chips.push(
    { id: 'catalog', to: FEATURE_ROUTES.catalog, label: catalogLabel(lobType) },
    { id: 'hours', to: FEATURE_ROUTES.fulfillmentHours, label: fulfillmentHoursLabel(lobType) },
    { id: 'business', to: FEATURE_ROUTES.business, label: businessSettingsLabel(lobType) },
    { id: 'whatsapp', to: FEATURE_ROUTES.whatsapp, label: 'WhatsApp' },
    { id: 'account', to: FEATURE_ROUTES.account, label: 'Account' },
  );

  return chips;
}

/**
 * Manager portal header links (not kitchen open/busy toggles).
 * @param {{ lobType?: string }} opts
 */
export function managerHeaderLinks({ lobType } = {}) {
  return [
    {
      id: 'hours',
      to: FEATURE_ROUTES.fulfillmentHours,
      label: `${fulfillmentHoursLabel(lobType)} →`,
    },
    {
      id: 'catalog',
      to: FEATURE_ROUTES.catalog,
      label: `${catalogLabel(lobType)} →`,
    },
    {
      id: 'team',
      to: FEATURE_ROUTES.team,
      label: 'Team',
    },
  ];
}

/**
 * Manager ops tabs only (no embedded catalog editor).
 * @param {{ lobType?: string }} opts
 */
export function managerOpsTabs({ lobType } = {}) {
  if (isPackagedLob(lobType) || isB2bLob(lobType)) {
    return [
      { key: 'orders', label: 'Active orders' },
      { key: 'reports', label: 'Reports' },
    ];
  }
  return [
    { key: 'queue', label: 'Queue' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'tables', label: 'Tables' },
    { key: 'orders', label: 'Active orders' },
    { key: 'reports', label: 'Reports' },
  ];
}
