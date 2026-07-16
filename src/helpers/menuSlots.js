// src/helpers/menuSlots.js
// Web menu applicable_slots rules:
// - anytime = available for tiffin + lunch + dinner (all day)
// - anytime is mutually exclusive with any specific slot
// - specific slots (tiffin/lunch/dinner) may combine freely

'use strict';

export const MENU_SLOT_OPTIONS = ['tiffin', 'lunch', 'dinner', 'anytime'];
export const MENU_SPECIFIC_SLOTS = ['tiffin', 'lunch', 'dinner'];

export function normalizeMenuSlots(slots) {
  if (!Array.isArray(slots) || !slots.length) return ['anytime'];
  const clean = [...new Set(slots.map((s) => String(s || '').toLowerCase().trim()))]
    .filter(Boolean)
    .filter((s) => MENU_SLOT_OPTIONS.includes(s));
  if (!clean.length) return ['anytime'];
  // anytime alone = all duration; never store anytime + specific together
  if (clean.includes('anytime')) return ['anytime'];
  return clean;
}

/**
 * Toggle a slot pill. Enforces anytime XOR specific slots.
 * @param {string[]} current
 * @param {string} slot
 * @returns {string[]}
 */
export function toggleMenuSlot(current, slot) {
  const cur = normalizeMenuSlots(current);
  if (slot === 'anytime') {
    return ['anytime'];
  }
  if (!MENU_SPECIFIC_SLOTS.includes(slot)) {
    return cur;
  }
  const withoutAnytime = cur.filter((s) => s !== 'anytime');
  const active = withoutAnytime.includes(slot);
  const next = active
    ? withoutAnytime.filter((s) => s !== slot)
    : [...withoutAnytime, slot];
  return normalizeMenuSlots(next);
}
