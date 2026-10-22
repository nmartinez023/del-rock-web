// Adaptador genérico: lee los eventos que la página publica como JSON-LD (schema.org/Event).
// Es el formato que usan muchas ticketeras para aparecer en Google, así que sirve para la mayoría.
import { limpiar } from '../texto.mjs';

const BLOQUE = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

export function extraer(html) {
  const eventos = [];
  for (const [, contenido] of html.matchAll(BLOQUE)) {
    let datos;
    try {
      datos = JSON.parse(contenido.trim());
    } catch {
      continue; // bloque mal formado: lo salteamos
    }
    for (const nodo of recorrer(datos)) {
      if (esEvento(nodo)) eventos.push(aCrudo(nodo));
    }
  }
  return eventos;
}

function* recorrer(valor) {
  if (Array.isArray(valor)) {
    for (const v of valor) yield* recorrer(v);
    return;
  }
  if (!valor || typeof valor !== 'object') return;
  yield valor;
  for (const [clave, v] of Object.entries(valor)) {
    // Bajamos por contenedores comunes (@graph, ItemList, subEvent), no por propiedades del evento.
    if (['@graph', 'itemListElement', 'item', 'subEvent', 'event', 'events', 'mainEntity'].includes(clave)) yield* recorrer(v);
  }
}

function tipos(nodo) {
  const t = nodo['@type'];
  return (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
}

function esEvento(nodo) {
  return tipos(nodo).some((t) => /Event$|^Festival$/.test(t)) && nodo.startDate;
}

const primero = (v) => (Array.isArray(v) ? v[0] : v);

function texto(v) {
  if (v == null) return '';
  if (typeof v === 'string') return limpiar(v);
  if (typeof v === 'object') return limpiar(v.name ?? v['@value'] ?? '');
  return limpiar(String(v));
}

function aCrudo(nodo) {
  const lugar = primero(nodo.location);
  const dir = lugar && typeof lugar === 'object' ? primero(lugar.address) : undefined;
  const oferta = primero(nodo.offers);
  const imagen = primero(nodo.image);
  const artistas = [nodo.performer, nodo.performers].flat().filter(Boolean).map(texto).filter(Boolean);

  return {
    nombre: texto(nodo.name),
    inicio: String(nodo.startDate),
    cancelado: /Cancelled|Postponed/i.test(String(nodo.eventStatus ?? '')),
    lugar: typeof lugar === 'string' ? limpiar(lugar) : texto(lugar),
    localidad: dir && typeof dir === 'object' ? texto(dir.addressLocality) : '',
    region: dir && typeof dir === 'object' ? texto(dir.addressRegion) : '',
    direccion: typeof dir === 'string' ? limpiar(dir) : dir ? texto(dir.streetAddress) : '',
    url: texto(oferta?.url) || texto(nodo.url),
    imagen: typeof imagen === 'string' ? imagen : (imagen?.url ?? ''),
    artistas,
    id: texto(nodo.identifier) || texto(nodo['@id']) || '',
  };
}
