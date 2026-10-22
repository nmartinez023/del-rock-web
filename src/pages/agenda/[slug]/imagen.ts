// Imagen de un evento, servida desde nuestro dominio sin guardarla en el repo.
// Corre en el Worker: busca la URL original del evento (solo publicados, así no es un proxy abierto),
// la pide a la ticketera una vez y la deja en caché (navegador + Cloudflare).
import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { slugsDeAgenda } from '../../../lib/util';

export const prerender = false;

const MAX_BYTES = 8 * 1024 * 1024;
const CACHE = 'public, max-age=604800, s-maxage=2592000'; // 7 días en el navegador, 30 en Cloudflare

export const GET: APIRoute = async ({ params, request }) => {
  // Acepta la URL pública ("cruzando-el-charco-rosario-21-noviembre") y la vieja (nombre del archivo).
  const slugs = await slugsDeAgenda();
  const id = [...slugs].find(([, s]) => s === params.slug)?.[0] ?? params.slug;
  const fecha = id ? await getEntry('agenda', id) : undefined;
  const imagen = fecha?.data.estado === 'publicado' ? fecha.data.imagen : undefined;
  if (!imagen) return new Response('Sin imagen', { status: 404 });
  // Las fotos que pasan por el redimensionador de Cloudflare de otro sitio ("/cdn-cgi/image/<opciones>/…",
  // como las de TuEntrada) no se pueden pedir desde un Worker: se pide la original.
  const origen = imagen.replace(/\/cdn-cgi\/image\/[^/]+\//, '/');

  // Caché de Cloudflare (Cache API). En workers.dev puede no estar disponible: si falla, seguimos sin ella.
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const clave = new Request(new URL(request.url).origin + new URL(request.url).pathname);
  const guardada = await cache?.match(clave).catch(() => undefined);
  if (guardada) return guardada;

  let res: Response;
  try {
    res = await fetch(origen, {
      headers: { 'user-agent': 'DelRockBot/1.0 (+https://del-rock-web.delrockarg.workers.dev)' },
      // @ts-expect-error: opción propia de Cloudflare para cachear la respuesta de origen
      cf: { cacheTtl: 2592000, cacheEverything: true },
    });
  } catch {
    return new Response('Imagen no disponible', { status: 502 });
  }

  const tipo = res.headers.get('content-type') ?? '';
  const largo = Number(res.headers.get('content-length') ?? 0);
  if (!res.ok || !tipo.startsWith('image/') || largo > MAX_BYTES) {
    return new Response('Imagen no disponible', { status: 502, headers: { 'cache-control': 'public, max-age=300' } });
  }

  const respuesta = new Response(res.body, {
    headers: { 'content-type': tipo, 'cache-control': CACHE, 'x-content-type-options': 'nosniff' },
  });
  if (cache) {
    try {
      await cache.put(clave, respuesta.clone());
    } catch {
      // sin Cache API: queda la caché del navegador y la del fetch de origen
    }
  }
  return respuesta;
};
