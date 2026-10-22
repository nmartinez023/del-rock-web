// Lee y escribe las fechas de src/content/agenda con el mismo formato YAML que usa Keystatic.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { hash, plano, slug } from './texto.mjs';

const CAMPOS_AUTO = ['titulo', 'tipo', 'bandas', 'fecha', 'hora', 'venue', 'ciudad', 'provincia', 'entradas'];

export function leerYaml(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => ({ archivo: f, datos: parse(readFileSync(join(dir, f), 'utf8')) ?? {} }));
}

const listaBandas = (d) => [...(d.bandas ?? [])].map(String).sort();

const camposAuto = (d) =>
  Object.fromEntries(
    CAMPOS_AUTO.map((c) => {
      if (c === 'bandas') return [c, listaBandas(d).join(',')];
      if (c === 'tipo') return [c, d.tipo || 'show'];
      return [c, d[c] ? String(d[c]) : ''];
    }),
  );
export const huellaDe = (d) => hash(camposAuto(d));

/** Mismo evento = misma fecha, mismo venue y mismas bandas (o mismo título si no hay bandas). */
export function claveDe(d) {
  const quien = listaBandas(d).join('+') || plano(d.titulo);
  return [String(d.fecha), plano(d.venue), quien].join('|');
}

function aYaml(d, estado, origen) {
  const salida = { titulo: d.titulo, estado, tipo: d.tipo || 'show' };
  if (d.bandas?.length) salida.bandas = d.bandas;
  Object.assign(salida, { fecha: d.fecha, hora: d.hora, venue: d.venue, ciudad: d.ciudad, provincia: d.provincia });
  if (d.entradas) salida.entradas = d.entradas;
  salida.origen = origen;
  // La hora va entre comillas, como la guarda el panel ("21:00" sin comillas es ambiguo en YAML).
  return stringify(salida, { lineWidth: 0 }).replace(/^hora: (\d{1,2}:\d{2})$/m, "hora: '$1'");
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
 * - Nuevo: se crea como "pendiente" (y sus bandas, si no existían).
 * - Ya traído antes y sin tocar a mano: se actualiza si cambió algo (mantiene su estado).
 * - Editado a mano, o cargado a mano / por otra fuente (mismo evento): no se toca.
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
  const creadas = new Set();
  const conBandas = (ev) => {
    for (const b of ev.bandasNuevas ?? []) {
      if (creadas.has(b.slug)) continue;
      if (asegurarBanda(dirBandas, b, seco)) resumen.bandasNuevas.push(b);
      creadas.add(b.slug);
    }
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
      conBandas(ev);
      if (!seco) writeFileSync(join(dir, previo.archivo), aYaml(ev, d.estado ?? 'pendiente', { fuente: fuente.slug, id: ev.id, huella: huellaDe(ev) }));
      resumen.actualizados.push(previo.archivo);
      continue;
    }

    if (porClave.has(claveDe(ev))) {
      resumen.omitidos++;
      continue;
    }

    const base = `${ev.fecha}-${slug(ev.bandas?.[0] || ev.titulo)}`.slice(0, 80).replace(/-+$/, '');
    let archivo = `${base}.yaml`;
    for (let n = 2; ocupados.has(archivo); n++) archivo = `${base}-${n}.yaml`;
    ocupados.add(archivo);

    const origen = { fuente: fuente.slug, id: ev.id, huella: huellaDe(ev) };
    conBandas(ev);
    if (!seco) writeFileSync(join(dir, archivo), aYaml(ev, 'pendiente', origen));
    const nuevo = { archivo, datos: { ...ev, origen } };
    porId.set(idOrigen, nuevo);
    porClave.set(claveDe(ev), nuevo);
    resumen.nuevos.push(archivo);
  }
  return resumen;
}
