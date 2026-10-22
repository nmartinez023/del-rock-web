// Ticketek (ticketek.com.ar): app AngularJS sin eventos en el HTML. La web los lee de su CMS
// (prod-cms-api.ticketek.com.ar): la portada lista los eventos vigentes (sin fecha) y el nodo de cada
// evento trae fechas, lugar, precio e imagen. Se leen solo los de música.
// robots.txt prohíbe /websource/ (la compra): nunca se pide, el link es a la página del evento.
import { limpiar } from '../texto.mjs';
import { htmlATexto } from './entradaplay.mjs';
import { bajar, bajarVarias } from './paginas.mjs';

const API = 'https://prod-cms-api.ticketek.com.ar/api/1.0/';
const WEB = 'https://www.ticketek.com.ar/';
const MAX_EVENTOS = 150;

/** "seru-giran/arena-maipu" → URL del nodo. El "?path=" va codificado dentro de la ruta, como lo pide la web. */
export const urlDeNodo = (ruta) => `${API}node%3Fpath%3D${encodeURIComponent(ruta.replace('/', '--'))}`;

export function urlDeDatos() {
  return urlDeNodo('home');
}

const conHttps = (u) => (u && u.startsWith('//') ? `https:${u}` : (u ?? ''));

/** Los eventos de la portada (repetidos en varias secciones), solo los de música. */
export function eventosDePortada(portada) {
  const vistos = new Map();
  for (const widgets of Object.values(portada.widgets ?? {})) {
    for (const w of widgets ?? []) {
      for (const a of w.artists ?? []) {
        const musica = (a.categories ?? []).some((c) => c.tid === '5' || /^m[uú]sica$/i.test(c.title));
        if (a.url && musica && !vistos.has(a.url)) vistos.set(a.url, a);
      }
    }
  }
  return [...vistos.values()];
}

export async function descargar(url, { agente, pedir = fetch, espera = 1000 } = {}) {
  const portada = JSON.parse(await bajar(url, { agente, pedir }));
  const items = eventosDePortada(portada).slice(0, MAX_EVENTOS);
  const paginas = await bajarVarias(items.map((i) => urlDeNodo(i.url)), { agente, pedir, espera });
  const porUrl = new Map(items.map((i) => [urlDeNodo(i.url), i]));
  return JSON.stringify(paginas.map((p) => ({ item: porUrl.get(p.url), nodo: JSON.parse(p.cuerpo) })));
}

export function extraer(cuerpo) {
  let lista;
  try {
    lista = JSON.parse(cuerpo);
  } catch {
    return [];
  }
  if (!Array.isArray(lista)) return [];

  return lista.flatMap(({ item = {}, nodo }) => {
    if (!nodo?.title) return [];
    const ticket = Object.values(nodo.widgets ?? {}).flat().find((w) => w?.type === 'tkt-show-ticket');
    if (ticket?.state === 'finished') return [];
    const venue = nodo.venue ?? item.venue ?? {};
    const caba = [venue.state, venue.city].some((t) => /capital federal|\bcaba\b|ciudad aut[oó]noma/i.test(t ?? ''));
    const contenido = Object.values(nodo.widgets ?? {}).flat().find((w) => w?.type === 'tkt-content');
    const pagina = nodo.metatags?.canonical || WEB + item.url;
    const funciones = [nodo.google_structured_data].flat().filter((d) => d?.startDate && /Event$/.test(String(d['@type'])));

    return funciones.map((f) => ({
      nombre: limpiar(nodo.title),
      inicio: String(f.startDate),
      cancelado: /Cancelled|Postponed/i.test(String(f.eventStatus ?? '')),
      lugar: limpiar(venue.title ?? ''),
      // En CABA la "ciudad" de Ticketek es el barrio (Palermo, Núñez…).
      localidad: caba ? 'Buenos Aires' : limpiar(venue.city ?? ''),
      region: caba ? 'CABA' : limpiar(venue.state ?? ''),
      direccion: limpiar(venue.address ?? ''),
      url: pagina,
      imagen: conHttps(nodo.metatags?.property?.['og:image'] || item.image),
      precioDesde: Number(nodo.lowerPrice) > 0 ? Math.round(Number(nodo.lowerPrice)) : null,
      descripcion: contenido?.content ? htmlATexto(contenido.content).slice(0, 3000) : '',
      artistas: nodo.artist?.title ? [limpiar(nodo.artist.title)] : [],
      id: `${nodo.showcode || nodo.nid}-${String(f.startDate).slice(0, 16)}`,
    }));
  });
}
