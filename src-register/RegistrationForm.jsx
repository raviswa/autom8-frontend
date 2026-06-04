// RegistrationForm.jsx — Munafe self-service restaurant registration
// Converted from Gutenberg block to standalone Vite/React component.
// Mount: see main.jsx  |  Styles: injected inline via useEffect

import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';
const h = React.createElement; // keeps all existing h() calls working unchanged

// ── Configuration ─────────────────────────────────────────────────────────────
const ROOT_ID    = "munafe-registration-root";
const API_BASE   = (() => {
  const el = document.getElementById(ROOT_ID);
  return (el && el.dataset.api) || "https://autom8-backend-production.up.railway.app";
})();

// ── Static data ───────────────────────────────────────────────────────────────
const STEPS = [
  { id: "details",     label: "Restaurant Details",   icon: "🍽️" },
  { id: "fulfillment", label: "Service Fulfillment",  icon: "🚀" },
  { id: "whatsapp",    label: "WhatsApp & Automation", icon: "💬" },
  { id: "menu",        label: "Menu Catalog",          icon: "📋" },
  { id: "checkout",    label: "Review & Subscribe",    icon: "✅" },
];

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

const CUISINE_OPTIONS = [
  { id: "veg",          label: "🥦 Veg" },
  { id: "non_veg",      label: "🍗 Non-Veg" },
  { id: "asian",        label: "🍜 Asian" },
  { id: "continental",  label: "🍝 Continental" },
  { id: "fast_food",    label: "🍔 Fast Food" },
];

const WORKFLOW_OPTIONS = [
  { value: "KOT_only",         label: "Paper KOT Only",       desc: "Traditional paper kitchen order tickets" },
  { value: "KDS_only",         label: "Digital KDS Only",     desc: "Kitchen display screens throughout" },
  { value: "Both_KOT_and_KDS", label: "KOT + KDS Hybrid",    desc: "Paper backup with digital screens" },
];

const FULFILLMENT_OPTIONS = [
  { id: "dine_in",           label: "Dine-In",          icon: "🪑", desc: "WhatsApp QR-to-table ordering" },
  { id: "takeaway",          label: "Takeaway",          icon: "🛍️", desc: "Self-service counter pickup" },
  { id: "door_delivery",     label: "Door Delivery",     icon: "🚗", desc: "Your own private drivers only" },
  { id: "table_reservation", label: "Table Reservation", icon: "📅", desc: "Book-ahead scheduling" },
];

const TIMEZONES = [
  "Asia/Kolkata","Asia/Dubai","Asia/Singapore","Asia/Colombo",
  "Asia/Riyadh","Asia/Qatar","Asia/Kuwait","Asia/Bahrain","Asia/Muscat","UTC",
];

// ── Default form state ─────────────────────────────────────────────────────────
const makeDefault = () => ({
  // Step 1
  name: "", display_name: "", slug: "", city: "",
  country_code: "IN", currency_code: "INR",
  cuisines: [], kitchen_workflow: "KOT_only",

  // Step 2
  dine_in: false, takeaway: false, door_delivery: false,
  table_reservation: false, table_count: 0,

  // Step 3
  whatsapp_number: "", waba_id: "", phone_number_id: "",
  meta_access_token: "", timezone: "Asia/Kolkata",
  payment_mode: "prepay",
  has_lunch: true,  lunch_start: "12:00", lunch_end: "15:00",
  has_dinner: true, dinner_start: "19:00", dinner_end: "23:00",

  // Step 4
  menu_catalog: [],
  menu_file: null,  // File object, not sent to API — parsed client-side

  // Internal
  contact_phone: "", manager_phone: "", address_line1: "",
});

// ── Validation rules per step ─────────────────────────────────────────────────
const REQUIRED = {
  0: ["name", "display_name", "slug", "city", "country_code"],
  1: [],
  2: ["whatsapp_number", "phone_number_id", "meta_access_token"],
  3: [],
  4: [],
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

  .mn-wrap { max-width: 100%; margin: 0 auto; padding: 0 8px; box-sizing: border-box; }

  /* Header */
  .mn-header { text-align: center; margin-bottom: 40px; }
  .mn-header-logo { font-family: 'DM Serif Display', serif; font-size: 28px; color: var(--mn-green); letter-spacing: -.5px; display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:6px; }
  .mn-header-sub { font-size: 14px; color: var(--mn-muted); }

  /* Stepper */
  .mn-stepper { display: flex; align-items: center; justify-content: center; margin-bottom: 36px; gap: 0; overflow-x: auto; padding: 4px 0; }
  .mn-step-item { display: flex; align-items: center; flex-shrink: 0; }
  .mn-step-pill {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 10px; border-radius: 20px;
    font-size: 12px; font-weight: 500; transition: all .2s;
    white-space: nowrap;
  }
  .mn-step-pill.done   { background: var(--mn-green-lt); color: var(--mn-green); }
  .mn-step-pill.active { background: var(--mn-green); color: #fff; }
  .mn-step-pill.future { background: transparent; color: var(--mn-muted); }
  .mn-step-num { width: 20px; height: 20px; border-radius: 50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600; flex-shrink:0; }
  .mn-step-pill.done   .mn-step-num { background: var(--mn-green); color:#fff; }
  .mn-step-pill.active .mn-step-num { background: rgba(255,255,255,.25); color:#fff; }
  .mn-step-pill.future .mn-step-num { background: var(--mn-border); color:var(--mn-muted); }
  .mn-step-connector { width: 20px; height: 1px; background: var(--mn-border); margin: 0 2px; }

  /* Card */
  .mn-card {
    background: var(--mn-white);
    border: 1px solid var(--mn-border);
    border-radius: var(--mn-radius);
    box-shadow: var(--mn-shadow);
    padding: 28px 32px;
  }
  .mn-card-title { font-family:'DM Serif Display', serif; font-size:22px; color:var(--mn-text); margin-bottom:4px; }
  .mn-card-sub   { font-size: 13px; color: var(--mn-muted); margin-bottom: 24px; line-height: 1.5; }

  /* Form fields */
  .mn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
  @media (max-width: 520px) { .mn-grid { grid-template-columns: 1fr; } }
  .mn-field { margin-bottom: 18px; }
  .mn-field-full { grid-column: 1 / -1; }
  .mn-label { display:block; font-size: 12px; font-weight:600; color:var(--mn-muted); text-transform:uppercase; letter-spacing:.04em; margin-bottom: 5px; }
  .mn-label.err { color: var(--mn-danger); }
  .mn-hint { font-size: 11px; color: var(--mn-muted); margin-bottom: 5px; line-height:1.4; }
  .mn-inp {
    width:100%; padding: 9px 12px; font-size:14px; font-family:inherit;
    border: 1px solid var(--mn-border); border-radius: 7px;
    background: var(--mn-white); color: var(--mn-text);
    outline:none; transition: border-color .15s, box-shadow .15s;
  }
  .mn-inp:focus { border-color: var(--mn-green); box-shadow: 0 0 0 3px rgba(27,122,90,.1); }
  .mn-inp.err { border-color: var(--mn-danger); background: var(--mn-danger-bg); }
  .mn-inp-note { font-size:11px; color:var(--mn-muted); margin-top:4px; }

  /* Slug row */
  .mn-slug-row { display:flex; align-items:center; border:1px solid var(--mn-border); border-radius:7px; overflow:hidden; transition:border-color .15s; }
  .mn-slug-row:focus-within { border-color:var(--mn-green); box-shadow:0 0 0 3px rgba(27,122,90,.1); }
  .mn-slug-row.err { border-color:var(--mn-danger); }
  .mn-slug-pre { padding:9px 10px; background:var(--mn-bg); font-size:12px; color:var(--mn-muted); border-right:1px solid var(--mn-border); white-space:nowrap; }
  .mn-slug-inp { flex:1; padding:9px 10px; border:none; outline:none; font-size:14px; font-family:inherit; color:var(--mn-text); background:transparent; }
  .mn-slug-badge { padding:0 10px; font-size:11px; font-weight:600; white-space:nowrap; }
  .mn-slug-badge.ok  { color: var(--mn-green); }
  .mn-slug-badge.na  { color: var(--mn-danger); }
  .mn-slug-badge.chk { color: var(--mn-muted); }

  /* Checkboxes / multi-select pills */
  .mn-pill-group { display:flex; flex-wrap:wrap; gap:8px; }
  .mn-pill {
    padding:6px 14px; border-radius:20px; font-size:13px; cursor:pointer;
    border:1px solid var(--mn-border); background:var(--mn-white); color:var(--mn-muted);
    user-select:none; transition: all .15s;
  }
  .mn-pill.sel { border-color:var(--mn-green); background:var(--mn-green-lt); color:var(--mn-green); font-weight:500; }

  /* Workflow selector */
  .mn-workflow-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  @media(max-width:520px){ .mn-workflow-grid { grid-template-columns:1fr; } }
  .mn-workflow-card {
    padding:12px 14px; border-radius:8px; border:1px solid var(--mn-border);
    cursor:pointer; transition:all .15s; background:var(--mn-white);
  }
  .mn-workflow-card:hover { border-color:var(--mn-green-mid); }
  .mn-workflow-card.sel { border-color:var(--mn-green); background:var(--mn-green-lt); }
  .mn-workflow-label { font-size:13px; font-weight:600; color:var(--mn-text); margin-bottom:3px; }
  .mn-workflow-card.sel .mn-workflow-label { color:var(--mn-green); }
  .mn-workflow-desc  { font-size:11px; color:var(--mn-muted); line-height:1.4; }

  /* Fulfillment cards */
  .mn-fulfill-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  @media(max-width:400px){ .mn-fulfill-grid { grid-template-columns:1fr; } }
  .mn-fulfill-card {
    padding:14px; border-radius:8px; border:1.5px solid var(--mn-border);
    cursor:pointer; transition:all .15s; background:var(--mn-white);
    display:flex; align-items:flex-start; gap:10px;
  }
  .mn-fulfill-card:hover { border-color:var(--mn-green-mid); }
  .mn-fulfill-card.sel { border-color:var(--mn-green); background:var(--mn-green-lt); }
  .mn-fulfill-icon  { font-size:22px; line-height:1; }
  .mn-fulfill-label { font-size:13px; font-weight:600; margin-bottom:2px; }
  .mn-fulfill-card.sel .mn-fulfill-label { color:var(--mn-green); }
  .mn-fulfill-desc  { font-size:11px; color:var(--mn-muted); line-height:1.4; }

  /* Toggle */
  .mn-toggle-row { display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--mn-border); }
  .mn-toggle-row:last-child { border-bottom:none; }
  .mn-toggle-label { font-size:14px; color:var(--mn-text); }
  .mn-toggle-track { width:40px; height:22px; border-radius:11px; cursor:pointer; position:relative; transition:background .2s; flex-shrink:0; }
  .mn-toggle-thumb { position:absolute; top:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left .2s; }

  /* Drop zone */
  .mn-dropzone {
    border: 2px dashed var(--mn-border); border-radius: 10px;
    padding: 40px 24px; text-align:center; cursor:pointer;
    transition: all .2s; background: var(--mn-bg);
  }
  .mn-dropzone.over { border-color: var(--mn-green); background: var(--mn-green-lt); }
  .mn-dropzone-icon { font-size:36px; margin-bottom:10px; }
  .mn-dropzone-text { font-size:14px; color:var(--mn-muted); margin-bottom:6px; }
  .mn-dropzone-text strong { color:var(--mn-green); }
  .mn-dropzone-sub  { font-size:12px; color:var(--mn-muted); }
  .mn-file-badge { display:inline-flex; align-items:center; gap:8px; margin-top:12px; padding:8px 14px; background:var(--mn-green-lt); border-radius:20px; font-size:13px; color:var(--mn-green); font-weight:500; }
  .mn-file-rm { cursor:pointer; font-size:15px; color:var(--mn-muted); }

  /* Summary table */
  .mn-summary { background:var(--mn-bg); border-radius:8px; border:1px solid var(--mn-border); overflow:hidden; margin-bottom:20px; }
  .mn-summary-row { display:grid; grid-template-columns:140px 1fr; padding:10px 16px; border-bottom:1px solid var(--mn-border); font-size:13px; }
  .mn-summary-row:last-child { border-bottom:none; }
  .mn-summary-key { color:var(--mn-muted); }
  .mn-summary-val { color:var(--mn-text); font-weight:500; }

  /* Alert */
  .mn-alert { padding:12px 16px; border-radius:8px; font-size:13px; margin-bottom:16px; }
  .mn-alert.err  { background:var(--mn-danger-bg); color:var(--mn-danger); border:1px solid #FECACA; }
  .mn-alert.info { background:var(--mn-green-lt); color:var(--mn-green); border:1px solid #A7F3D0; }

  /* Buttons */
  .mn-nav { display:flex; justify-content:space-between; align-items:center; margin-top:24px; }
  .mn-btn {
    padding:10px 22px; border-radius:8px; font-size:14px; font-weight:600;
    cursor:pointer; border:none; transition:all .15s; font-family:inherit;
    display:inline-flex; align-items:center; gap:6px;
  }
  .mn-btn:disabled { opacity:.45; cursor:not-allowed; }
  .mn-btn-primary   { background:var(--mn-green); color:#fff; }
  .mn-btn-primary:hover:not(:disabled) { background:#166248; }
  .mn-btn-secondary { background:var(--mn-white); color:var(--mn-text); border:1px solid var(--mn-border); }
  .mn-btn-secondary:hover:not(:disabled) { border-color:var(--mn-green); color:var(--mn-green); }

  /* Success screen */
  .mn-success { text-align:center; padding:40px 0; }
  .mn-success-icon { font-size:56px; margin-bottom:16px; }
  .mn-success-title { font-family:'DM Serif Display',serif; font-size:26px; margin-bottom:8px; }
  .mn-success-sub { font-size:14px; color:var(--mn-muted); }

  /* Section divider */
  .mn-section { margin-top:24px; padding-top:20px; border-top:1px solid var(--mn-border); }
  .mn-section-title { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--mn-muted); margin-bottom:12px; }

  /* Time row */
  .mn-time-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px; }
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

// ── Step 1: Core Restaurant Details ───────────────────────────────────────────

function Step1({ f, set, errors }) {
  const [slugStatus, setSlugStatus] = useState("idle"); // idle|checking|ok|taken
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
        const data = await res.json();
        setSlugStatus(data.available ? "ok" : "taken");
      } catch {
        setSlugStatus("idle");
      }
    }, 600);
  };

  const toggleCuisine = (id) => {
    const cur = f.cuisines || [];
    set("cuisines", cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]);
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

    // Cuisines
    h("div", { className: "mn-field mn-field-full", style: { marginTop: 4 } },
      h("label", { className: "mn-label" }, "Cuisine Types"),
      h("div", { className: "mn-pill-group", style: { marginTop: 6 } },
        CUISINE_OPTIONS.map((c) =>
          h(Pill, {
            key: c.id, label: c.label,
            selected: (f.cuisines || []).includes(c.id),
            onToggle: () => toggleCuisine(c.id),
          })
        )
      )
    ),

    // Kitchen workflow
    h("div", { className: "mn-section" },
      h("p", { className: "mn-section-title" }, "Kitchen Workflow"),
      h("div", { className: "mn-workflow-grid" },
        WORKFLOW_OPTIONS.map((w) =>
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
  const toggle = (id) => set(id, !f[id]);
  return h(Fragment, null,
    h("div", { className: "mn-fulfill-grid" },
      FULFILLMENT_OPTIONS.map((opt) =>
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
    f.dine_in && h("div", { className: "mn-field", style: { marginTop: 20, maxWidth: 200 } },
      h(Field, { label: "Table Count", hint: "Total physical tables" },
        h(Input, { type: "number", value: f.table_count, onChange: (v) => set("table_count", parseInt(v) || 0) })
      )
    )
  );
}

// ── Step 3: WhatsApp & Automation Config ──────────────────────────────────────

function Step3({ f, set, errors }) {
  const e = (k) => errors.includes(k);
  return h(Fragment, null,
    h("div", { style: { marginBottom: 16, padding: "10px 14px", background: "#EAF3DE", borderRadius: 8, fontSize: 12, color: "#3B6D11", lineHeight: 1.7 } },
      "📖 All values below come from ",
      h("a", { href: "https://developers.facebook.com/apps/", target: "_blank", rel: "noreferrer", style: { color: "#1D9E75", fontWeight: 600 } }, "Meta for Developers"),
      " and ",
      h("a", { href: "https://business.facebook.com/", target: "_blank", rel: "noreferrer", style: { color: "#1D9E75", fontWeight: 600 } }, "Meta Business Manager"),
      ". Set up once, never touched again."
    ),
    h("div", { className: "mn-grid" },
      h(Field, { label: "WhatsApp Number *", hint: "Bot sends/receives from this number", error: e("whatsapp_number") ? "required" : "" },
        h(Input, { value: f.whatsapp_number, onChange: (v) => set("whatsapp_number", v), placeholder: "919444000000", hasError: e("whatsapp_number") }),
        h("div", { style: { fontSize: 11, color: "#666", marginTop: 4 } }, "Country code + number, no + or spaces. Find in: Meta Business Manager → Accounts → WhatsApp Accounts.")
      ),
      h(Field, { label: "WABA ID", hint: "WhatsApp Business Account ID" },
        h(Input, { value: f.waba_id, onChange: (v) => set("waba_id", v), placeholder: "1234567890" }),
        h("div", { style: { fontSize: 11, color: "#666", marginTop: 4 } }, "Meta Business Manager → Accounts → WhatsApp Accounts → click your account → ID shown at top.")
      ),
      h(Field, { label: "Phone Number ID *", error: e("phone_number_id") ? "required" : "", hint: "Different from your phone number" },
        h(Input, { value: f.phone_number_id, onChange: (v) => set("phone_number_id", v), placeholder: "1234567890", hasError: e("phone_number_id") }),
        h("div", { style: { fontSize: 11, color: "#666", marginTop: 4 } }, "developers.facebook.com/apps → Your App → WhatsApp → API Setup → Phone Number ID (numeric string).")
      ),
      h(Field, { label: "Meta System Access Token *", error: e("meta_access_token") ? "required" : "", hint: "Permanent token — never expires" },
        h(Input, { value: f.meta_access_token, onChange: (v) => set("meta_access_token", v), placeholder: "EAAxxxxxx…", hasError: e("meta_access_token") }),
        h("div", { style: { fontSize: 11, color: "#666", marginTop: 4 } }, "Meta Business Manager → Settings → System Users → Add System User (Admin) → Generate Token → tick whatsapp_business_messaging + whatsapp_business_management → Generate. Copy immediately.")
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
    setParseStatus(`📄 ${file.name} selected — catalog will be processed on submit.`);
    // Note: actual parsing (XLSX→JSON) is handled server-side after multipart upload,
    // or can be done client-side via SheetJS if bundled.
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
    const rows = [
      ["item_name","category","price","description","is_veg","sku","slot"],
      ["Masala Dosa","Breakfast","80","Crispy dosa with potato filling","TRUE","SKU001","all_day"],
      ["Chicken Biryani","Main Course","220","Fragrant rice with spiced chicken","FALSE","SKU002","lunch"],
      ["Filter Coffee","Beverages","30","Traditional South Indian filter coffee","TRUE","SKU003","all_day"],
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "munafe_menu_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return h(Fragment, null,
    h("div", { style: { marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#F0F6FF", borderRadius: 8, border: "1px solid #C5DDF8" } },
      h("div", null,
        h("div", { style: { fontSize: 13, fontWeight: 600, color: "#185FA5" } }, "📥 Download menu template"),
        h("div", { style: { fontSize: 11, color: "#555", marginTop: 2 } }, "Fill in your items and upload below. Columns: item_name, category, price, description, is_veg, sku, slot")
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
        h("strong", null, "Click or drag"), " your menu catalog here"
      ),
      h("p", { className: "mn-dropzone-sub" }, "Supports .xlsx, .xls, .csv — columns: Item Name, Price, SKU, Slot"),
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
      "💡 Columns expected: Item Name · Price · SKU (optional) · Slot (lunch / dinner / all_day)"
    )
  );
}

// ── Step 5: Review & Checkout ─────────────────────────────────────────────────

function Step5({ form, onRedirect }) {
  const [status, setStatus] = useState("idle");   // idle|loading|error
  const [errMsg, setErrMsg] = useState("");

  const country = COUNTRIES.find((c) => c.code === form.country_code);

  const summaryRows = [
    ["Business name",   form.display_name || form.name],
    ["Subdomain",       form.slug ? `autom8.works/${form.slug}` : "—"],
    ["Location",        [form.city, country?.label].filter(Boolean).join(", ")],
    ["Cuisines",        (form.cuisines || []).join(", ") || "—"],
    ["Kitchen flow",    form.kitchen_workflow],
    ["Services",        FULFILLMENT_OPTIONS.filter((o) => form[o.id]).map((o) => o.label).join(", ") || "—"],
    ["WhatsApp",        form.whatsapp_number || "—"],
    ["Timezone",        form.timezone],
    ["Payment mode",    form.payment_mode],
    ["Menu file",       form.menu_file?.name || (form.menu_catalog?.length ? `${form.menu_catalog.length} items` : "Not uploaded")],
  ];

  const handleSubmit = async () => {
    setStatus("loading"); setErrMsg("");

    // Build multipart OR JSON body depending on whether a file was attached
    let fetchUrl;
    let fetchOptions;
    if (form.menu_file) {
      fetchUrl = `${API_BASE}/api/v1/register/upload`;
      const fd = new FormData();
      fd.append("data", JSON.stringify(buildPayload(form)));
      fd.append("menu_file", form.menu_file);
      fetchOptions = { method: "POST", body: fd };
    } else {
      fetchUrl = `${API_BASE}/api/v1/register`;
      fetchOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      };
    }

    try {
      const res  = await fetch(fetchUrl, fetchOptions);
      const data = await res.json();
      if (res.ok) {
        // Redirect to MoR checkout
        window.location.href = data.checkout_url;
      } else {
        setStatus("error");
        setErrMsg(data.detail || "Registration failed. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrMsg("Could not reach the Munafe server. Please check your connection.");
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
    h("div", { className: "mn-alert info" },
      "After clicking Submit, you'll be redirected to complete your subscription payment."
    ),
    h("div", { style: { marginTop: 12 } },
      h("button", {
        className: "mn-btn mn-btn-primary",
        disabled: status === "loading",
        onClick: handleSubmit,
      }, status === "loading" ? "Processing…" : "Submit & Subscribe →")
    )
  );
}

// ── Payload builder ───────────────────────────────────────────────────────────
function buildPayload(form) {
  return {
    name:             form.name,
    display_name:     form.display_name,
    slug:             form.slug,
    city:             form.city,
    country_code:     form.country_code,
    currency_code:    form.currency_code,
    cuisines:         form.cuisines,
    kitchen_workflow: form.kitchen_workflow,
    dine_in:          form.dine_in,
    takeaway:         form.takeaway,
    door_delivery:    form.door_delivery,
    table_reservation:form.table_reservation,
    table_count:      form.table_count,
    whatsapp_number:  form.whatsapp_number,
    waba_id:          form.waba_id,
    phone_number_id:  form.phone_number_id,
    meta_access_token:form.meta_access_token,
    timezone:         form.timezone,
    payment_mode:     form.payment_mode,
    lunch_start:      form.has_lunch  ? form.lunch_start  : null,
    lunch_end:        form.has_lunch  ? form.lunch_end    : null,
    dinner_start:     form.has_dinner ? form.dinner_start : null,
    dinner_end:       form.has_dinner ? form.dinner_end   : null,
    menu_catalog:     form.menu_catalog || [],
    contact_phone:    form.contact_phone,
    manager_phone:    form.manager_phone,
    address_line1:    form.address_line1,
  };
}

// ── Main App ──────────────────────────────────────────────────────────────────

function MunafeRegistrationForm() {
  const [step,   setStep  ] = useState(0);
  const [form,   setForm  ] = useState(makeDefault);
  const [errors, setErrors] = useState([]);

  // Inject CSS once
  useEffect(() => {
    if (document.getElementById("munafe-block-css")) return;
    const style = document.createElement("style");
    style.id = "munafe-block-css";
    style.textContent = CSS;
    document.head.appendChild(style);
  }, []);

  const set = useCallback((k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => e.filter((x) => x !== k));
  }, []);

  const validate = () => {
    const req = REQUIRED[step] || [];
    const bad = req.filter((k) => {
      const v = form[k];
      return v == null || String(v).trim() === "";
    });
    setErrors(bad);
    return bad.length === 0;
  };

  const next = () => { if (validate()) setStep((s) => s + 1); };
  const back = () => { setErrors([]); setStep((s) => s - 1); };

  const stepComponents = [
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
        h("span", null, "🍽️"),
        h("span", null, "Munafe")
      ),
      h("p", { className: "mn-header-sub" }, "Cross-border restaurant engine · Self-service onboarding")
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
        "Tell us about your restaurant — Munafe will set up your sovereign regional database.",
        "Select the fulfillment modes your team manages.",
        "Connect your Meta WhatsApp Business account and configure service hours.",
        "Upload your daily menu catalog in Excel or CSV format.",
        "Review your details, then proceed to activate your subscription.",
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
