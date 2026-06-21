import { defineConfig } from 'vite';

// base: './' keeps asset paths relative so the build works on GitHub Pages,
// Netlify, Vercel, or any static host without extra config.
export default defineConfig({
  base: './',
  server: { open: true },
});
