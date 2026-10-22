import { getCollection, type CollectionEntry } from 'astro:content';

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
    ...agenda.filter((f) => f.data.estado === 'publicado').flatMap((f) => f.data.bandas.map((b) => b.id)),
  ]);
  return bandas
    .filter((b) => !b.data.automatica || conContenido.has(b.id))
    .sort((a, b) => a.data.nombre.localeCompare(b.data.nombre, 'es'));
}

export const tocaEn = (fecha: Fecha, bandaId: string) => fecha.data.bandas.some((b) => b.id === bandaId);

export async function noticiasOrdenadas() {
  const todas = await getCollection('noticias');
  return todas.sort((a, b) => b.data.fecha.getTime() - a.data.fecha.getTime());
}

/** Fechas desde hoy (hora de Argentina) en adelante, de la más cercana a la más lejana. */
export async function proximasFechas() {
  const hoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: TZ }));
  const todas = await getCollection('agenda');
  return todas
    .filter((f) => f.data.estado === 'publicado' && f.data.fecha.getTime() >= hoy.getTime())
    .sort((a, b) => a.data.fecha.getTime() - b.data.fecha.getTime());
}
