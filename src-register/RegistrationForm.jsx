// RegistrationForm.jsx — Munafe self-service restaurant registration, later extended to other LOBs
// Converted from Gutenberg block to standalone Vite/React component.
// Mount: see main.jsx  |  Styles: injected inline via useEffect

import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { loadFacebookSdk, launchWhatsAppEmbeddedSignup } from '../src/helpers/metaEmbeddedSignup';
const h = React.createElement; // keeps all existing h() calls working unchanged

// ── Configuration ─────────────────────────────────────────────────────────────
const ROOT_ID    = "munafe-registration-root";
const API_BASE   = (() => {
  const el = document.getElementById(ROOT_ID);
  return (el && el.dataset.api) || "https://api.autom8.works";
})();
const APP_LOGIN  = "https://app.autom8.works/login";
const DRAFT_KEY  = "autom8_registration_draft_v1";
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

function saveDraft(form) {
  try {
    const { owner_password, embedded_signup_code, menu_file, ...safe } = form;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      form: safe,
      savedAt: Date.now(),
      session: {
        embedded_signup_code: embedded_signup_code || "",
        es_connected: !!form.es_connected,
      },
    }));
  } catch { /* ignore */ }
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// ── Static data ───────────────────────────────────────────────────────────────
const COUNTRIES = [
  { code: "IN", label: "India",               currency: "INR", tz: "Asia/Kolkata" },
  { code: "AE", label: "UAE",                 currency: "AED", tz: "Asia/Dubai" },
  { code: "SG", label: "Singapore",           currency: "SGD", tz: "Asia/Singapore" },
  { code: "LK", label: "Sri Lanka",           currency: "LKR", tz: "Asia/Colombo" },
  { code: "SA", label: "Saudi Arabia",        currency: "SAR", tz: "Asia/Riyadh" },
  { code: "QA", label: "Qatar",               currency: "QAR", tz: "Asia/Qatar" },
  { code: "BH", label: "Bahrain",             currency: "BHD", tz: "Asia/Bahrain" },
  { code: "KW", label: "Kuwait",              currency: "KWD", tz: "Asia/Kuwait" },
  { code: "OM", label: "Oman",                currency: "OMR", tz: "Asia/Muscat" },
];

const TIMEZONES = [
  "Asia/Kolkata","Asia/Dubai","Asia/Singapore","Asia/Colombo",
  "Asia/Riyadh","Asia/Qatar","Asia/Kuwait","Asia/Bahrain","Asia/Muscat","UTC",
];

// ── LOB (Line of Business) configuration registry ──────────────────────────────
// Everything that differs by business type lives here. Adding a new LOB means
// adding one entry — no changes needed to the step components themselves.
const LOB_CONFIGS = {
  restaurant: {
    label: "Restaurant / F&B", icon: "🍽️",
    tagline: "Cross-border restaurant engine · Self-service onboarding",
    categoryLabel: "Cuisine Types",
    categoryOptions: [
      { id: "veg",          label: "🥦 Veg" },
      { id: "non_veg",      label: "🍗 Non-Veg" },
      { id: "asian",        label: "🍜 Asian" },
      { id: "continental",  label: "🍝 Continental" },
      { id: "fast_food",    label: "🍔 Fast Food" },
    ],
    hasWorkflow: true,
    workflowOptions: [
      { value: "KOT_only",         label: "Paper KOT Only",     desc: "Traditional paper kitchen order tickets" },
      { value: "KDS_only",         label: "Digital KDS Only",   desc: "Kitchen display screens throughout" },
      { value: "Both_KOT_and_KDS", label: "KOT + KDS Hybrid",   desc: "Paper backup with digital screens" },
    ],
    fulfillmentLabel: "Service Fulfillment",
    fulfillmentOptions: [
      { id: "dine_in",           label: "Dine-In",          icon: "🪑", desc: "WhatsApp QR-to-table ordering" },
      { id: "takeaway",          label: "Takeaway",         icon: "🛍️", desc: "Self-service counter pickup" },
      { id: "door_delivery",     label: "Door Delivery",    icon: "🚗", desc: "Your own private drivers only" },
      { id: "table_reservation", label: "Table Reservation", icon: "📅", desc: "Book-ahead scheduling" },
    ],
    showTableCount: true,
    catalogStepLabel: "Menu Catalog",
    catalogLabel: "menu catalog",
    catalogTemplateName: "munafe_menu_template.csv",
    catalogTemplateColumns: ["item_name","category","price","description","is_veg","sku","slot"],
    catalogTemplateSample: [
      ["Masala Dosa","Breakfast","80","Crispy dosa with potato filling","TRUE","SKU001","all_day"],
      ["Chicken Biryani","Main Course","220","Fragrant rice with spiced chicken","FALSE","SKU002","lunch"],
      ["Filter Coffee","Beverages","30","Traditional South Indian filter coffee","TRUE","SKU003","all_day"],
    ],
    catalogDropHint: "Supports .xlsx, .xls, .csv — columns: Item Name, Price, SKU, Slot",
    catalogHint: "💡 Columns expected: Item Name · Price · SKU (optional) · Slot (lunch / dinner / all_day)",
  },

  supply: {
    label: "B2B Supply", icon: "📦",
    tagline: "Supplier-to-restaurant ordering · Self-service onboarding",
    categoryLabel: "Supply Categories",
    categoryOptions: [
      { id: "perishables",     label: "🥬 Perishables" },
      { id: "packaged_goods",  label: "📦 Packaged Goods" },
      { id: "beverages",       label: "🥤 Beverages" },
      { id: "equipment",       label: "🔧 Kitchen Equipment" },
    ],
    hasWorkflow: false,
    fulfillmentLabel: "Fulfillment Options",
    fulfillmentOptions: [
      { id: "scheduled_delivery", label: "Scheduled Delivery", icon: "🚚", desc: "Recurring supply runs to buyers" },
      { id: "on_demand",          label: "On-Demand Orders",   icon: "⚡", desc: "Ad-hoc restock requests" },
      { id: "warehouse_pickup",   label: "Warehouse Pickup",   icon: "🏭", desc: "Buyer collects from your depot" },
    ],
    showTableCount: false,
    catalogStepLabel: "Product Catalog",
    catalogLabel: "product catalog",
    catalogTemplateName: "munafe_supply_catalog_template.csv",
    catalogTemplateColumns: ["item_name","category","price","unit","moq","sku"],
    catalogTemplateSample: [
      ["Basmati Rice 25kg","Staples","1800","bag","2","SKU101"],
      ["Sunflower Oil 15L","Oils","2200","can","1","SKU102"],
    ],
    catalogDropHint: "Supports .xlsx, .xls, .csv — columns: Item Name, Price, Unit, MOQ, SKU",
    catalogHint: "💡 Columns expected: Item Name · Price · Unit · MOQ (minimum order qty) · SKU",
  },

  retail: {
    label: "Retail / General Store", icon: "🛒",
    tagline: "Retail ordering & storefront · Self-service onboarding",
    categoryLabel: "Store Categories",
    categoryOptions: [
      { id: "grocery",    label: "🛍️ Grocery" },
      { id: "home_goods", label: "🏠 Home Goods" },
      { id: "apparel",    label: "👕 Apparel" },
      { id: "general",    label: "🧾 General Merchandise" },
    ],
    hasWorkflow: false,
    fulfillmentLabel: "Fulfillment Options",
    fulfillmentOptions: [
      { id: "in_store_pickup", label: "In-Store Pickup", icon: "🏬", desc: "Customer collects from your outlet" },
      { id: "door_delivery",   label: "Door Delivery",   icon: "🚗", desc: "Local delivery to customers" },
    ],
    showTableCount: false,
    catalogStepLabel: "Product Catalog",
    catalogLabel: "product catalog",
    catalogTemplateName: "munafe_retail_catalog_template.csv",
    catalogTemplateColumns: ["item_name","category","price","description","sku","stock_qty"],
    catalogTemplateSample: [
      ["Cotton Bedsheet Set","Home Goods","899","King size, 2 pillow covers","SKU201","40"],
    ],
    catalogDropHint: "Supports .xlsx, .xls, .csv — columns: Item Name, Price, SKU, Stock Qty",
    catalogHint: "💡 Columns expected: Item Name · Price · SKU · Stock Qty",
  },

  food_products: {
    label: "Packaged Food Products", icon: "🍯",
    tagline: "Packaged food ordering · Self-service onboarding",
    categoryLabel: "Product Categories",
    categoryOptions: [
      { id: "snacks",    label: "🍿 Snacks" },
      { id: "sweets",    label: "🍬 Sweets" },
      { id: "pickles",   label: "🥒 Pickles & Preserves" },
      { id: "beverages", label: "🥤 Beverages" },
    ],
    hasWorkflow: false,
    fulfillmentLabel: "Fulfillment Options",
    fulfillmentOptions: [
      { id: "door_delivery",  label: "Door Delivery",  icon: "🚗", desc: "Ship directly to customers" },
      { id: "store_pickup",   label: "Store Pickup",   icon: "🏬", desc: "Customer collects from your outlet" },
      { id: "wholesale",      label: "Wholesale Orders", icon: "📦", desc: "Bulk orders to retailers" },
    ],
    showTableCount: false,
    catalogStepLabel: "Product Catalog",
    catalogLabel: "product catalog",
    catalogTemplateName: "munafe_food_products_catalog_template.csv",
    catalogTemplateColumns: ["item_name","category","price","description","sku","shelf_life_days"],
    catalogTemplateSample: [
      ["Mango Pickle 250g","Pickles & Preserves","150","Traditional Andhra style","SKU301","180"],
    ],
    catalogDropHint: "Supports .xlsx, .xls, .csv — columns: Item Name, Price, SKU, Shelf Life",
    catalogHint: "💡 Columns expected: Item Name · Price · SKU · Shelf Life (days)",
  },

  jewellery: {
    label: "Artificial Jewellery", icon: "💍",
    tagline: "Jewellery catalog ordering · Self-service onboarding",
    categoryLabel: "Product Categories",
    categoryOptions: [
      { id: "necklaces",  label: "📿 Necklaces" },
      { id: "earrings",   label: "💎 Earrings" },
      { id: "bangles",    label: "⭕ Bangles" },
      { id: "bridal_sets", label: "👰 Bridal Sets" },
    ],
    hasWorkflow: false,
    fulfillmentLabel: "Fulfillment Options",
    fulfillmentOptions: [
      { id: "door_delivery", label: "Door Delivery", icon: "🚗", desc: "Ship directly to customers" },
      { id: "store_pickup",  label: "Store Pickup",  icon: "🏬", desc: "Customer collects from your outlet" },
    ],
    showTableCount: false,
    catalogStepLabel: "Product Catalog",
    catalogLabel: "product catalog",
    catalogTemplateName: "munafe_jewellery_catalog_template.csv",
    catalogTemplateColumns: ["item_name","category","price","description","sku","material"],
    catalogTemplateSample: [
      ["Kemp Choker Set","Bridal Sets","2499","Temple-style kemp stone choker","SKU401","Alloy + Kemp stone"],
    ],
    catalogDropHint: "Supports .xlsx, .xls, .csv — columns: Item Name, Price, SKU, Material",
    catalogHint: "💡 Columns expected: Item Name · Price · SKU · Material",
  },

  electronics: {
    label: "Retail / Electronics", icon: "🔌",
    tagline: "Electronics ordering & support · Self-service onboarding",
    categoryLabel: "Product Categories",
    categoryOptions: [
      { id: "mobiles",     label: "📱 Mobiles & Accessories" },
      { id: "appliances",  label: "🔌 Home Appliances" },
      { id: "computers",   label: "💻 Computers" },
      { id: "audio",       label: "🎧 Audio & Wearables" },
    ],
    hasWorkflow: false,
    fulfillmentLabel: "Fulfillment Options",
    fulfillmentOptions: [
      { id: "door_delivery", label: "Door Delivery",  icon: "🚗", desc: "Ship directly to customers" },
      { id: "store_pickup",  label: "Store Pickup",   icon: "🏬", desc: "Customer collects from your outlet" },
      { id: "installation",  label: "Installation Service", icon: "🛠️", desc: "On-site setup for appliances" },
    ],
    showTableCount: false,
    catalogStepLabel: "Product Catalog",
    catalogLabel: "product catalog",
    catalogTemplateName: "munafe_electronics_catalog_template.csv",
    catalogTemplateColumns: ["item_name","category","price","description","sku","warranty_months"],
    catalogTemplateSample: [
      ["1.5 Ton Split AC","Home Appliances","32999","5-star rated inverter AC","SKU501","24"],
    ],
    catalogDropHint: "Supports .xlsx, .xls, .csv — columns: Item Name, Price, SKU, Warranty (months)",
    catalogHint: "💡 Columns expected: Item Name · Price · SKU · Warranty (months)",
  },
};

const LOB_LIST = Object.keys(LOB_CONFIGS).map((id) => ({ id, ...LOB_CONFIGS[id] }));

// Steps are fixed in shape; only the labels of a couple of them change per LOB.
const buildSteps = (lobId) => {
  const cfg = LOB_CONFIGS[lobId] || LOB_CONFIGS.restaurant;
  return [
    { id: "business_type", label: "Business Type",          icon: "🏷️" },
    { id: "details",       label: `${cfg.label} Details`,   icon: cfg.icon },
    { id: "fulfillment",   label: cfg.fulfillmentLabel,      icon: "🚀" },
    { id: "whatsapp",      label: "WhatsApp & Automation",   icon: "💬" },
    { id: "catalog",       label: cfg.catalogStepLabel,      icon: "📋" },
    { id: "checkout",      label: "Review & Subscribe",      icon: "✅" },
  ];
};

// ── Default form state ─────────────────────────────────────────────────────────
const makeDefault = () => ({
  // Step 0
  business_type: "",

  // Step 1
  name: "", display_name: "", slug: "", city: "",
  country_code: "IN", currency_code: "INR",
  categories: [], kitchen_workflow: "KOT_only",
  owner_name: "", email: "", owner_password: "",

  // Step 2
  dine_in: false, takeaway: false, door_delivery: false,
  table_reservation: false, table_count: 0,

  // Step 3 — WhatsApp via Embedded Signup (no Meta Developer Console)
  whatsapp_number: "", waba_id: "", phone_number_id: "",
  embedded_signup_code: "", display_phone_number: "",
  es_connected: false,
  timezone: "Asia/Kolkata",
  payment_mode: "prepay",
  has_lunch: true,  lunch_start: "12:00", lunch_end: "15:00",
  has_dinner: true, dinner_start: "19:00", dinner_end: "23:00",

  // Step 4
  menu_catalog: [],
  menu_file: null,  // File object, not sent to API — parsed client-side

  // Internal
  contact_phone: "", manager_phone: "", address_line1: "",
  idempotency_key: (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `reg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
});

// ── Validation rules per step ─────────────────────────────────────────────────
const REQUIRED = {
  0: ["business_type"],
  1: ["name", "display_name", "slug", "city", "country_code", "owner_name", "email", "owner_password"],
  2: [],
  3: ["embedded_signup_code", "waba_id", "phone_number_id"],
  4: [],
  5: [],
};

// ── Utility functions ─────────────────────────────────────────────────────────
const slugify = (str) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const fmt = (val) => (val == null || val === "" ? "—" : String(val));

// ── Styles ────────────────────────────────────────────────────────────────────
// Injected as a <style> tag at mount — no build step dependency.
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

  :root {
    --mn-green:     #1B7A5A;
    --mn-green-lt:  #E8F5F0;
    --mn-green-mid: #2DA07A;
    --mn-accent:    #F0A500;
    --mn-text:      #1A1A1A;
    --mn-muted:     #6B7280;
    --mn-border:    #E2E8E4;
    --mn-bg:        #FAFCFB;
    --mn-white:     #FFFFFF;
    --mn-danger:    #DC2626;
    --mn-danger-bg: #FEF2F2;
    --mn-radius:    10px;
    --mn-shadow:    0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04);
  }

  #munafe-registration-root * { box-sizing: border-box; margin: 0; padding: 0; }
  #munafe-registration-root {
    font-family: 'DM Sans', sans-serif;
    color: var(--mn-text);
    background: var(--mn-bg);
    min-height: 100vh;
    padding: 40px 16px 80px;
  }

  #munafe-registration-root .mn-wrap { max-width: 100%; margin: 0 auto; padding: 0 8px; box-sizing: border-box; }

  /* Header */
  #munafe-registration-root .mn-header { text-align: center; margin-bottom: 40px; }
  #munafe-registration-root .mn-header-logo { font-family: 'DM Serif Display', serif; font-size: 28px; color: var(--mn-green); letter-spacing: -.5px; display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:6px; }
  #munafe-registration-root .mn-header-sub { font-size: 14px; color: var(--mn-muted); }

  /* Stepper */
  #munafe-registration-root .mn-stepper { display: flex; align-items: center; justify-content: center; margin-bottom: 36px; gap: 0; overflow-x: auto; padding: 4px 0; }
  #munafe-registration-root .mn-step-item { display: flex; align-items: center; flex-shrink: 0; }
  #munafe-registration-root .mn-step-pill {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px; border-radius: 20px;
    font-size: 12px; font-weight: 500; transition: all .2s;
    white-space: nowrap;
  }
  #munafe-registration-root .mn-step-pill.done   { background: var(--mn-green-lt); color: var(--mn-green); }
  #munafe-registration-root .mn-step-pill.active { background: var(--mn-green); color: #fff; }
  #munafe-registration-root .mn-step-pill.future { background: transparent; color: var(--mn-muted); }
  #munafe-registration-root .mn-step-num { width: 20px; height: 20px; border-radius: 50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600; flex-shrink:0; }
  #munafe-registration-root .mn-step-pill.done   .mn-step-num { background: var(--mn-green); color:#fff; }
  #munafe-registration-root .mn-step-pill.active .mn-step-num { background: rgba(255,255,255,.25); color:#fff; }
  #munafe-registration-root .mn-step-pill.future .mn-step-num { background: var(--mn-border); color:var(--mn-muted); }
  #munafe-registration-root .mn-step-connector { width: 20px; height: 1px; background: var(--mn-border); margin: 0 2px; }

  /* Card */
  #munafe-registration-root .mn-card {
    background: var(--mn-white);
    border: 1px solid var(--mn-border);
    border-radius: var(--mn-radius);
    box-shadow: var(--mn-shadow);
    padding: 28px 32px;
  }
  #munafe-registration-root .mn-card-title { font-family:'DM Serif Display', serif; font-size:22px; color:var(--mn-text); margin-bottom:4px; }
  #munafe-registration-root .mn-card-sub   { font-size: 13px; color: var(--mn-muted); margin-bottom: 24px; line-height: 1.5; }

  /* Form fields */
  #munafe-registration-root .mn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
  @media (max-width: 520px) { #munafe-registration-root .mn-grid { grid-template-columns: 1fr; } }
  #munafe-registration-root .mn-field { margin-bottom: 18px; }
  #munafe-registration-root .mn-field-full { grid-column: 1 / -1; }
  #munafe-registration-root .mn-label { display:block; font-size: 12px; font-weight:600; color:var(--mn-muted); text-transform:uppercase; letter-spacing:.04em; margin-bottom: 5px; }
  #munafe-registration-root .mn-label.err { color: var(--mn-danger); }
  #munafe-registration-root .mn-hint { font-size: 11px; color: var(--mn-muted); margin-bottom: 5px; line-height:1.4; }
  #munafe-registration-root .mn-inp {
    width:100%; padding: 9px 12px; font-size:14px; font-family:inherit;
    border: 1px solid var(--mn-border); border-radius: 7px;
    background: var(--mn-white); color: var(--mn-text);
    outline:none; transition: border-color .15s, box-shadow .15s;
  }
  #munafe-registration-root .mn-inp:focus { border-color: var(--mn-green); box-shadow: 0 0 0 3px rgba(27,122,90,.1); }
  #munafe-registration-root .mn-inp.err { border-color: var(--mn-danger); background: var(--mn-danger-bg); }
  #munafe-registration-root .mn-inp-note { font-size:11px; color:var(--mn-muted); margin-top:4px; }

  /* Slug row */
  #munafe-registration-root .mn-slug-row { display:flex; align-items:center; border:1px solid var(--mn-border); border-radius:7px; overflow:hidden; transition:border-color .15s; }
  #munafe-registration-root .mn-slug-row:focus-within { border-color:var(--mn-green); box-shadow:0 0 0 3px rgba(27,122,90,.1); }
  #munafe-registration-root .mn-slug-row.err { border-color:var(--mn-danger); }
  #munafe-registration-root .mn-slug-pre { padding:9px 10px; background:var(--mn-bg); font-size:12px; color:var(--mn-muted); border-right:1px solid var(--mn-border); white-space:nowrap; }
  #munafe-registration-root .mn-slug-inp { flex:1; padding:9px 10px; border:none; outline:none; font-size:14px; font-family:inherit; color:var(--mn-text); background:transparent; }
  #munafe-registration-root .mn-slug-badge { padding:0 10px; font-size:11px; font-weight:600; white-space:nowrap; }
  #munafe-registration-root .mn-slug-badge.ok  { color: var(--mn-green); }
  #munafe-registration-root .mn-slug-badge.na  { color: var(--mn-danger); }
  #munafe-registration-root .mn-slug-badge.chk { color: var(--mn-muted); }

  /* Checkboxes / multi-select pills */
  #munafe-registration-root .mn-pill-group { display:flex; flex-wrap:wrap; gap:8px; }
  #munafe-registration-root .mn-pill {
    padding:6px 14px; border-radius:20px; font-size:13px; cursor:pointer;
    border:1px solid var(--mn-border); background:var(--mn-white); color:var(--mn-muted);
    user-select:none; transition: all .15s;
  }
  #munafe-registration-root .mn-pill.sel { border-color:var(--mn-green); background:var(--mn-green-lt); color:var(--mn-green); font-weight:500; }

  /* Workflow selector */
  #munafe-registration-root .mn-workflow-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  @media(max-width:520px){ #munafe-registration-root .mn-workflow-grid { grid-template-columns:1fr; } }
  #munafe-registration-root .mn-workflow-card {
    padding:12px 14px; border-radius:8px; border:1px solid var(--mn-border);
    cursor:pointer; transition:all .15s; background:var(--mn-white);
  }
  #munafe-registration-root .mn-workflow-card:hover { border-color:var(--mn-green-mid); }
  #munafe-registration-root .mn-workflow-card.sel { border-color:var(--mn-green); background:var(--mn-green-lt); }
  #munafe-registration-root .mn-workflow-label { font-size:13px; font-weight:600; color:var(--mn-text); margin-bottom:3px; }
  #munafe-registration-root .mn-workflow-card.sel .mn-workflow-label { color:var(--mn-green); }
  #munafe-registration-root .mn-workflow-desc  { font-size:11px; color:var(--mn-muted); line-height:1.4; }

  /* Business type cards */
  #munafe-registration-root .mn-lob-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  @media(max-width:560px){ #munafe-registration-root .mn-lob-grid { grid-template-columns:repeat(2,1fr); } }
  #munafe-registration-root .mn-lob-card {
    padding:18px 12px; border-radius:10px; border:1.5px solid var(--mn-border);
    cursor:pointer; transition:all .15s; background:var(--mn-white);
    text-align:center; display:flex; flex-direction:column; align-items:center; gap:8px;
  }
  #munafe-registration-root .mn-lob-card:hover { border-color:var(--mn-green-mid); }
  #munafe-registration-root .mn-lob-card.sel { border-color:var(--mn-green); background:var(--mn-green-lt); }
  #munafe-registration-root .mn-lob-icon { font-size:26px; }
  #munafe-registration-root .mn-lob-label { font-size:12.5px; font-weight:600; color:var(--mn-text); line-height:1.3; }
  #munafe-registration-root .mn-lob-card.sel .mn-lob-label { color:var(--mn-green); }

  /* Fulfillment cards */
  #munafe-registration-root .mn-fulfill-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  @media(max-width:400px){ #munafe-registration-root .mn-fulfill-grid { grid-template-columns:1fr; } }
  #munafe-registration-root .mn-fulfill-card {
    padding:14px; border-radius:8px; border:1.5px solid var(--mn-border);
    cursor:pointer; transition:all .15s; background:var(--mn-white);
    display:flex; align-items:flex-start; gap:10px;
  }
  #munafe-registration-root .mn-fulfill-card:hover { border-color:var(--mn-green-mid); }
  #munafe-registration-root .mn-fulfill-card.sel { border-color:var(--mn-green); background:var(--mn-green-lt); }
  #munafe-registration-root .mn-fulfill-icon  { font-size:22px; line-height:1; }
  #munafe-registration-root .mn-fulfill-label { font-size:13px; font-weight:600; margin-bottom:2px; }
  #munafe-registration-root .mn-fulfill-card.sel .mn-fulfill-label { color:var(--mn-green); }
  #munafe-registration-root .mn-fulfill-desc  { font-size:11px; color:var(--mn-muted); line-height:1.4; }

  /* Toggle */
  #munafe-registration-root .mn-toggle-row { display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--mn-border); }
  #munafe-registration-root .mn-toggle-row:last-child { border-bottom:none; }
  #munafe-registration-root .mn-toggle-label { font-size:14px; color:var(--mn-text); }
  #munafe-registration-root .mn-toggle-track { width:40px; height:22px; border-radius:11px; cursor:pointer; position:relative; transition:background .2s; flex-shrink:0; }
  #munafe-registration-root .mn-toggle-thumb { position:absolute; top:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left .2s; }

  /* Drop zone */
  #munafe-registration-root .mn-dropzone {
    border: 2px dashed var(--mn-border); border-radius: 10px;
    padding: 40px 24px; text-align:center; cursor:pointer;
    transition: all .2s; background: var(--mn-bg);
  }
  #munafe-registration-root .mn-dropzone.over { border-color: var(--mn-green); background: var(--mn-green-lt); }
  #munafe-registration-root .mn-dropzone-icon { font-size:36px; margin-bottom:10px; }
  #munafe-registration-root .mn-dropzone-text { font-size:14px; color:var(--mn-muted); margin-bottom:6px; }
  #munafe-registration-root .mn-dropzone-text strong { color:var(--mn-green); }
  #munafe-registration-root .mn-dropzone-sub  { font-size:12px; color:var(--mn-muted); }
  #munafe-registration-root .mn-file-badge { display:inline-flex; align-items:center; gap:8px; margin-top:12px; padding:8px 14px; background:var(--mn-green-lt); border-radius:20px; font-size:13px; color:var(--mn-green); font-weight:500; }
  #munafe-registration-root .mn-file-rm { cursor:pointer; font-size:15px; color:var(--mn-muted); }

  /* Summary table */
  #munafe-registration-root .mn-summary { background:var(--mn-bg); border-radius:8px; border:1px solid var(--mn-border); overflow:hidden; margin-bottom:20px; }
  #munafe-registration-root .mn-summary-row { display:grid; grid-template-columns:140px 1fr; padding:10px 16px; border-bottom:1px solid var(--mn-border); font-size:13px; }
  #munafe-registration-root .mn-summary-row:last-child { border-bottom:none; }
  #munafe-registration-root .mn-summary-key { color:var(--mn-muted); }
  #munafe-registration-root .mn-summary-val { color:var(--mn-text); font-weight:500; }

  /* Alert */
  #munafe-registration-root .mn-alert { padding:12px 16px; border-radius:8px; font-size:13px; margin-bottom:16px; }
  #munafe-registration-root .mn-alert.err  { background:var(--mn-danger-bg); color:var(--mn-danger); border:1px solid #FECACA; }
  #munafe-registration-root .mn-alert.info { background:var(--mn-green-lt); color:var(--mn-green); border:1px solid #A7F3D0; }

  /* Buttons — !important on legibility props to beat WP theme button resets */
  #munafe-registration-root .mn-nav { display:flex !important; justify-content:space-between; align-items:center; margin-top:24px; }
  #munafe-registration-root .mn-btn {
    padding:10px 22px !important; border-radius:8px; font-size:14px !important; font-weight:600 !important;
    cursor:pointer; border:none !important; transition:all .15s; font-family:inherit;
    display:inline-flex !important; align-items:center; gap:6px;
  }
  #munafe-registration-root .mn-btn:disabled { opacity:.45; cursor:not-allowed; }
  #munafe-registration-root .mn-btn-primary   { background:var(--mn-green) !important; color:#fff !important; }
  #munafe-registration-root .mn-btn-primary:hover:not(:disabled) { background:#166248 !important; }
  #munafe-registration-root .mn-btn-secondary { background:var(--mn-white) !important; color:var(--mn-text) !important; border:1px solid var(--mn-border) !important; }
  #munafe-registration-root .mn-btn-secondary:hover:not(:disabled) { border-color:var(--mn-green) !important; color:var(--mn-green) !important; }

  /* Success screen */
  #munafe-registration-root .mn-success { text-align:center; padding:40px 0; }
  #munafe-registration-root .mn-success-icon { font-size:56px; margin-bottom:16px; }
  #munafe-registration-root .mn-success-title { font-family:'DM Serif Display',serif; font-size:26px; margin-bottom:8px; }
  #munafe-registration-root .mn-success-sub { font-size:14px; color:var(--mn-muted); }

  /* Section divider */
  #munafe-registration-root .mn-section { margin-top:24px; padding-top:20px; border-top:1px solid var(--mn-border); }
  #munafe-registration-root .mn-section-title { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--mn-muted); margin-bottom:12px; }

  /* Time row */
  #munafe-registration-root .mn-time-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px; }
`;

// ── Primitive components ───────────────────────────────────────────────────────

function Field({ label, hint, error, full, children }) {
  return h("div", { className: `mn-field${full ? " mn-field-full" : ""}` },
    h("label", { className: `mn-label${error ? " err" : ""}` },
      error ? `${label} — ${error}` : label
    ),
    hint && h("p", { className: "mn-hint" }, hint),
    children
  );
}

function Input({ value, onChange, placeholder, type = "text", hasError, name }) {
  return h("input", {
    type, value, name, placeholder,
    className: `mn-inp${hasError ? " err" : ""}`,
    onChange: (e) => onChange(e.target.value),
  });
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return h("textarea", {
    value, rows, placeholder,
    className: "mn-inp",
    style: { resize: "vertical", minHeight: "80px" },
    onChange: (e) => onChange(e.target.value),
  });
}

function SelectField({ value, onChange, options }) {
  return h("select", {
    value, className: "mn-inp",
    onChange: (e) => onChange(e.target.value),
  },
    options.map((o) =>
      h("option", { key: o.value ?? o, value: o.value ?? o }, o.label ?? o)
    )
  );
}

function Toggle({ checked, onChange, label }) {
  return h("div", { className: "mn-toggle-row" },
    h("span", { className: "mn-toggle-label" }, label),
    h("div", {
      className: "mn-toggle-track",
      style: { background: checked ? "var(--mn-green)" : "var(--mn-border)" },
      onClick: () => onChange(!checked),
    },
      h("div", {
        className: "mn-toggle-thumb",
        style: { left: checked ? "21px" : "3px" },
      })
    )
  );
}

function Pill({ label, selected, onToggle }) {
  return h("button", {
    type: "button",
    className: `mn-pill${selected ? " sel" : ""}`,
    onClick: onToggle,
  }, label);
}

// ── Step 0: Business Type ─────────────────────────────────────────────────────

function Step0({ f, set, errors }) {
  const e = errors.includes("business_type");
  return h(Fragment, null,
    e && h("div", { className: "mn-alert err" }, "Please choose the type of business you're onboarding."),
    h("div", { className: "mn-lob-grid" },
      LOB_LIST.map((lob) =>
        h("div", {
          key: lob.id,
          className: `mn-lob-card${f.business_type === lob.id ? " sel" : ""}`,
          onClick: () => set("business_type", lob.id),
        },
          h("div", { className: "mn-lob-icon" }, lob.icon),
          h("div", { className: "mn-lob-label" }, lob.label),
        )
      )
    )
  );
}

// ── Step 1: Core Business Details ─────────────────────────────────────────────

function Step1({ f, set, errors }) {
  const [slugStatus, setSlugStatus] = useState("idle"); // idle|checking|ok|taken|error
  const slugTimer = useRef(null);
  const e = (k) => errors.includes(k);

  const handleCountryChange = (code) => {
    const country = COUNTRIES.find((c) => c.code === code);
    set("country_code", code);
    if (country) {
      set("currency_code", country.currency);
      set("timezone", country.tz);
    }
  };

  const handleNameChange = (val) => {
    set("name", val);
    if (!f.slug || f.slug === slugify(f.name)) {
      const auto = slugify(val);
      set("slug", auto);
      scheduleSlugCheck(auto);
    }
  };

  const scheduleSlugCheck = (slug) => {
    clearTimeout(slugTimer.current);
    if (slug.length < 2) { setSlugStatus("idle"); return; }
    setSlugStatus("checking");
    slugTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/slug-check/${encodeURIComponent(slug)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSlugStatus(data.available ? "ok" : "taken");
      } catch {
        setSlugStatus("error");
      }
    }, 600);
  };

  const cfg = LOB_CONFIGS[f.business_type] || LOB_CONFIGS.restaurant;

  const toggleCategory = (id) => {
    const cur = f.categories || [];
    set("categories", cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]);
  };

  return h(Fragment, null,
    h("div", { className: "mn-grid" },

      // Business Name
      h(Field, { label: "Business Name", error: e("name") ? "required" : "" },
        h(Input, { value: f.name, onChange: handleNameChange, placeholder: "Murugan Idli Shop", hasError: e("name") })
      ),

      // Display Name
      h(Field, { label: "Display Name", hint: "Shown to customers", error: e("display_name") ? "required" : "" },
        h(Input, { value: f.display_name, onChange: (v) => set("display_name", v), placeholder: "Murugan Idli Shop", hasError: e("display_name") })
      ),

      // Slug
      h(Field, { label: "Subdomain / Slug", hint: "Your unique Munafe URL handle", error: e("slug") ? "required" : "", full: true },
        h("div", { className: `mn-slug-row${e("slug") ? " err" : ""}` },
          h("span", { className: "mn-slug-pre" }, "autom8.works/"),
          h("input", {
            className: "mn-slug-inp",
            value: f.slug,
            placeholder: "murugan-idli-shop",
            onChange: (e) => { set("slug", e.target.value); scheduleSlugCheck(e.target.value); },
          }),
          slugStatus === "checking" && h("span", { className: "mn-slug-badge chk" }, "checking…"),
          slugStatus === "ok"       && h("span", { className: "mn-slug-badge ok"  }, "✓ available"),
          slugStatus === "taken"    && h("span", { className: "mn-slug-badge na"  }, "✗ taken"),
          slugStatus === "error"    && h("span", { className: "mn-slug-badge chk" }, "couldn't check"),
        )
      ),

      // City
      h(Field, { label: "City", error: e("city") ? "required" : "" },
        h(Input, { value: f.city, onChange: (v) => set("city", v), placeholder: "Chennai", hasError: e("city") })
      ),

      // Country
      h(Field, { label: "Country", error: e("country_code") ? "required" : "" },
        h(SelectField, {
          value: f.country_code,
          onChange: handleCountryChange,
          options: COUNTRIES.map((c) => ({ value: c.code, label: c.label })),
        })
      ),

      // Currency (auto-filled, readonly)
      h(Field, { label: "Currency", hint: "Auto-set from country" },
        h(Input, { value: f.currency_code, onChange: () => {}, placeholder: "INR" })
      ),

      // Contact Phone
      h(Field, { label: "Contact Phone" },
        h(Input, { value: f.contact_phone, onChange: (v) => set("contact_phone", v), placeholder: "919444XXXXXX" })
      ),
    ),

    h("div", { className: "mn-section" },
      h("p", { className: "mn-section-title" }, "Owner login (for app.autom8.works)"),
      h("div", { className: "mn-grid" },
        h(Field, { label: "Owner name *", error: e("owner_name") ? "required" : "" },
          h(Input, { value: f.owner_name, onChange: (v) => set("owner_name", v), placeholder: "Your full name", hasError: e("owner_name") })
        ),
        h(Field, {
          label: "Login email *",
          error: e("email")
            ? (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.email).trim()) ? "Invalid email" : "required")
            : "",
        },
          h(Input, { value: f.email, onChange: (v) => set("email", v), placeholder: "you@business.com", hasError: e("email") })
        ),
        h(Field, {
          label: "Password *",
          error: e("owner_password")
            ? (f.owner_password && String(f.owner_password).length < 8 ? "Min 8 characters" : "required")
            : "",
          full: true,
        },
          h(Input, { type: "password", value: f.owner_password, onChange: (v) => set("owner_password", v), placeholder: "Min 8 characters", hasError: e("owner_password") })
        ),
      )
    ),

    // Categories (label & options vary per LOB)
    h("div", { className: "mn-field mn-field-full", style: { marginTop: 4 } },
      h("label", { className: "mn-label" }, cfg.categoryLabel),
      h("div", { className: "mn-pill-group", style: { marginTop: 6 } },
        cfg.categoryOptions.map((c) =>
          h(Pill, {
            key: c.id, label: c.label,
            selected: (f.categories || []).includes(c.id),
            onToggle: () => toggleCategory(c.id),
          })
        )
      )
    ),

    // Kitchen workflow — restaurant LOB only
    cfg.hasWorkflow && h("div", { className: "mn-section" },
      h("p", { className: "mn-section-title" }, "Kitchen Workflow"),
      h("div", { className: "mn-workflow-grid" },
        cfg.workflowOptions.map((w) =>
          h("div", {
            key: w.value,
            className: `mn-workflow-card${f.kitchen_workflow === w.value ? " sel" : ""}`,
            onClick: () => set("kitchen_workflow", w.value),
          },
            h("div", { className: "mn-workflow-label" }, w.label),
            h("div", { className: "mn-workflow-desc"  }, w.desc),
          )
        )
      )
    )
  );
}

// ── Step 2: Service Fulfillment Matrix ────────────────────────────────────────

function Step2({ f, set }) {
  const cfg = LOB_CONFIGS[f.business_type] || LOB_CONFIGS.restaurant;
  const toggle = (id) => set(id, !f[id]);
  return h(Fragment, null,
    h("div", { className: "mn-fulfill-grid" },
      cfg.fulfillmentOptions.map((opt) =>
        h("div", {
          key: opt.id,
          className: `mn-fulfill-card${f[opt.id] ? " sel" : ""}`,
          onClick: () => toggle(opt.id),
        },
          h("div", { className: "mn-fulfill-icon" }, opt.icon),
          h("div", null,
            h("div", { className: "mn-fulfill-label" }, opt.label),
            h("div", { className: "mn-fulfill-desc"  }, opt.desc),
          )
        )
      )
    ),
    cfg.showTableCount && f.dine_in && h("div", { className: "mn-field", style: { marginTop: 20, maxWidth: 200 } },
      h(Field, { label: "Table Count", hint: "Total physical tables" },
        h(Input, { type: "number", value: f.table_count, onChange: (v) => set("table_count", parseInt(v) || 0) })
      )
    )
  );
}

// ── Step 3: WhatsApp via Embedded Signup (no Meta Developer Console) ─────────

function Step3({ f, set, errors }) {
  const e = (k) => errors.includes(k);
  const [esConfig, setEsConfig] = useState(null);           // null = loading (or after network fail)
  const [esConfigError, setEsConfigError] = useState(null); // "network" | null
  const [connecting, setConnecting] = useState(false);
  const [connectErr, setConnectErr] = useState("");

  const loadEsConfig = useCallback(() => {
    setEsConfigError(null);
    setEsConfig(null);
    fetch(`${API_BASE}/api/whatsapp/embedded-signup/config`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setEsConfig(data);
        setEsConfigError(null);
      })
      .catch(() => {
        setEsConfig(null);
        setEsConfigError("network");
      });
  }, []);

  useEffect(() => { loadEsConfig(); }, [loadEsConfig]);

  const connectDisabled =
    connecting ||
    esConfigError === "network" ||
    esConfig?.enabled === false ||
    (esConfig == null && !esConfigError); // still loading

  const connectWhatsApp = async () => {
    setConnectErr("");
    if (esConfigError === "network" || esConfig == null) {
      setConnectErr("Can't reach the Autom8 server right now. Please try again in a moment.");
      return;
    }
    if (!esConfig.enabled) {
      setConnectErr("WhatsApp connect is not enabled yet. Contact Autom8 support.");
      return;
    }
    setConnecting(true);
    try {
      await loadFacebookSdk(esConfig.appId, esConfig.graphVersion);
      const session = await launchWhatsAppEmbeddedSignup({
        configId: esConfig.configId,
        solutionId: esConfig.solutionId || undefined,
      });
      if (!session.code || !session.waba_id || !session.phone_number_id) {
        throw new Error("Signup finished but WhatsApp account details were incomplete. Please try again.");
      }
      const digits = (session.display_phone_number || "").replace(/\D/g, "");
      set("embedded_signup_code", session.code);
      set("waba_id", session.waba_id);
      set("phone_number_id", session.phone_number_id);
      set("display_phone_number", session.display_phone_number || "");
      if (digits) set("whatsapp_number", digits);
      set("es_connected", true);
    } catch (err) {
      setConnectErr(err.message || "Could not connect WhatsApp");
      set("es_connected", false);
    } finally {
      setConnecting(false);
    }
  };

  return h(Fragment, null,
    h("div", { style: { marginBottom: 16, padding: "10px 14px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11", lineHeight: 1.7 } },
      "Connect WhatsApp in one click — ",
      h("strong", null, "no Meta Developer Console"),
      ". Have your business documents ready and a phone number that is ",
      h("strong", null, "not"),
      " already on personal WhatsApp."
    ),

    h("div", {
      style: {
        marginBottom: 20, padding: 16, borderRadius: 10,
        border: "1px solid var(--mn-border)", background: "var(--mn-white)",
        display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between",
      },
    },
      h("div", { style: { flex: "1 1 220px" } },
        h("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--mn-text)" } },
          f.es_connected ? "WhatsApp connected" : "Connect your WhatsApp Business number"
        ),
        h("div", { style: { fontSize: 12, color: "var(--mn-muted)", marginTop: 4, lineHeight: 1.5 } },
          f.es_connected
            ? `WABA ${f.waba_id} · Phone ID ${f.phone_number_id}${f.whatsapp_number ? ` · +${f.whatsapp_number}` : ""}`
            : "Opens a secure Meta window to create or link your WhatsApp Business Account."
        )
      ),
      h("button", {
        type: "button",
        className: "mn-btn mn-btn-primary",
        disabled: connectDisabled,
        onClick: connectWhatsApp,
        style: { whiteSpace: "nowrap" },
      }, connecting ? "Connecting…" : (f.es_connected ? "Reconnect WhatsApp" : "Connect WhatsApp"))
    ),

    (e("embedded_signup_code") || e("waba_id") || e("phone_number_id")) && h("div", { className: "mn-alert err" },
      "Please click Connect WhatsApp before continuing."
    ),
    connectErr && h("div", { className: "mn-alert err" }, connectErr),
    esConfigError === "network" && h("div", { className: "mn-alert err" },
      h("div", { style: { marginBottom: 10 } },
        "Can't reach the Autom8 server right now. Please check your connection and try again in a moment — if this keeps happening, contact Autom8 support."
      ),
      h("button", {
        type: "button",
        className: "mn-btn mn-btn-secondary",
        onClick: loadEsConfig,
      }, "Retry")
    ),
    !esConfigError && esConfig && esConfig.enabled === false && h("div", { className: "mn-alert err" },
      "Embedded Signup is not configured on the server yet. Autom8 must set META_EMBEDDED_SIGNUP_CONFIG_ID."
    ),

    h("div", { className: "mn-grid" },
      h(Field, { label: "WhatsApp number (auto-filled)", hint: "Editable if needed — digits only, with country code" },
        h(Input, {
          value: f.whatsapp_number,
          onChange: (v) => set("whatsapp_number", v),
          placeholder: "919444000000",
        })
      ),
      h(Field, { label: "Timezone" },
        h(SelectField, { value: f.timezone, onChange: (v) => set("timezone", v), options: TIMEZONES })
      ),
      h(Field, { label: "Payment Mode" },
        h(SelectField, {
          value: f.payment_mode, onChange: (v) => set("payment_mode", v),
          options: [
            { value: "prepay", label: "Pre-pay (default)" },
            { value: "postpay", label: "Post-pay" },
            { value: "partial", label: "Partial deposit" },
          ],
        })
      ),
    ),

    h("div", { className: "mn-section" },
      h("p", { className: "mn-section-title" }, "Service Timing Slots"),
      h(Toggle, { checked: f.has_lunch, onChange: (v) => set("has_lunch", v), label: "Lunch service" }),
      f.has_lunch && h("div", { className: "mn-time-row" },
        h(Field, { label: "Lunch opens" },  h(Input, { type: "time", value: f.lunch_start,  onChange: (v) => set("lunch_start",  v) })),
        h(Field, { label: "Lunch closes" }, h(Input, { type: "time", value: f.lunch_end,    onChange: (v) => set("lunch_end",    v) })),
      ),
      h(Toggle, { checked: f.has_dinner, onChange: (v) => set("has_dinner", v), label: "Dinner service" }),
      f.has_dinner && h("div", { className: "mn-time-row" },
        h(Field, { label: "Dinner opens" },  h(Input, { type: "time", value: f.dinner_start, onChange: (v) => set("dinner_start", v) })),
        h(Field, { label: "Dinner closes" }, h(Input, { type: "time", value: f.dinner_end,   onChange: (v) => set("dinner_end",   v) })),
      ),
    )
  );
}

// ── Step 4: Menu Catalog Upload ───────────────────────────────────────────────

function Step4({ f, set }) {
  const cfg = LOB_CONFIGS[f.business_type] || LOB_CONFIGS.restaurant;
  const [dragOver, setDragOver] = useState(false);
  const [parseStatus, setParseStatus] = useState("");
  const fileInputRef = useRef(null);

  const parseFile = async (file) => {
    if (!file) return;
    const allowed = ["xlsx","xls","csv"];
    const ext = file.name.split(".").pop().toLowerCase();
    if (!allowed.includes(ext)) {
      setParseStatus("❌ Only .xlsx, .xls, or .csv files are supported.");
      return;
    }
    set("menu_file", file);
    setParseStatus("📄 Reading " + file.name + "…");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (!rows.length) {
        setParseStatus("⚠️ No rows found in that file.");
        set("menu_catalog", []);
        return;
      }
      set("menu_catalog", rows);
      setParseStatus(`✅ ${rows.length} row${rows.length === 1 ? "" : "s"} ready from ${file.name}`);
    } catch (err) {
      setParseStatus("❌ Could not read that file — check it matches the template columns.");
      set("menu_catalog", []);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    parseFile(e.dataTransfer.files[0]);
  };

  const removeFile = () => {
    set("menu_file", null);
    set("menu_catalog", []);
    setParseStatus("");
  };

  const downloadTemplate = () => {
    const rows = [cfg.catalogTemplateColumns, ...cfg.catalogTemplateSample];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = cfg.catalogTemplateName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return h(Fragment, null,
    h("div", { style: { marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#F0F6FF", borderRadius: 8, border: "1px solid #C5DDF8" } },
      h("div", null,
        h("div", { style: { fontSize: 13, fontWeight: 600, color: "#185FA5" } }, `📥 Download ${cfg.catalogLabel} template`),
        h("div", { style: { fontSize: 11, color: "#555", marginTop: 2 } }, `Fill in your items and upload below. Columns: ${cfg.catalogTemplateColumns.join(", ")}`)
      ),
      h("button", {
        onClick: downloadTemplate,
        style: { fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid #378ADD", background: "#378ADD", color: "#fff", cursor: "pointer", whiteSpace: "nowrap", marginLeft: 12 }
      }, "⬇ Get template")
    ),
    h("div", {
      className: `mn-dropzone${dragOver ? " over" : ""}`,
      onDragOver: (e) => { e.preventDefault(); setDragOver(true); },
      onDragLeave: () => setDragOver(false),
      onDrop: handleDrop,
      onClick: () => fileInputRef.current && fileInputRef.current.click(),
    },
      h("div", { className: "mn-dropzone-icon" }, "📊"),
      h("p", { className: "mn-dropzone-text" },
        h("strong", null, "Click or drag"), ` your ${cfg.catalogLabel} here`
      ),
      h("p", { className: "mn-dropzone-sub" }, cfg.catalogDropHint),
      f.menu_file && h("div", { className: "mn-file-badge" },
        `✅ ${f.menu_file.name}`,
        h("span", { className: "mn-file-rm", onClick: (e) => { e.stopPropagation(); removeFile(); } }, " ✕")
      )
    ),
    h("input", {
      type: "file", accept: ".xlsx,.xls,.csv",
      ref: fileInputRef, style: { display: "none" },
      onChange: (e) => parseFile(e.target.files[0]),
    }),
    parseStatus && h("p", { style: { marginTop: 10, fontSize: 13, color: "var(--mn-muted)" } }, parseStatus),
    h("div", { className: "mn-alert info", style: { marginTop: 16 } },
      cfg.catalogHint
    )
  );
}

// ── Step 5: Review & Checkout ─────────────────────────────────────────────────

function Step5({ form, onRedirect }) {
  const [status, setStatus] = useState("idle");   // idle|loading|error|needs_attention
  const [errMsg, setErrMsg] = useState("");
  const [attentionMsg, setAttentionMsg] = useState("");

  const country = COUNTRIES.find((c) => c.code === form.country_code);
  const cfg = LOB_CONFIGS[form.business_type] || LOB_CONFIGS.restaurant;

  const summaryRows = [
    ["Business type",   cfg.label],
    ["Business name",   form.display_name || form.name],
    ["Subdomain",       form.slug ? `autom8.works/${form.slug}` : "—"],
    ["Location",        [form.city, country?.label].filter(Boolean).join(", ")],
    [cfg.categoryLabel, (form.categories || []).join(", ") || "—"],
    ...(cfg.hasWorkflow ? [["Kitchen flow", form.kitchen_workflow]] : []),
    [cfg.fulfillmentLabel, cfg.fulfillmentOptions.filter((o) => form[o.id]).map((o) => o.label).join(", ") || "—"],
    ["Owner email",     form.email || "—"],
    ["WhatsApp",        form.es_connected ? (form.whatsapp_number || "Connected") : (form.whatsapp_number || "—")],
    ["Timezone",        form.timezone],
    ["Payment mode",    form.payment_mode],
    [cfg.catalogStepLabel, form.menu_file?.name || (form.menu_catalog?.length ? `${form.menu_catalog.length} items` : "Not uploaded")],
  ];

  const handleSubmit = async () => {
    setStatus("loading"); setErrMsg(""); setAttentionMsg("");

    const fetchUrl = `${API_BASE}/api/v1/register`;
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": form.idempotency_key || "",
      },
      body: JSON.stringify(buildPayload(form)),
    };

    try {
      const res  = await fetch(fetchUrl, fetchOptions);
      const data = await res.json();
      if (res.ok) {
        clearDraft();
        if (data.status === "needs_attention" || data.whatsapp?.success === false) {
          setStatus("needs_attention");
          setAttentionMsg(data.message || "Account created — finish WhatsApp in Settings → WhatsApp after login.");
          setTimeout(() => {
            window.location.href = data.checkout_url || data.login_url || APP_LOGIN;
          }, 4000);
          return;
        }
        const dest = data.checkout_url || data.login_url || APP_LOGIN;
        window.location.href = dest;
      } else {
        setStatus("error");
        setErrMsg(data.error || data.detail || "Registration failed. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrMsg("Could not reach the Autom8 server. If you already submitted, wait before retrying.");
    }
  };

  return h(Fragment, null,
    h("div", { className: "mn-summary" },
      summaryRows.map(([k, v]) =>
        h("div", { key: k, className: "mn-summary-row" },
          h("span", { className: "mn-summary-key" }, k),
          h("span", { className: "mn-summary-val"  }, fmt(v)),
        )
      )
    ),
    status === "error" && h("div", { className: "mn-alert err" }, errMsg),
    status === "needs_attention" && h("div", { className: "mn-alert info" }, attentionMsg),
    h("div", { className: "mn-alert info" },
      "After submit, your account is created and WhatsApp is linked. You'll go to the app login to start your trial."
    ),
    h("div", { style: { marginTop: 12 } },
      h("button", {
        className: "mn-btn mn-btn-primary",
        disabled: status === "loading" || status === "needs_attention",
        onClick: handleSubmit,
      }, status === "loading" ? "Processing…" : "Create account & continue →")
    )
  );
}

// ── Payload builder ───────────────────────────────────────────────────────────
function buildPayload(form) {
  return {
    business_type:    form.business_type, // kept for reference/logging; backend keys off lob_type below
    lob_type:         form.business_type, // onboarding.js reads body.lob_type — this is the field that actually drives catalog schema selection
    name:             form.name,
    display_name:     form.display_name,
    slug:             form.slug,
    city:             form.city,
    country_code:     form.country_code,
    currency_code:    form.currency_code,
    categories:       form.categories,
    kitchen_workflow: form.business_type === "restaurant" ? form.kitchen_workflow : null,
    dine_in:          form.dine_in,
    takeaway:         form.takeaway,
    door_delivery:    form.door_delivery,
    table_reservation:form.table_reservation,
    table_count:      form.table_count,
    owner_name:       form.owner_name,
    email:            form.email,
    owner_password:   form.owner_password,
    phone:            form.contact_phone || null,
    whatsapp_number:  form.whatsapp_number,
    waba_id:          form.waba_id,
    phone_number_id:  form.phone_number_id,
    embedded_signup_code: form.embedded_signup_code || null,
    display_phone_number: form.display_phone_number || form.whatsapp_number || null,
    timezone:         form.timezone,
    payment_mode:     form.payment_mode,
    lunch_start:      form.has_lunch  ? form.lunch_start  : null,
    lunch_end:        form.has_lunch  ? form.lunch_end    : null,
    dinner_start:     form.has_dinner ? form.dinner_start : null,
    dinner_end:       form.has_dinner ? form.dinner_end   : null,
    menu_catalog:     form.menu_catalog || [],
    contact_phone:    form.contact_phone,
    manager_phone:    form.manager_phone || form.contact_phone,
    address_line1:    form.address_line1,
    has_lunch:        form.has_lunch,
    has_dinner:       form.has_dinner,
    cuisines:         form.categories,
    idempotency_key:  form.idempotency_key,
  };
}

// ── Main App ──────────────────────────────────────────────────────────────────

function MunafeRegistrationForm() {
  const [step,   setStep  ] = useState(0);
  const [form,   setForm  ] = useState(makeDefault);
  const [errors, setErrors] = useState([]);
  const [draftPrompt, setDraftPrompt] = useState(null);

  // Inject CSS once
  useEffect(() => {
    if (document.getElementById("munafe-block-css")) return;
    const style = document.createElement("style");
    style.id = "munafe-block-css";
    style.textContent = CSS;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    const d = loadDraft();
    if (d?.form) setDraftPrompt(d);
  }, []);

  const set = useCallback((k, v) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      saveDraft(next);
      return next;
    });
    setErrors((e) => e.filter((x) => x !== k));
  }, []);

  useEffect(() => {
    if (!form.es_connected || !form.email || !emailOk(form.email)) return;
    const t = setTimeout(() => {
      fetch(`${API_BASE}/api/v1/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          draft: (() => {
            const { owner_password, embedded_signup_code, menu_file, ...safe } = form;
            return safe;
          })(),
          waba_id: form.waba_id,
          phone_number_id: form.phone_number_id,
          whatsapp_number: form.whatsapp_number,
          embedded_signup_code: form.embedded_signup_code || null,
        }),
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [form.es_connected, form.waba_id, form.phone_number_id, form.email]);

  const validate = async () => {
    const req = REQUIRED[step] || [];
    const bad = req.filter((k) => {
      const v = form[k];
      return v == null || String(v).trim() === "";
    });
    if (step === 1) {
      if (form.owner_password && String(form.owner_password).length < 8 && !bad.includes("owner_password")) {
        bad.push("owner_password");
      }
      if (form.email && !emailOk(form.email) && !bad.includes("email")) {
        bad.push("email");
      }
    }
    setErrors(bad);
    if (bad.length) return false;
    if (step === 1 && form.email) {
      try {
        const res = await fetch(`${API_BASE}/api/v1/email-check/${encodeURIComponent(form.email.trim())}`);
        const data = await res.json();
        if (data.available === false) {
          setErrors((e) => [...e, "email"]);
          alert(data.message || "This email already has an Autom8 account. Please log in instead.");
          return false;
        }
      } catch { /* allow continue */ }
    }
    return true;
  };

  const next = async () => { if (await validate()) setStep((s) => s + 1); };
  const back = () => { setErrors([]); setStep((s) => s - 1); };

  const resumeDraft = () => {
    if (!draftPrompt?.form) return;
    setForm({
      ...makeDefault(),
      ...draftPrompt.form,
      owner_password: "",
      embedded_signup_code: draftPrompt.session?.embedded_signup_code || "",
      es_connected: !!draftPrompt.session?.es_connected,
      menu_file: null,
    });
    setDraftPrompt(null);
  };
  const startOver = () => {
    clearDraft();
    setForm(makeDefault());
    setStep(0);
    setDraftPrompt(null);
  };

  const cfg   = LOB_CONFIGS[form.business_type] || LOB_CONFIGS.restaurant;
  const STEPS = buildSteps(form.business_type);

  const stepComponents = [
    h(Step0, { f: form, set, errors }),
    h(Step1, { f: form, set, errors }),
    h(Step2, { f: form, set, errors }),
    h(Step3, { f: form, set, errors }),
    h(Step4, { f: form, set }),
    h(Step5, { form, onRedirect: () => {} }),
  ];

  return h("div", { className: "mn-wrap" },

    // ── Header
    h("div", { className: "mn-header" },
      h("div", { className: "mn-header-logo" },
        h("span", null, form.business_type ? cfg.icon : "🍽️"),
        h("span", null, "Munafe")
      ),
      h("p", { className: "mn-header-sub" }, form.business_type ? cfg.tagline : "Multi-LOB commerce engine · Self-service onboarding")
    ),

    draftPrompt && h("div", { className: "mn-alert info", style: { marginBottom: 16 } },
      h("div", { style: { marginBottom: 8 } }, "You have an unfinished registration. Resume where you left off?"),
      h("button", { className: "mn-btn mn-btn-primary", style: { marginRight: 8 }, onClick: resumeDraft }, "Resume"),
      h("button", { className: "mn-btn mn-btn-secondary", onClick: startOver }, "Start over")
    ),

    // ── Stepper
    h("div", { className: "mn-stepper" },
      STEPS.map((s, i) => h(Fragment, { key: s.id },
        h("div", { className: "mn-step-item" },
          h("div", {
            className: `mn-step-pill ${i < step ? "done" : i === step ? "active" : "future"}`,
          },
            h("div", { className: "mn-step-num" }, i < step ? "✓" : i + 1),
            h("span", null, s.label)
          )
        ),
        i < STEPS.length - 1 && h("div", { className: "mn-step-connector" })
      ))
    ),

    // ── Card
    h("div", { className: "mn-card" },
      h("h2", { className: "mn-card-title" }, STEPS[step].icon + " " + STEPS[step].label),
      h("p", { className: "mn-card-sub" }, [
        "Choose the type of business you're setting up on Munafe.",
        "Tell us about your business and create your owner login.",
        "Select the fulfillment modes your team manages.",
        "Connect WhatsApp with one click — no Meta Developer Console.",
        `Upload your ${cfg.catalogLabel} in Excel or CSV format.`,
        "Review your details, then create your account and start the trial.",
      ][step]),
      stepComponents[step]
    ),

    // ── Navigation
    step < STEPS.length - 1 && h("div", { className: "mn-nav" },
      step > 0
        ? h("button", { className: "mn-btn mn-btn-secondary", onClick: back }, "← Back")
        : h("span"),
      h("button", { className: "mn-btn mn-btn-primary", onClick: next }, "Continue →")
    )
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
export default MunafeRegistrationForm;
