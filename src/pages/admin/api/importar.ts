// POST /admin/api/importar — guarda en el repo los eventos de una ticketera que trajiste con tu navegador.
// Cuerpo: { fuente: "passline" | "allaccess", eventos: [...] }
import type { APIRoute } from 'astro';
import { COOKIE_TOKEN, ErrorGitHub, IMPORTABLES, depurarImportacion, guardarImportacion, verificarAcceso, type Importable } from '../../../lib/admin/github';

export const prerender = false;

const MAX_BYTES = 1_500_000;
const MAX_EVENTOS = 2_000;
const responder = (status: number, datos: unknown) =>
  new Response(JSON.stringify(datos), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const POST: APIRoute = async ({ request, cookies, url }) => {
  // Solo desde nuestro propio sitio (protege contra formularios de otras webs).
  if (request.headers.get('origin') !== url.origin) return responder(403, { error: 'Origen no permitido.' });

  const token = cookies.get(COOKIE_TOKEN)?.value;
  if (!token) return responder(401, { error: 'Sin sesión de GitHub.' });

  const texto = await request.text();
  if (texto.length > MAX_BYTES) return responder(413, { error: 'Demasiados datos.' });
  let cuerpo: { fuente?: string; eventos?: unknown };
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return responder(400, { error: 'Pedido inválido.' });
  }
  const fuente = cuerpo.fuente as Importable;
  if (!(fuente in IMPORTABLES) || !Array.isArray(cuerpo.eventos) || cuerpo.eventos.length > MAX_EVENTOS) {
    return responder(400, { error: 'Fuente o eventos inválidos.' });
  }
  const eventos = depurarImportacion(fuente, cuerpo.eventos);
  if (!eventos.length) return responder(400, { error: `No hay eventos válidos de ${IMPORTABLES[fuente].nombre}.` });

  try {
    const acceso = await verificarAcceso(token);
    if (!acceso.puede) return responder(403, { error: `${acceso.login} no tiene permiso de escritura en el repo.` });
    return responder(200, await guardarImportacion(token, fuente, eventos, acceso.login));
  } catch (err) {
    const status = err instanceof ErrorGitHub ? err.status : 500;
    return responder(status, { error: (err as Error).message });
  }
};
