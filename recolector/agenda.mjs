// Lee y escribe los eventos (YAML, igual que el panel) en dos carpetas:
//   src/content/agenda/          rock nacional (lo que publica Del Rock)
//   src/content/otros-eventos/   el resto de los eventos de fuentes de Rosario
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { hash, plano, slug } from './texto.mjs';

// Los estados llevan emoji porque el listado del panel muestra el valor tal cual (ver keystatic.config.ts).
export const PUBLICADO = '✅ Publicado';
export const PENDIENTE = '⏳ Pendiente';
export const DESCARTADO = '❌ Descartado';

export function normalizarEstado(v) {
  if (/descart/i.test(v ?? '')) return DESCARTADO;
  if (/pendient/i.test(v ?? '')) return PENDIENTE;
  return v ? PUBLICADO : PENDIENTE;
}

// Campos que completa el recolector. Si alguno cambia a mano, el evento queda como "editado" y no se pisa.
export const CAMPOS_AUTO = [
  'titulo', 'tipo', 'genero', 'rockNacional', 'bandas', 'artistas', 'fecha', 'hora', 'venue', 'direccion',
  'ciudad', 'provincia', 'entradas', 'precioDesde', 'imagen', 'aviso', 'descripcion',
];

export const DIRS = { agenda: 'src/content/agenda', otros: 'src/content/otros-eventos' };

export function leerYaml(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => ({ archivo: f, datos: parse(readFileSync(join(dir, f), 'utf8')) ?? {} }));
}

const vacio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const lista = (v) => [...(v ?? [])].map(String).sort().join(',');

const camposAuto = (d) =>
  Object.fromEntries(
    CAMPOS_AUTO.map((c) => {
      if (c === 'bandas' || c === 'artistas') return [c, lista(d[c])];
      if (c === 'tipo') return [c, d.tipo || 'show'];
      if (c === 'rockNacional') return [c, String(d.rockNacional ?? '')];
      return [c, vacio(d[c]) ? '' : String(d[c]).trim()];
    }),
  );
export const huellaDe = (d) => hash(camposAuto(d));

/** Cómo queda guardado un evento en su carpeta (sin estado ni origen). La huella se calcula sobre esto. */
export function guardable(ev, destino) {
  const d = { titulo: ev.titulo, tipo: ev.tipo || 'show', rockNacional: destino === 'agenda' };
  if (ev.genero) d.genero = ev.genero;
  if (destino === 'agenda' && ev.bandas?.length) d.bandas = ev.bandas;
  if (destino === 'otros' && ev.artistas?.length) d.artistas = ev.artistas;
  for (const c of ['fecha', 'hora', 'venue', 'direccion', 'ciudad', 'provincia', 'entradas', 'precioDesde', 'imagen', 'aviso', 'descripcion']) {
    if (!vacio(ev[c]) || c === 'hora') d[c] = ev[c] ?? '';
  }
  return d;
}

/**
 * YAML que el panel lee igual que nosotros. El panel usa un lector de YAML "viejo" (1.1) que toma
 * 2026-10-22 como fecha, 21:00 como número o "12345" como número: escribiendo en modo 1.1 esos
 * valores quedan entre comillas y siguen siendo texto. La `fecha` del evento sí va sin comillas,
 * como la guarda el propio panel en su campo de fecha.
 */
export const yamlPanel = (d) =>
  stringify(d, { lineWidth: 0, version: '1.1' }).replace(/^fecha: "(\d{4}-\d{2}-\d{2})"$/m, 'fecha: $1');

/** YAML en el orden de los campos del panel. */
export function aYaml(d, estado, origen, flyer) {
  const { titulo, ...resto } = d;
  const salida = { titulo, estado, ...resto };
  if (flyer) salida.flyer = flyer;
  salida.origen = origen;
  return yamlPanel(salida);
}

/** Mismo evento = misma fecha, mismo lugar y mismo título (sin importar mayúsculas ni acentos). */
export function claveDe(d) {
  return [String(d.fecha), plano(d.venue), plano(d.titulo)].join('|');
}

/** Bandas de la colección, con lo que importa para clasificar: si la creó el recolector y si la confirmaste. */
export function leerBandas(dir) {
  return leerYaml(dir).map((b) => ({
    slug: b.archivo.replace(/\.yaml$/, ''),
    nombre: b.datos.nombre,
    automatica: b.datos.automatica === true,
    rockConfirmado: b.datos.rockConfirmado === true,
  }));
}

/** Crea la banda (oculta en la web hasta que tenga algo publicado) si todavía no existe. */
function asegurarBanda(dirBandas, banda, seco, { confirmar = false } = {}) {
  if (!dirBandas || !banda) return false;
  const ruta = join(dirBandas, `${banda.slug}.yaml`);
  if (existsSync(ruta)) return false;
  if (!seco) {
    mkdirSync(dirBandas, { recursive: true });
    writeFileSync(ruta, yamlPanel({ nombre: banda.nombre, automatica: true, ...(confirmar ? { rockConfirmado: true } : {}) }));
  }
  return true;
}

/** Marca una banda creada por el recolector como "Siempre es rock nacional" (la elegiste vos). */
function confirmarBanda(dirBandas, slugBanda, seco) {
  const ruta = join(dirBandas, `${slugBanda}.yaml`);
  if (!existsSync(ruta)) return;
  const d = parse(readFileSync(ruta, 'utf8')) ?? {};
  if (d.automatica !== true || d.rockConfirmado === true) return;
  if (!seco) writeFileSync(ruta, yamlPanel({ ...d, rockConfirmado: true }));
}

/** Todos los eventos guardados, de las dos carpetas, indexados por origen ("fuente|id"). */
export function indicePorOrigen(dirs = DIRS) {
  const indice = new Map();
  for (const destino of ['agenda', 'otros']) {
    for (const e of leerYaml(dirs[destino])) {
      if (e.datos.origen?.id) indice.set(`${e.datos.origen.fuente}|${e.datos.origen.id}`, { ...e, destino });
    }
  }
  return indice;
}

/**
 * Mezcla los eventos clasificados (cada uno con `destino`: 'agenda' | 'otros' | null) con lo guardado.
 * - Nuevo: se crea como "Pendiente" en su carpeta (y sus bandas, si no existían).
 * - Ya traído y sin tocar a mano: se actualiza si cambió algo (mantiene su estado); si ahora va a la
 *   otra carpeta, se mueve; si ya no se guarda (destino null), se borra.
 * - Editado a mano, o cargado a mano / por otra fuente (mismo evento): no se toca.
 */
export function mezclar(eventos, fuente, { hoy, seco = false, dirs = DIRS, dirBandas } = {}) {
  for (const d of Object.values(dirs)) if (!seco) mkdirSync(d, { recursive: true });
  const porId = indicePorOrigen(dirs);
  const porClave = new Map();
  const ocupados = { agenda: new Set(), otros: new Set() };
  for (const destino of ['agenda', 'otros']) {
    for (const e of leerYaml(dirs[destino])) {
      porClave.set(claveDe(e.datos), e);
      ocupados[destino].add(e.archivo);
    }
  }
  const resumen = { nuevos: [], actualizados: [], movidos: [], borrados: [], bandasNuevas: [], sinCambios: 0, omitidos: 0 };
  const creadas = new Set();
  const conBandas = (ev) => {
    for (const b of ev.bandasNuevas ?? []) {
      if (creadas.has(b.slug)) continue;
      if (asegurarBanda(dirBandas, b, seco)) resumen.bandasNuevas.push(b);
      creadas.add(b.slug);
    }
  };
  const origenDe = (ev, previo) => {
    const o = { fuente: fuente.slug, id: ev.id, huella: huellaDe(guardable(ev, ev.destino)) };
    const detalle = ev.detalle ?? previo?.origen?.detalle;
    if (detalle) o.detalle = detalle;
    return o;
  };
  const nombreLibre = (ev) => {
    const base = `${ev.fecha}-${slug(ev.titulo)}`.slice(0, 80).replace(/-+$/, '');
    let archivo = `${base}.yaml`;
    for (let n = 2; ocupados[ev.destino].has(archivo); n++) archivo = `${base}-${n}.yaml`;
    ocupados[ev.destino].add(archivo);
    return archivo;
  };

  for (const ev of eventos) {
    if (ev.fecha < hoy) continue;
    const previo = porId.get(`${fuente.slug}|${ev.id}`);

    if (previo) {
      const d = previo.datos;
      if (d.origen.huella !== huellaDe(d)) {
        resumen.sinCambios++; // editado a mano: manda lo tuyo
        continue;
      }
      const rutaPrevia = join(dirs[previo.destino], previo.archivo);
      if (!ev.destino) {
        if (!seco) unlinkSync(rutaPrevia);
        resumen.borrados.push(previo.archivo);
        continue;
      }
      // Si esta vez no se leyó la página del evento, se conservan los datos que vinieron de ahí.
      const completo = ev.detalle ? ev : { ...ev, direccion: ev.direccion || d.direccion, aviso: ev.aviso || d.aviso, descripcion: ev.descripcion || d.descripcion };
      const nuevo = guardable(completo, ev.destino);
      const mismaCarpeta = previo.destino === ev.destino;
      if (mismaCarpeta && huellaDe(nuevo) === d.origen.huella && (!ev.detalle || ev.detalle === d.origen.detalle)) {
        resumen.sinCambios++;
        continue;
      }
      conBandas(completo);
      const archivo = mismaCarpeta ? previo.archivo : nombreLibre(ev);
      if (!seco) {
        writeFileSync(join(dirs[ev.destino], archivo), aYaml(nuevo, normalizarEstado(d.estado), origenDe(completo, d), d.flyer));
        if (!mismaCarpeta) unlinkSync(rutaPrevia);
      }
      (mismaCarpeta ? resumen.actualizados : resumen.movidos).push(archivo);
      continue;
    }

    if (!ev.destino) continue;
    if (porClave.has(claveDe(ev))) {
      resumen.omitidos++;
      continue;
    }

    const archivo = nombreLibre(ev);
    const origen = origenDe(ev);
    conBandas(ev);
    if (!seco) writeFileSync(join(dirs[ev.destino], archivo), aYaml(guardable(ev, ev.destino), PENDIENTE, origen));
    const guardado = { archivo, destino: ev.destino, datos: { ...guardable(ev, ev.destino), origen } };
    porId.set(`${fuente.slug}|${ev.id}`, guardado);
    porClave.set(claveDe(ev), guardado);
    resumen.nuevos.push(`${ev.destino === 'otros' ? 'otros/' : ''}${archivo}`);
  }
  return resumen;
}

/**
 * Respeta lo que marcaste a mano en "Rock nacional":
 * - en Agenda, destildado → pasa a "Otros eventos" si la fuente es de Rosario; si no, se borra;
 * - en Otros, tildado → pasa a Agenda, con los artistas convertidos en bandas (se crean las que falten).
 * El evento queda como "editado a mano", así el recolector no lo vuelve a mover.
 */
export function reubicar({ fuentesRosario, bandas, dirs = DIRS, dirBandas, seco = false }) {
  const movidos = [];
  const nombrePorSlug = new Map(bandas.map((b) => [b.slug, b.nombre]));

  for (const e of leerYaml(dirs.agenda)) {
    if (e.datos.rockNacional !== false) continue;
    const ruta = join(dirs.agenda, e.archivo);
    const deRosario = !e.datos.origen?.fuente || fuentesRosario.has(e.datos.origen.fuente);
    if (deRosario) {
      const { bandas: slugs = [], ...resto } = e.datos;
      const datos = { ...resto, artistas: slugs.map((s) => nombrePorSlug.get(s) ?? s) };
      if (!seco) {
        mkdirSync(dirs.otros, { recursive: true });
        writeFileSync(join(dirs.otros, e.archivo), yamlPanel(datos));
      }
      movidos.push(`${e.archivo} → otros`);
    } else movidos.push(`${e.archivo} → borrado (no es rock y la fuente no es de Rosario)`);
    if (!seco) unlinkSync(ruta);
  }

  for (const e of leerYaml(dirs.otros)) {
    if (e.datos.rockNacional !== true) continue;
    const { artistas = [], ...resto } = e.datos;
    // Si la IA no supo quiénes tocan, en un show la banda es el título ("Cruzando el Charco").
    const nombres = artistas.length ? artistas : resto.tipo === 'festival' ? [] : [resto.titulo];
    const slugs = [];
    for (const nombre of nombres) {
      const s = slug(nombre);
      if (!s) continue;
      // La pasaste a rock vos: la banda queda como "Siempre es rock nacional".
      if (!nombrePorSlug.has(s)) {
        if (asegurarBanda(dirBandas, { slug: s, nombre }, seco, { confirmar: true })) nombrePorSlug.set(s, nombre);
      } else if (dirBandas) confirmarBanda(dirBandas, s, seco);
      slugs.push(s);
    }
    if (!seco) {
      writeFileSync(join(dirs.agenda, e.archivo), yamlPanel({ ...resto, bandas: slugs }));
      unlinkSync(join(dirs.otros, e.archivo));
    }
    movidos.push(`${e.archivo} → agenda`);
  }
  return movidos;
}
