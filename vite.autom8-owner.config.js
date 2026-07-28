// vite.autom8-owner.config.js
// Build: npm run build:autom8-owner
// Output: dist-autom8-owner/owner.bundle.js

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(
        env.VITE_API_URL || 'https://api.autom8.works',
      ),
    },
    build: {
      outDir: resolve(__dirname, 'dist-autom8-owner'),
      emptyOutDir: true,
      lib: {
        entry: resolve(__dirname, 'src-autom8-owner/main.jsx'),
        name: 'Autom8OwnerConsole',
        formats: ['iife'],
        fileName: () => 'owner.bundle.js',
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
          banner: 'var process={env:{NODE_ENV:"production"}};',
        },
      },
      cssCodeSplit: false,
      minify: 'esbuild',
    },
  };
});
