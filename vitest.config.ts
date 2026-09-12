import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    // globals: true lets @testing-library/react register its automatic DOM
    // cleanup between tests; without it rendered components accumulate.
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: { alias: { '@': resolve(import.meta.dirname, '.') } },
});
