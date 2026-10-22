// Asocia cada evento con una banda de la colección "Bandas" y aplica el filtro de la fuente.
// Con el filtro "todos", si la banda no existe se propone una nueva a partir del evento.
// Acá es donde, más adelante, entra un modelo de IA para limpiar nombres y títulos.
import { plano, slug, limpiar } from './texto.mjs';

export function buscarBanda(evento, bandas) {
  const texto = ` ${plano([evento.titulo, ...(evento.artistas ?? [])].join(' '))} `;
  let mejor = null;
  for (const b of bandas) {
    const nombre = plano(b.nombre);
    if (nombre.length < 3) continue;
    if (texto.includes(` ${nombre} `) && (!mejor || nombre.length > plano(mejor.nombre).length)) mejor = b;
  }
  return mejor?.slug ?? null;
}

// Eventos que no son de una banda: no se crea ninguna.
const NO_ES_BANDA = /\b(festival|fest|obra|teatro|stand ?up|infantil|feria|fiesta|ciclo|tributo|homenaje|karaoke|jam)\b/;
// Palabras que acompañan al nombre en el título y no son parte de él.
const RUIDO = /\b(gira|tour|presenta[n]?|show|en vivo|concierto|recital|despedida|aniversario|nuevo disco|20\d\d|19\d\d)\b/g;
const CORTES = /\s+(?:[-–—|:/+&]|y invitados|con invitados|en el|en la|en los|en las|en)\s+/i;

/** Nombre probable de la banda: primero el "performer" del JSON-LD, si no, el comienzo del título. */
export function nombreDeBanda(evento) {
  const candidato = evento.artistas?.[0] || evento.titulo.split(CORTES)[0];
  if (NO_ES_BANDA.test(plano(evento.titulo)) && !evento.artistas?.length) return null;

  let nombre = limpiar(
    candidato
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(new RegExp(RUIDO.source, 'gi'), ' ')
      .replace(/[^\p{L}\p{N}' .]/gu, ' '),
  );
  if (!nombre || nombre.length < 2 || nombre.length > 40 || nombre.split(' ').length > 7) return null;
  if (NO_ES_BANDA.test(plano(nombre))) return null;

  // "LOS PIOJOS" → "Los Piojos"; si ya viene con mayúsculas y minúsculas, se respeta.
  if (nombre === nombre.toUpperCase()) {
    nombre = nombre.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, esp, letra) => esp + letra.toUpperCase());
  }
  return nombre;
}

/**
 * Devuelve el evento con su banda, o null si no pasa el filtro.
 * Si la fuente trae "todos" y la banda no existe, agrega `bandaNueva: { slug, nombre }`.
 */
export function clasificar(evento, bandas, fuente) {
  const banda = buscarBanda(evento, bandas);
  if (banda) return { ...evento, banda };
  if (fuente.filtro !== 'todos') return null;

  const nombre = nombreDeBanda(evento);
  if (!nombre) return { ...evento, banda: null };
  const existente = bandas.find((b) => plano(b.nombre) === plano(nombre));
  if (existente) return { ...evento, banda: existente.slug };
  return { ...evento, banda: slug(nombre), bandaNueva: { slug: slug(nombre), nombre } };
}
