import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vuetify from 'vite-plugin-vuetify'

// Deployed as a GitHub Pages project site, so every asset is served from a
// sub-path rather than the domain root.
const BASE = '/austria-population-tracker/'

export default defineConfig({
  base: BASE,
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Plotly and MapLibre are both large and needed on different routes.
        // Splitting them keeps the initial load from carrying either one.
        manualChunks(id: string) {
          if (id.includes('plotly.js')) return 'plotly'
          if (id.includes('maplibre-gl')) return 'maplibre'
          return undefined
        },
      },
    },
  },
})
