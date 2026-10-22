import { config, collection, fields } from '@keystatic/core';

const PROVINCIAS = [
  'CABA',
  'Buenos Aires',
  'Córdoba',
  'Santa Fe',
  'Mendoza',
  'Tucumán',
  'Neuquén',
  'Otra',
] as const;

export default config({
  // El contenido vive en GitHub: cada "Save" del panel es un commit en main.
  storage: { kind: 'github', repo: 'nmartinez023/del-rock-web' },
  ui: {
    brand: { name: 'Del Rock Arg' },
  },
  collections: {
    noticias: collection({
      label: 'Noticias',
      slugField: 'titulo',
      path: 'src/content/noticias/*',
      format: { contentField: 'contenido' },
      entryLayout: 'content',
      columns: ['titulo', 'fecha'],
      schema: {
        titulo: fields.slug({ name: { label: 'Título' } }),
        destacado: fields.text({
          label: 'Palabra destacada',
          description: 'Parte del título que va en azul. Tiene que estar escrita igual que en el título.',
        }),
        bajada: fields.text({ label: 'Bajada', multiline: true }),
        fecha: fields.date({ label: 'Fecha', defaultValue: { kind: 'today' }, validation: { isRequired: true } }),
        tipo: fields.select({
          label: 'Tipo',
          options: [
            { label: 'Noticia', value: 'noticia' },
            { label: 'Cobertura', value: 'cobertura' },
            { label: 'Lanzamiento', value: 'lanzamiento' },
            { label: 'Aniversario', value: 'aniversario' },
          ],
          defaultValue: 'noticia',
        }),
        banda: fields.relationship({ label: 'Banda', collection: 'bandas' }),
        portada: fields.image({
          label: 'Foto de portada',
          directory: 'src/assets/noticias',
          publicPath: '../../assets/noticias/',
          validation: { isRequired: true },
        }),
        portadaAlt: fields.text({ label: 'Descripción de la portada (accesibilidad)' }),
        galeria: fields.array(
          fields.object({
            imagen: fields.image({
              label: 'Foto',
              directory: 'src/assets/noticias',
              publicPath: '../../assets/noticias/',
              validation: { isRequired: true },
            }),
            epigrafe: fields.text({ label: 'Epígrafe' }),
          }),
          { label: 'Galería', itemLabel: (p) => p.fields.epigrafe.value || 'Foto' },
        ),
        instagram: fields.url({ label: 'Link al post de Instagram (opcional, se embebe al final)' }),
        tags: fields.array(fields.text({ label: 'Tag' }), { label: 'Tags', itemLabel: (p) => p.value }),
        contenido: fields.markdoc({ label: 'Contenido' }),
      },
    }),

    bandas: collection({
      label: 'Bandas',
      slugField: 'nombre',
      path: 'src/content/bandas/*',
      format: { data: 'yaml' },
      schema: {
        nombre: fields.slug({ name: { label: 'Nombre' } }),
        foto: fields.image({
          label: 'Foto',
          directory: 'src/assets/bandas',
          publicPath: '../../assets/bandas/',
        }),
        descripcion: fields.text({ label: 'Descripción corta', multiline: true }),
        instagram: fields.url({ label: 'Instagram de la banda' }),
        spotify: fields.url({ label: 'Spotify' }),
      },
    }),

    agenda: collection({
      label: 'Agenda',
      slugField: 'titulo',
      path: 'src/content/agenda/*',
      format: { data: 'yaml' },
      columns: ['titulo', 'fecha'],
      schema: {
        titulo: fields.slug({
          name: { label: 'Título', description: 'Nombre de la banda o del festival' },
        }),
        banda: fields.relationship({ label: 'Banda (si es un show de una banda)', collection: 'bandas' }),
        fecha: fields.date({ label: 'Fecha', validation: { isRequired: true } }),
        hora: fields.text({ label: 'Hora', description: 'Ej: 21:00' }),
        venue: fields.text({ label: 'Lugar', validation: { length: { min: 1 } } }),
        ciudad: fields.text({ label: 'Ciudad', validation: { length: { min: 1 } } }),
        provincia: fields.select({
          label: 'Provincia',
          options: PROVINCIAS.map((p) => ({ label: p, value: p })),
          defaultValue: 'CABA',
        }),
        entradas: fields.url({ label: 'Link de entradas' }),
        flyer: fields.image({
          label: 'Flyer',
          directory: 'src/assets/agenda',
          publicPath: '../../assets/agenda/',
        }),
      },
    }),
  },
});
