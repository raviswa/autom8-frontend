// src/pages/supply/api.js
// ============================================================================
// Supply API URL resolver — re-exports from the canonical config location.
//
// All supply pages MUST import from '../../config/api', not from this file.
// This file is kept only as a thin re-export shim so that any legacy import
// of './api' still works without errors.
//
// Canonical source of truth: src/config/api.js
// ============================================================================
 
export { resolveApiBase, resolveWsBase, resolveSupplyApiBase } from '../../config/api';
