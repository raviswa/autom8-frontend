import { isSupplyPortalLob } from '../config/dashboardProfiles';

const ROLE_HOME = {
  brand_owner: '/dashboard/brand',
  brand_manager: '/dashboard/brand',
  owner: '/dashboard/owner',
  manager: '/dashboard/manager',
  kitchen_staff: '/dashboard/kitchen',
  packing_staff: '/dashboard/packing',
  dispatch_staff: '/dashboard/packing',
  sales_staff: '/dashboard/manager',
  marketing: '/dashboard/marketing',
  captain: '/dashboard/captain',
  waiter: '/dashboard/kitchen',
};

/** Informational landing for lob_type=supply (tenant portal ≠ supply ops). */
export const SUPPLY_INFO_PATH = '/dashboard/supply-info';

/**
 * Post-login / default home for an Autom8 employee session.
 * Supply-portal tenants never land on restaurant ops screens.
 */
export function resolveEmployeeHomePath(user) {
  if (!user) return '/login';
  if (isSupplyPortalLob(user.lob_type)) return SUPPLY_INFO_PATH;
  return ROLE_HOME[user.role] ?? `/dashboard/${user.role}`;
}
