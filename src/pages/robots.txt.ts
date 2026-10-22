// robots.txt con la URL del sitio actual (cambia sola cuando se configure el dominio propio).
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('/sitemap-index.xml', site).toString();
  return new Response(`User-agent: *\nAllow: /\nDisallow: /keystatic\nDisallow: /api/\n\nSitemap: ${sitemap}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
