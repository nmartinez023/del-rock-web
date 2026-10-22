// Aplica la clasificación de la IA a un evento y decide dónde se guarda:
// - rock nacional → Agenda, con sus bandas vinculadas a la colección Bandas (se crean las que falten);
// - no rock y fuente de Rosario → "Otros eventos de Rosario", con los artistas como texto;
// - no rock y fuente de otro lado → no se guarda.
import { plano, slug } from './texto.mjs';

const MAX_BANDAS = 8;
const MAX_NUEVAS = 6;

const sinArticulo = (s) => plano(s).replace(/^(los|las|la|el) /, '');

/** Banda ya cargada con ese nombre ("Los Piojos" = "LOS PIOJOS" = "Piojos"). */
export function bandaPara(nombre, bandas) {
  const n = sinArticulo(nombre);
  return n.length >= 2 ? bandas.find((b) => sinArticulo(b.nombre) === n) : undefined;
}

/** Devuelve el evento listo para guardar (con `destino`), o null si no se guarda. */
export function aplicarClasificacion(ev, ia, bandas, fuente) {
  const base = { ...ev, titulo: ia.titulo || ev.titulo, tipo: ia.tipo, rockNacional: ia.rockNacional };

  if (!ia.rockNacional) {
    if (!fuente.rosario) return null;
    return { ...base, destino: 'otros', artistas: ia.artistas, bandas: [], bandasNuevas: [] };
  }

  const slugs = [];
  const nuevas = [];
  for (const nombre of ia.artistas) {
    const existente = bandaPara(nombre, bandas) ?? bandaPara(nombre, nuevas);
    if (existente) {
      if (!slugs.includes(existente.slug)) slugs.push(existente.slug);
    } else if (nuevas.length < MAX_NUEVAS && slug(nombre)) {
      const nueva = { slug: slug(nombre), nombre };
      nuevas.push(nueva);
      slugs.push(nueva.slug);
    }
  }
  return { ...base, destino: 'agenda', artistas: [], bandas: slugs.slice(0, MAX_BANDAS), bandasNuevas: nuevas };
}
