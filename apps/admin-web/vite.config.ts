import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
      },
    },
  },
  // Bound concurrent jsdom/Ant Design instances on development machines and CI.
  test: { environment: 'jsdom', restoreMocks: true, maxWorkers: 2 },
});
