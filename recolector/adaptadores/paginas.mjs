// Para ticketeras sin un listado completo: se lee la portada y después la página de cada evento,
// de a una y con pausa (para no cargarles el servidor).

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET de una página o un JSON, con nuestro User-Agent. */
export async function bajar(url, { agente, pedir = fetch } = {}) {
  const res = await pedir(url, {
    headers: { 'user-agent': agente, 'accept-language': 'es-AR,es;q=0.9' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.text();
}

/**
 * Baja varias páginas en orden, con `espera` ms entre una y otra. Las que fallan se saltean
 * (una página caída no tira abajo toda la fuente) salvo que fallen todas.
 */
export async function bajarVarias(urls, { agente, pedir = fetch, espera = 1000 } = {}) {
  const paginas = [];
  let error;
  for (const [i, url] of urls.entries()) {
    if (i > 0 && espera) await pausa(espera);
    try {
      paginas.push({ url, cuerpo: await bajar(url, { agente, pedir }) });
    } catch (err) {
      error = err;
    }
  }
  if (urls.length && !paginas.length) throw error;
  return paginas;
}
