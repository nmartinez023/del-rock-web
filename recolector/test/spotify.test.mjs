import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completar, fotoDe, idDeArtista, mismoNombre } from '../spotify.mjs';
import { aplicarSpotify } from '../../src/lib/admin/github.ts';

test('Spotify: id del link, nombre exacto y foto mediana', () => {
  assert.equal(idDeArtista('https://open.spotify.com/intl-es/artist/1ZBOAgEJMHUEuoiMEN2FJJ?si=abc'), '1ZBOAgEJMHUEuoiMEN2FJJ');
  assert.equal(idDeArtista('https://open.spotify.com/artist/1ZBOAgEJMHUEuoiMEN2FJJ'), '1ZBOAgEJMHUEuoiMEN2FJJ');
  assert.equal(idDeArtista('https://open.spotify.com/album/1ZBOAgEJMHUEuoiMEN2FJJ'), null);

  assert.ok(mismoNombre('Babasonicos', 'Babasónicos'));
  assert.ok(mismoNombre('Las Pastillas Del Abuelo', 'Las Pastillas del Abuelo'));
  assert.ok(!mismoNombre('Divididos Sin Suerte', 'Divididos'));

  const fotos = { images: [{ url: 'g', width: 640 }, { url: 'm', width: 320 }, { url: 'c', width: 160 }] };
  assert.equal(fotoDe(fotos), 'm');
  assert.equal(fotoDe({ images: [] }), null);
});

test('Spotify: completar la banda sin pisar lo cargado a mano', () => {
  const banda = { nombre: 'Divididos', descripcion: 'La aplanadora del rock', automatica: true, spotifyBuscado: '2026-09-01' };
  const artista = { id: 'x', external_urls: { spotify: 'https://open.spotify.com/artist/x' }, images: [{ url: 'm', width: 320 }], genres: ['rock argentino'] };
  assert.deepEqual(completar(banda, artista, 'sugerido'), {
    nombre: 'Divididos',
    descripcion: 'La aplanadora del rock',
    automatica: true,
    spotify: 'https://open.spotify.com/artist/x',
    spotifyEstado: 'sugerido',
    fotoSpotify: 'm',
    generos: ['rock argentino'],
  });
});

test('Admin: aprobar o descartar el Spotify sugerido de una banda', () => {
  const yaml = 'nombre: Divididos\nspotify: https://open.spotify.com/artist/x\nspotifyEstado: sugerido\nfotoSpotify: https://i.scdn.co/image/m\ngeneros:\n  - rock argentino\n  - hard rock\nautomatica: true\n';
  assert.equal(aplicarSpotify(yaml, 'aprobar'), yaml.replace('spotifyEstado: sugerido', 'spotifyEstado: aprobado'));
  assert.equal(aplicarSpotify(yaml, 'descartar'), 'nombre: Divididos\nspotifyEstado: descartado\nautomatica: true\n');
  // Si ya lo revisó otro, no se toca.
  const aprobado = yaml.replace('sugerido', 'aprobado');
  assert.equal(aplicarSpotify(aprobado, 'descartar'), aprobado);
});
