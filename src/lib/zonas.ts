// Zonas del filtro de la agenda: agrupa las localidades en algo que la gente reconoce. CABA y el
// conurbano son "Buenos Aires y GBA"; las grandes ciudades suman su área metropolitana; el resto
// queda por provincia. Las claves son slugs de localidad (slugTag: sin tildes, en minúscula, con guiones).
import { slugTag } from './util';

/** CABA + los 24 partidos del conurbano y la primera corona (Pilar, Escobar, Cañuelas…), por localidad. */
const GBA = `
buenos-aires caba capital-federal ciudad-autonoma-de-buenos-aires
adrogue almirante-brown burzaco glew longchamps rafael-calzada jose-marmol claypole ministro-rivadavia san-jose
avellaneda wilde sarandi dock-sud gerli pineyro villa-dominico
berazategui ranelagh hudson platanos sourigues
esteban-echeverria monte-grande luis-guillon el-jaguel nueve-de-abril 9-de-abril canning
ezeiza tristan-suarez
florencio-varela bosques
general-san-martin san-martin villa-ballester san-andres villa-maipu jose-leon-suarez billinghurst villa-lynch
hurlingham william-morris villa-tesei
ituzaingo villa-udaondo
jose-c-paz jose-clemente-paz
la-matanza san-justo ramos-mejia laferrere gregorio-de-laferrere isidro-casanova gonzalez-catan villa-luzuriaga lomas-del-mirador tapiales ciudad-evita villa-madero la-tablada virrey-del-pino rafael-castillo aldo-bonzi
lanus lanus-este lanus-oeste remedios-de-escalada valentin-alsina monte-chingolo
lomas-de-zamora banfield temperley turdera llavallol villa-fiorito ingeniero-budge
malvinas-argentinas los-polvorines grand-bourg tortuguitas pablo-nogues ingeniero-adolfo-sourdeaux villa-de-mayo
merlo padua san-antonio-de-padua libertad pontevedra
moreno paso-del-rey francisco-alvarez la-reja trujui
moron haedo el-palomar castelar villa-sarmiento
quilmes quilmes-oeste quilmes-este bernal bernal-oeste ezpeleta san-francisco-solano don-bosco
san-fernando victoria virreyes
san-isidro martinez acassuso beccar boulogne villa-adelina
san-miguel bella-vista muniz
tigre don-torcuato general-pacheco el-talar benavidez nordelta rincon-de-milberg troncos-del-talar ricardo-rojas
tres-de-febrero caseros ciudadela santos-lugares saenz-pena villa-bosch martin-coronado ciudad-jardin loma-hermosa pablo-podesta churruca villa-raffo
vicente-lopez olivos florida munro la-lucila villa-martelli carapachay
pilar del-viso presidente-derqui villa-rosa
escobar belen-de-escobar garin ingeniero-maschwitz maquinista-savio
general-rodriguez guernica presidente-peron san-vicente alejandro-korn canuelas marcos-paz
`;

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
const EN_GBA = new Set(lista(GBA));
const METRO_DE = new Map(Object.entries(METROPOLIS).flatMap(([zona, [prov, ls]]) => lista(ls).map((l) => [`${prov}|${l}`, zona] as const)));
const CON_METROPOLI = new Set(Object.values(METROPOLIS).map(([prov]) => prov));

export const ZONA_GBA = 'Buenos Aires y GBA';

/** Nombre de la zona de una fecha (ciudad y provincia, como están en la agenda). */
export function zonaDe(ciudad: string | undefined, provincia: string | undefined): string {
  const loc = slugTag(ciudad ?? '');
  let prov = provincia?.trim() || 'Otra';
  if (prov === 'Otra') prov = loc === 'cipolletti' ? 'Neuquén' : (PROVINCIA_DE[loc] ?? 'Otra');
  if (prov === 'CABA' || (prov === 'Buenos Aires' && EN_GBA.has(loc))) return ZONA_GBA;
  // La provincia va en la clave: San Martín, Las Heras o Rivadavia existen en varias.
  const metro = METRO_DE.get(`${prov}|${loc}`);
  if (metro) return metro;
  if (prov === 'Otra') return 'Otras ciudades';
  return CON_METROPOLI.has(prov) ? `Interior de ${prov}` : prov;
}
