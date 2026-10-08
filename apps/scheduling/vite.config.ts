import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The local API, started with PORT=4310 (see docs/VERGO-SCHEDULING.md).
const API = 'http://localhost:4310';

// VERGO Scheduling: the desktop admin tool's screens, served by the main API
// at /scheduling/ behind the admin login. `npm run build` writes into the
// API's public folder; commit the result, as the API serves it as it is.
export default defineConfig({
  base: '/scheduling/',
  plugins: [svelte()],
  build: {
    outDir: '../api/public/scheduling',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // In dev, proxy the API (and its login) so the admin session cookie works on one origin.
    proxy: {
      '/api': API,
      '/login': API,
    },
  },
});
