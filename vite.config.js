import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — changes rarely, cached aggressively by browser
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],

          // Supabase client — large, separate chunk
          'supabase-vendor': ['@supabase/supabase-js'],

          // Axios — used for API calls
          'axios-vendor': ['axios'],
        },
      },
    },
    // Raise warning threshold to 600kB so per-chunk warnings are meaningful
    chunkSizeWarningLimit: 600,
  },
})
