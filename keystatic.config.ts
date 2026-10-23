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

// Mismo texto en recolector/agenda.mjs y src/content.config.ts.
const ESTADOS = ['✅ Publicado', '⏳ Pendiente', '❌ Descartado'];

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
        spotify: fields.url({ label: 'Spotify', description: 'Link al perfil del artista. Si lo cargás vos, la foto y los géneros se completan solos.' }),
        spotifyEstado: fields.select({
          label: 'Spotify: estado',
          description: 'Sugerido = lo encontró la búsqueda automática y todavía no se muestra en la web (aprobalo en /admin/bandas).',
          options: [
            { label: 'Aprobado (o cargado a mano)', value: 'aprobado' },
            { label: 'Sugerido, sin revisar', value: 'sugerido' },
            { label: 'Descartado: no es esta banda', value: 'descartado' },
          ],
          defaultValue: 'aprobado',
        }),
        fotoSpotify: fields.url({ label: 'Foto de Spotify', description: 'La completa la búsqueda. Si subís una foto arriba, se usa esa.' }),
        generos: fields.array(fields.text({ label: 'Género' }), { label: 'Géneros (de Spotify)', itemLabel: (p) => p.value }),
        spotifyBuscado: fields.text({ label: 'Última búsqueda en Spotify sin resultado', description: 'Se vuelve a buscar 30 días después.' }),
        automatica: fields.checkbox({
          label: 'Creada por el recolector',
          description:
            'Aparece en la web recién cuando tenga una fecha publicada o una nota. Destildala para mostrarla siempre.',
        }),
        rockConfirmado: fields.checkbox({
          label: 'Siempre es rock nacional',
          description:
            'Sus eventos entran a la Agenda aunque la IA diga otra cosa. Se tilda solo cuando pasás un evento a rock a mano. ' +
            'Las bandas que cargaste vos (no creadas por el recolector) ya cuentan como confirmadas.',
        }),
      },
    }),

    agenda: collection({
      label: 'Agenda (rock nacional)',
      slugField: 'titulo',
      path: 'src/content/agenda/*',
      format: { data: 'yaml' },
      columns: ['titulo', 'fecha', 'estado'],
      schema: camposEvento({ conBandas: true }),
    }),

    otros: collection({
      label: 'Otros eventos de Rosario',
      slugField: 'titulo',
      path: 'src/content/otros-eventos/*',
      format: { data: 'yaml' },
      columns: ['titulo', 'fecha', 'estado'],
      schema: camposEvento({ conBandas: false }),
    }),

    fuentes: collection({
      label: 'Fuentes de agenda',
      slugField: 'nombre',
      path: 'src/content/fuentes/*',
      format: { data: 'yaml' },
      columns: ['nombre', 'rosario', 'activa'],
      schema: {
        nombre: fields.slug({ name: { label: 'Nombre', description: 'Ej: "Niceto en Passline"' } }),
        url: fields.url({
          label: 'URL',
          description: 'Página de la ticketera, venue o productora con el listado de eventos.',
          validation: { isRequired: true },
        }),
        activa: fields.checkbox({ label: 'Activa', defaultValue: true }),
        rosario: fields.checkbox({
          label: 'Es de Rosario',
          description:
            'Tildado: se guardan todos sus eventos (los de rock nacional en Agenda, el resto en "Otros eventos de Rosario"). ' +
            'Sin tildar: solo se guardan los de rock nacional.',
          defaultValue: false,
        }),
        provincia: fields.select({
          label: 'Provincia por defecto',
          description: 'Se usa cuando la ticketera no dice dónde es.',
          options: PROVINCIAS.map((p) => ({ label: p, value: p })),
          defaultValue: 'CABA',
        }),
        notas: fields.text({ label: 'Notas', multiline: true }),
      },
    }),
  },
});

/**
 * Campos de un evento. Los de rock nacional (Agenda) llevan bandas de la colección Bandas;
 * los otros eventos de Rosario solo guardan los nombres de los artistas.
 */
function camposEvento({ conBandas }: { conBandas: boolean }) {
  return {
    titulo: fields.slug({
      name: { label: 'Título', description: 'Nombre de la banda o del festival' },
    }),
    // El emoji va dentro del valor porque el listado del panel muestra el valor tal cual.
    estado: fields.select({
      label: 'Estado',
      description: conBandas
        ? 'Solo los "Publicado" aparecen en la web. Los que trae el recolector entran como "Pendiente".'
        : 'Para la otra app que use estos eventos. No se muestran en Del Rock.',
      options: ESTADOS.map((e) => ({ label: e, value: e })),
      defaultValue: ESTADOS[0],
    }),
    rockNacional: fields.checkbox({
      label: 'Rock nacional',
      description: conBandas
        ? 'Lo decide la IA. Si lo destildás, el recolector lo pasa a "Otros eventos de Rosario" (o lo borra si la fuente no es de Rosario).'
        : 'Lo decide la IA. Si lo tildás, el recolector lo pasa a la Agenda de rock nacional.',
      defaultValue: conBandas,
    }),
    genero: fields.text({ label: 'Género', description: 'Lo pone la IA (ej: "punk rock", "cumbia pop").' }),
    tipo: fields.select({
      label: 'Tipo',
      options: [
        { label: 'Show', value: 'show' },
        { label: 'Festival', value: 'festival' },
      ],
      defaultValue: 'show',
    }),
    ...(conBandas
      ? {
          bandas: fields.multiRelationship({
            label: 'Bandas',
            description: 'Las que tocan. Un festival puede no tener ninguna o llevar su lineup.',
            collection: 'bandas',
          }),
        }
      : {
          artistas: fields.array(fields.text({ label: 'Artista' }), {
            label: 'Artistas',
            itemLabel: (p) => p.value,
          }),
        }),
    fecha: fields.date({ label: 'Fecha', validation: { isRequired: true } }),
    hora: fields.text({ label: 'Hora', description: 'Ej: 21:00' }),
    venue: fields.text({ label: 'Lugar', validation: { length: { min: 1 } } }),
    direccion: fields.text({ label: 'Dirección', description: 'Calle y número, para el link "Cómo llegar".' }),
    ciudad: fields.text({ label: 'Ciudad', validation: { length: { min: 1 } } }),
    provincia: fields.select({
      label: 'Provincia',
      options: PROVINCIAS.map((p) => ({ label: p, value: p })),
      defaultValue: 'CABA',
    }),
    entradas: fields.url({ label: 'Link de entradas' }),
    precioDesde: fields.integer({ label: 'Precio desde (en pesos)', description: 'Vacío si no se sabe; 0 si es gratis.' }),
    imagen: fields.url({
      label: 'Imagen (URL)',
      description: 'La trae el recolector desde la ticketera. La web la muestra a través de su propio servidor, sin guardarla en el repo.',
    }),
    aviso: fields.text({ label: 'Aviso', description: 'Ej: "Apto +18 años".' }),
    descripcion: fields.text({ label: 'Descripción', multiline: true }),
    flyer: fields.image({
      label: 'Flyer propio',
      description: 'Opcional. Si lo subís, se usa en lugar de la imagen de la ticketera.',
      directory: 'src/assets/agenda',
      publicPath: '../../assets/agenda/',
    }),
    origen: fields.object(
      {
        fuente: fields.text({ label: 'Fuente' }),
        id: fields.text({ label: 'ID en la ticketera' }),
        huella: fields.text({ label: 'Huella' }),
        detalle: fields.text({ label: 'Última lectura de la página del evento' }),
      },
      {
        label: 'Origen automático',
        description:
          'Lo completa el recolector. Si editás el evento a mano, el recolector deja de actualizarlo. No hace falta tocar estos campos.',
      },
    ),
  };
}
