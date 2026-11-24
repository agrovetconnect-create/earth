import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    target: 'es2022',
    outDir: 'dist/client',
    emptyOutDir: true,
    // maplibre-gl is a self-contained rendering engine (~1.05 MB) that cannot
    // be meaningfully split further without replacing the mapping library.
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('maplibre-gl')) return 'map';
          if (id.includes('pdfjs-dist')) return 'pdf';
          if (id.includes('react-markdown')) return 'markdown';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/webhook': 'http://localhost:3000',
      '/internal': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
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
