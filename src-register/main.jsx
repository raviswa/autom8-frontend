// main.jsx — Vite entry point for the Munafe registration form
// Compiled by Vite into wp-plugin/assets/register.bundle.js (IIFE, self-contained)

import React from 'react';
import { createRoot } from 'react-dom/client';
import MunafeRegistrationForm from './RegistrationForm';

const rootEl = document.getElementById('munafe-registration-root');

if (rootEl) {
  createRoot(rootEl).render(
    React.createElement(MunafeRegistrationForm)
  );
}
