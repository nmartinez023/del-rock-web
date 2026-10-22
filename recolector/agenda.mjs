// Lee y escribe las fechas de src/content/agenda con el mismo formato YAML que usa Keystatic.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { hash, plano, slug } from './texto.mjs';

const CAMPOS_AUTO = ['titulo', 'banda', 'fecha', 'hora', 'venue', 'ciudad', 'provincia', 'entradas'];

export function leerYaml(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => ({ archivo: f, datos: parse(readFileSync(join(dir, f), 'utf8')) ?? {} }));
}

const camposAuto = (d) => Object.fromEntries(CAMPOS_AUTO.map((c) => [c, d[c] ? String(d[c]) : '']));
export const huellaDe = (d) => hash(camposAuto(d));

/** Mismo show = misma fecha, mismo venue y misma banda (o mismo título si no hay banda). */
export function claveDe(d) {
  return [String(d.fecha), plano(d.venue), d.banda || plano(d.titulo)].join('|');
}

function aYaml(d, estado, origen) {
  const salida = { titulo: d.titulo, estado };
  if (d.banda) salida.banda = d.banda;
  Object.assign(salida, { fecha: d.fecha, hora: d.hora, venue: d.venue, ciudad: d.ciudad, provincia: d.provincia });
  if (d.entradas) salida.entradas = d.entradas;
  salida.origen = origen;
  return stringify(salida, { lineWidth: 0 });
}

/** Crea la banda (oculta en la web hasta que tenga algo publicado) si todavía no existe. */
function asegurarBanda(dirBandas, banda, seco) {
  if (!dirBandas || !banda) return false;
  const ruta = join(dirBandas, `${banda.slug}.yaml`);
  if (existsSync(ruta)) return false;
  if (!seco) writeFileSync(ruta, stringify({ nombre: banda.nombre, automatica: true }, { lineWidth: 0 }));
  return true;
}

/**
 * Mezcla los eventos recolectados con la agenda existente.
 * - Nuevo: se crea como "pendiente" (y su banda, si no existía).
 * - Ya traído antes y sin tocar a mano: se actualiza si cambió algo (mantiene su estado).
 * - Editado a mano, o cargado a mano / por otra fuente (mismo show): no se toca.
 */
export function mezclar(dir, eventos, fuente, { hoy, seco = false, dirBandas } = {}) {
  const existentes = leerYaml(dir);
  const porId = new Map();
  const porClave = new Map();
  for (const e of existentes) {
    if (e.datos.origen?.id) porId.set(`${e.datos.origen.fuente}|${e.datos.origen.id}`, e);
    porClave.set(claveDe(e.datos), e);
  }
  const ocupados = new Set(existentes.map((e) => e.archivo));
  const resumen = { nuevos: [], actualizados: [], bandasNuevas: [], sinCambios: 0, omitidos: 0 };
  const conBanda = (ev) => {
    if (asegurarBanda(dirBandas, ev.bandaNueva, seco)) resumen.bandasNuevas.push(ev.bandaNueva);
  };

  for (const ev of eventos) {
    if (ev.fecha < hoy) continue;
    const idOrigen = `${fuente.slug}|${ev.id}`;
    const previo = porId.get(idOrigen);

    if (previo) {
      const d = previo.datos;
      const editadoAMano = d.origen.huella !== huellaDe(d);
      if (editadoAMano || huellaDe(ev) === d.origen.huella) {
        resumen.sinCambios++;
        continue;
      }
      conBanda(ev);
      if (!seco) writeFileSync(join(dir, previo.archivo), aYaml(ev, d.estado ?? 'pendiente', { fuente: fuente.slug, id: ev.id, huella: huellaDe(ev) }));
      resumen.actualizados.push(previo.archivo);
      continue;
    }

    if (porClave.has(claveDe(ev))) {
      resumen.omitidos++;
      continue;
    }

    const base = `${ev.fecha}-${slug(ev.banda || ev.titulo)}`.slice(0, 80).replace(/-+$/, '');
    let archivo = `${base}.yaml`;
    for (let n = 2; ocupados.has(archivo); n++) archivo = `${base}-${n}.yaml`;
    ocupados.add(archivo);

    const origen = { fuente: fuente.slug, id: ev.id, huella: huellaDe(ev) };
    conBanda(ev);
    if (!seco) writeFileSync(join(dir, archivo), aYaml(ev, 'pendiente', origen));
    const nuevo = { archivo, datos: { ...ev, origen } };
    porId.set(idOrigen, nuevo);
    porClave.set(claveDe(ev), nuevo);
    resumen.nuevos.push(archivo);
  }
  return resumen;
}
