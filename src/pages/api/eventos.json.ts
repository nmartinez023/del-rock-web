// Todos los eventos próximos, de rock nacional y del resto de Rosario, para otras apps.
// Se genera en cada build (4 veces por día con el recolector, más el rebuild diario).
// Uso: GET /api/eventos.json  →  { generado, eventos: [...] }
// Cada evento trae `rockNacional` y `estado` ("publicado" | "pendiente"); los descartados no salen.
import type { APIRoute } from 'astro';
import { getCollection, getEntry } from 'astro:content';
import { legible, rutaDeFecha } from '../../lib/util';

export const GET: APIRoute = async ({ site }) => {
  const hoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const vigente = (f: { data: { estado: string; fecha: Date } }) => f.data.estado !== 'descartado' && f.data.fecha >= hoy;

  const rock = await Promise.all(
    (await getCollection('agenda', vigente)).map(async (f) => ({
      ...comunes(f.data),
      id: `agenda/${f.id}`,
      rockNacional: true,
      artistas: (await Promise.all(f.data.bandas.map((b) => getEntry('bandas', b)))).filter(Boolean).map((b) => b!.data.nombre),
      // Página en Del Rock (solo existe para los publicados).
      url: f.data.estado === 'publicado' ? new URL(await rutaDeFecha(f), site).toString() : null,
    })),
  );
  const otros = (await getCollection('otros', vigente)).map((f) => ({
    ...comunes(f.data),
    id: `otros/${f.id}`,
    rockNacional: false,
    artistas: f.data.artistas,
    url: null,
  }));

  const eventos = [...rock, ...otros].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  return new Response(JSON.stringify({ generado: new Date().toISOString(), cantidad: eventos.length, eventos }, null, 1), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  });
};

function comunes(d: {
  titulo: string; estado: string; tipo: string; genero?: string; fecha: Date; hora?: string; venue: string; direccion?: string;
  ciudad: string; provincia: string; entradas?: string | null; precioDesde?: number | null; imagen?: string | null;
  aviso?: string; descripcion?: string; origen?: { fuente?: string };
}) {
  return {
    titulo: legible(d.titulo),
    estado: d.estado,
    tipo: d.tipo,
    genero: d.genero ?? '',
    fecha: d.fecha.toISOString().slice(0, 10),
    hora: d.hora ?? '',
    lugar: d.venue,
    direccion: d.direccion ?? '',
    ciudad: d.ciudad,
    provincia: d.provincia,
    entradas: d.entradas ?? null,
    precioDesde: d.precioDesde ?? null,
    imagen: d.imagen ?? null,
    aviso: d.aviso ?? '',
    descripcion: d.descripcion ?? '',
    fuente: d.origen?.fuente ?? null,
  };
}
