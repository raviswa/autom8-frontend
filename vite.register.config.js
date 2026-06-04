// vite.register.config.js
// Place at repo root alongside vite.config.js
//
// Build:  npm run build:register
// Output: dist-register/register.bundle.js  → upload to WP plugin assets/

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],

    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(
        env.VITE_API_URL || 'https://autom8-backend-production.up.railway.app'
      ),
    },

    build: {
      outDir:      resolve(__dirname, 'dist-register'),
      emptyOutDir: true,

      lib: {
        entry:    resolve(__dirname, 'src-register/main.jsx'),
        name:     'MunafeRegister',
        formats:  ['iife'],
        fileName: () => 'register.bundle.js',
      },

      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          banner: 'var process={env:{NODE_ENV:"production"}};',
        },
      },

      cssCodeSplit: false,
      minify:      'esbuild',
    },
  };
});
