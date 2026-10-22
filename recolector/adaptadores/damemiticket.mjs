// Dame mi Ticket (damemiticket.com): la web es una app Angular sin los eventos en el HTML.
// Los pide a su API (POST /eventos/EventosHome), que devuelve un JSON con todo: nombre, fecha, lugar,
// dirección, ciudad, imagen, precios y descripción. No hace falta leer la página de cada evento.
// La respuesta también trae datos internos de ventas (tickets vendidos, recaudación): no se usan.
import { limpiar } from '../texto.mjs';

const API = 'https://patagonia-chain.westus2.cloudapp.azure.com:431/eventos/EventosHome';
const IMAGENES = 'https://patagonia-chain.com/img_ticket/';
const WEB = 'https://damemiticket.com/evento/';

export function urlDeDatos() {
  return API;
}

/** La API se consulta con POST y cuerpo vacío. */
export async function descargar(url, { agente, pedir = fetch } = {}) {
  const res = await pedir(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': agente },
    body: '{}',
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** El precio más bajo entre las distintas entradas (valor_Ticket, valor_Ticket2…), sin el cargo por servicio. */
function precioMinimo(e) {
  const precios = Object.entries(e)
    .filter(([k, v]) => /^valor_Ticket/.test(k) && typeof v === 'number' && v > 0)
    .map(([, v]) => v);
  return precios.length ? Math.round(Math.min(...precios)) : null;
}

export function extraer(cuerpo) {
  let eventos;
  try {
    eventos = JSON.parse(cuerpo);
  } catch {
    return [];
  }
  if (!Array.isArray(eventos)) return [];

  return eventos
    .filter((e) => e.nombre_Evento && e.fecha_Evento && e.estado !== 'caducado')
    .map((e) => ({
      nombre: limpiar(e.nombre_Evento),
      // "2026-10-22T00:00:00" + "20:30" → hora local de Argentina
      inicio: `${String(e.fecha_Evento).slice(0, 10)}${/^\d{1,2}:\d{2}$/.test(e.hora_Evento ?? '') ? `T${e.hora_Evento.padStart(5, '0')}` : ''}`,
      cancelado: false,
      lugar: limpiar(e.nombre ?? ''),
      localidad: limpiar(e.ciudad ?? ''),
      region: limpiar(e.provincia ?? ''),
      direccion: limpiar(e.direccion ?? ''),
      url: e.slug ? WEB + e.slug : 'https://damemiticket.com/',
      imagen: e.imagen ? IMAGENES + e.imagen : '',
      precioDesde: precioMinimo(e),
      descripcion: String(e.descripcion ?? '').trim().slice(0, 3000),
      artistas: [],
      id: String(e.id_Evento ?? e.slug),
    }));
}
