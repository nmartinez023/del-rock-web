// Lectura mínima de robots.txt: respeta Disallow/Allow del grupo de nuestro bot o del grupo "*".

const cache = new Map();

export function parsearRobots(texto, agente) {
  const grupos = [];
  let actual = null;
  let leyendoAgentes = false;

  for (const crudo of texto.split(/\r?\n/)) {
    const linea = crudo.replace(/#.*/, '').trim();
    if (!linea) continue;
    const [clave, ...resto] = linea.split(':');
    const campo = clave.trim().toLowerCase();
    const valor = resto.join(':').trim();

    if (campo === 'user-agent') {
      if (!leyendoAgentes) {
        actual = { agentes: [], reglas: [] };
        grupos.push(actual);
      }
      actual.agentes.push(valor.toLowerCase());
      leyendoAgentes = true;
    } else if (actual && (campo === 'allow' || campo === 'disallow')) {
      actual.reglas.push({ permitir: campo === 'allow', ruta: valor });
      leyendoAgentes = false;
    } else {
      leyendoAgentes = false;
    }
  }

  const propio = agente.toLowerCase();
  const grupo =
    grupos.find((g) => g.agentes.some((a) => a !== '*' && propio.includes(a))) ??
    grupos.find((g) => g.agentes.includes('*'));
  return grupo?.reglas ?? [];
}

export function rutaPermitida(reglas, ruta) {
  // Gana la regla más específica (la más larga); ante empate, Allow.
  let mejor = null;
  for (const r of reglas) {
    if (!r.ruta) continue;
    if (!coincide(r.ruta, ruta)) continue;
    if (!mejor || r.ruta.length > mejor.ruta.length || (r.ruta.length === mejor.ruta.length && r.permitir)) mejor = r;
  }
  return mejor ? mejor.permitir : true;
}

function coincide(patron, ruta) {
  const re = '^' + patron.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
  return new RegExp(re).test(ruta);
}

export async function puedeLeer(url, agente, pedir = fetch) {
  const { origin, pathname, search } = new URL(url);
  if (!cache.has(origin)) {
    cache.set(
      origin,
      pedir(`${origin}/robots.txt`, { headers: { 'user-agent': agente }, signal: AbortSignal.timeout(10_000) })
        .then((r) => (r.ok ? r.text() : ''))
        .then((t) => parsearRobots(t, agente))
        .catch(() => []),
    );
  }
  return rutaPermitida(await cache.get(origin), pathname + search);
}
