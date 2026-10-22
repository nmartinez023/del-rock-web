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
    }),
});

const agenda = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/agenda' }),
  schema: ({ image }) =>
    z.object({
      titulo: z.string(),
      banda: reference('bandas').nullable().optional(),
      fecha: z.coerce.date(),
      hora: z.string().optional(),
      venue: z.string(),
      ciudad: z.string(),
      provincia: z.string().default('CABA'),
      entradas: z.string().url().nullable().optional(),
      flyer: image().nullable().optional(),
    }),
});

export const collections = { noticias, bandas, agenda };
