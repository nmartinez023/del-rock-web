// Mueve de lista los eventos según lo que marcaste a mano en "Rock nacional" (panel):
// tildado en "Otros eventos" → Agenda; destildado en Agenda → "Otros eventos" (o se borra si
// la fuente no es de Rosario). No consulta ticketeras ni IA: corre al guardar desde el panel.
// Uso: node recolector/reubicar.mjs
import { appendFileSync } from 'node:fs';
import { leerYaml, leerBandas, reubicar } from './agenda.mjs';

const DIR_BANDAS = 'src/content/bandas';
const fuentesRosario = new Set(
  leerYaml('src/content/fuentes')
    .filter((f) => f.datos.rosario)
    .map((f) => f.archivo.replace(/\.yaml$/, '')),
);
const bandas = leerBandas(DIR_BANDAS);

const movidos = reubicar({ fuentesRosario, bandas, dirBandas: DIR_BANDAS });
const resumen = movidos.length ? movidos.map((m) => `- ${m}`).join('\n') : 'Nada para mover.';
console.log(resumen);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Reubicar eventos\n\n${resumen}\n`);
