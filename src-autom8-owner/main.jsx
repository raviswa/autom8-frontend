import React from 'react';
import { createRoot } from 'react-dom/client';
import OwnerConsole from './OwnerConsole';

const rootEl = document.getElementById('autom8-owner-root');
if (rootEl) {
  createRoot(rootEl).render(React.createElement(OwnerConsole));
}
