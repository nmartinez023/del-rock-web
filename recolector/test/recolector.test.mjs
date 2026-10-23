import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, stringify } from 'yaml';
import { extraer } from '../adaptadores/jsonld.mjs';
import { adaptadorPara } from '../adaptadores/index.mjs';
import { normalizar, fechaHora, provinciaDe, completar } from '../normalizar.mjs';
import { aplicarClasificacion, bandaPara, bandasEnEvento, clasificacionPorBanda } from '../clasificar.mjs';
import { mezclar, reubicar, limpiarBandas, huellaDe, PENDIENTE, PUBLICADO, normalizarEstado, yamlPanel } from '../agenda.mjs';
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

test('Dame mi Ticket: lee la API (POST), arma fecha, lugar, precio, imagen y link', async () => {
  const ad = adaptadorPara('https://damemiticket.com/');
  const url = ad.urlDeDatos('https://damemiticket.com/');
  let pedido;
  const cuerpo = readFileSync(new URL('./fixtures/damemiticket.json', import.meta.url), 'utf8');
  const texto = await ad.descargar(url, { agente: 'X', pedir: async (u, init) => ((pedido = { u, init }), { ok: true, text: async () => cuerpo }) });
  assert.equal(pedido.init.method, 'POST');
  assert.match(pedido.u, /EventosHome$/);

  const [punk, desorden, konducta] = ad.extraer(texto).map((c) => normalizar(c, { url: 'https://damemiticket.com/', provincia: 'Santa Fe' }));
  assert.deepEqual(
    [desorden.titulo, desorden.fecha, desorden.hora, desorden.venue, desorden.direccion, desorden.ciudad, desorden.provincia],
    ['DESORDEN PÚBLICO EN ROSARIO', '2026-12-19', '20:00', 'JAGUAR HAÜS', 'Rodriguez 198 bis', 'Rosario', 'Santa Fe'],
  );
  assert.equal(desorden.entradas, 'https://damemiticket.com/evento/desorden-publico-en-rosario');
  assert.match(desorden.imagen, /^https:\/\/patagonia-chain\.com\/img_ticket\/.+\.jpg$/);
  assert.deepEqual([punk.precioDesde, desorden.precioDesde, konducta.precioDesde], [5000, 25000, 7000], 'el precio más bajo mayor a cero');
  assert.equal(konducta.descripcion, 'Aniversario del disco.');
});

test('Turbo Entrada: una función = un evento, con lugar, ciudad e imagen; descripción decodificada', () => {
  const ad = adaptadorPara('https://turboentrada.com/');
  assert.match(ad.urlDeDatos('https://turboentrada.com/'), /entradauno\.com\/v1\/api\/v2\/Cartelera$/);
  const cuerpo = readFileSync(new URL('./fixtures/turboentrada.json', import.meta.url), 'utf8');
  const f = { url: 'https://turboentrada.com/', provincia: 'Santa Fe' };
  const ev = ad.extraer(cuerpo).map((c) => normalizar(c, f));
  const ruido = ev.find((e) => e.titulo === 'Un Poco de Ruido');
  assert.deepEqual(
    [ruido.fecha, ruido.hora, ruido.venue, ruido.ciudad, ruido.provincia, ruido.descripcion, ruido.precioDesde],
    ['2026-10-31', '21:00', 'Metropolitano Rosario', 'Rosario', 'Santa Fe', 'Vuelve a Rosario', null],
  );
  assert.match(ruido.entradas, /^https:\/\/(www\.)?turboentrada\.com\/landing\//);
  assert.match(ruido.imagen, /^https:\/\/contenidos\.entradauno\.com\//);
  const seru = ev.find((e) => e.titulo.startsWith('Seru Giran'));
  assert.deepEqual([seru.ciudad, seru.provincia], ['Bahia Blanca', 'Buenos Aires']);
});

const nacional = (url, provincia = 'Otra') => ({ url, provincia });
const fixture = (nombre) => readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url), 'utf8');

test('Ticketek: nodo del CMS → fecha, lugar, provincia (CABA aunque diga el barrio), precio y link a la página', () => {
  const ad = adaptadorPara('https://www.ticketek.com.ar/');
  assert.equal(ad.urlDeDatos(), 'https://prod-cms-api.ticketek.com.ar/api/1.0/node%3Fpath%3Dhome');
  assert.equal(ad.urlDeNodo('seru-giran/arena-maipu'), 'https://prod-cms-api.ticketek.com.ar/api/1.0/node%3Fpath%3Dseru-giran--arena-maipu');
  const [seru, tipitos] = ad.extraer(fixture('ticketek.json')).map((c) => normalizar(c, nacional('https://www.ticketek.com.ar/')));
  assert.deepEqual(
    [seru.titulo, seru.fecha, seru.hora, seru.venue, seru.ciudad, seru.provincia, seru.precioDesde],
    ['Serú Girán', '2026-11-12', '22:00', 'Arena Maipu', 'Maipu', 'Mendoza', 67800],
  );
  assert.deepEqual([tipitos.ciudad, tipitos.provincia, tipitos.direccion], ['Buenos Aires', 'CABA', 'Marcelo T. de Alvear 1125']);
  assert.equal(tipitos.entradas, 'https://www.ticketek.com.ar/los-tipitos/teatro-coliseo');
  assert.doesNotMatch(tipitos.entradas, /websource/, 'la compra está prohibida en robots.txt');
  assert.match(tipitos.imagen, /^https:\/\/prod-cms-static\.ticketek\.com\.ar\//);
  assert.deepEqual(tipitos.artistas, ['Los Tipitos']);
});

test('Ticketek: de la portada solo los eventos de música, sin repetir', () => {
  const musica = [{ tid: '5', title: 'Musica' }];
  const portada = {
    widgets: {
      a: [{ type: 'tkt-artist-list', artists: [{ url: 'a/x', categories: musica }, { url: 'b/y', categories: [{ tid: '7', title: 'Teatro' }] }] }],
      b: [{ type: 'tkt-artist-list', artists: [{ url: 'a/x', categories: musica }] }, { type: 'tkt-custom-image' }],
    },
  };
  assert.deepEqual(adaptadorPara('https://www.ticketek.com.ar/').eventosDePortada(portada).map((a) => a.url), ['a/x']);
});

test('AllAccess: lee lo que juntó el marcador (JSON-LD de cada evento), con og:image y sin la "descripción" que es la fecha', () => {
  const ad = adaptadorPara('https://www.allaccess.com.ar/');
  assert.equal(ad.importado, 'recolector/entradas/allaccess.json', 'no se pide a la web: se lee lo traído desde /admin');
  const archivo = JSON.stringify({ guardado: '2026-10-22T20:00:00.000Z', por: 'prueba', cantidad: 2, eventos: JSON.parse(fixture('allaccess.json')) });
  const [foo, syd] = ad.extraer(archivo).map((c) => normalizar(c, nacional('https://www.allaccess.com.ar/')));
  assert.deepEqual(
    [syd.titulo, syd.fecha, syd.hora, syd.venue, syd.ciudad, syd.provincia, syd.precioDesde, syd.descripcion],
    ['SYDERAMA', '2026-10-24', '20:30', 'The Roxy Bar & Grill', 'CABA', 'CABA', 20000, ''],
  );
  assert.equal(syd.entradas, 'https://www.allaccess.com.ar/event/syderama');
  assert.match(syd.imagen, /^https:\/\/cdn\.getcrowder\.com\//);
  assert.equal(foo.id, 'foo-fighters');
});

test('Passline: lee lo traído desde /admin; CABA, entidades HTML y localidades en mayúsculas', () => {
  const ad = adaptadorPara('https://home.passline.com/');
  assert.equal(ad.importado, 'recolector/entradas/passline.json');
  const [divididos, kuelgue, abel] = ad.extraer(fixture('passline.json')).map((c) => normalizar(c, nacional('https://home.passline.com/')));
  assert.deepEqual(
    [divididos.fecha, divididos.hora, divididos.venue, divididos.ciudad, divididos.provincia, divididos.precioDesde, divididos.id],
    ['2026-12-17', '19:00', 'TEATRO FLORES', 'Buenos Aires', 'CABA', null, '530496'],
  );
  assert.equal(divididos.entradas, 'https://www.passline.com/eventos/divididos-en-teatro-flores-17-diciembre-2026');
  assert.match(divididos.imagen, /^https:\/\/imagenes\.passline\.com\/.+-rec\.jpg$/);
  assert.deepEqual([kuelgue.provincia, kuelgue.precioDesde], ['Mendoza', 65000]);
  assert.deepEqual([abel.ciudad, abel.provincia, abel.hora], ['San Carlos De Bariloche', 'Otra', '21:30']);
});

test('Passline: localidades codificadas dos veces y "CA" como Ciudad de Buenos Aires', () => {
  const ad = adaptadorPara('https://home.passline.com/');
  const ev = (comuna, region) => ({ id: 1, nombre: 'X', url: 'https://www.passline.com/eventos/x', fecha_inicio: '2026-11-06', nombre_communa: comuna, nombre_region: region });
  const lugar = (comuna, region) => {
    const [c] = ad.extraer(JSON.stringify([ev(comuna, region)])).map((e) => normalizar(e, nacional('https://home.passline.com/')));
    return [c.ciudad, c.provincia];
  };
  assert.deepEqual(lugar('CA&amp;Ntilde;UELAS', 'Buenos Aires'), ['Cañuelas', 'Buenos Aires']);
  assert.deepEqual(lugar('CA', 'Buenos Aires'), ['Buenos Aires', 'CABA']);
  assert.deepEqual(lugar('CA', 'C&amp;oacute;rdoba'), ['Córdoba', 'Córdoba']);
});

test('Movistar Arena: funciones de la ficha (año deducido), matiné y noche, y la fecha del listado si la ficha no cargó', () => {
  const ad = adaptadorPara('https://www.movistararena.com.ar/shows');
  assert.equal(ad.urlDeDatos(), 'https://www.movistararena.com.ar/shows');
  const evs = ad.extraer(fixture('movistararena.json')).map((c) => normalizar(c, nacional('https://www.movistararena.com.ar/shows', 'CABA')));
  const de = (t) => evs.filter((e) => e.titulo.includes(t));

  const [plan] = de('MARIPOSA');
  assert.deepEqual(
    [plan.fecha, plan.hora, plan.venue, plan.direccion, plan.ciudad, plan.provincia, plan.precioDesde],
    ['2026-10-31', '21:00', 'Movistar Arena', 'Humboldt 450', 'Buenos Aires', 'CABA', 75000],
  );
  assert.match(plan.entradas, /^https:\/\/www\.movistararena\.com\.ar\/show\/[\w-]+$/);
  assert.deepEqual(de('Becerra').map((e) => e.fecha), ['2027-02-06', '2026-11-13', '2026-11-14', '2026-11-15'], 'febrero ya es del año que viene');
  assert.deepEqual(de('Alejo').map((e) => e.hora), ['16:00', '21:00']);
  assert.equal(new Set(de('Alejo').map((e) => e.id)).size, 2);
  const [rata] = de('RATA BLANCA');
  assert.deepEqual([rata.fecha, rata.hora, rata.precioDesde], ['2026-12-05', '', 68000]);
});

test('TuEntrada: datos de Next en el HTML; una gira da un evento por ciudad', async () => {
  const ad = adaptadorPara('https://tuentrada.com/');
  const empaquetar = (obj) => `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(obj))}])</script>`;
  const portada = empaquetar({ banners: [{ model: 'event', id: 883, slug: 'dyango-tco', name: 'Dyango' }, { model: 'eventGroup', id: 1, slug: 'ntvg-gira' }] })
    + empaquetar({ items: [{ model: 'event', id: 883, slug: 'dyango-tco' }, { data: { url: 'x' }, type: 'link' }] })
    // Tarjeta suelta de la grilla de la portada (así aparecía Babasónicos).
    + `<script>self.__next_f.push([1,${JSON.stringify('3e:["$","$L31","1165",{"alt":"BABASONICOS","href":"babasonicos-amr","id":1165,"src":"https://bucket.tuentrada.com/b.jpg"}]\n')}])</script>`;
  const enPortada = ad.eventosDePortada(portada);
  assert.deepEqual(enPortada.map((e) => e.slug), ['dyango-tco', 'ntvg-gira', 'babasonicos-amr']);
  assert.deepEqual([enPortada[2].name, enPortada[2].imageMainNew.src], ['BABASONICOS', 'https://bucket.tuentrada.com/b.jpg']);

  const evs = ad.extraer(fixture('tuentrada.json')).map((c) => normalizar(c, nacional('https://tuentrada.com/', 'Buenos Aires')));
  const ntvg = evs.filter((e) => e.titulo === 'NO TE VA GUSTAR');
  assert.deepEqual(ntvg.map((e) => [e.fecha, e.ciudad]), [['2026-11-20', 'San Andres De Giles'], ['2026-11-21', 'Villa Ballester'], ['2026-11-22', 'Quilmes']]);
  assert.equal(new Set(evs.map((e) => e.id)).size, evs.length, 'cada función tiene su id');
  const dyango = evs.find((e) => e.titulo === 'Dyango');
  assert.deepEqual([dyango.hora, dyango.venue, dyango.entradas, dyango.precioDesde], ['21:00', 'Teatro Colonial', 'https://tuentrada.com/dyango-tco', null]);
});

test('"Otros eventos de Rosario": solo de Rosario y alrededores, aunque la fuente venda en otras ciudades', () => {
  const noRock = respuesta({ rockNacional: false, titulo: 'Camilo', artistas: ['Camilo'] });
  assert.equal(aplicarClasificacion(evento('CAMILO', { ciudad: 'Funes' }), noRock, bandas, rosario).destino, 'otros');
  assert.equal(aplicarClasificacion(evento('CAMILO', { ciudad: 'Neuquén' }), noRock, bandas, rosario), null);
  // El rock de cualquier ciudad sí va a la Agenda.
  assert.equal(aplicarClasificacion(evento('KAPANGA', { ciudad: 'Neuquén' }), respuesta(), bandas, rosario).destino, 'agenda');
});

// --- Clasificación ------------------------------------------------------------

test('rock nacional: va a la Agenda, con bandas cargadas o nuevas', () => {
  const ev = aplicarClasificacion(evento('LOS PIOJOS + Los Gardelitos'), respuesta({ titulo: 'Los Piojos + Los Gardelitos', artistas: ['Los Piojos', 'Los Gardelitos'] }), bandas, fuente);
  assert.equal(ev.destino, 'agenda');
  assert.equal(ev.titulo, 'Los Piojos + Los Gardelitos');
  assert.deepEqual(ev.bandas, ['los-piojos', 'los-gardelitos']);
  assert.deepEqual(ev.bandasNuevas, [{ slug: 'los-gardelitos', nombre: 'Los Gardelitos', automatica: true }]);
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

test('banda del listado ⇒ rock nacional sin consultar a la IA', () => {
  const lista = [...bandas, { slug: 'cruzando-el-charco', nombre: 'Cruzando el Charco', automatica: true }];
  const ev = evento('CRUZANDO EL CHARCO - DESACTIVAR EL DRAMA TOUR EN ROSARIO');
  const conocidas = bandasEnEvento(ev, lista);
  assert.deepEqual(conocidas.map((b) => b.slug), ['cruzando-el-charco']);
  const ia = clasificacionPorBanda(ev, conocidas);
  assert.deepEqual(ia, {
    genero: 'rock', rockNacional: true, tipo: 'show',
    titulo: 'Cruzando el Charco - Desactivar el Drama Tour', artistas: ['Cruzando el Charco'],
  });
  const final = aplicarClasificacion(ev, ia, lista, fuente);
  assert.deepEqual([final.destino, final.bandas], ['agenda', ['cruzando-el-charco']]);

  // Varias bandas, palabras completas y sin artículo: "Piojos" = "Los Piojos".
  assert.deepEqual(bandasEnEvento(evento('PIOJOS + KAPANGA EN EL HIPÓDROMO'), lista).map((b) => b.slug).sort(), ['kapanga', 'los-piojos']);
  // Sin coincidencias parciales: "Turfa" no es "Turf".
  assert.deepEqual(bandasEnEvento(evento('TURFA EN VIVO'), lista), []);
  // Tributos: decide la IA (en "Tributo a Los Piojos" no tocan Los Piojos).
  assert.deepEqual(bandasEnEvento(evento('TRIBUTO A LOS PIOJOS'), lista), []);
  // Festival con una banda conocida.
  assert.equal(clasificacionPorBanda(evento('FESTIVAL BANDERA CON KAPANGA'), [bandas[0]]).tipo, 'festival');
});

test('si la IA nombra una banda del listado, es rock aunque la IA diga que no', () => {
  const ev = aplicarClasificacion(evento('Kapanga + Los Lirios'), respuesta({ rockNacional: false, artistas: ['Kapanga', 'Los Lirios'] }), bandas, fuente);
  assert.deepEqual([ev.destino, ev.bandas], ['agenda', ['kapanga', 'los-lirios']]);
});

test('limpiarBandas: borra las automáticas sin fechas de rock ni notas; respeta las demás', () => {
  const { raiz, dirs, dirBandas, borrar } = carpetas();
  try {
    const dirNoticias = join(raiz, 'noticias');
    for (const d of [dirs.agenda, dirBandas, dirNoticias]) mkdirSync(d, { recursive: true });
    const banda = (s, d) => writeFileSync(join(dirBandas, s + '.yaml'), stringify(d));
    banda('a-mano', { nombre: 'A mano' });
    banda('confirmada', { nombre: 'Confirmada', automatica: true, rockConfirmado: true });
    banda('con-fecha', { nombre: 'Con fecha', automatica: true });
    banda('con-nota', { nombre: 'Con nota', automatica: true });
    banda('huerfana', { nombre: 'Huérfana', automatica: true });
    writeFileSync(join(dirs.agenda, 'x.yaml'), stringify({ titulo: 'X', bandas: ['con-fecha'] }));
    writeFileSync(join(dirNoticias, 'n.mdoc'), ['---', 'titulo: N', 'banda: con-nota', '---', 'Texto'].join('\n'));
    assert.deepEqual(limpiarBandas({ dirs, dirBandas, dirNoticias }), ['Huérfana']);
    assert.deepEqual(archivos(dirBandas), ['a-mano.yaml', 'con-fecha.yaml', 'con-nota.yaml', 'confirmada.yaml']);
  } finally {
    borrar();
  }
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
    assert.deepEqual(leer(dirBandas, 'cruzando-el-charco.yaml'), { nombre: 'Cruzando el Charco', automatica: true, rockConfirmado: true });
  } finally {
    borrar();
  }
});

test('más de 3 artistas: es un festival, sin bandas vinculadas ni bandas nuevas (aunque sea rock por una banda conocida)', () => {
  const cinco = ['Kapanga', 'Turf', 'Banda Uno', 'Banda Dos', 'Banda Tres'];
  const ev = aplicarClasificacion(evento('ROCK EN EL RÍO'), respuesta({ titulo: 'Rock en el Río', artistas: cinco, rockNacional: false }), bandas, fuente);
  assert.deepEqual([ev.destino, ev.tipo, ev.rockNacional, ev.bandas, ev.bandasNuevas], ['agenda', 'festival', true, [], []]);
  const tres = aplicarClasificacion(evento('TRES'), respuesta({ titulo: 'Tres', artistas: cinco.slice(0, 3) }), bandas, fuente);
  assert.deepEqual([tres.tipo, tres.bandas], ['show', ['kapanga', 'turf', 'banda-uno']], 'hasta 3 sigue siendo un show con sus bandas');
});

test('reubicar: un evento de Otros con más de 3 artistas pasa a Agenda como festival, sin crear bandas', () => {
  const { dirs, dirBandas, borrar } = carpetas();
  try {
    const ia = respuesta({ rockNacional: false, genero: 'cumbia', titulo: 'Fiesta', artistas: ['A Uno', 'B Dos', 'C Tres', 'D Cuatro'] });
    mezclar([aplicarClasificacion(evento('FIESTA', { id: 'f' }), ia, bandas, rosario)], rosario, { hoy: HOY, dirs });
    const [archivo] = archivos(dirs.otros);
    writeFileSync(join(dirs.otros, archivo), stringify({ ...leer(dirs.otros, archivo), rockNacional: true }));
    reubicar({ fuentesRosario: new Set(['rosario']), bandas, dirs, dirBandas });
    const movido = leer(dirs.agenda, archivo);
    assert.deepEqual([movido.tipo, movido.bandas], ['festival', []]);
    assert.equal(existsSync(dirBandas) ? readdirSync(dirBandas).length : 0, 0);
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
