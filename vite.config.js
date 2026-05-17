// vite.config.js
// Add this comment to force cache bust
// build: 2026-05-17

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    strictPort: false,
    hmr: {
      host: 'localhost',
      port: 3000,
      protocol: 'ws'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'utils': ['axios', 'date-fns', 'zustand']
        }
      }
    }
  },
  preview: {
    port: 3000,
    strictPort: false,
    host: true
  }
})
