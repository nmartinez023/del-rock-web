import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, stringify } from 'yaml';
import { extraer } from '../adaptadores/jsonld.mjs';
import { normalizar, fechaHora, provinciaDe } from '../normalizar.mjs';
import { clasificar } from '../clasificar.mjs';
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

test('robots.txt: respeta Disallow y la regla más específica', () => {
  const reglas = parsearRobots('User-agent: *\nDisallow: /checkout\nDisallow: /eventos/\nAllow: /eventos/rock\n', 'DelRockBot/1.0');
  assert.equal(rutaPermitida(reglas, '/eventos/rock/kapanga'), true);
  assert.equal(rutaPermitida(reglas, '/eventos/teatro'), false);
  assert.equal(rutaPermitida(reglas, '/checkout/1'), false);
  assert.equal(rutaPermitida(reglas, '/'), true);
  assert.equal(rutaPermitida(parsearRobots('User-agent: *\nDisallow: /\n', 'x'), '/lo-que-sea'), false);
});
