// Acceso al repo desde el panel /admin, con la misma sesión de GitHub que usa Keystatic
// (cookie keystatic-gh-access-token). Lee los eventos en vivo y guarda los cambios en un solo commit.
// Corre en el Worker: todo por la API GraphQL de GitHub, sin dependencias pesadas.

export const REPO = { owner: 'nmartinez023', name: 'del-rock-web', rama: 'main' }; // igual que keystatic.config.ts
export const COOKIE_TOKEN = 'keystatic-gh-access-token';

export const LISTAS = {
  agenda: { carpeta: 'src/content/agenda', titulo: 'Rock nacional (Agenda)' },
  otros: { carpeta: 'src/content/otros-eventos', titulo: 'Otros eventos de Rosario' },
} as const;
export type Lista = keyof typeof LISTAS;

export const ESTADOS = { publicado: '✅ Publicado', pendiente: '⏳ Pendiente', descartado: '❌ Descartado' } as const;

export class ErrorGitHub extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

async function graphql<T>(token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'del-rock-admin' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) throw new ErrorGitHub('La sesión de GitHub venció.', 401);
  const json = (await res.json()) as { data?: T; errors?: { message: string; type?: string }[] };
  if (json.errors?.length) {
    const conflicto = json.errors.some((e) => /expected|head|oid/i.test(e.message));
    throw new ErrorGitHub(json.errors.map((e) => e.message).join('; '), conflicto ? 409 : 502);
  }
  return json.data as T;
}

/** Quién sos y si podés escribir en el repo. */
export async function verificarAcceso(token: string) {
  const d = await graphql<{ viewer: { login: string }; repository: { viewerPermission: string } | null }>(
    token,
    `query($o:String!,$n:String!){ viewer{login} repository(owner:$o,name:$n){ viewerPermission } }`,
    { o: REPO.owner, n: REPO.name },
  );
  const puede = ['ADMIN', 'MAINTAIN', 'WRITE'].includes(d.repository?.viewerPermission ?? '');
  return { login: d.viewer.login, puede };
}

/**
 * Lectura mínima de los YAML de eventos: solo claves de primer nivel y `origen.fuente`.
 * (El plan gratis de Workers da pocos milisegundos de CPU por pedido: evitamos un parser completo.)
 */
export function leerCampos(texto: string) {
  const d: Record<string, string> = {};
  let bloque = '';
  for (const linea of texto.split(/\r?\n/)) {
    const arriba = /^([A-Za-z]+):\s*(.*)$/.exec(linea);
    if (arriba) {
      bloque = arriba[1];
      if (arriba[2] !== '' && !arriba[2].startsWith('|') && !arriba[2].startsWith('>')) d[arriba[1]] = sinComillas(arriba[2]);
      continue;
    }
    const anidada = /^\s+([A-Za-z]+):\s*(.*)$/.exec(linea);
    if (anidada && bloque === 'origen') d[`origen.${anidada[1]}`] = sinComillas(anidada[2]);
  }
  return d;
}

function sinComillas(v: string) {
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

export interface EventoAdmin {
  archivo: string;
  titulo: string;
  estado: 'publicado' | 'pendiente' | 'descartado';
  fecha: string;
  hora: string;
  venue: string;
  ciudad: string;
  genero: string;
  tipo: string;
  precioDesde: string;
  imagen: string;
  entradas: string;
  fuente: string;
}

const normalizarEstado = (v = ''): EventoAdmin['estado'] =>
  /descart/i.test(v) ? 'descartado' : /pendient/i.test(v) ? 'pendiente' : v ? 'publicado' : 'pendiente';

/** Todos los eventos de una lista, leídos del repo en vivo (una sola consulta). */
export async function leerEventos(token: string, lista: Lista): Promise<EventoAdmin[]> {
  const d = await graphql<{ repository: { object: { entries: { name: string; object: { text: string | null } | null }[] } | null } }>(
    token,
    `query($o:String!,$n:String!,$e:String!){ repository(owner:$o,name:$n){ object(expression:$e){ ... on Tree { entries { name object { ... on Blob { text } } } } } } }`,
    { o: REPO.owner, n: REPO.name, e: `${REPO.rama}:${LISTAS[lista].carpeta}` },
  );
  return (d.repository.object?.entries ?? [])
    .filter((e) => e.name.endsWith('.yaml') && e.object?.text)
    .map((e) => {
      const c = leerCampos(e.object!.text!);
      return {
        archivo: e.name,
        titulo: c.titulo ?? e.name,
        estado: normalizarEstado(c.estado),
        fecha: c.fecha ?? '',
        hora: c.hora ?? '',
        venue: c.venue ?? '',
        ciudad: c.ciudad ?? '',
        genero: c.genero ?? '',
        tipo: c.tipo ?? 'show',
        precioDesde: c.precioDesde ?? '',
        imagen: c.imagen ?? '',
        entradas: c.entradas ?? '',
        fuente: c['origen.fuente'] ?? 'a mano',
      };
    });
}

export type Accion = 'publicar' | 'descartar' | 'pendiente' | 'mover';

/**
 * Cambia el YAML de un evento tocando una sola línea, sin reescribir el resto:
 * publicar / descartar / pendiente cambian `estado`; mover invierte `rockNacional`
 * (el Action "Reubicar eventos" lo pasa a la otra lista, igual que al tildarlo en el panel).
 */
export function aplicarAccion(texto: string, accion: Accion, lista: Lista) {
  if (accion === 'mover') {
    const valor = lista === 'agenda' ? 'false' : 'true';
    return /^rockNacional:.*$/m.test(texto)
      ? texto.replace(/^rockNacional:.*$/m, `rockNacional: ${valor}`)
      : texto.replace(/^(titulo:.*)$/m, `$1\nrockNacional: ${valor}`);
  }
  const estado = { publicar: ESTADOS.publicado, descartar: ESTADOS.descartado, pendiente: ESTADOS.pendiente }[accion];
  return /^estado:.*$/m.test(texto) ? texto.replace(/^estado:.*$/m, `estado: ${estado}`) : texto.replace(/^(titulo:.*)$/m, `$1\nestado: ${estado}`);
}

function aBase64(texto: string) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

/** Aplica la acción a los archivos elegidos y lo guarda todo en un solo commit (reintenta si alguien guardó a la vez). */
export async function guardar(token: string, lista: Lista, accion: Accion, archivos: string[], login: string) {
  const carpeta = LISTAS[lista].carpeta;
  for (let intento = 0; intento < 3; intento++) {
    // Estado actual de la rama y de cada archivo, en una sola consulta.
    const alias = archivos.map((a, i) => `f${i}: object(expression: ${JSON.stringify(`${REPO.rama}:${carpeta}/${a}`)}) { ... on Blob { text } }`);
    const d = await graphql<{ repository: Record<string, { text?: string; target?: { oid: string } } | null> & { ref: { target: { oid: string } } } }>(
      token,
      `query($o:String!,$n:String!){ repository(owner:$o,name:$n){ ref(qualifiedName: ${JSON.stringify(`refs/heads/${REPO.rama}`)}){ target { oid } } ${alias.join(' ')} } }`,
      { o: REPO.owner, n: REPO.name },
    );
    const cambios = archivos.flatMap((a, i) => {
      const actual = d.repository[`f${i}`]?.text;
      if (!actual) return []; // ya no existe (lo movieron o borraron)
      const nuevo = aplicarAccion(actual, accion, lista);
      return nuevo === actual ? [] : [{ path: `${carpeta}/${a}`, contents: aBase64(nuevo) }];
    });
    if (!cambios.length) return { cambiados: 0, commit: null };

    const verbo = { publicar: 'Publicar', descartar: 'Descartar', pendiente: 'Volver a pendiente', mover: lista === 'agenda' ? 'Pasar a Otros' : 'Pasar a Agenda' }[accion];
    try {
      const r = await graphql<{ createCommitOnBranch: { commit: { oid: string } } }>(
        token,
        `mutation($i:CreateCommitOnBranchInput!){ createCommitOnBranch(input:$i){ commit { oid } } }`,
        {
          i: {
            branch: { repositoryNameWithOwner: `${REPO.owner}/${REPO.name}`, branchName: REPO.rama },
            expectedHeadOid: d.repository.ref.target.oid,
            message: { headline: `Admin: ${verbo} ${cambios.length} evento${cambios.length === 1 ? '' : 's'}`, body: `Desde /admin, por ${login}.` },
            fileChanges: { additions: cambios },
          },
        },
      );
      return { cambiados: cambios.length, commit: r.createCommitOnBranch.commit.oid };
    } catch (err) {
      if (err instanceof ErrorGitHub && err.status === 409 && intento < 2) continue; // alguien guardó a la vez: reintentar
      throw err;
    }
  }
  throw new ErrorGitHub('No se pudo guardar: el repo cambió varias veces seguidas. Probá de nuevo.', 409);
}
