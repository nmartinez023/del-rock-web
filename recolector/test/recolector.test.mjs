import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, stringify } from 'yaml';
import { extraer } from '../adaptadores/jsonld.mjs';
import { adaptadorPara } from '../adaptadores/index.mjs';
import { normalizar, fechaHora, provinciaDe, completar } from '../normalizar.mjs';
import { clasificar, nombresDelTitulo } from '../clasificar.mjs';
import { mezclar } from '../agenda.mjs';
import { parsearRobots, rutaPermitida } from '../robots.mjs';

const html = readFileSync(new URL('./fixtures/ticketera.html', import.meta.url), 'utf8');
const fuente = { slug: 'prueba', url: 'https://tickets.ejemplo/listado', provincia: 'CABA', filtro: 'bandas' };
const bandas = [
  { slug: 'kapanga', nombre: 'Kapanga' },
  { slug: 'turf', nombre: 'Turf' },
  { slug: 'ntvg', nombre: 'No Te Va Gustar' },
  { slug: 'los-espiritus', nombre: 'Los Espíritus' },
];
const HOY = '2026-10-25'; // el Festival Bandera (24/10) ya pasó

const procesar = (f = fuente) =>
  extraer(html)
    .map((c) => normalizar(c, f))
    .filter(Boolean)
    .map((e) => clasificar(e, bandas, f))
    .filter(Boolean);

const evento = (titulo, extra = {}) => ({
  titulo,
  fecha: '2026-11-01',
  hora: '21:00',
  venue: 'Club',
  ciudad: 'Buenos Aires',
  provincia: 'CABA',
  entradas: 'https://t/x',
  artistas: [],
  id: titulo,
  ...extra,
});

test('extrae eventos de @graph e ItemList y saltea JSON roto', () => {
  const crudos = extraer(html);
  assert.equal(crudos.length, 5);
  assert.equal(crudos[0].nombre, 'KAPANGA & invitados - Gira 2026');
  assert.equal(crudos[0].url, 'https://tickets.ejemplo/kapanga-flores');
  assert.deepEqual(crudos[0].artistas, ['Kapanga']);
  assert.equal(crudos[2].cancelado, true);
});

test('convierte la hora a Argentina (UTC 00:30 del 15 = 21:30 del 14)', () => {
  assert.deepEqual(fechaHora('2026-11-15T00:30:00Z'), { fecha: '2026-11-14', hora: '21:30' });
  assert.deepEqual(fechaHora('2026-12-05T21:30:00-03:00'), { fecha: '2026-12-05', hora: '21:30' });
  assert.deepEqual(fechaHora('2026-11-20'), { fecha: '2026-11-20', hora: '' });
  assert.equal(fechaHora('mañana'), null);
});

test('deduce la provincia desde la dirección', () => {
  assert.equal(provinciaDe('Ciudad Autónoma de Buenos Aires'), 'CABA');
  assert.equal(provinciaDe('Av. Siempreviva 123, Rosario, Santa Fe'), 'Santa Fe');
  assert.equal(provinciaDe('La Plata'), 'Buenos Aires');
  assert.equal(provinciaDe('Montevideo'), null);
  // La región manda sobre la dirección (calle Córdoba en Rosario).
  assert.equal(provinciaDe('Santa Fe', 'Rosario', 'Córdoba 1650'), 'Santa Fe');
});

test('con filtro "bandas" deja solo eventos con bandas cargadas y descarta cancelados', () => {
  assert.deepEqual(
    procesar().map((e) => [e.bandas, e.fecha, e.provincia, e.venue]),
    [
      [['kapanga'], '2026-11-14', 'CABA', 'Teatro Flores'],
      [['turf'], '2026-12-05', 'Santa Fe', 'Distrito Rock'],
    ],
  );
});

test('con filtro "todos" entran también el festival (sin bandas) y la obra', () => {
  const ev = procesar({ ...fuente, filtro: 'todos' });
  assert.equal(ev.length, 4);
  const festival = ev.find((e) => e.titulo === 'Festival Bandera');
  assert.deepEqual([festival.tipo, festival.bandas, festival.bandasNuevas], ['festival', [], []]);
  const obra = ev.find((e) => e.titulo === 'Obra de teatro infantil');
  assert.deepEqual([obra.tipo, obra.bandas, obra.provincia], ['show', [], 'Buenos Aires']);
});

test('nombresDelTitulo: limpia el título y separa varios artistas', () => {
  assert.deepEqual(nombresDelTitulo('LOS PIOJOS - Gira 2026'), ['Los Piojos']);
  assert.deepEqual(nombresDelTitulo('Ciro y los Persas en el Estadio Único'), ['Ciro y los Persas']);
  assert.deepEqual(nombresDelTitulo('El Mató a un Policía Motorizado + invitados'), ['El Mató a un Policía Motorizado']);
  assert.deepEqual(nombresDelTitulo('Pez (presentación nuevo disco)'), ['Pez']);
  assert.deepEqual(nombresDelTitulo('SILVESTRE Y LA NARANJA'), ['Silvestre y la Naranja']);
  assert.deepEqual(nombresDelTitulo('CARAS EXTRAÑAS DESPIDE EL AÑO'), ['Caras Extrañas']);
  assert.deepEqual(nombresDelTitulo('Las Pastillas del Abuelo + Guasones / Valdés'), ['Las Pastillas del Abuelo', 'Guasones', 'Valdés']);
  assert.deepEqual(nombresDelTitulo('DIRTY SOUND CLUB x CCG'), ['Dirty Sound Club', 'CCG']);
  assert.deepEqual(nombresDelTitulo('Viejas Locas & Jóvenes Pordioseros - Gira'), ['Viejas Locas', 'Jóvenes Pordioseros']);
});

test('dos bandas: matchea las cargadas y crea las que faltan', () => {
  const f = { ...fuente, filtro: 'todos' };
  // Las dos cargadas, unidas por "y" (que no es separador): las reconoce por nombre.
  assert.deepEqual(clasificar(evento('Los Espíritus y Kapanga en el Teatro Flores'), bandas, f).bandas, ['los-espiritus', 'kapanga']);
  // Una cargada y otra nueva.
  const mixto = clasificar(evento('Turf + Los Gardelitos'), bandas, f);
  assert.deepEqual(mixto.bandas, ['turf', 'los-gardelitos']);
  assert.deepEqual(mixto.bandasNuevas, [{ slug: 'los-gardelitos', nombre: 'Los Gardelitos' }]);
  // Con "y": la conocida se reconoce y el resto queda como banda nueva.
  assert.deepEqual(clasificar(evento('Los Espíritus y Él Mató'), bandas, f).bandas, ['los-espiritus', 'el-mato']);
  // Una banda conocida que en realidad es el lugar no se asocia: "Charly Day en CCG".
  const conLugar = clasificar(evento('Charly Day en CCG'), [...bandas, { slug: 'ccg', nombre: 'CCG' }], f);
  assert.deepEqual(conLugar.bandas, ['charly-day']);
  // Artistas informados por la ticketera: se usan tal cual.
  const informados = clasificar(evento('Noche de rock', { artistas: ['Kapanga', 'Los Tabaleros'] }), bandas, f);
  assert.deepEqual(informados.bandas, ['kapanga', 'los-tabaleros']);
  // Con filtro "bandas" no se crean nuevas, pero se mantienen las cargadas.
  assert.deepEqual(clasificar(evento('Turf + Los Gardelitos'), bandas, fuente).bandas, ['turf']);
  assert.equal(clasificar(evento('Los Gardelitos'), bandas, fuente), null);
});

test('festivales: sin bandas o con el lineup que se reconozca, nunca inventadas del título', () => {
  const f = { ...fuente, filtro: 'todos' };
  const solo = clasificar(evento('Festival Bandera 2026'), bandas, f);
  assert.deepEqual([solo.tipo, solo.bandas, solo.bandasNuevas], ['festival', [], []]);
  const conLineup = clasificar(evento('Cosquín Rock Fest: Turf, No Te Va Gustar y más'), bandas, f);
  assert.deepEqual([conLineup.tipo, conLineup.bandas.sort()], ['festival', ['ntvg', 'turf']]);
  // Con filtro "bandas", un festival entra solo si tiene alguna banda cargada.
  assert.equal(clasificar(evento('Festival Bandera'), bandas, fuente), null);
  assert.equal(clasificar(evento('Festival con Kapanga'), bandas, fuente).tipo, 'festival');
});

test('mezclar: crea pendientes, actualiza los no editados y respeta los editados a mano', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenda-'));
  try {
    // Una fecha cargada a mano del mismo show de Turf: no se duplica.
    writeFileSync(
      join(dir, 'turf-manual.yaml'),
      stringify({ titulo: 'Turf', estado: 'publicado', tipo: 'show', bandas: ['turf'], fecha: '2026-12-05', hora: '21:30', venue: 'Distrito Rock', ciudad: 'Rosario', provincia: 'Santa Fe' }),
    );
    const eventos = procesar({ ...fuente, filtro: 'todos' });

    const r1 = mezclar(dir, eventos, fuente, { hoy: HOY });
    assert.equal(r1.nuevos.length, 2, 'Kapanga y la obra (Festival Bandera ya pasó)');
    assert.equal(r1.omitidos, 1, 'Turf ya estaba cargado a mano');
    const kapanga = r1.nuevos.find((a) => a.includes('kapanga'));
    const texto = readFileSync(join(dir, kapanga), 'utf8');
    assert.match(texto, /^hora: '21:30'$/m, 'la hora va entre comillas');
    const datos = parse(texto);
    assert.deepEqual([datos.estado, datos.tipo, datos.bandas], ['pendiente', 'show', ['kapanga']]);
    assert.equal(datos.titulo, 'KAPANGA & invitados - Gira 2026');

    // Segunda corrida igual: no cambia nada.
    const r2 = mezclar(dir, eventos, fuente, { hoy: HOY });
    assert.deepEqual([r2.nuevos.length, r2.actualizados.length, r2.sinCambios], [0, 0, 2]);

    // La ticketera cambia la hora: se actualiza y mantiene el estado.
    writeFileSync(join(dir, kapanga), stringify({ ...datos, estado: 'publicado' }));
    const cambiados = eventos.map((e) => (e.bandas.includes('kapanga') ? { ...e, hora: '22:00' } : e));
    const r3 = mezclar(dir, cambiados, fuente, { hoy: HOY });
    assert.deepEqual(r3.actualizados, [kapanga]);
    const actualizado = parse(readFileSync(join(dir, kapanga), 'utf8'));
    assert.deepEqual([actualizado.hora, actualizado.estado], ['22:00', 'publicado']);

    // Le agregás una banda a mano: el recolector ya no lo toca aunque la ticketera cambie.
    writeFileSync(join(dir, kapanga), stringify({ ...actualizado, bandas: ['kapanga', 'turf'] }));
    const r4 = mezclar(dir, eventos, fuente, { hoy: HOY });
    assert.equal(r4.actualizados.length, 0);
    assert.deepEqual(parse(readFileSync(join(dir, kapanga), 'utf8')).bandas, ['kapanga', 'turf']);

    assert.equal(readdirSync(dir).length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('crea las bandas que faltan, una sola vez y solo si se guarda la fecha', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenda-'));
  const dirBandas = mkdtempSync(join(tmpdir(), 'bandas-'));
  try {
    const f = { ...fuente, filtro: 'todos' };
    const lista = [...bandas];
    const clasificados = [
      evento('LOS PIOJOS + Los Gardelitos - Gira 2026', { fecha: '2026-11-01', id: '1' }),
      evento('Los Piojos - segunda fecha', { fecha: '2026-11-02', id: '2' }),
      evento('Los Pericos - ya pasó', { fecha: '2026-10-01', id: '3' }),
    ].map((e) => {
      const c = clasificar(e, lista, f);
      for (const b of c.bandasNuevas) if (!lista.some((x) => x.slug === b.slug)) lista.push(b);
      return c;
    });
    assert.deepEqual(clasificados.map((c) => c.bandas), [['los-piojos', 'los-gardelitos'], ['los-piojos'], ['los-pericos']]);

    const r = mezclar(dir, clasificados, f, { hoy: HOY, dirBandas });
    assert.deepEqual(r.bandasNuevas.map((b) => b.nombre), ['Los Piojos', 'Los Gardelitos'], 'Los Pericos no: su fecha ya pasó');
    assert.deepEqual(readdirSync(dirBandas).sort(), ['los-gardelitos.yaml', 'los-piojos.yaml']);
    assert.deepEqual(parse(readFileSync(join(dirBandas, 'los-piojos.yaml'), 'utf8')), { nombre: 'Los Piojos', automatica: true });
    assert.deepEqual(parse(readFileSync(join(dir, r.nuevos[0]), 'utf8')).bandas, ['los-piojos', 'los-gardelitos']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(dirBandas, { recursive: true, force: true });
  }
});

test('adaptador de Entrada Play: lee su JSON y arma fecha, lugar, link y bandas', () => {
  const ad = adaptadorPara('https://entradaplay.com');
  assert.equal(ad.urlDeDatos('https://entradaplay.com'), 'https://entradaplay.com/obtener_eventos/?cantidad_eventos=200');
  const cuerpo = readFileSync(new URL('./fixtures/entradaplay.json', import.meta.url), 'utf8');
  const f = { ...fuente, url: 'https://entradaplay.com', provincia: 'Santa Fe', filtro: 'todos' };
  const ev = ad
    .extraer(cuerpo, ad.urlDeDatos(f.url))
    .map((c) => normalizar(c, f))
    .filter(Boolean)
    .map((e) => clasificar(e, bandas, f));

  assert.equal(ev.length, 2, 'el evento sin fecha se descarta');
  assert.deepEqual(
    [ev[0].fecha, ev[0].hora, ev[0].venue, ev[0].ciudad, ev[0].provincia, ev[0].entradas, ev[0].bandas],
    ['2026-11-07', '21:00', 'Teatro de Prueba', 'Rosario', 'Santa Fe', 'https://entradaplay.com/LOS-PIOJOS/', ['los-piojos']],
  );
  assert.deepEqual(
    [ev[1].fecha, ev[1].hora, ev[1].ciudad, ev[1].entradas, ev[1].bandas],
    ['2026-11-15', '', 'Santa Fe', 'https://otra-ticketera.ejemplo/evento', ['banda-invitada', 'otro-artista']],
  );
  assert.equal(adaptadorPara('https://otra.ejemplo/x').extraer, extraer, 'el resto usa JSON-LD');
});

test('Entrada Play: precio e imagen del listado; descripción, aviso y dirección de la página del evento', () => {
  const ad = adaptadorPara('https://entradaplay.com');
  const lista = ad.extraer(readFileSync(new URL('./fixtures/entradaplay.json', import.meta.url), 'utf8'), 'https://entradaplay.com/obtener_eventos/');
  assert.equal(lista[0].imagen, 'https://entradaplay.com/media/eventos/banda.jpg');
  assert.equal(lista[0].precioDesde, 25000);

  const html = readFileSync(new URL('./fixtures/entradaplay-evento.html', import.meta.url), 'utf8');
  const extra = ad.detalle(lista[0], html);
  assert.deepEqual(extra, {
    direccion: 'Calle Falsa 123',
    descripcion: 'La banda vuelve a Rosario con un show único.\n\nApertura de puertas: 20 hs.\n\nInvitados especiales.',
    aviso: 'EVENTO APTO +18 AÑOS',
  });
  const ev = normalizar(completar(lista[0], extra), { url: 'https://entradaplay.com', provincia: 'Santa Fe' });
  assert.deepEqual(
    [ev.direccion, ev.precioDesde, ev.imagen, ev.aviso],
    ['Calle Falsa 123', 25000, 'https://entradaplay.com/media/eventos/banda.jpg', 'EVENTO APTO +18 AÑOS'],
  );
});

test('JSON-LD genérico: precio más bajo de las ofertas y descripción', () => {
  const [ev] = extraer(`<script type="application/ld+json">{"@type":"MusicEvent","name":"X","startDate":"2026-11-01",
    "description":"Show acústico","offers":[{"price":"20000"},{"price":"15000.50"},{"lowPrice":"18000"}]}</script>`);
  assert.deepEqual([ev.precioDesde, ev.descripcion], [15001, 'Show acústico']);
});

test('mezclar: si esta vez no se leyó la página del evento, conserva la descripción guardada', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenda-'));
  try {
    const base = evento('Turf', { bandas: ['turf'], tipo: 'show', precioDesde: 20000, imagen: 'https://t/img.jpg' });
    mezclar(dir, [{ ...base, descripcion: 'Texto largo', aviso: '+18', direccion: 'Calle 1', detalle: '2026-10-25' }], fuente, { hoy: HOY });
    const [archivo] = readdirSync(dir);
    // Corrida siguiente: cambia el precio y no se leyó la página (no hay descripción en el evento).
    const r = mezclar(dir, [{ ...base, precioDesde: 25000 }], fuente, { hoy: HOY });
    assert.deepEqual(r.actualizados, [archivo]);
    const d = parse(readFileSync(join(dir, archivo), 'utf8'));
    assert.deepEqual([d.precioDesde, d.descripcion, d.aviso, d.direccion, d.origen.detalle], [25000, 'Texto largo', '+18', 'Calle 1', '2026-10-25']);
    // Y una tercera corrida igual no cambia nada.
    assert.equal(mezclar(dir, [{ ...base, precioDesde: 25000 }], fuente, { hoy: HOY }).actualizados.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('robots.txt: respeta Disallow y la regla más específica', () => {
  const reglas = parsearRobots('User-agent: *\nDisallow: /checkout\nDisallow: /eventos/\nAllow: /eventos/rock\n', 'DelRockBot/1.0');
  assert.equal(rutaPermitida(reglas, '/eventos/rock/kapanga'), true);
  assert.equal(rutaPermitida(reglas, '/eventos/teatro'), false);
  assert.equal(rutaPermitida(reglas, '/checkout/1'), false);
  assert.equal(rutaPermitida(reglas, '/'), true);
  assert.equal(rutaPermitida(parsearRobots('User-agent: *\nDisallow: /\n', 'x'), '/lo-que-sea'), false);
});
