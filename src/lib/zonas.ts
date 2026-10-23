// Zonas del filtro de la agenda: agrupa las localidades en algo que la gente reconoce. Las grandes
// ciudades suman su área metropolitana y el resto queda por provincia: CABA, el conurbano y el interior
// bonaerense son "Buenos Aires". Las claves son slugs de localidad (slugTag: sin tildes, en minúscula, con guiones).
import { slugTag } from './util';

/** Grandes ciudades con su área metropolitana: provincia y localidades. */
const METROPOLIS: Record<string, [string, string]> = {
  'La Plata': ['Buenos Aires', 'la-plata berisso ensenada city-bell gonnet manuel-b-gonnet villa-elisa los-hornos tolosa'],
  'Mar del Plata': ['Buenos Aires', 'mar-del-plata batan'],
  Rosario: ['Santa Fe', 'rosario san-lorenzo funes villa-gobernador-galvez granadero-baigorria capitan-bermudez fray-luis-beltran perez roldan'],
  'Santa Fe': ['Santa Fe', 'santa-fe ciudad-de-santa-fe santo-tome'],
  Córdoba: ['Córdoba', 'cordoba mendiolaza villa-allende unquillo rio-ceballos saldan malagueno'],
  Mendoza: ['Mendoza', 'mendoza maipu godoy-cruz guaymallen las-heras lujan-de-cuyo'],
  Tucumán: ['Tucumán', 'san-miguel-de-tucuman tucuman yerba-buena tafi-viejo banda-del-rio-sali'],
  // Cipolletti es de Río Negro, pero está pegada a Neuquén capital.
  Neuquén: ['Neuquén', 'neuquen plottier centenario cipolletti'],
};

/** Localidades que llegan con provincia "Otra": a qué provincia pertenecen. */
const PROVINCIA_DE: Record<string, string> = {
  'general-roca': 'Río Negro', 'san-carlos-de-bariloche': 'Río Negro', bariloche: 'Río Negro', viedma: 'Río Negro',
  'comodoro-rivadavia': 'Chubut', trelew: 'Chubut', 'puerto-madryn': 'Chubut', rawson: 'Chubut',
  'concepcion-del-uruguay': 'Entre Ríos', parana: 'Entre Ríos', gualeguaychu: 'Entre Ríos', concordia: 'Entre Ríos',
  'juana-koslay': 'San Luis', 'villa-mercedes': 'San Luis', 'san-luis': 'San Luis',
  'la-rioja': 'La Rioja',
  'san-fdo-del-valle-de-catamarca': 'Catamarca', 'san-fernando-del-valle-de-catamarca': 'Catamarca', catamarca: 'Catamarca',
  'san-salvador-de-jujuy': 'Jujuy', jujuy: 'Jujuy',
  'santiago-del-estero': 'Santiago del Estero', 'la-banda': 'Santiago del Estero',
  'villa-aberastain': 'San Juan', 'san-juan': 'San Juan', rivadavia: 'San Juan',
  salta: 'Salta', corrientes: 'Corrientes', resistencia: 'Chaco', posadas: 'Misiones', formosa: 'Formosa',
  'santa-rosa': 'La Pampa', 'rio-gallegos': 'Santa Cruz', ushuaia: 'Tierra del Fuego', 'rio-grande': 'Tierra del Fuego',
};

const lista = (texto: string) => texto.trim().split(/\s+/);
const METRO_DE = new Map(Object.entries(METROPOLIS).flatMap(([zona, [prov, ls]]) => lista(ls).map((l) => [`${prov}|${l}`, zona] as const)));
// En estas provincias el interior se ve aparte de la capital ("Interior de Córdoba"). En el resto
// queda con el nombre de la provincia: en Santa Fe y Mendoza eso lo suma a la zona de la capital.
const CON_METROPOLI = new Set(['Córdoba', 'Tucumán', 'Neuquén']);

export const ZONA_BA = 'Buenos Aires';

/** Nombre de la zona de una fecha (ciudad y provincia, como están en la agenda). */
export function zonaDe(ciudad: string | undefined, provincia: string | undefined): string {
  const loc = slugTag(ciudad ?? '');
  let prov = provincia?.trim() || 'Otra';
  if (prov === 'Otra') prov = loc === 'cipolletti' ? 'Neuquén' : (PROVINCIA_DE[loc] ?? 'Otra');
  if (prov === 'CABA') return ZONA_BA;
  // La provincia va en la clave: San Martín, Las Heras o Rivadavia existen en varias.
  const metro = METRO_DE.get(`${prov}|${loc}`);
  if (metro) return metro;
  if (prov === 'Otra') return 'Otras ciudades';
  if (prov === 'Buenos Aires') return ZONA_BA;
  return CON_METROPOLI.has(prov) ? `Interior de ${prov}` : prov;
}
