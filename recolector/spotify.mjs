// Completa las bandas con su perfil de Spotify: link, foto y géneros (la API no da biografías).
// - Banda con link de Spotify cargado a mano: trae la foto y los géneros (queda aprobada).
// - Banda sin link: busca el nombre exacto y lo deja como "sugerido" para aprobar en /admin/bandas.
//   La web no muestra nada de Spotify hasta que lo apruebes (puede ser otra banda con el mismo nombre).
// - Sin coincidencia exacta: anota la fecha y vuelve a probar en 30 días.
// Uso: SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=… node recolector/spotify.mjs [--seco]
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { yamlPanel } from './agenda.mjs';
import { plano } from './texto.mjs';

const DIR = 'src/content/bandas';
const REINTENTAR_DIAS = 30;
const ESPERA_MS = 250; // entre pedidos, para no pasar el cupo de la API


/** "https://open.spotify.com/intl-es/artist/1ZBOAgEJMHUEuoiMEN2FJJ?si=…" → "1ZBOAgEJMHUEuoiMEN2FJJ" */
export const idDeArtista = (url = '') => /open\.spotify\.com\/(?:[\w-]+\/)?artist\/([A-Za-z0-9]{22})/.exec(url)?.[1] ?? null;

/** Mismo nombre sin importar tildes, mayúsculas, signos ni un "Los"/"La" de más adelante. */
export const mismoNombre = (a, b) => {
  const n = (t) => plano(t).replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(los|las|la|el|the) /, '');
  return n(a) === n(b);
};

/** La foto más chica que tenga al menos 300 px (Spotify las da de 640, 320 y 160). */
export const fotoDe = (artista) => {
  const imgs = [...(artista.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (imgs.find((i) => (i.width ?? 0) >= 300) ?? imgs.at(-1))?.url ?? null;
};

/** Qué cambia en una banda con lo que respondió Spotify (sin tocar lo que cargaste vos). */
export function completar(banda, artista, estado) {
  const d = { ...banda, spotify: artista.external_urls?.spotify ?? `https://open.spotify.com/artist/${artista.id}`, spotifyEstado: estado };
  const foto = fotoDe(artista);
  if (foto) d.fotoSpotify = foto;
  if (artista.genres?.length) d.generos = artista.genres.slice(0, 4);
  delete d.spotifyBuscado;
  return d;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function token(id, secreto) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${id}:${secreto}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify no dio acceso (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}

function cliente(tk) {
  return async function pedir(ruta) {
    for (let intento = 0; intento < 4; intento++) {
      const res = await fetch(`https://api.spotify.com/v1${ruta}`, { headers: { authorization: `Bearer ${tk}` } });
      if (res.status === 429) {
        await dormir((Number(res.headers.get('retry-after')) || 5) * 1000);
        continue;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Spotify ${res.status} en ${ruta}: ${(await res.text()).slice(0, 200)}`);
      await dormir(ESPERA_MS);
      return res.json();
    }
    throw new Error(`Spotify sigue limitando los pedidos (${ruta}).`);
  };
}

async function main() {
  const seco = process.argv.includes('--seco');
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secreto } = process.env;
  if (!id || !secreto) {
    console.log('Faltan SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET: no se busca nada.');
    return;
  }
  const pedir = cliente(await token(id, secreto));
  const hoy = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() - REINTENTAR_DIAS * 864e5).toISOString().slice(0, 10);
  const r = { aprobadas: [], sugeridas: [], sinResultado: 0, salteadas: 0, errores: [] };

  for (const archivo of readdirSync(DIR).filter((f) => f.endsWith('.yaml')).sort()) {
    const ruta = join(DIR, archivo);
    const banda = parse(readFileSync(ruta, 'utf8')) ?? {};
    let nueva = null;
    try {
      const idCargado = idDeArtista(banda.spotify ?? '');
      if (banda.spotifyEstado === 'descartado' || (banda.spotifyEstado && banda.fotoSpotify)) {
        r.salteadas++;
        continue;
      }
      if (idCargado) {
        // Link cargado a mano (o sugerido sin foto todavía): solo completar.
        const artista = await pedir(`/artists/${idCargado}`);
        if (artista) {
          nueva = completar(banda, artista, banda.spotifyEstado ?? 'aprobado');
          r.aprobadas.push(banda.nombre);
        }
      } else if (!banda.spotify) {
        if (banda.spotifyBuscado && banda.spotifyBuscado > limite) {
          r.salteadas++;
          continue;
        }
        const q = new URLSearchParams({ q: banda.nombre, type: 'artist', market: 'AR', limit: '10' });
        const res = await pedir(`/search?${q}`);
        // Si hay varias con el mismo nombre, Spotify pone primero la más escuchada.
        const artista = (res?.artists?.items ?? []).find((a) => mismoNombre(a.name, banda.nombre));
        if (artista) {
          nueva = completar(banda, artista, 'sugerido');
          r.sugeridas.push(banda.nombre);
        } else {
          nueva = { ...banda, spotifyBuscado: hoy };
          r.sinResultado++;
        }
      }
    } catch (err) {
      r.errores.push(`${banda.nombre}: ${err.message}`);
      if (r.errores.length >= 5) break; // algo anda mal en general (cupo, claves): mejor cortar
      continue;
    }
    if (nueva && !seco) writeFileSync(ruta, yamlPanel(nueva));
  }

  const resumen = `${r.sugeridas.length} sugeridas para revisar en /admin/bandas, ${r.aprobadas.length} completadas desde su link, ${r.sinResultado} sin coincidencia, ${r.salteadas} ya revisadas.`;
  console.log(`Spotify: ${resumen}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Spotify\n\n${resumen}\n`);
  if (r.sugeridas.length) console.log(`Sugeridas: ${r.sugeridas.join(', ')}`);
  if (r.errores.length) {
    console.error(`Errores:\n- ${r.errores.join('\n- ')}`);
    process.exitCode = 1;
  }
}

// Se corre como script; los tests solo importan las funciones.
if (process.argv[1]?.endsWith('spotify.mjs')) await main();
