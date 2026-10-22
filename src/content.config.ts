import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Los esquemas reflejan keystatic.config.ts: Keystatic escribe los archivos,
// Astro los valida y los tipa.

const noticias = defineCollection({
  loader: glob({ pattern: '**/*.mdoc', base: './src/content/noticias' }),
  schema: ({ image }) =>
    z.object({
      titulo: z.string(),
      destacado: z.string().optional(),
      bajada: z.string().optional(),
      fecha: z.coerce.date(),
      tipo: z.enum(['noticia', 'cobertura', 'lanzamiento', 'aniversario']).default('noticia'),
      banda: reference('bandas').nullable().optional(),
      portada: image(),
      portadaAlt: z.string().optional(),
      galeria: z.array(z.object({ imagen: image(), epigrafe: z.string().optional() })).default([]),
      instagram: z.string().url().nullable().optional(),
      tags: z.array(z.string()).default([]),
    }),
});

const bandas = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/bandas' }),
  schema: ({ image }) =>
    z.object({
      nombre: z.string(),
      foto: image().nullable().optional(),
      descripcion: z.string().optional(),
      instagram: z.string().url().nullable().optional(),
      spotify: z.string().url().nullable().optional(),
      automatica: z.boolean().default(false),
    }),
});

const agenda = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/agenda' }),
  schema: ({ image }) =>
    z.object({
      titulo: z.string(),
      estado: z.enum(['publicado', 'pendiente', 'descartado']).default('publicado'),
      tipo: z.enum(['show', 'festival']).default('show'),
      // Lista de slugs de bandas. No se valida con reference(): si borrás una banda desde el panel,
      // las fechas que la nombraban siguen compilando y esa banda simplemente no se muestra.
      bandas: z.array(z.string()).default([]),
      fecha: z.coerce.date(),
      hora: z.string().optional(),
      venue: z.string(),
      direccion: z.string().optional(),
      ciudad: z.string(),
      provincia: z.string().default('CABA'),
      entradas: z.string().url().nullable().optional(),
      precioDesde: z.number().nullable().optional(),
      imagen: z.string().url().nullable().optional(),
      aviso: z.string().optional(),
      descripcion: z.string().optional(),
      flyer: image().nullable().optional(),
    }),
});

export const collections = { noticias, bandas, agenda };
