import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
<<<<<<< HEAD
  optimizeDeps: {
    entries: ['index.html'],
  },
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  build: {
    target: 'es2022',
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
<<<<<<< HEAD
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
=======
    port: 5173,
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  },
});
