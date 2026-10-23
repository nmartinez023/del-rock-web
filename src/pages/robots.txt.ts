// robots.txt con la URL del sitio actual (cambia sola cuando se configure el dominio propio).
import type { APIRoute } from 'astro';
import { LANZADO } from '../lib/lanzamiento';

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('/sitemap-index.xml', site).toString();
  // Antes del lanzamiento solo se puede rastrear la página de "Próximamente".
  if (!LANZADO) {
    return new Response('User-agent: *\nAllow: /$\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return new Response(`User-agent: *\nAllow: /\nDisallow: /keystatic\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${sitemap}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
