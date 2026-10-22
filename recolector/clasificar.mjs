// Asocia cada evento con una banda de la colección "Bandas" y aplica el filtro de la fuente.
// Acá es donde, más adelante, entra un modelo de IA para los casos que no se resuelven por nombre.
import { plano } from './texto.mjs';

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

export function clasificar(evento, bandas, fuente) {
  const banda = buscarBanda(evento, bandas);
  if (!banda && fuente.filtro !== 'todos') return null;
  return { ...evento, banda };
}
