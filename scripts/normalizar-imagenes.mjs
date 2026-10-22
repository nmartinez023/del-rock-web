// Corre antes de cada build (npm "prebuild").
// Keystatic guarda las fotos con la extensión original y Astro solo acepta algunas:
// una foto .jfif (común al descargar de WhatsApp o del navegador) o .JPG rompe el build.
// Este script las renombra a una extensión válida y actualiza las rutas en el contenido.
import { readdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, extname, sep } from 'node:path';

const ASSETS = 'src/assets';
const CONTENIDO = 'src/content';
const VALIDAS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg', 'tiff']);
const ALIAS = { jfif: 'jpg', jpe: 'jpg', pjpeg: 'jpg', pjp: 'jpg', tif: 'tiff' };

function* archivos(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) yield* archivos(ruta);
    else yield ruta;
  }
}

const aPosix = (p) => p.split(sep).join('/');
const cambios = new Map();

for (const ruta of archivos(ASSETS)) {
  const ext = extname(ruta).slice(1);
  const minuscula = ext.toLowerCase();
  const nueva = ALIAS[minuscula] ?? (VALIDAS.has(minuscula) ? minuscula : null);
  if (!nueva || nueva === ext) continue;

  const destino = ruta.slice(0, -ext.length) + nueva;
  if (existsSync(destino) && destino.toLowerCase() !== ruta.toLowerCase()) {
    console.warn(`[imagenes] No renombro ${ruta}: ya existe ${destino}`);
    continue;
  }
  renameSync(ruta, destino);
  cambios.set(aPosix(relative(ASSETS, ruta)), aPosix(relative(ASSETS, destino)));
}

if (cambios.size > 0) {
  for (const ruta of archivos(CONTENIDO)) {
    const original = readFileSync(ruta, 'utf8');
    let texto = original;
    for (const [viejo, nuevo] of cambios) texto = texto.replaceAll(`assets/${viejo}`, `assets/${nuevo}`);
    if (texto !== original) writeFileSync(ruta, texto);
  }
  for (const [viejo, nuevo] of cambios) console.log(`[imagenes] ${viejo} -> ${nuevo}`);
}
