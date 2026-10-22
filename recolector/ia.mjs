// Clasificación de eventos con IA: Claude Haiku 5.5 a través de OpenRouter.
// Para cada evento nuevo decide si es rock nacional, si es festival, cuál es el título limpio
// y quiénes tocan. Las respuestas se guardan en recolector/cache-ia.json: un evento ya
// clasificado no se vuelve a pagar mientras no cambien su título, fecha, lugar o artistas.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { hash } from './texto.mjs';

export const MODELO = process.env.RECOLECTOR_MODELO || 'anthropic/claude-haiku-5.5';
const URL_API = 'https://openrouter.ai/api/v1/chat/completions';
const ARCHIVO_CACHE = 'recolector/cache-ia.json';
const DIAS_CACHE = 45; // se olvidan las respuestas de eventos que pasaron hace más de esto

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rockNacional', 'tipo', 'titulo', 'artistas'],
  properties: {
    rockNacional: { type: 'boolean' },
    tipo: { type: 'string', enum: ['show', 'festival'] },
    titulo: { type: 'string' },
    artistas: { type: 'array', items: { type: 'string' } },
  },
};

export const INSTRUCCIONES = `Clasificás eventos publicados por ticketeras argentinas para Del Rock, un medio de rock nacional.
Respondé solo con el JSON pedido:

- rockNacional: true si el evento es de rock nacional: artistas argentinos (o uruguayos muy ligados a la escena argentina, como No Te Va Gustar o El Cuarteto de Nos) de rock, pop-rock, punk, hardcore, metal, indie, alternativo, ska, reggae, blues, rock barrial, psicodelia o stoner. También true para tributos a artistas de rock nacional y para festivales donde la mayoría es rock nacional.
  false para cumbia, cuarteto, folklore, tango, chamamé, trap, reggaetón, música urbana, pop melódico o baladas, electrónica y fiestas de DJ, stand-up, teatro, espectáculos infantiles, tributos a artistas extranjeros y artistas extranjeros. Si no conocés al artista, decidí por lo que dicen el título y la descripción; si de verdad no hay forma de saberlo, false.
- tipo: "festival" si se presenta como festival o ciclo con varios artistas; si no, "show".
- titulo: el nombre del evento, limpio: sin ciudad, lugar, fecha, hora ni frases de venta. Con mayúsculas y minúsculas normales (no todo en mayúscula), respetando cómo se escribe el artista ("El Mató a un Policía Motorizado", "LBC"). Si hay nombre de gira o de show, puede ir después de un guion largo: "Ke Personajes — Corazón Ausente Tour".
- artistas: quienes tocan, cada uno por separado y bien escrito. Sin el lugar, la gira, "invitados" ni DJs genéricos. No inventes artistas que no aparezcan en los datos. Vacío si no se sabe (por ejemplo, un festival sin lineup anunciado).`;

/** Clave de caché: solo datos del listado, así la respuesta no cambia por leer o no la página del evento. */
export function claveIA(ev) {
  return hash({ t: ev.titulo, f: ev.fecha, v: ev.venue, c: ev.ciudad, a: ev.artistas ?? [] });
}

export function cargarCache(archivo = ARCHIVO_CACHE) {
  const datos = existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : { entradas: {} };
  const entradas = new Map(Object.entries(datos.entradas ?? {}));
  return {
    get: (clave) => entradas.get(clave)?.r,
    set: (clave, r, fecha) => entradas.set(clave, { r, fecha, modelo: MODELO }),
    guardar(hoy) {
      const limite = new Date(new Date(hoy).getTime() - DIAS_CACHE * 86_400_000).toISOString().slice(0, 10);
      const vivas = [...entradas].filter(([, e]) => (e.fecha ?? '9999') >= limite).sort(([a], [b]) => a.localeCompare(b));
      writeFileSync(archivo, JSON.stringify({ version: 1, entradas: Object.fromEntries(vivas) }, null, 1) + '\n');
    },
  };
}

function valido(r) {
  return (
    r &&
    typeof r.rockNacional === 'boolean' &&
    (r.tipo === 'show' || r.tipo === 'festival') &&
    typeof r.titulo === 'string' &&
    Array.isArray(r.artistas) &&
    r.artistas.every((a) => typeof a === 'string')
  );
}

function leerJson(texto) {
  const limpio = String(texto ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
  const ini = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  return JSON.parse(limpio.slice(ini, fin + 1));
}

export class SinCredito extends Error {}

/**
 * Devuelve una función async (evento) → { rockNacional, tipo, titulo, artistas, costo }.
 * `pedir` permite reemplazar fetch en los tests.
 */
export function crearClasificador({ apiKey, pedir = fetch, modelo = MODELO, esperar = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let simple = false; // si OpenRouter rechaza el formato estructurado, se pasa a pedir JSON por instrucción

  return async function clasificarConIA(ev) {
    const datos = {
      titulo: ev.titulo,
      lugar: ev.venue,
      ciudad: ev.ciudad,
      provincia: ev.provincia,
      artistasInformados: ev.artistas ?? [],
      descripcion: (ev.descripcion ?? '').slice(0, 1500),
    };
    for (let intento = 0; intento < 4; intento++) {
      const cuerpo = {
        model: modelo,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: INSTRUCCIONES + (simple ? '\n\nRespondé únicamente con un objeto JSON, sin texto alrededor.' : '') },
          { role: 'user', content: JSON.stringify(datos) },
        ],
        usage: { include: true },
        ...(simple
          ? {}
          : {
              response_format: { type: 'json_schema', json_schema: { name: 'evento', strict: true, schema: ESQUEMA } },
              reasoning: { effort: 'low' },
            }),
      };
      const res = await pedir(URL_API, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'http-referer': 'https://del-rock-web.delrockarg.workers.dev',
          'x-title': 'Del Rock - recolector de agenda',
        },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(60_000),
      });

      if (res.status === 401 || res.status === 402 || res.status === 403) {
        throw new SinCredito(`OpenRouter respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      if (res.status === 400 && !simple) {
        simple = true; // probamos sin formato estructurado ni reasoning
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        await esperar(2000 * (intento + 1));
        continue;
      }
      if (!res.ok) throw new Error(`OpenRouter respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const json = await res.json();
      try {
        const r = leerJson(json.choices?.[0]?.message?.content);
        if (valido(r)) {
          return {
            rockNacional: r.rockNacional,
            tipo: r.tipo,
            titulo: r.titulo.trim(),
            artistas: r.artistas.map((a) => a.trim()).filter(Boolean),
            costo: Number(json.usage?.cost ?? 0),
          };
        }
      } catch {
        // respuesta no parseable: reintentamos
      }
    }
    throw new Error('la IA no devolvió una respuesta válida');
  };
}
