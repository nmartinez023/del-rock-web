import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

export type Noticia = CollectionEntry<'noticias'>;
export type Fecha = CollectionEntry<'agenda'>;

const TZ = 'America/Argentina/Buenos_Aires';

export const TIPOS: Record<Noticia['data']['tipo'], string> = {
  noticia: 'Noticia',
  cobertura: 'Cobertura',
  lanzamiento: 'Lanzamiento',
  aniversario: 'Aniversario',
};

export function fechaLarga(d: Date) {
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function hace(d: Date, ahora = new Date()) {
  const dias = Math.round((ahora.getTime() - d.getTime()) / 86_400_000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return fechaLarga(d);
}

export function diaMes(d: Date) {
  const dia = d.toLocaleDateString('es-AR', { day: '2-digit', timeZone: 'UTC' });
  const mes = d.toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
  return { dia, mes };
}

export function minutosDeLectura(texto: string) {
  return Math.max(1, Math.round(texto.split(/\s+/).length / 220));
}

/** Parte el título para pintar la palabra destacada en azul. */
export function partesTitulo(titulo: string, destacado?: string) {
  if (!destacado) return [{ texto: titulo, azul: false }];
  const i = titulo.toLowerCase().indexOf(destacado.toLowerCase());
  if (i < 0) return [{ texto: titulo, azul: false }];
  return [
    { texto: titulo.slice(0, i), azul: false },
    { texto: titulo.slice(i, i + destacado.length), azul: true },
    { texto: titulo.slice(i + destacado.length), azul: false },
  ].filter((p) => p.texto);
}

export function slugTag(tag: string) {
  return tag
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Bandas que se muestran en la web, ordenadas por nombre. Las que creó el recolector
 * quedan ocultas hasta que tengan una fecha publicada o una nota.
 */
export async function bandasVisibles() {
  const [bandas, noticias, agenda] = await Promise.all([
    getCollection('bandas'),
    getCollection('noticias'),
    getCollection('agenda'),
  ]);
  const conContenido = new Set([
    ...noticias.map((n) => n.data.banda?.id),
    ...agenda.filter((f) => f.data.estado === 'publicado' && f.data.rockNacional).flatMap((f) => f.data.bandas),
  ]);
  return bandas
    .filter((b) => !b.data.automatica || conContenido.has(b.id))
    .sort((a, b) => a.data.nombre.localeCompare(b.data.nombre, 'es'));
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "21 de noviembre" */
export function diaYMes(d: Date) {
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Posición de `buscado` en `texto` como palabra completa, sin importar acentos ni mayúsculas. */
function buscarPalabra(texto: string, buscado: string): [number, number] | null {
  const mapa: number[] = [];
  let plano = '';
  for (let i = 0; i < texto.length; i++) {
    for (const c of sinAcentos(texto[i])) {
      plano += c;
      mapa.push(i);
    }
  }
  const b = sinAcentos(buscado).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(^|[^a-z0-9])(${b})(?=[^a-z0-9]|$)`).exec(plano);
  if (!m || !b) return null;
  const inicio = m.index + m[1].length;
  return [mapa[inicio], mapa[inicio + m[2].length - 1] + 1];
}

const CONECTORES = new Set(['y', 'e', 'de', 'del', 'la', 'las', 'el', 'los', 'a', 'al', 'con', 'en', 'o', 'x', 'ft']);

/**
 * "CRUZANDO EL CHARCO" → "Cruzando el Charco". Los títulos que ya vienen con mayúsculas y minúsculas
 * se respetan, y las siglas sin vocales ("LBC") quedan como están.
 */
export function legible(texto: string) {
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

/**
 * Título del evento con la ciudad destacada: "Cruzando el Charco en Rosario".
 * - Si el título ya nombra la ciudad, solo se destaca ("Nepal en ROSARIO").
 * - Si ya tiene un "en" ("Alex Ubago en La Segunda Arena"), se agrega "· Rosario".
 * - Los festivales quedan como están.
 */
export function tituloConCiudad(fecha: Fecha) {
  const { ciudad, tipo } = fecha.data;
  const titulo = legible(fecha.data.titulo);
  const plano = { partes: [{ texto: titulo, azul: false }], texto: titulo };
  if (tipo === 'festival' || !ciudad) return plano;

  const pos = buscarPalabra(titulo, ciudad);
  if (pos) {
    const [a, b] = pos;
    const partes = [
      { texto: titulo.slice(0, a), azul: false },
      { texto: titulo.slice(a, b), azul: true },
      { texto: titulo.slice(b), azul: false },
    ].filter((p) => p.texto);
    return { partes, texto: titulo };
  }
  const conector = /(^|\s)en\s/i.test(titulo) ? ' · ' : ' en ';
  return {
    partes: [
      { texto: titulo + conector, azul: false },
      { texto: ciudad, azul: true },
    ],
    texto: `${titulo}${conector}${ciudad}`,
  };
}

/** Slug para buscadores: "cruzando-el-charco-rosario-21-noviembre". */
function slugDeFecha(fecha: Fecha) {
  const { titulo, ciudad } = fecha.data;
  const c = slugTag(ciudad ?? '');
  let t = slugTag(titulo);
  if (c) t = t.replace(new RegExp(`(^|-)(en-)?${c}(?=-|$)`, 'g'), '').replace(/^-+|-+$/g, '');
  if (t.length > 60) t = t.slice(0, 60).replace(/-[^-]*$/, '');
  const d = fecha.data.fecha;
  return [t, c, String(d.getUTCDate()), MESES[d.getUTCMonth()]].filter(Boolean).join('-');
}

let rutas: Promise<Map<string, string>> | undefined;

/** Slug público de cada fecha (id del archivo → slug), sin repetidos. */
export function slugsDeAgenda() {
  rutas ??= getCollection('agenda').then((todas) => {
    const mapa = new Map<string, string>();
    const usados = new Set<string>();
    for (const f of todas.sort((a, b) => a.id.localeCompare(b.id))) {
      const base = slugDeFecha(f);
      let s = base;
      for (let n = 2; usados.has(s); n++) s = `${base}-${n}`;
      usados.add(s);
      mapa.set(f.id, s);
    }
    return mapa;
  });
  return rutas;
}

export async function rutaDeFecha(fecha: Fecha) {
  return `/agenda/${(await slugsDeAgenda()).get(fecha.id)}/`;
}

/** "sábado 28 de noviembre de 2026" */
export function fechaCompleta(d: Date) {
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function precioTexto(precio: number | null | undefined) {
  if (precio === null || precio === undefined) return null;
  if (precio === 0) return 'Gratis';
  return `Desde ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(precio)}`;
}

/** Imagen del evento: flyer propio (optimizado por Astro) o la de la ticketera, servida por nuestro Worker. */
// Ticketeras cuyo firewall no deja que nuestro servidor pida sus fotos (responde 403): en esas,
// la foto la carga directo el navegador de quien visita, desde la ticketera.
const IMAGEN_DIRECTA = /^https:\/\/bucket\.tuentrada\.com\//;

export function imagenDeFecha(fecha: Fecha, ruta: string) {
  if (fecha.data.flyer) return { tipo: 'local' as const, src: fecha.data.flyer };
  const { imagen } = fecha.data;
  if (imagen && IMAGEN_DIRECTA.test(imagen)) return { tipo: 'remota' as const, src: imagen };
  if (imagen) return { tipo: 'remota' as const, src: `${ruta}imagen` };
  return null;
}

export const tocaEn = (fecha: Fecha, bandaId: string) => fecha.data.bandas.includes(bandaId);

/** Bandas de una fecha que existen en la colección (las borradas se ignoran). */
export async function bandasDe(fecha: Fecha) {
  const entradas = await Promise.all(fecha.data.bandas.map((id) => getEntry('bandas', id)));
  return entradas.filter((b) => b !== undefined);
}

export async function noticiasOrdenadas() {
  const todas = await getCollection('noticias');
  return todas.sort((a, b) => b.data.fecha.getTime() - a.data.fecha.getTime());
}

/** Fechas desde hoy (hora de Argentina) en adelante, de la más cercana a la más lejana. */
export async function proximasFechas() {
  const hoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: TZ }));
  const todas = await getCollection('agenda');
  return todas
    .filter((f) => f.data.estado === 'publicado' && f.data.rockNacional && f.data.fecha.getTime() >= hoy.getTime())
    .sort((a, b) => a.data.fecha.getTime() - b.data.fecha.getTime());
}
