// Recolector de agenda: lee las fuentes activas (panel → "Fuentes de agenda"), extrae los eventos,
// los clasifica con IA y los guarda como "Pendiente":
//   rock nacional            → src/content/agenda          (lo que publica Del Rock)
//   resto, si es de Rosario  → src/content/otros-eventos   (para otras apps, vía /api/eventos.json)
//
// Uso: npm run recolectar            (escribe los archivos; necesita OPENROUTER_API_KEY)
//      npm run recolectar -- --seco  (solo muestra qué haría)
import { appendFileSync, writeFileSync } from 'node:fs';
import { leerYaml, leerBandas, mezclar, indicePorOrigen, reubicar, limpiarBandas } from './agenda.mjs';
import { adaptadorPara } from './adaptadores/index.mjs';
import { normalizar, hoyEnArgentina, completar, fechaHora } from './normalizar.mjs';
import { aplicarClasificacion, bandasEnEvento, clasificacionPorBanda } from './clasificar.mjs';
import { crearClasificador, cargarCache, claveIA, MODELO, SinCredito } from './ia.mjs';
import { puedeLeer } from './robots.mjs';

const AGENTE = 'DelRockBot/1.0 (+https://del-rock-web.delrockarg.workers.dev)';
const DIR_BANDAS = 'src/content/bandas';
const DIAS_DETALLE = 7; // cada cuánto se vuelve a leer la página de un evento ya cargado
const MAX_DETALLES = 80; // tope de páginas de evento por fuente y por corrida
const MAX_IA = 300; // tope de consultas a la IA por corrida
const seco = process.argv.includes('--seco');

const fuentes = leerYaml('src/content/fuentes')
  .map((f) => ({ ...f.datos, slug: f.archivo.replace(/\.yaml$/, '') }))
  .filter((f) => f.activa !== false && f.url);
const bandas = leerBandas(DIR_BANDAS);
const hoy = hoyEnArgentina();
const cache = cargarCache();
const apiKey = process.env.OPENROUTER_API_KEY;
const clasificarConIA = apiKey ? crearClasificador({ apiKey }) : null;
const ia = { consultas: 0, costo: 0, sinCredito: false };

const lineas = [`## Recolector de agenda (${new Date().toISOString()})${seco ? ' — modo seco' : ''}`, `Modelo: ${MODELO}`, ''];
const errores = [];
const log = (l) => {
  console.log(l);
  lineas.push(l);
};
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

if (!apiKey) log('⚠️ Falta OPENROUTER_API_KEY: los eventos que no estén en la caché de la IA quedan sin clasificar y no se guardan.');
if (fuentes.length === 0) log('No hay fuentes activas. Cargalas en el panel: Fuentes de agenda.');

// 1. Lo que marcaste a mano en "Rock nacional" manda: se mueve de lista antes de recolectar.
const movidos = reubicar({ fuentesRosario: new Set(fuentes.filter((f) => f.rosario).map((f) => f.slug)), bandas, dirBandas: DIR_BANDAS, seco });
for (const m of movidos) log(`- reubicado a mano: ${m}`);
// 2. Bandas automáticas que quedaron sin eventos de rock: afuera (si no, forzarían "rock" para siempre).
for (const b of limpiarBandas({ dirBandas: DIR_BANDAS, seco })) log(`- banda borrada (sin fechas de rock): ${b}`);
bandas.splice(0, bandas.length, ...leerBandas(DIR_BANDAS));

/** Descarga los datos de la fuente: con el método propio del adaptador o con un GET común. */
async function descargar(adaptador, url) {
  if (adaptador.descargar) return adaptador.descargar(url, { agente: AGENTE });
  const res = await fetch(url, {
    headers: { 'user-agent': AGENTE, 'accept-language': 'es-AR,es;q=0.9' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Lee la página propia de un evento (descripción, dirección, aviso) solo cuando hace falta. */
async function leerDetalles(items, adaptador, fuente) {
  const guardados = indicePorOrigen();
  const limite = new Date(Date.now() - DIAS_DETALLE * 86_400_000).toISOString().slice(0, 10);
  const host = new URL(fuente.url).hostname;
  let leidas = 0;
  for (const item of items) {
    const { crudo } = item;
    if (leidas >= MAX_DETALLES || !crudo.url) continue;
    if (new URL(crudo.url).hostname !== host) continue; // links a otra ticketera: no
    const previo = guardados.get(`${fuente.slug}|${crudo.id || crudo.url}`);
    if (previo && (previo.datos.origen?.detalle ?? '') >= limite) continue;
    if (!(await puedeLeer(crudo.url, AGENTE))) continue;
    try {
      const res = await fetch(crudo.url, { headers: { 'user-agent': AGENTE }, signal: AbortSignal.timeout(20_000) });
      if (res.ok) {
        item.crudo = { ...completar(crudo, adaptador.detalle(crudo, await res.text())), detalle: hoy };
        leidas++;
      }
    } catch {
      // Si falla una página de evento, seguimos con los datos del listado.
    }
    await pausa(1000);
  }
  return leidas;
}

/** Clasifica con IA los eventos que no están en la caché (de a 4 en paralelo). */
async function clasificarPendientes(items) {
  const faltan = items.filter((i) => !i.ia);
  let sinClasificar = 0;
  for (let i = 0; i < faltan.length; i += 4) {
    await Promise.all(
      faltan.slice(i, i + 4).map(async (item) => {
        if (!clasificarConIA || ia.sinCredito || ia.consultas >= MAX_IA) return sinClasificar++;
        ia.consultas++;
        try {
          const r = await clasificarConIA(item.ev);
          ia.costo += r.costo;
          const { costo, ...respuesta } = r;
          item.ia = respuesta;
          cache.set(item.clave, respuesta, item.ev.fecha);
        } catch (err) {
          if (err instanceof SinCredito) ia.sinCredito = err.message;
          else log(`  - ⚠️ IA: "${item.ev.titulo}": ${err.message}`);
          sinClasificar++;
        }
      }),
    );
  }
  return sinClasificar;
}

for (const fuente of fuentes) {
  try {
    const adaptador = adaptadorPara(fuente.url);
    const url = adaptador.urlDeDatos?.(fuente.url) ?? fuente.url;
    if (!(await puedeLeer(url, AGENTE))) {
      log(`- **${fuente.slug}**: robots.txt no permite leer ${url}, la salteo.`);
      continue;
    }
    const crudos = adaptador.extraer(await descargar(adaptador, url), url);
    const guardados = indicePorOrigen();

    // 2. Eventos futuros, con su respuesta de IA si ya está en caché.
    let items = crudos
      .filter((c) => !c.cancelado && (fechaHora(c.inicio)?.fecha ?? '') >= hoy)
      .map((crudo) => {
        const ev = normalizar(crudo, fuente);
        return ev && { crudo, ev, clave: claveIA(ev), ia: undefined };
      })
      .filter(Boolean);
    // Primero, banda conocida: si toca una banda de la colección, es rock nacional y no se consulta la IA.
    // Si la IA ya lo había clasificado, se usa esa respuesta (título limpio, género) y la banda solo
    // la corrige a rock si hace falta.
    let porBanda = 0;
    for (const item of items) {
      const conocidas = bandasEnEvento(item.ev, bandas);
      const cacheada = cache.get(item.clave);
      if (conocidas.length) porBanda++;
      if (cacheada && conocidas.length && !cacheada.rockNacional) {
        item.ia = { ...cacheada, rockNacional: true, artistas: cacheada.artistas.length ? cacheada.artistas : conocidas.map((b) => b.nombre) };
      } else if (cacheada) item.ia = cacheada;
      else if (conocidas.length) item.ia = clasificacionPorBanda(item.ev, conocidas);
    }
    // Lo que ya sabemos que no es rock, de una fuente que no es de Rosario, ni se mira (salvo que esté guardado).
    items = items.filter((i) => fuente.rosario || i.ia?.rockNacional !== false || guardados.has(`${fuente.slug}|${i.ev.id}`));

    // 3. Página de cada evento (descripción, dirección, aviso) y clasificación de los que faltan.
    // Sin IA disponible, solo vale la pena leer la página de los que ya están clasificados.
    const conIA = clasificarConIA && !ia.sinCredito;
    const detalles = adaptador.detalle ? await leerDetalles(conIA ? items : items.filter((i) => i.ia), adaptador, fuente) : 0;
    for (const item of items) item.ev = normalizar(item.crudo, fuente);
    const sinClasificar = await clasificarPendientes(items);

    // 4. Dónde va cada uno, y a guardar.
    const eventos = items
      .filter((i) => i.ia && i.ev)
      .map((i) => aplicarClasificacion(i.ev, i.ia, bandas, fuente) ?? { ...i.ev, destino: null });
    const r = mezclar(eventos, fuente, { hoy, seco, dirBandas: DIR_BANDAS });
    bandas.push(...r.bandasNuevas); // cuentan para las fuentes siguientes

    const rock = eventos.filter((e) => e.destino === 'agenda').length;
    const otros = eventos.filter((e) => e.destino === 'otros').length;
    log(
      `- **${fuente.slug}**${fuente.rosario ? ' (Rosario)' : ''}: ${crudos.length} eventos en la página → ` +
        `${rock} de rock nacional (${porBanda} con banda conocida), ${otros} otros${fuente.rosario ? '' : ' (no se guardan)'}, ${sinClasificar} sin clasificar. ` +
        `${r.nuevos.length} nuevos, ${r.actualizados.length} actualizados, ${r.movidos.length} cambiados de lista, ` +
        `${r.borrados.length} borrados, ${r.sinCambios} sin cambios, ${r.omitidos} ya cargados por otra vía. Páginas de evento leídas: ${detalles}.`,
    );
    for (const a of r.nuevos) log(`  - nuevo: ${a}`);
    for (const b of r.bandasNuevas) log(`  - banda nueva: ${b.nombre}`);
    for (const a of r.movidos) log(`  - cambiado de lista: ${a}`);
    for (const a of r.borrados) log(`  - borrado (ya no es rock): ${a}`);
    if (crudos.length === 0) log(`  - ⚠️ No encontré eventos: puede que la página no publique JSON-LD y necesite un adaptador propio.`);
  } catch (err) {
    errores.push(fuente.slug);
    log(`- **${fuente.slug}**: ❌ ${err.message}`);
  }
  await pausa(1500); // no saturar a nadie
}

if (!seco) cache.guardar(hoy);
log('');
log(`IA: ${ia.consultas} consultas, costo USD ${ia.costo.toFixed(4)}.`);
if (ia.sinCredito) log(`❌ La IA dejó de responder (¿sin crédito o key inválida?): ${ia.sinCredito}`);

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lineas.join('\n') + '\n');
// El resumen de la última corrida también queda en el repo, para verlo sin entrar a GitHub Actions.
if (!seco) writeFileSync('recolector/ultimo-resumen.md', lineas.join('\n') + '\n');
// Falla si alguna fuente dio error o la IA no está disponible, así GitHub avisa por mail
// (lo que sí se recolectó queda guardado).
if (errores.length || ia.sinCredito || (!apiKey && !seco)) process.exitCode = 1;
