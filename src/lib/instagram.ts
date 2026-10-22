/**
 * Últimos posts de @del.rock.arg con la API de Instagram (Instagram API with Instagram Login).
 * Se consulta UNA vez por build: el token nunca llega al navegador y las imágenes
 * las descarga y optimiza Astro, así que la web no depende de Instagram en cada visita.
 *
 * Sin INSTAGRAM_TOKEN (o si la API falla) devuelve [] y la home muestra solo el botón al perfil.
 */
export interface PostInstagram {
  id: string;
  imagen: string;
  link: string;
  texto: string;
  esCarrusel: boolean;
  esVideo: boolean;
}

interface MediaApi {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
}

const CAMPOS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';

let cache: Promise<PostInstagram[]> | undefined;

export function ultimosPosts(cantidad = 6): Promise<PostInstagram[]> {
  cache ??= pedir(12);
  return cache.then((p) => p.slice(0, cantidad));
}

async function pedir(limite: number): Promise<PostInstagram[]> {
  const token = import.meta.env.INSTAGRAM_TOKEN;
  if (!token) return [];

  const url = new URL('https://graph.instagram.com/me/media');
  url.searchParams.set('fields', CAMPOS);
  url.searchParams.set('limit', String(limite));
  url.searchParams.set('access_token', token);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`[instagram] La API respondió ${res.status}: ${await res.text()}`);
      return [];
    }
    const { data } = (await res.json()) as { data: MediaApi[] };
    return data
      .map((m) => ({
        id: m.id,
        imagen: (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) ?? '',
        link: m.permalink,
        texto: (m.caption ?? '').split('\n')[0].slice(0, 140),
        esCarrusel: m.media_type === 'CAROUSEL_ALBUM',
        esVideo: m.media_type === 'VIDEO',
      }))
      .filter((p) => p.imagen);
  } catch (err) {
    console.warn('[instagram] No se pudo leer el feed:', err);
    return [];
  }
}
