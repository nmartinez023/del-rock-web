// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';

// El panel de Keystatic (/keystatic) corre solo en desarrollo: editás local,
// commiteás y Cloudflare Pages publica el sitio estático.
const isDev = process.argv.includes('dev');

export default defineConfig({
  site: 'https://delrock.com.ar',
  integrations: [react(), markdoc(), ...(isDev ? [keystatic()] : [])],
  image: {
    // Imágenes del feed de Instagram: Astro las descarga y optimiza en el build.
    remotePatterns: [
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
    ],
  },
});
