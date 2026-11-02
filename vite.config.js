import { defineConfig } from 'vite'

export default defineConfig({
  server: { host: true, port: 5173 },
  preview: { host: true, port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // three changes only on a deliberate upgrade; game code changes on
        // every deploy. Its own content-hashed chunk keeps a returning
        // player's cached copy valid across game deploys.
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three'
        },
      },
    },
    // three alone is ~500 kB minified and cannot be split further; the
    // per-chunk gzip budgets in tools/check-bundle-size.js are the real guard.
    chunkSizeWarningLimit: 600,
  },
})
