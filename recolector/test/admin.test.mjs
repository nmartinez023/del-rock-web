// Tests del panel /admin (src/lib/admin/github.ts): lectura de campos y edición de una sola línea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCampos, aplicarAccion } from '../../src/lib/admin/github.ts';

const yaml = [
  'titulo: CRUZANDO EL CHARCO',
  'estado: ⏳ Pendiente',
  'rockNacional: true',
  'tipo: show',
  'fecha: 2026-11-21',
  'hora: "21:00"',
  "venue: 'Teatro O''Higgins'",
  'descripcion: |-',
  '  Texto: con dos puntos',
  'origen:',
  '  fuente: entrada-play',
  '  id: "12345"',
  '',
].join('\n');

test('leerCampos: primer nivel, comillas y origen.fuente; ignora el texto de bloques', () => {
  const c = leerCampos(yaml);
  assert.deepEqual(
    [c.titulo, c.estado, c.rockNacional, c.fecha, c.hora, c.venue, c['origen.fuente'], c['origen.id'], c.Texto],
    ['CRUZANDO EL CHARCO', '⏳ Pendiente', 'true', '2026-11-21', '21:00', "Teatro O'Higgins", 'entrada-play', '12345', undefined],
  );
});

test('aplicarAccion: cambia solo la línea que corresponde', () => {
  const publicado = aplicarAccion(yaml, 'publicar', 'agenda');
  assert.equal(publicado, yaml.replace('estado: ⏳ Pendiente', 'estado: ✅ Publicado'));
  assert.equal(aplicarAccion(yaml, 'descartar', 'otros'), yaml.replace('estado: ⏳ Pendiente', 'estado: ❌ Descartado'));
  assert.equal(aplicarAccion(yaml, 'mover', 'agenda'), yaml.replace('rockNacional: true', 'rockNacional: false'));
  // Sin la línea, se agrega debajo del título.
  const sinEstado = 'titulo: X\nfecha: 2026-11-01\n';
  assert.equal(aplicarAccion(sinEstado, 'publicar', 'agenda'), 'titulo: X\nestado: ✅ Publicado\nfecha: 2026-11-01\n');
  assert.equal(aplicarAccion(sinEstado, 'mover', 'otros'), 'titulo: X\nrockNacional: true\nfecha: 2026-11-01\n');
});
