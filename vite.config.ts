import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Project pages: VITE_BASE_PATH=/pdf-real/
// Domínio customizado / preview local: VITE_BASE_PATH=/ ou omitido
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react()],
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'threads',
  },
});
