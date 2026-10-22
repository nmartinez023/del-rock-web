import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, stringify } from 'yaml';
import { extraer } from '../adaptadores/jsonld.mjs';
import { adaptadorPara } from '../adaptadores/index.mjs';
import { normalizar, fechaHora, provinciaDe } from '../normalizar.mjs';
import { clasificar, nombreDeBanda } from '../clasificar.mjs';
import { mezclar } from '../agenda.mjs';
import { parsearRobots, rutaPermitida } from '../robots.mjs';

const html = readFileSync(new URL('./fixtures/ticketera.html', import.meta.url), 'utf8');
const fuente = { slug: 'prueba', url: 'https://tickets.ejemplo/listado', provincia: 'CABA', filtro: 'bandas' };
const bandas = [
  { slug: 'kapanga', nombre: 'Kapanga' },
  { slug: 'turf', nombre: 'Turf' },
  { slug: 'ntvg', nombre: 'No Te Va Gustar' },
];
const HOY = '2026-10-25'; // el Festival Bandera (24/10) ya pasó

const procesar = (f = fuente) =>
  extraer(html)
    .map((c) => normalizar(c, f))
    .filter(Boolean)
    .map((e) => clasificar(e, bandas, f))
    .filter(Boolean);

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
});

test('con filtro "bandas" deja solo las bandas cargadas y descarta cancelados', () => {
  const ev = procesar();
  assert.deepEqual(
    ev.map((e) => [e.banda, e.fecha, e.provincia, e.venue]),
    [
      ['kapanga', '2026-11-14', 'CABA', 'Teatro Flores'],
      ['turf', '2026-12-05', 'Santa Fe', 'Distrito Rock'],
    ],
  );
});

test('con filtro "todos" también entran los que no tienen banda', () => {
  const ev = procesar({ ...fuente, filtro: 'todos' });
  assert.equal(ev.length, 4);
  assert.equal(ev.find((e) => e.titulo === 'Obra de teatro infantil').provincia, 'Buenos Aires');
});

test('mezclar: crea pendientes, actualiza los no editados y respeta los editados a mano', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenda-'));
  try {
    // Una fecha cargada a mano del mismo show de Turf: no se duplica.
    writeFileSync(
      join(dir, 'turf-manual.yaml'),
      stringify({ titulo: 'Turf', estado: 'publicado', banda: 'turf', fecha: '2026-12-05', hora: '21:30', venue: 'Distrito Rock', ciudad: 'Rosario', provincia: 'Santa Fe' }),
    );
    const eventos = procesar({ ...fuente, filtro: 'todos' });

    const r1 = mezclar(dir, eventos, fuente, { hoy: HOY });
    assert.equal(r1.nuevos.length, 2, 'Kapanga y la obra (Festival Bandera ya pasó)');
    assert.equal(r1.omitidos, 1, 'Turf ya estaba cargado a mano');
    const kapanga = r1.nuevos.find((a) => a.includes('kapanga'));
    const datos = parse(readFileSync(join(dir, kapanga), 'utf8'));
    assert.equal(datos.estado, 'pendiente');
    assert.equal(datos.titulo, 'KAPANGA & invitados - Gira 2026');
    assert.equal(datos.entradas, 'https://tickets.ejemplo/kapanga-flores');

    // Segunda corrida igual: no cambia nada.
    const r2 = mezclar(dir, eventos, fuente, { hoy: HOY });
    assert.deepEqual([r2.nuevos.length, r2.actualizados.length, r2.sinCambios], [0, 0, 2]);

    // La ticketera cambia la hora: se actualiza y mantiene el estado.
    writeFileSync(join(dir, kapanga), stringify({ ...datos, estado: 'publicado' }));
    const cambiados = eventos.map((e) => (e.banda === 'kapanga' ? { ...e, hora: '22:00' } : e));
    const r3 = mezclar(dir, cambiados, fuente, { hoy: HOY });
    assert.deepEqual(r3.actualizados, [kapanga]);
    const actualizado = parse(readFileSync(join(dir, kapanga), 'utf8'));
    assert.deepEqual([actualizado.hora, actualizado.estado], ['22:00', 'publicado']);

    // Lo editás a mano: el recolector ya no lo toca aunque la ticketera cambie.
    writeFileSync(join(dir, kapanga), stringify({ ...actualizado, titulo: 'Kapanga' }));
    const r4 = mezclar(dir, eventos, fuente, { hoy: HOY });
    assert.equal(r4.actualizados.length, 0);
    assert.equal(parse(readFileSync(join(dir, kapanga), 'utf8')).titulo, 'Kapanga');

    assert.equal(readdirSync(dir).length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('nombreDeBanda: limpia el título y no inventa bandas para festivales u obras', () => {
  const n = (titulo, artistas = []) => nombreDeBanda({ titulo, artistas });
  assert.equal(n('LOS PIOJOS - Gira 2026'), 'Los Piojos');
  assert.equal(n('Ciro y los Persas en el Estadio Único'), 'Ciro y los Persas');
  assert.equal(n('El Mató a un Policía Motorizado + invitados'), 'El Mató a un Policía Motorizado');
  assert.equal(n('Cualquier título largo', ['Los Espíritus']), 'Los Espíritus');
  assert.equal(n('Pez (presentación nuevo disco)'), 'Pez');
  assert.equal(n('SILVESTRE Y LA NARANJA'), 'Silvestre y la Naranja');
  assert.equal(n('DIRTY SOUND CLUB x CCG'), 'Dirty Sound Club');
  assert.equal(n('CARAS EXTRAÑAS DESPIDE EL AÑO'), 'Caras Extrañas');
  assert.equal(n('Festival Bandera'), null);
  assert.equal(n('Obra de teatro infantil'), null);
});

test('con filtro "todos" crea la banda que falta, una sola vez y solo si se guarda la fecha', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenda-'));
  const dirBandas = mkdtempSync(join(tmpdir(), 'bandas-'));
  try {
    const f = { ...fuente, filtro: 'todos' };
    const eventos = [
      { titulo: 'LOS PIOJOS - Gira 2026', fecha: '2026-11-01', hora: '21:00', venue: 'River', ciudad: 'Buenos Aires', provincia: 'CABA', entradas: 'https://t/1', artistas: [], id: '1' },
      { titulo: 'Los Piojos - segunda fecha', fecha: '2026-11-02', hora: '21:00', venue: 'River', ciudad: 'Buenos Aires', provincia: 'CABA', entradas: 'https://t/2', artistas: [], id: '2' },
      { titulo: 'Los Pericos - ya pasó', fecha: '2026-10-01', hora: '', venue: 'Club', ciudad: 'Buenos Aires', provincia: 'CABA', entradas: 'https://t/3', artistas: [], id: '3' },
    ];
    const lista = [...bandas];
    const clasificados = [];
    for (const e of eventos) {
      const c = clasificar(e, lista, f);
      clasificados.push(c);
      if (c.bandaNueva && !lista.some((b) => b.slug === c.bandaNueva.slug)) lista.push(c.bandaNueva);
    }
    assert.deepEqual(clasificados.map((c) => c.banda), ['los-piojos', 'los-piojos', 'los-pericos']);

    const r = mezclar(dir, clasificados, f, { hoy: HOY, dirBandas });
    assert.deepEqual(r.bandasNuevas.map((b) => b.nombre), ['Los Piojos'], 'Los Pericos no: su fecha ya pasó');
    assert.deepEqual(readdirSync(dirBandas), ['los-piojos.yaml']);
    assert.deepEqual(parse(readFileSync(join(dirBandas, 'los-piojos.yaml'), 'utf8')), { nombre: 'Los Piojos', automatica: true });
    assert.equal(parse(readFileSync(join(dir, r.nuevos[0]), 'utf8')).banda, 'los-piojos');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(dirBandas, { recursive: true, force: true });
  }
});

test('adaptador de Entrada Play: lee su JSON y arma fecha, lugar y link', () => {
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
    [ev[0].fecha, ev[0].hora, ev[0].venue, ev[0].ciudad, ev[0].provincia, ev[0].entradas, ev[0].bandaNueva.nombre],
    ['2026-11-07', '21:00', 'Teatro de Prueba', 'Rosario', 'Santa Fe', 'https://entradaplay.com/LOS-PIOJOS/', 'Los Piojos'],
  );
  assert.deepEqual(
    [ev[1].fecha, ev[1].hora, ev[1].ciudad, ev[1].entradas, ev[1].bandaNueva.nombre],
    ['2026-11-15', '', 'Santa Fe', 'https://otra-ticketera.ejemplo/evento', 'Banda Invitada'],
  );
  assert.equal(adaptadorPara('https://otra.ejemplo/x').extraer, extraer, 'el resto usa JSON-LD');
});

test('robots.txt: respeta Disallow y la regla más específica', () => {
  const reglas = parsearRobots('User-agent: *\nDisallow: /checkout\nDisallow: /eventos/\nAllow: /eventos/rock\n', 'DelRockBot/1.0');
  assert.equal(rutaPermitida(reglas, '/eventos/rock/kapanga'), true);
  assert.equal(rutaPermitida(reglas, '/eventos/teatro'), false);
  assert.equal(rutaPermitida(reglas, '/checkout/1'), false);
  assert.equal(rutaPermitida(reglas, '/'), true);
  assert.equal(rutaPermitida(parsearRobots('User-agent: *\nDisallow: /\n', 'x'), '/lo-que-sea'), false);
});
