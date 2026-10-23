// GET /admin/api/login?volver=/admin/ticketeras — inicia sesión con GitHub (la misma de Keystatic)
// y, al terminar, vuelve al panel en vez de quedarse en /keystatic (ver src/middleware.ts).
import type { APIRoute } from 'astro';
import { COOKIE_VOLVER, destinoValido } from '../../../lib/admin/volver';

export const prerender = false;

export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const volver = destinoValido(url.searchParams.get('volver')) ?? '/admin';
  cookies.set(COOKIE_VOLVER, volver, { path: '/', httpOnly: true, secure: url.protocol === 'https:', sameSite: 'lax', maxAge: 600 });
  return redirect('/api/keystatic/github/login', 302);
};
