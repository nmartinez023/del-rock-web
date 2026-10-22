// TuEntrada (tuentrada.com): app Next.js sin JSON-LD ni API pública (la suya pide login).
// Los datos vienen dentro del HTML, en el "flight data" de Next (self.__next_f.push(...)):
// la portada trae los eventos destacados y la página de cada evento sus funciones (fecha, lugar, ciudad).
// No publica precio ni descripción. robots.txt: ai-train=no (no se usa para entrenar nada).
import { limpiar } from '../texto.mjs';
import { bajar, bajarVarias } from './paginas.mjs';

const WEB = 'https://tuentrada.com/';
const MAX_EVENTOS = 60;
const MAX_FUNCIONES = 8; // los cines publican decenas de funciones: con las primeras alcanza

export function urlDeDatos() {
  return WEB;
}

/** Junta los fragmentos de datos que Next deja en la página. */
export function datosDeNext(html) {
  return [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)]
    .map((m) => {
      try {
        return JSON.parse(`"${m[1]}"`);
      } catch {
        return '';
      }
    })
    .join('');
}

/** El valor JSON (array u objeto) que empieza en la posición i, contando llaves. */
function valorEn(texto, i) {
  let prof = 0;
  let enTexto = false;
  for (let j = i; j < texto.length; j++) {
    const c = texto[j];
    if (enTexto) {
      if (c === '\\') j++;
      else if (c === '"') enTexto = false;
    } else if (c === '"') enTexto = true;
    else if (c === '[' || c === '{') prof++;
    else if (c === ']' || c === '}') {
      prof--;
      if (prof === 0) {
        try {
          return JSON.parse(texto.slice(i, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Todos los arrays que siguen a "clave": en el texto. */
function arraysDe(texto, clave) {
  const marca = `"${clave}":[`;
  const salida = [];
  for (let i = texto.indexOf(marca); i >= 0; i = texto.indexOf(marca, i + 1)) {
    const v = valorEn(texto, i + marca.length - 1);
    if (Array.isArray(v)) salida.push(v);
  }
  return salida;
}

/** Eventos de la portada (carrusel y listados), sin repetir. */
export function eventosDePortada(html) {
  const texto = datosDeNext(html);
  const vistos = new Map();
  for (const lista of [...arraysDe(texto, 'banners'), ...arraysDe(texto, 'items')]) {
    for (const e of lista) {
      if (/^event(Group)?$/.test(e?.model) && e.slug && !vistos.has(e.slug)) vistos.set(e.slug, e);
    }
  }
  return [...vistos.values()];
}

export async function descargar(url, { agente, pedir = fetch, espera = 1000 } = {}) {
  const eventos = eventosDePortada(await bajar(url, { agente, pedir })).slice(0, MAX_EVENTOS);
  const urlDe = (e) => WEB + encodeURIComponent(e.slug);
  const paginas = await bajarVarias(eventos.map(urlDe), { agente, pedir, espera });
  const porUrl = new Map(eventos.map((e) => [urlDe(e), e]));
  return JSON.stringify(
    paginas.map((p) => ({ evento: porUrl.get(p.url), funciones: arraysDe(datosDeNext(p.cuerpo), 'eventSessions')[0] ?? [] })),
  );
}

export function extraer(cuerpo) {
  let lista;
  try {
    lista = JSON.parse(cuerpo);
  } catch {
    return [];
  }
  if (!Array.isArray(lista)) return [];

  return lista.flatMap(({ evento = {}, funciones = [] }) =>
    funciones
      .filter((f) => f?.date && f.type !== 'CANCELLED')
      .slice(0, MAX_FUNCIONES)
      .map((f) => ({
        nombre: limpiar(evento.name || f.name || ''),
        inicio: String(f.date),
        cancelado: /cancel/i.test(String(f.status ?? '')),
        lugar: limpiar(f.venue ?? ''),
        localidad: limpiar(f.city ?? ''),
        region: /^buenos aires$/i.test(f.city ?? '') ? 'CABA' : '', // las ciudades del conurbano vienen con su nombre
        direccion: '',
        url: WEB + encodeURIComponent(evento.slug ?? ''),
        // La original, sin el redimensionador de Cloudflare (desde un Worker no se puede pedir).
        imagen: (evento.imageMainNew?.src ?? '').replace(/\/cdn-cgi\/image\/[^/]+\//, '/'),
        precioDesde: null,
        descripcion: '',
        artistas: [],
        id: `${evento.id}-${f.id}`,
      })),
  );
}
