import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    target: 'es2022',
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    ...(process.env.DISABLE_HMR === 'true' ? { hmr: false, ws: false } : {}),
    watch: {
      ignored: [
        '**/mobile/**',
        '**/mobile-planning/**',
        '**/tests/**',
        '**/supabase/**',
        '**/dist/**',
      ],
    },
  },
});
