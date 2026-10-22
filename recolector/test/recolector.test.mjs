import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, stringify } from 'yaml';
import { extraer } from '../adaptadores/jsonld.mjs';
import { adaptadorPara } from '../adaptadores/index.mjs';
import { normalizar, fechaHora, provinciaDe, completar } from '../normalizar.mjs';
import { aplicarClasificacion, bandaPara } from '../clasificar.mjs';
import { mezclar, reubicar, huellaDe, PENDIENTE, PUBLICADO, normalizarEstado, yamlPanel } from '../agenda.mjs';
import jsyaml from 'js-yaml';
import { crearClasificador, cargarCache, claveIA, SinCredito } from '../ia.mjs';
import { parsearRobots, rutaPermitida } from '../robots.mjs';

const html = readFileSync(new URL('./fixtures/ticketera.html', import.meta.url), 'utf8');
const fuente = { slug: 'prueba', url: 'https://tickets.ejemplo/listado', provincia: 'CABA', rosario: false };
const rosario = { ...fuente, slug: 'rosario', rosario: true };
const bandas = [
  { slug: 'kapanga', nombre: 'Kapanga' },
  { slug: 'turf', nombre: 'Turf' },
  { slug: 'los-piojos', nombre: 'Los Piojos' },
];
const HOY = '2026-10-25';

const evento = (titulo, extra = {}) => ({
  titulo, fecha: '2026-11-01', hora: '21:00', venue: 'Club', ciudad: 'Rosario', provincia: 'Santa Fe',
  entradas: 'https://t/x', artistas: [], id: titulo, ...extra,
});
const respuesta = (extra = {}) => ({ genero: 'rock', rockNacional: true, tipo: 'show', titulo: 'Kapanga', artistas: ['Kapanga'], ...extra });

/** Carpetas temporales con la misma forma que el repo. */
function carpetas() {
  const raiz = mkdtempSync(join(tmpdir(), 'recolector-'));
  const dirs = { agenda: join(raiz, 'agenda'), otros: join(raiz, 'otros') };
  const dirBandas = join(raiz, 'bandas');
  for (const d of [...Object.values(dirs), dirBandas]) rmSync(d, { recursive: true, force: true });
  return { raiz, dirs, dirBandas, borrar: () => rmSync(raiz, { recursive: true, force: true }) };
}
const leer = (dir, archivo) => parse(readFileSync(join(dir, archivo), 'utf8'));
const archivos = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);

// --- Extracción y normalización -------------------------------------------------

test('JSON-LD: extrae eventos de @graph e ItemList y saltea JSON roto', () => {
  const crudos = extraer(html);
  assert.equal(crudos.length, 5);
  assert.equal(crudos[0].nombre, 'KAPANGA & invitados - Gira 2026');
  assert.equal(crudos[0].url, 'https://tickets.ejemplo/kapanga-flores');
  assert.deepEqual(crudos[0].artistas, ['Kapanga']);
  assert.equal(crudos[2].cancelado, true);
});

test('JSON-LD genérico: precio más bajo de las ofertas y descripción', () => {
  const [ev] = extraer(`<script type="application/ld+json">{"@type":"MusicEvent","name":"X","startDate":"2026-11-01",
    "description":"Show acústico","offers":[{"price":"20000"},{"price":"15000.50"},{"lowPrice":"18000"}]}</script>`);
  assert.deepEqual([ev.precioDesde, ev.descripcion], [15001, 'Show acústico']);
});

test('convierte la hora a Argentina (UTC 00:30 del 15 = 21:30 del 14)', () => {
  assert.deepEqual(fechaHora('2026-11-15T00:30:00Z'), { fecha: '2026-11-14', hora: '21:30' });
  assert.deepEqual(fechaHora('2026-12-05T21:30:00-03:00'), { fecha: '2026-12-05', hora: '21:30' });
  assert.deepEqual(fechaHora('2026-11-20'), { fecha: '2026-11-20', hora: '' });
  assert.equal(fechaHora('mañana'), null);
});

test('deduce la provincia desde la dirección; la región manda sobre la calle', () => {
  assert.equal(provinciaDe('Ciudad Autónoma de Buenos Aires'), 'CABA');
  assert.equal(provinciaDe('Av. Siempreviva 123, Rosario, Santa Fe'), 'Santa Fe');
  assert.equal(provinciaDe('La Plata'), 'Buenos Aires');
  assert.equal(provinciaDe('Santa Fe', 'Rosario', 'Córdoba 1650'), 'Santa Fe');
  assert.equal(provinciaDe('Montevideo'), null);
});

test('Entrada Play: listado (precio, imagen, link) y página del evento (descripción, aviso, dirección)', () => {
  const ad = adaptadorPara('https://entradaplay.com');
  assert.equal(ad.urlDeDatos('https://entradaplay.com'), 'https://entradaplay.com/obtener_eventos/?cantidad_eventos=200');
  const lista = ad.extraer(readFileSync(new URL('./fixtures/entradaplay.json', import.meta.url), 'utf8'), 'https://entradaplay.com/obtener_eventos/');
  assert.equal(lista.length, 3);
  assert.deepEqual(
    [lista[0].imagen, lista[0].precioDesde, lista[0].url, lista[1].url],
    ['https://entradaplay.com/media/eventos/banda.jpg', 25000, 'https://entradaplay.com/LOS-PIOJOS/', 'https://otra-ticketera.ejemplo/evento'],
  );
  const extra = ad.detalle(lista[0], readFileSync(new URL('./fixtures/entradaplay-evento.html', import.meta.url), 'utf8'));
  assert.deepEqual(extra, {
    direccion: 'Calle Falsa 123',
    descripcion: 'La banda vuelve a Rosario con un show único.\n\nApertura de puertas: 20 hs.\n\nInvitados especiales.',
    aviso: 'EVENTO APTO +18 AÑOS',
  });
  const ev = normalizar(completar(lista[0], extra), { url: 'https://entradaplay.com', provincia: 'Santa Fe' });
  assert.deepEqual([ev.fecha, ev.hora, ev.venue, ev.ciudad, ev.provincia, ev.direccion], ['2026-11-07', '21:00', 'Teatro de Prueba', 'Rosario', 'Santa Fe', 'Calle Falsa 123']);
  assert.equal(normalizar(lista[2], fuente), null, 'el evento sin fecha se descarta');
  assert.equal(adaptadorPara('https://otra.ejemplo/x').extraer, extraer, 'el resto usa JSON-LD');
});

// --- Clasificación ------------------------------------------------------------

test('rock nacional: va a la Agenda, con bandas cargadas o nuevas', () => {
  const ev = aplicarClasificacion(evento('LOS PIOJOS + Los Gardelitos'), respuesta({ titulo: 'Los Piojos + Los Gardelitos', artistas: ['Los Piojos', 'Los Gardelitos'] }), bandas, fuente);
  assert.equal(ev.destino, 'agenda');
  assert.equal(ev.titulo, 'Los Piojos + Los Gardelitos');
  assert.deepEqual(ev.bandas, ['los-piojos', 'los-gardelitos']);
  assert.deepEqual(ev.bandasNuevas, [{ slug: 'los-gardelitos', nombre: 'Los Gardelitos' }]);
  assert.equal(bandaPara('Piojos', bandas)?.slug, 'los-piojos', 'sin importar el artículo');
});

test('no es rock: de Rosario va a "otros" con los artistas como texto; de otro lado no se guarda', () => {
  const ia = respuesta({ rockNacional: false, titulo: 'Los Nocheros', artistas: ['Los Nocheros'] });
  const otro = aplicarClasificacion(evento('LOS NOCHEROS'), ia, bandas, rosario);
  assert.deepEqual([otro.destino, otro.artistas, otro.bandas, otro.bandasNuevas], ['otros', ['Los Nocheros'], [], []]);
  assert.equal(aplicarClasificacion(evento('LOS NOCHEROS'), ia, bandas, fuente), null);
});

test('título: si la IA devuelve algo que no se parece al original, queda el original', () => {
  const ev = aplicarClasificacion(evento('LOS NOCHEROS'), respuesta({ rockNacional: false, titulo: 'LosNgueros', artistas: ['Los Nocheros'] }), bandas, rosario);
  assert.equal(ev.titulo, 'LOS NOCHEROS');
  assert.equal(aplicarClasificacion(evento('CARAS EXTRAÑAS DESPIDE EL AÑO EN ROSARIO'), respuesta({ titulo: 'Caras Extrañas despide el año' }), bandas, fuente).titulo, 'Caras Extrañas despide el año');
});

test('festival de rock sin lineup: va a la Agenda sin bandas', () => {
  const ev = aplicarClasificacion(evento('FESTIVAL BANDERA'), respuesta({ tipo: 'festival', titulo: 'Festival Bandera', artistas: [] }), bandas, fuente);
  assert.deepEqual([ev.destino, ev.tipo, ev.bandas], ['agenda', 'festival', []]);
});

// --- IA (con fetch simulado: no gasta créditos) --------------------------------

const respuestaApi = (contenido, status = 200, costo = 0.0003) => ({
  status,
  ok: status < 300,
  json: async () => ({ choices: [{ message: { content: typeof contenido === 'string' ? contenido : JSON.stringify(contenido) } }], usage: { cost: costo } }),
  text: async () => 'error',
});

test('IA: pide formato estructurado al modelo configurado y devuelve la respuesta con su costo', async () => {
  const pedidos = [];
  const ia = crearClasificador({ apiKey: 'k', modelo: 'anthropic/claude-haiku-5.5', pedir: async (url, init) => (pedidos.push(JSON.parse(init.body)), respuestaApi(respuesta())) });
  const r = await ia(evento('KAPANGA', { descripcion: 'x'.repeat(5000) }));
  assert.deepEqual(r, { ...respuesta(), costo: 0.0003 });
  assert.equal(pedidos[0].model, 'anthropic/claude-haiku-5.5');
  assert.equal(pedidos[0].response_format.type, 'json_schema');
  assert.equal(JSON.parse(pedidos[0].messages[1].content).descripcion.length, 1500, 'la descripción se recorta');
});

test('IA: si OpenRouter rechaza el formato (400), reintenta pidiendo JSON por instrucción', async () => {
  const pedidos = [];
  const respuestas = [respuestaApi('', 400), respuestaApi('```json\n' + JSON.stringify(respuesta()) + '\n```')];
  const ia = crearClasificador({ apiKey: 'k', pedir: async (u, init) => (pedidos.push(JSON.parse(init.body)), respuestas.shift()) });
  assert.equal((await ia(evento('KAPANGA'))).titulo, 'Kapanga');
  assert.equal(pedidos[1].response_format, undefined);
});

test('IA: sin crédito o key inválida corta con SinCredito; respuestas inválidas se reintentan', async () => {
  const sinCredito = crearClasificador({ apiKey: 'k', pedir: async () => respuestaApi('', 402) });
  await assert.rejects(sinCredito(evento('X')), SinCredito);

  const respuestas = [respuestaApi({ nada: true }), respuestaApi('no es json'), respuestaApi(respuesta())];
  const conReintento = crearClasificador({ apiKey: 'k', pedir: async () => respuestas.shift(), esperar: async () => {} });
  assert.equal((await conReintento(evento('X'))).rockNacional, true);
});

test('caché de IA: guarda por evento y olvida los que pasaron hace mucho', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cache-'));
  const archivo = join(dir, 'cache.json');
  try {
    const c = cargarCache(archivo);
    const nuevo = evento('A', { fecha: '2026-11-01' });
    c.set(claveIA(nuevo), respuesta(), nuevo.fecha);
    c.set('vieja', respuesta(), '2026-01-01');
    c.guardar(HOY);
    const otra = cargarCache(archivo);
    assert.deepEqual(otra.get(claveIA(nuevo)), respuesta());
    assert.equal(otra.get('vieja'), undefined);
    assert.equal(claveIA(nuevo), claveIA({ ...nuevo, descripcion: 'leída después' }), 'la clave no depende de la página del evento');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Guardado -------------------------------------------------------------------

test('mezclar: rock a Agenda y el resto a "otros", como Pendiente; crea las bandas nuevas', () => {
  const { dirs, dirBandas, borrar } = carpetas();
  try {
    const rock = aplicarClasificacion(evento('LOS GARDELITOS', { id: '1' }), respuesta({ titulo: 'Los Gardelitos', artistas: ['Los Gardelitos'] }), bandas, rosario);
    const otro = aplicarClasificacion(evento('LOS NOCHEROS', { id: '2' }), respuesta({ rockNacional: false, titulo: 'Los Nocheros', artistas: ['Los Nocheros'] }), bandas, rosario);
    const r = mezclar([rock, otro], rosario, { hoy: HOY, dirs, dirBandas });
    assert.deepEqual(r.nuevos, ['2026-11-01-los-gardelitos.yaml', 'otros/2026-11-01-los-nocheros.yaml']);
    const a = leer(dirs.agenda, '2026-11-01-los-gardelitos.yaml');
    assert.deepEqual([a.estado, a.rockNacional, a.bandas, a.artistas], [PENDIENTE, true, ['los-gardelitos'], undefined]);
    assert.match(readFileSync(join(dirs.agenda, '2026-11-01-los-gardelitos.yaml'), 'utf8'), /^hora: "21:00"$/m);
    const o = leer(dirs.otros, '2026-11-01-los-nocheros.yaml');
    assert.deepEqual([o.estado, o.rockNacional, o.artistas, o.bandas], [PENDIENTE, false, ['Los Nocheros'], undefined]);
    assert.deepEqual(archivos(dirBandas), ['los-gardelitos.yaml'], 'no se crean bandas para los que no son rock');

    // Segunda corrida igual: nada cambia.
    const r2 = mezclar([rock, otro], rosario, { hoy: HOY, dirs, dirBandas });
    assert.deepEqual([r2.nuevos.length, r2.actualizados.length, r2.sinCambios], [0, 0, 2]);
  } finally {
    borrar();
  }
});

test('mezclar: actualiza lo no editado (manteniendo estado), respeta lo editado y conserva la descripción', () => {
  const { dirs, borrar } = carpetas();
  try {
    const base = aplicarClasificacion(evento('KAPANGA', { id: 'k', descripcion: 'Texto', detalle: '2026-10-25' }), respuesta(), bandas, fuente);
    mezclar([base], fuente, { hoy: HOY, dirs });
    const [archivo] = archivos(dirs.agenda);
    // La publicás: cambiar el estado no cuenta como edición.
    writeFileSync(join(dirs.agenda, archivo), stringify({ ...leer(dirs.agenda, archivo), estado: PUBLICADO }));

    // Cambia el precio y esta vez no se leyó la página del evento.
    const cambio = { ...base, precioDesde: 30000, descripcion: '', detalle: undefined };
    assert.deepEqual(mezclar([cambio], fuente, { hoy: HOY, dirs }).actualizados, [archivo]);
    const d = leer(dirs.agenda, archivo);
    assert.deepEqual([d.estado, d.precioDesde, d.descripcion, d.origen.detalle], [PUBLICADO, 30000, 'Texto', '2026-10-25']);

    // La editás a mano: el recolector no la vuelve a tocar.
    writeFileSync(join(dirs.agenda, archivo), stringify({ ...d, titulo: 'Kapanga en vivo' }));
    assert.equal(mezclar([{ ...cambio, precioDesde: 1 }], fuente, { hoy: HOY, dirs }).actualizados.length, 0);
    assert.equal(leer(dirs.agenda, archivo).titulo, 'Kapanga en vivo');
  } finally {
    borrar();
  }
});

test('mezclar: si un evento ya no es rock, se mueve a "otros" (Rosario) o se borra (otras fuentes)', () => {
  const { dirs, borrar } = carpetas();
  try {
    const ev = evento('CRUZANDO EL CHARCO', { id: 'c' });
    const comoRock = (f) => aplicarClasificacion(ev, respuesta({ titulo: 'Cruzando el Charco', artistas: ['Cruzando el Charco'] }), bandas, f);
    const comoOtro = (f) => aplicarClasificacion(ev, respuesta({ rockNacional: false, titulo: 'Cruzando el Charco', artistas: ['Cruzando el Charco'] }), bandas, f) ?? { ...ev, destino: null };

    mezclar([comoRock(rosario)], rosario, { hoy: HOY, dirs });
    const r = mezclar([comoOtro(rosario)], rosario, { hoy: HOY, dirs });
    assert.equal(r.movidos.length, 1);
    assert.deepEqual([archivos(dirs.agenda).length, archivos(dirs.otros).length], [0, 1]);

    // Otra fuente (no de Rosario), otro show: si deja de ser rock, se borra.
    const ev2 = evento('CRUZANDO EL CHARCO', { id: 'c2', fecha: '2026-11-08', venue: 'Teatro' });
    const ia2 = (rock) => respuesta({ rockNacional: rock, titulo: 'Cruzando el Charco', artistas: ['Cruzando el Charco'] });
    mezclar([aplicarClasificacion(ev2, ia2(true), bandas, fuente)], fuente, { hoy: HOY, dirs });
    assert.equal(archivos(dirs.agenda).length, 1);
    const sale = aplicarClasificacion(ev2, ia2(false), bandas, fuente) ?? { ...ev2, destino: null };
    assert.equal(mezclar([sale], fuente, { hoy: HOY, dirs }).borrados.length, 1);
    assert.equal(archivos(dirs.agenda).length, 0);
  } finally {
    borrar();
  }
});

test('reubicar: respeta lo que marcás a mano en "Rock nacional"', () => {
  const { dirs, dirBandas, borrar } = carpetas();
  try {
    mezclar([aplicarClasificacion(evento('KAPANGA', { id: '1' }), respuesta(), bandas, rosario)], rosario, { hoy: HOY, dirs });
    mezclar([aplicarClasificacion(evento('LOS PERICOS', { id: '2' }), respuesta({ rockNacional: false, titulo: 'Los Pericos', artistas: ['Los Pericos'] }), bandas, rosario)], rosario, { hoy: HOY, dirs });
    const [enAgenda] = archivos(dirs.agenda);
    const [enOtros] = archivos(dirs.otros);
    // Destildás Kapanga y tildás Los Pericos.
    writeFileSync(join(dirs.agenda, enAgenda), stringify({ ...leer(dirs.agenda, enAgenda), rockNacional: false }));
    writeFileSync(join(dirs.otros, enOtros), stringify({ ...leer(dirs.otros, enOtros), rockNacional: true }));

    const movidos = reubicar({ fuentesRosario: new Set(['rosario']), bandas, dirs, dirBandas });
    assert.equal(movidos.length, 2);
    assert.deepEqual(leer(dirs.otros, enAgenda).artistas, ['Kapanga']);
    assert.deepEqual(leer(dirs.agenda, enOtros).bandas, ['los-pericos']);
    assert.deepEqual(archivos(dirBandas), ['los-pericos.yaml']);
    // Y quedan como editados a mano: el recolector no los vuelve a mover.
    const d = leer(dirs.agenda, enOtros);
    assert.notEqual(d.origen.huella, huellaDe(d));
  } finally {
    borrar();
  }
});

test('YAML: el lector del panel (js-yaml) ve como texto lo que es texto', () => {
  const texto = yamlPanel({
    titulo: 'Yes', fecha: '2026-11-28', hora: '21:00',
    origen: { fuente: 'x', id: '12345', huella: '1234567890123456', detalle: '2026-10-22' },
  });
  assert.match(texto, /^fecha: 2026-11-28$/m, 'la fecha del evento va sin comillas, como la guarda el panel');
  const d = jsyaml.load(texto);
  for (const v of [d.titulo, d.hora, d.origen.id, d.origen.huella, d.origen.detalle]) assert.equal(typeof v, 'string');
});

test('reubicar: un show sin artistas que pasa a rock usa el título como banda', () => {
  const { dirs, dirBandas, borrar } = carpetas();
  try {
    mezclar([aplicarClasificacion(evento('CRUZANDO EL CHARCO', { id: 'c' }), respuesta({ rockNacional: false, genero: 'sin datos', titulo: 'Cruzando el Charco', artistas: [] }), bandas, rosario)], rosario, { hoy: HOY, dirs });
    const [archivo] = archivos(dirs.otros);
    writeFileSync(join(dirs.otros, archivo), stringify({ ...leer(dirs.otros, archivo), rockNacional: true }));
    reubicar({ fuentesRosario: new Set(['rosario']), bandas, dirs, dirBandas });
    assert.deepEqual(leer(dirs.agenda, archivo).bandas, ['cruzando-el-charco']);
    assert.deepEqual(leer(dirBandas, 'cruzando-el-charco.yaml'), { nombre: 'Cruzando el Charco', automatica: true });
  } finally {
    borrar();
  }
});

test('estados: normaliza los viejos sin emoji', () => {
  assert.deepEqual(['publicado', 'pendiente', 'descartado', undefined].map(normalizarEstado), ['✅ Publicado', '⏳ Pendiente', '❌ Descartado', '⏳ Pendiente']);
});

test('robots.txt: respeta Disallow y la regla más específica', () => {
  const reglas = parsearRobots('User-agent: *\nDisallow: /checkout\nDisallow: /eventos/\nAllow: /eventos/rock\n', 'DelRockBot/1.0');
  assert.equal(rutaPermitida(reglas, '/eventos/rock/kapanga'), true);
  assert.equal(rutaPermitida(reglas, '/eventos/teatro'), false);
  assert.equal(rutaPermitida(reglas, '/checkout/1'), false);
  assert.equal(rutaPermitida(reglas, '/'), true);
  assert.equal(rutaPermitida(parsearRobots('User-agent: *\nDisallow: /\n', 'x'), '/lo-que-sea'), false);
});
