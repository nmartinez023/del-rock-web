// POST /admin/api/eventos — aplica una acción a varios eventos en un solo commit.
// Cuerpo: { lista: "agenda" | "otros", accion: "publicar" | "descartar" | "pendiente" | "mover", archivos: ["x.yaml", ...] }
import type { APIRoute } from 'astro';
import { COOKIE_TOKEN, ErrorGitHub, LISTAS, guardar, verificarAcceso, type Accion, type Lista } from '../../../lib/admin/github';

export const prerender = false;

const ACCIONES: Accion[] = ['publicar', 'descartar', 'pendiente', 'mover'];
const responder = (status: number, datos: unknown) =>
  new Response(JSON.stringify(datos), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export const POST: APIRoute = async ({ request, cookies, url }) => {
  // Solo desde nuestro propio sitio (protege contra formularios de otras webs).
  if (request.headers.get('origin') !== url.origin) return responder(403, { error: 'Origen no permitido.' });

  const token = cookies.get(COOKIE_TOKEN)?.value;
  if (!token) return responder(401, { error: 'Sin sesión de GitHub.' });

  let cuerpo: { lista?: string; accion?: string; archivos?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return responder(400, { error: 'Pedido inválido.' });
  }
  const lista = cuerpo.lista as Lista;
  const accion = cuerpo.accion as Accion;
  const archivos = Array.isArray(cuerpo.archivos) ? cuerpo.archivos.map(String) : [];
  if (!(lista in LISTAS) || !ACCIONES.includes(accion)) return responder(400, { error: 'Acción o lista inválida.' });
  if (!archivos.length || archivos.length > 200 || !archivos.every((a) => /^[a-z0-9][a-z0-9-]*\.yaml$/.test(a))) {
    return responder(400, { error: 'Archivos inválidos.' });
  }

  try {
    const acceso = await verificarAcceso(token);
    if (!acceso.puede) return responder(403, { error: `${acceso.login} no tiene permiso de escritura en el repo.` });
    const r = await guardar(token, lista, accion, archivos, acceso.login);
    return responder(200, r);
  } catch (err) {
    const status = err instanceof ErrorGitHub ? err.status : 500;
    return responder(status, { error: (err as Error).message });
  }
};
