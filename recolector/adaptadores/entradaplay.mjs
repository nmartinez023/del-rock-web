// Entrada Play (entradaplay.com): la portada no trae los eventos en el HTML,
// los carga desde /obtener_eventos/ como JSON. Leemos ese endpoint directamente.
// La página de cada evento suma la dirección (JSON-LD), el aviso (+18, etc.) y la descripción.
import { limpiar, decodificarEntidades } from '../texto.mjs';
import { extraer as extraerJsonLd } from './jsonld.mjs';

export function urlDeDatos(url) {
  return new URL('/obtener_eventos/?cantidad_eventos=200', url).toString();
}

/** "23/10/2026, 20:00" → "2026-10-23T20:00" (hora local de Argentina). */
function aISO(desde) {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2}))?/.exec(desde ?? '');
  if (!m) return '';
  const [, d, mes, a, h, min] = m;
  const fecha = `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return h ? `${fecha}T${h.padStart(2, '0')}:${min}` : fecha;
}

function precio(valor) {
  const p = parseFloat(valor ?? '');
  return Number.isFinite(p) && p >= 0 ? Math.round(p) : null;
}

export function extraer(cuerpo, url) {
  let datos;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    return [];
  }
  const origen = new URL(url).origin;

  return (datos.eventos ?? []).map((e) => {
    // "Centro Cultural Güemes, Rosario, Santa Fe" → lugar, localidad, provincia
    const partes = limpiar(e.lugar).split(/\s*,\s*/);
    return {
      nombre: limpiar(e.nombre),
      inicio: aISO(e.desde_fecha),
      cancelado: false,
      lugar: partes[0] ?? '',
      localidad: partes.length > 2 ? partes[1] : limpiar(e.lugar_responsive),
      region: partes.length > 1 ? partes.at(-1) : '',
      direccion: '',
      url: e.url_externa || `${origen}/${e.slug}/`,
      imagen: e.imagen_home ? new URL(e.imagen_home, origen).toString() : '',
      precioDesde: precio(e.entradas_online_desde),
      descripcion: '',
      artistas: [],
      id: e.slug,
    };
  });
}

/** HTML enriquecido → texto plano con párrafos. */
export function htmlATexto(html) {
  return decodificarEntidades(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h\d|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 3000);
}

export function detalle(crudo, html) {
  // La dirección sale del JSON-LD de la página. Su "description" es un texto genérico de SEO: no se usa.
  const [ld] = extraerJsonLd(html);

  const marca = html.indexOf('INSERTA DESCRIPCION DEL EVENTO');
  let descripcion = '';
  if (marca >= 0) {
    const desde = html.indexOf('-->', marca) + 3;
    const hasta = html.indexOf('<style', desde);
    descripcion = htmlATexto(html.slice(desde, hasta > 0 ? hasta : desde + 20000));
  }

  const aviso = /class="advertencia[^"]*"[\s\S]*?<div class="p-2">([\s\S]*?)<\/div>/i.exec(html)?.[1];

  return {
    direccion: ld?.direccion ?? '',
    descripcion,
    aviso: aviso ? limpiar(htmlATexto(aviso)).replace(/^ADVERTENCIA:\s*/i, '') : '',
  };
}
