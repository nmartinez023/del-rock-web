// Entrada Play (entradaplay.com): la portada no trae los eventos en el HTML,
// los carga desde /obtener_eventos/ como JSON. Leemos ese endpoint directamente.
import { limpiar } from '../texto.mjs';

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
      artistas: [],
      id: e.slug,
    };
  });
}
