// Keystatic siempre deja al usuario en /keystatic después del login de GitHub. Si el login
// arrancó desde el panel (/admin/api/login), lo devolvemos a la página del panel de donde vino.
import { defineMiddleware } from 'astro:middleware';
import { COOKIE_TOKEN } from './lib/admin/github';
import { COOKIE_VOLVER, destinoValido } from './lib/admin/volver';

export const onRequest = defineMiddleware((context, next) => {
  if (context.isPrerendered || !/^\/keystatic\/?$/.test(context.url.pathname)) return next();
  const volver = destinoValido(context.cookies.get(COOKIE_VOLVER)?.value);
  if (!volver || !context.cookies.has(COOKIE_TOKEN)) return next();
  context.cookies.delete(COOKIE_VOLVER, { path: '/' });
  return context.redirect(volver, 302);
});
