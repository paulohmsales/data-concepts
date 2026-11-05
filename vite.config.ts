import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // the content API (npm run api) serves /api in development
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000, // the acceptance checks run thousands of simulations
  },
})
