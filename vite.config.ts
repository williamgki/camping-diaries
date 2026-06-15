import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative base so the build works at any path — GitHub Pages project sites
  // serve at /<repo>/, not the domain root.
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1100, // maplibre-gl is a single large chunk
  },
})
