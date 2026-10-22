// Renueva el token de larga duración de Instagram (vale 60 días; se puede renovar
// cuando tiene más de 24 h). Lee INSTAGRAM_TOKEN de .env y muestra el nuevo.
// Uso: npm run ig:renovar
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const token = env.match(/^INSTAGRAM_TOKEN=(.+)$/m)?.[1]?.trim();
if (!token) {
  console.error('Falta INSTAGRAM_TOKEN en .env');
  process.exit(1);
}

const url = new URL('https://graph.instagram.com/refresh_access_token');
url.searchParams.set('grant_type', 'ig_refresh_token');
url.searchParams.set('access_token', token);

const res = await fetch(url);
const json = await res.json();
if (!res.ok) {
  console.error('Instagram respondió con error:', json);
  process.exit(1);
}

const dias = Math.round(json.expires_in / 86400);
console.log(`Token nuevo (vence en ${dias} días). Pegalo en .env y en las variables de Cloudflare Pages:\n`);
console.log(json.access_token);
