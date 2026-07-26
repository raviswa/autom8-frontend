/** Shared labels / helpers for packaged-LOB order journey UI. */

export const JOURNEY_STAGES = [
  { key: 'prep', label: 'Prep' },
  { key: 'packing', label: 'Packing' },
  { key: 'shipment', label: 'Shipment' },
  { key: 'delivered', label: 'Delivered' },
];

/** Map API stage → stepper index highlight. */
export function stageToStepperKey(stage) {
  const s = String(stage || '').toLowerCase();
  if (s === 'prep') return 'prep';
  if (s === 'packing') return 'packing';
  if (s === 'delivered') return 'delivered';
  if (
    s === 'awaiting_courier'
    || s === 'shipped'
    || s === 'out_for_delivery'
    || s === 'pickup'
    || s === 'own_team'
  ) {
    return 'shipment';
  }
  return 'prep';
}

export function stageLabel(stage) {
  const map = {
    prep: 'In prep',
    packing: 'Packing',
    awaiting_courier: 'Awaiting courier',
    shipped: 'Shipped',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    pickup: 'Store pickup',
    own_team: 'Own delivery team',
  };
  return map[String(stage || '').toLowerCase()] || stage || '—';
}

export function skipReasonLabel(reason, errorText) {
  const map = {
    shiprocket_not_connected: 'Add Shiprocket API user in Settings',
    own_team: 'Own delivery team',
    pending_manager: 'Awaiting manager courier approval',
    missing_delivery_address: 'Missing address / pincode',
    pickup_or_takeaway: 'Store pickup',
    custom_courier: 'Custom courier (manual AWB)',
    channel_blocked: 'Courier channel not ready',
    shiprocket_error: errorText || 'Shiprocket error — retry from packing',
    not_delivery: 'Not a delivery order',
  };
  return map[String(reason || '')] || (reason ? String(reason) : null);
}

export function shiprocketTrackUrl(shipment) {
  if (shipment?.tracking_url) return shipment.tracking_url;
  const awb = String(shipment?.awb || '').trim();
  if (!awb) return null;
  return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
}

export async function copyText(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
