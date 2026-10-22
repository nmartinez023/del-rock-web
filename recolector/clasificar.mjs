// Decide si un evento es rock nacional y dónde se guarda:
// 1. Si toca una banda de la colección Bandas, es rock nacional (sin consultar a la IA).
// 2. Si no, decide la IA (ver ia.mjs).
// Y después:
// - rock nacional → Agenda, con sus bandas vinculadas a la colección Bandas (se crean las que falten);
// - no rock y fuente de Rosario → "Otros eventos de Rosario", con los artistas como texto;
// - no rock y fuente de otro lado → no se guarda.
import { plano, slug, limpiar } from './texto.mjs';

const MAX_BANDAS = 8;
const MAX_NUEVAS = 6;

const sinArticulo = (s) => plano(s).replace(/^(los|las|la|el) /, '');
// En un tributo el nombre de la banda aparece pero no toca ella: decide la IA.
const ES_TRIBUTO = /\b(tributo|homenaje|tribute)\b/;
const ES_FESTIVAL = /\b(festival|fest)\b/;

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

/**
 * Bandas de la colección que aparecen en el evento (título o artistas informados por la ticketera),
 * como palabras completas: "2 MINUTOS EN LA SALA" → 2 Minutos. Gana el nombre más largo.
 */
export function bandasEnEvento(ev, bandas) {
  const texto = ` ${plano([ev.titulo, ...(ev.artistas ?? [])].join(' | '))} `;
  if (ES_TRIBUTO.test(texto)) return [];
  let resto = texto;
  const encontradas = [];
  for (const b of [...bandas].sort((x, y) => plano(y.nombre).length - plano(x.nombre).length)) {
    for (const v of new Set([plano(b.nombre), sinArticulo(b.nombre)])) {
      if (v.length >= 3 && resto.includes(` ${v} `)) {
        encontradas.push(b);
        resto = resto.replace(` ${v} `, ' | ');
        break;
      }
    }
  }
  return encontradas;
}

const CONECTORES = new Set(['y', 'e', 'de', 'del', 'la', 'las', 'el', 'los', 'a', 'al', 'con', 'en', 'o']);

/** "SILVESTRE Y LA NARANJA" → "Silvestre y la Naranja"; las siglas sin vocales ("LBC") quedan igual. */
function capitalizar(texto) {
  const letras = texto.replace(/[^\p{L}]/gu, '');
  const mayus = letras.replace(/[^\p{Lu}]/gu, '').length;
  if (!letras || mayus / letras.length < 0.7) return texto;
  return texto
    .split(' ')
    .map((p, i) => {
      if (!/[aeiouyáéíóúü]/i.test(p)) return p;
      const min = p.toLowerCase();
      if (i > 0 && CONECTORES.has(min)) return min;
      return min.replace(/^(\P{L}*)(\p{L})/u, (_, pre, l) => pre + l.toUpperCase());
    })
    .join(' ');
}

/** Clasificación sin IA para un evento de una banda conocida: rock nacional. */
export function clasificacionPorBanda(ev, conocidas) {
  const sinCiudad = limpiar(ev.titulo.replace(new RegExp(`\\s+en\\s+${ev.ciudad}\\s*$`, 'i'), ''));
  return {
    genero: 'rock',
    rockNacional: true,
    tipo: ES_FESTIVAL.test(plano(ev.titulo)) ? 'festival' : 'show',
    titulo: capitalizar(sinCiudad),
    artistas: conocidas.map((b) => b.nombre),
  };
}

/** Devuelve el evento listo para guardar (con `destino`), o null si no se guarda. */
export function aplicarClasificacion(ev, iaOriginal, bandas, fuente) {
  // Si la IA nombra una banda de la colección (o el título es una), es rock nacional igual.
  const titulos = [iaOriginal.titulo, ev.titulo].filter(Boolean).map((t) => t.split(/\s+[—–|-]\s+/)[0]);
  const conocidas = [...new Set([...iaOriginal.artistas, ...titulos].map((n) => bandaPara(n, bandas)).filter(Boolean))];
  const ia = conocidas.length
    ? { ...iaOriginal, rockNacional: true, artistas: iaOriginal.artistas.length ? iaOriginal.artistas : conocidas.map((b) => b.nombre) }
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
