// AllAccess (allaccess.com.ar): la portada lista los eventos (solo nombre y foto) y la página de cada
// evento publica JSON-LD con fecha, lugar y precios. La imagen sale de og:image (el JSON-LD no la trae).
import { extraer as extraerJsonLd } from './jsonld.mjs';
import { bajar, bajarVarias } from './paginas.mjs';

const WEB = 'https://www.allaccess.com.ar/';
const MAX_EVENTOS = 120;

export function urlDeDatos() {
  return WEB;
}

/** Los slugs de /event/<slug> que aparecen en la portada, sin repetir. */
export function slugsDePortada(html) {
  const re = /href=['"](?:https:\/\/www\.allaccess\.com\.ar\/|\.\.\/|\/)event\/([^'"\/#?]+)['"]/g;
  return [...new Set([...html.matchAll(re)].map((m) => m[1]))];
}

/** De cada página nos quedamos solo con el JSON-LD y la imagen: el resto es la app. */
function recorte(html) {
  const jsonld = html.match(/<script\b[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? [];
  const imagen = /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] ?? '';
  return { jsonld: jsonld.join('\n'), imagen };
}

export async function descargar(url, { agente, pedir = fetch, espera = 1000 } = {}) {
  const slugs = slugsDePortada(await bajar(url, { agente, pedir })).slice(0, MAX_EVENTOS);
  const paginas = await bajarVarias(slugs.map((s) => `${WEB}event/${s}`), { agente, pedir, espera });
  return JSON.stringify(paginas.map((p) => ({ url: p.url, ...recorte(p.cuerpo) })));
}

export function extraer(cuerpo) {
  let paginas;
  try {
    paginas = JSON.parse(cuerpo);
  } catch {
    return [];
  }
  if (!Array.isArray(paginas)) return [];

  return paginas.flatMap((p) =>
    extraerJsonLd(p.jsonld ?? '').map((ev, i) => {
      const slug = p.url.split('/event/')[1] ?? '';
      return {
        ...ev,
        url: p.url,
        imagen: ev.imagen || p.imagen || '',
        // La "descripción" del JSON-LD es solo la fecha o el lugar en texto ("Domingo 25 de Octubre 2026", "En River").
        descripcion: '',
        localidad: ev.localidad.replace(/^[A-Z]\d{4}[A-Z]{0,3}\s+/, ''), // sin código postal ("W3400 Corrientes")
        region: /^buenos aires$/i.test(ev.localidad.trim()) ? 'CABA' : ev.region, // "San Isidro, Buenos Aires" sí es provincia
        id: i ? `${slug}-${i}` : slug,
      };
    }),
  );
}
