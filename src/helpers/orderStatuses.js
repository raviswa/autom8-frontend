// Shared active order statuses for floor occupancy + auto-release.
// MUST stay in sync with autom8-backend-main/src/helpers/tableRelease.js ACTIVE_ORDER_STATUSES.
// Include `ready` so Manager floor and the 45-min release job agree.

export const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'in_progress', 'ready'];
