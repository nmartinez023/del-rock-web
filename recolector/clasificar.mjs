// Decide qué bandas tocan en cada evento y si es un festival, y aplica el filtro de la fuente.
// - Primero reconoce las bandas ya cargadas (pueden ser varias).
// - Después usa los artistas que informa la ticketera (JSON-LD "performer").
// - Si no hay, separa el comienzo del título en nombres ("Banda A + Banda B", "A & B", "A ft B").
// - Un festival no crea bandas desde el título: solo reconoce las cargadas o las del lineup informado.
// Acá es donde, más adelante, entra un modelo de IA para los títulos que estas reglas no resuelven.
import { plano, slug, limpiar } from './texto.mjs';

const MAX_BANDAS = 8;
const MAX_NUEVAS = 4;

const ES_FESTIVAL = /\b(festival|fest)\b/;
// Eventos que no son de bandas: no se crea ninguna desde el título.
const NO_ES_BANDA = /\b(obra|teatro|stand ?up|infantil|feria|fiesta|ciclo|tributo|homenaje|karaoke|jam)\b/;
// Palabras que acompañan al nombre en el título y no son parte de él.
const RUIDO = /\b(gira|tour|show|en vivo|concierto|recital|aniversario|nuevo disco|invitados?|artistas? invitad[oa]s?|y m[aá]s|20\d\d|19\d\d)\b/gi;
// Lo que sigue a estos cortes ya no son artistas ("Kapanga - Gira 2026", "Ciro en el Estadio").
const FIN_ARTISTAS = /\s+(?:[-–—|:]|y invitados|con invitados|presenta[n]?|despide[n]?|en el|en la|en los|en las|en)\s+/i;
// Separadores entre artistas: "A + B", "A & B", "A / B", "A, B", "A x B", "A ft B", "A junto a B", "A vs B".
const ENTRE_ARTISTAS = /\s*(?:\+|&|\/|,)\s*|\s+(?:x|ft\.?|feat\.?|junto a|vs\.?)\s+/i;
const CONECTORES = new Set(['y', 'e', 'de', 'del', 'la', 'las', 'el', 'los', 'a', 'al', 'con', 'en', 'o']);
const BORDES = new Set(['y', 'e', 'o', 'de', 'del', 'a', 'al', 'con', 'en']);

/**
 * "LOS PIOJOS" → "Los Piojos", "SILVESTRE Y LA NARANJA" → "Silvestre y la Naranja".
 * Las siglas sin vocales ("LBC", "CCG") quedan en mayúsculas.
 */
function capitalizar(nombre) {
  const letras = nombre.replace(/[^\p{L}]/gu, '');
  const mayus = letras.replace(/[^\p{Lu}]/gu, '').length;
  if (!letras || mayus / letras.length < 0.7) return nombre; // ya viene con mayúsculas y minúsculas
  return nombre
    .split(' ')
    .map((p, i) => {
      if (!/[aeiouyáéíóúü]/i.test(p)) return p; // sigla
      const min = p.toLowerCase();
      if (i > 0 && CONECTORES.has(min)) return min;
      return min.replace(/^(\P{L}*)(\p{L})/u, (m, pre, l) => pre + l.toUpperCase());
    })
    .join(' ');
}

/** Limpia un posible nombre de banda; null si no parece uno. */
function limpiarNombre(texto) {
  const nombre = limpiar(
    texto
      .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
      .replace(RUIDO, ' ')
      .replace(/[^\p{L}\p{N}' .]/gu, ' '),
  );
  const palabras = nombre.split(' ').filter(Boolean);
  // Saca conectores sueltos en los bordes ("y Él Mató" → "Él Mató"); los artículos ("Los", "La") se quedan.
  while (palabras.length && BORDES.has(plano(palabras[0]))) palabras.shift();
  while (palabras.length && BORDES.has(plano(palabras.at(-1)))) palabras.pop();
  const final = palabras.join(' ');
  if (final.length < 2 || final.length > 40 || palabras.length > 7) return null;
  if (NO_ES_BANDA.test(plano(final)) || ES_FESTIVAL.test(plano(final))) return null;
  return capitalizar(final);
}

/** Bandas cargadas que aparecen en el texto (sin superponerse; gana la más larga). */
export function buscarBandas(texto, bandas) {
  let resto = ` ${plano(texto)} `;
  const encontradas = [];
  for (const b of [...bandas].sort((x, y) => plano(y.nombre).length - plano(x.nombre).length)) {
    const nombre = plano(b.nombre);
    if (nombre.length < 3) continue;
    if (resto.includes(` ${nombre} `)) {
      encontradas.push(b);
      resto = resto.replace(` ${nombre} `, ' | ');
    }
  }
  return encontradas;
}

/** Saca de un fragmento del título las palabras que forman el nombre de una banda conocida. */
function quitarNombre(fragmento, nombre) {
  const palabras = fragmento.split(/\s+/).filter(Boolean);
  const objetivo = plano(nombre).split(' ');
  for (let i = 0; i + objetivo.length <= palabras.length; i++) {
    const tramo = palabras.slice(i, i + objetivo.length).map(plano).join(' ');
    if (tramo === objetivo.join(' ')) return [...palabras.slice(0, i), '|', ...palabras.slice(i + objetivo.length)].join(' ');
  }
  return fragmento;
}

/** Nombres de artistas que salen del título, sin contar las bandas ya conocidas. */
export function nombresDelTitulo(titulo, conocidas = []) {
  let artistas = titulo.split(FIN_ARTISTAS)[0];
  for (const b of conocidas) artistas = quitarNombre(artistas, b.nombre);
  return artistas
    .split(ENTRE_ARTISTAS)
    .flatMap((p) => p.split('|'))
    .map(limpiarNombre)
    .filter(Boolean);
}

/**
 * Devuelve el evento con `tipo`, `bandas` (slugs) y `bandasNuevas` ({ slug, nombre } a crear),
 * o null si no pasa el filtro de la fuente.
 */
export function clasificar(evento, bandas, fuente) {
  const titulo = plano(evento.titulo);
  const tipo = ES_FESTIVAL.test(titulo) ? 'festival' : 'show';

  const conocidas = buscarBandas([evento.titulo, ...(evento.artistas ?? [])].join(' | '), bandas);
  const slugs = conocidas.map((b) => b.slug);

  const candidatos = evento.artistas?.length
    ? evento.artistas.map(limpiarNombre).filter(Boolean)
    : tipo === 'festival' || NO_ES_BANDA.test(titulo)
      ? []
      : nombresDelTitulo(evento.titulo, conocidas);

  const nuevas = [];
  for (const nombre of candidatos) {
    const existente = bandas.find((b) => plano(b.nombre) === plano(nombre));
    const s = existente?.slug ?? slug(nombre);
    if (slugs.includes(s)) continue;
    if (existente) slugs.push(s);
    else if (fuente.filtro === 'todos' && nuevas.length < MAX_NUEVAS) {
      nuevas.push({ slug: s, nombre });
      slugs.push(s);
    }
  }

  // "Solo bandas cargadas": hace falta al menos una banda conocida (también para festivales).
  if (fuente.filtro !== 'todos' && conocidas.length === 0) return null;
  return { ...evento, tipo, bandas: slugs.slice(0, MAX_BANDAS), bandasNuevas: nuevas };
}
