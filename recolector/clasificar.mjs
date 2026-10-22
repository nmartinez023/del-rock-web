// Aplica la clasificación de la IA a un evento y decide dónde se guarda:
// - rock nacional → Agenda, con sus bandas vinculadas a la colección Bandas (se crean las que falten);
// - no rock y fuente de Rosario → "Otros eventos de Rosario", con los artistas como texto;
// - no rock y fuente de otro lado → no se guarda.
import { plano, slug } from './texto.mjs';

const MAX_BANDAS = 8;
const MAX_NUEVAS = 6;

const sinArticulo = (s) => plano(s).replace(/^(los|las|la|el) /, '');

/**
 * Título de la IA, salvo que no comparta ninguna palabra con el original (la IA a veces
 * "inventa": "LOS NOCHEROS" → "LosNgueros"). En ese caso se queda el original.
 */
export function tituloSeguro(deIA, original) {
  const palabras = (s) => new Set(plano(s).split(' ').filter((p) => p.length > 2));
  const orig = palabras(original);
  return deIA && [...palabras(deIA)].some((p) => orig.has(p)) ? deIA : original;
}

/** Banda ya cargada con ese nombre ("Los Piojos" = "LOS PIOJOS" = "Piojos"). */
export function bandaPara(nombre, bandas) {
  const n = sinArticulo(nombre);
  return n.length >= 2 ? bandas.find((b) => sinArticulo(b.nombre) === n) : undefined;
}

/** Banda que vos confirmaste como rock: cargada a mano, o marcada "Siempre es rock nacional". */
const confirmada = (b) => !b.automatica || b.rockConfirmado;

/**
 * Bandas confirmadas que tocan en el evento: entre los artistas de la IA o, si no los supo,
 * el título ("Cruzando el Charco", "Cruzando el Charco — Gira 2026").
 */
export function bandasConfirmadas(ev, ia, bandas) {
  const titulos = [ia.titulo, ev.titulo].filter(Boolean).map((t) => t.split(/\s+[—–|-]\s+/)[0]);
  const encontradas = [];
  for (const nombre of [...ia.artistas, ...titulos]) {
    const b = bandaPara(nombre, bandas);
    if (b && confirmada(b) && !encontradas.includes(b)) encontradas.push(b);
  }
  return encontradas;
}

/** Devuelve el evento listo para guardar (con `destino`), o null si no se guarda. */
export function aplicarClasificacion(ev, iaOriginal, bandas, fuente) {
  // Si toca una banda que confirmaste, es rock nacional aunque la IA no la conozca.
  const confirmadas = bandasConfirmadas(ev, iaOriginal, bandas);
  const ia = confirmadas.length
    ? { ...iaOriginal, rockNacional: true, artistas: iaOriginal.artistas.length ? iaOriginal.artistas : confirmadas.map((b) => b.nombre) }
    : iaOriginal;
  const base = { ...ev, titulo: tituloSeguro(ia.titulo, ev.titulo), tipo: ia.tipo, genero: ia.genero ?? '', rockNacional: ia.rockNacional };

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
      const nueva = { slug: slug(nombre), nombre, automatica: true };
      nuevas.push(nueva);
      slugs.push(nueva.slug);
    }
  }
  return { ...base, destino: 'agenda', artistas: [], bandas: slugs.slice(0, MAX_BANDAS), bandasNuevas: nuevas };
}
