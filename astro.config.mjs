// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';
import cloudflare from '@astrojs/cloudflare';

// URL pública para links canónicos y previews al compartir. Cuando tengas dominio
// propio, cargá SITE_URL en las variables de build del Worker en Cloudflare.
const site = process.env.SITE_URL ?? 'https://del-rock-web.delrockarg.workers.dev';

// Todo el sitio se prerenderiza como HTML estático. Lo único que corre en el
// Worker es el panel de Keystatic (/keystatic y /api/keystatic), que guarda
// cada cambio como commit en GitHub y eso dispara un nuevo deploy.
export default defineConfig({
  site,
  adapter: cloudflare({
    // Las imágenes se optimizan con sharp al compilar: no hace falta Cloudflare Images.
    imageService: 'compile',
  }),
  integrations: [react(), markdoc(), keystatic()],
  // Sin sesiones de Astro: así el adapter no crea un KV en Cloudflare.
  session: false,
  image: {
    // Imágenes del feed de Instagram: Astro las descarga y optimiza en el build.
    remotePatterns: [
      { protocol: 'https', hostname: '**.cdninstagram.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
    ],
  },
});
