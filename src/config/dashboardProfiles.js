/**
 * Owner dashboard profiles by lob_type.
 *
 * Matrix (additive — refine per LOB in follow-ups):
 * - restaurant: tables, queue, KOT, dining KPIs, session outcomes
 * - food_products: commerce Live + SKU analytics (template for packaged)
 * - retail / jewellery / b2b / psl: currently inherit packagedCommerce
 *   (psl may later need a kitchen-aware hybrid)
 */

const PACKAGED_LOBS = ['food_products', 'psl', 'retail', 'b2b', 'jewellery'];

/** Restaurant baseline — full dining chrome. */
const restaurant = {
  id: 'restaurant',
  isPackaged: false,
  showTablesLive: true,
  showKot: true,
  showCourierQueue: false,
  showCommerceLive: false,
  showDiningKpis: true,
  showSessionOutcomes: true,
  showOrderCancels: true,
  showKotAnalytics: true,
  fourthKpi: 'covers', // Total covers
  kpiRow2: 'dining',
  topItemsTitle: 'Top menu items',
  itemPerfTitle: 'Item performance',
  insightsCopy: 'restaurant',
  insightsSections: {
    returning: true,
    visitFrequency: true,
    recency: true,
    topCustomers: true,
    combos: true,
    stockOutages: true,
    quadrant: true,
  },
  copy: {
    visitFrequencyTitle: 'Visit frequency',
    visitFrequencySub: 'Based on phone numbers on paid orders',
    avgBetweenLabel: 'Avg days between visits',
    topByVisitsTitle: 'Top customers by visits',
    quadrantTitle: 'Menu engineering quadrant',
    quadrantSub: 'Stars · Hidden gems · Fillers · Dead weight (paid)',
    insightsBlurb: 'Actionable analytics for staffing, menu, and WhatsApp retention · paid revenue only',
  },
};

/**
 * Packaged commerce (food_products template).
 * Shared by retail / jewellery / b2b / psl until LOB-specific splits land.
 */
const packagedCommerce = {
  id: 'packagedCommerce',
  isPackaged: true,
  showTablesLive: false,
  showKot: false,
  showCourierQueue: true,
  showCommerceLive: true,
  showDiningKpis: false,
  showSessionOutcomes: false,
  showOrderCancels: true,
  showKotAnalytics: false,
  fourthKpi: 'uniqueCustomers',
  kpiRow2: 'commerce',
  topItemsTitle: 'Top SKUs',
  itemPerfTitle: 'SKU performance',
  insightsCopy: 'commerce',
  insightsSections: {
    returning: true,
    visitFrequency: true,
    recency: true,
    topCustomers: true,
    combos: true,
    stockOutages: true,
    quadrant: true,
  },
  copy: {
    visitFrequencyTitle: 'Order frequency',
    visitFrequencySub: 'Based on phone numbers on paid orders',
    avgBetweenLabel: 'Avg days between orders',
    topByVisitsTitle: 'Top customers by orders',
    quadrantTitle: 'Catalog engineering',
    quadrantSub: 'Stars · Hidden gems · Fillers · Dead weight (paid)',
    insightsBlurb: 'Catalog, repeat buyers, and WhatsApp retention · paid revenue only',
  },
};

/** food_products explicitly uses the commerce template (same object; id for clarity). */
const food_products = {
  ...packagedCommerce,
  id: 'food_products',
};

const BY_LOB = {
  restaurant,
  food_products,
  retail: { ...packagedCommerce, id: 'retail' },
  jewellery: { ...packagedCommerce, id: 'jewellery' },
  b2b: { ...packagedCommerce, id: 'b2b' },
  psl: { ...packagedCommerce, id: 'psl' },
};

export function isPackagedLob(lobType) {
  return PACKAGED_LOBS.includes(String(lobType || '').toLowerCase());
}

/**
 * @param {string|null|undefined} lobType
 * @returns {typeof restaurant}
 */
export function getDashboardProfile(lobType) {
  const key = String(lobType || 'restaurant').toLowerCase();
  return BY_LOB[key] || (isPackagedLob(key) ? packagedCommerce : restaurant);
}

export { PACKAGED_LOBS, restaurant, packagedCommerce, food_products };
