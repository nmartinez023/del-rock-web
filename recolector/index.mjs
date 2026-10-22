// Recolector de agenda: lee las fuentes activas (Keystatic → "Fuentes de agenda"), extrae los eventos
// y los guarda en src/content/agenda como "pendiente" para revisarlos desde el panel.
//
// Uso: npm run recolectar            (escribe los archivos)
//      npm run recolectar -- --seco  (solo muestra qué haría)
import { appendFileSync } from 'node:fs';
import { leerYaml, mezclar } from './agenda.mjs';
import { adaptadorPara } from './adaptadores/index.mjs';
import { normalizar, hoyEnArgentina } from './normalizar.mjs';
import { clasificar } from './clasificar.mjs';
import { puedeLeer } from './robots.mjs';

const AGENTE = 'DelRockBot/1.0 (+https://del-rock-web.delrockarg.workers.dev)';
const DIR_AGENDA = 'src/content/agenda';
const DIR_BANDAS = 'src/content/bandas';
const seco = process.argv.includes('--seco');

const fuentes = leerYaml('src/content/fuentes')
  .map((f) => ({ ...f.datos, slug: f.archivo.replace(/\.yaml$/, '') }))
  .filter((f) => f.activa !== false && f.url);
const bandas = leerYaml(DIR_BANDAS).map((b) => ({ slug: b.archivo.replace(/\.yaml$/, ''), nombre: b.datos.nombre }));
const hoy = hoyEnArgentina();

const lineas = [`## Recolector de agenda (${new Date().toISOString()})${seco ? ' — modo seco' : ''}`, ''];
const errores = [];
const log = (l) => {
  console.log(l);
  lineas.push(l);
};

if (fuentes.length === 0) log('No hay fuentes activas. Cargalas en el panel: Fuentes de agenda.');

for (const fuente of fuentes) {
  try {
    const adaptador = adaptadorPara(fuente.url);
    const url = adaptador.urlDeDatos?.(fuente.url) ?? fuente.url;
    if (!(await puedeLeer(url, AGENTE))) {
      log(`- **${fuente.slug}**: robots.txt no permite leer ${url}, la salteo.`);
      continue;
    }
    const res = await fetch(url, {
      headers: { 'user-agent': AGENTE, 'accept-language': 'es-AR,es;q=0.9' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cuerpo = await res.text();

    const crudos = adaptador.extraer(cuerpo, url);
    const eventos = crudos
      .map((c) => normalizar(c, fuente))
      .filter(Boolean)
      .map((e) => clasificar(e, bandas, fuente))
      .filter(Boolean);

    const r = mezclar(DIR_AGENDA, eventos, fuente, { hoy, seco, dirBandas: DIR_BANDAS });
    // Las bandas creadas en esta fuente ya cuentan para las siguientes (evita duplicarlas).
    bandas.push(...r.bandasNuevas);
    log(
      `- **${fuente.slug}**: ${crudos.length} eventos en la página, ${eventos.length} pasan el filtro → ` +
        `${r.nuevos.length} nuevos, ${r.actualizados.length} actualizados, ${r.sinCambios} sin cambios, ${r.omitidos} ya cargados por otra vía.`,
    );
    for (const a of r.nuevos) log(`  - nuevo: ${a}`);
    for (const b of r.bandasNuevas) log(`  - banda nueva: ${b.nombre}`);
    for (const a of r.actualizados) log(`  - actualizado: ${a}`);
    if (crudos.length === 0) log(`  - ⚠️ No encontré eventos: puede que la página no publique JSON-LD y necesite un adaptador propio.`);
  } catch (err) {
    errores.push(fuente.slug);
    log(`- **${fuente.slug}**: ❌ ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 1500)); // no saturar a nadie
}

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lineas.join('\n') + '\n');
// Falla si alguna fuente dio error, así GitHub avisa por mail (lo que sí se recolectó queda guardado).
if (errores.length) process.exitCode = 1;
