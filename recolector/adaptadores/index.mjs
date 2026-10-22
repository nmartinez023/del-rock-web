import * as jsonld from './jsonld.mjs';
import * as entradaplay from './entradaplay.mjs';
import * as damemiticket from './damemiticket.mjs';
import * as turboentrada from './turboentrada.mjs';

// Adaptadores específicos por dominio, para ticketeras que no publican JSON-LD.
// Cada uno exporta extraer(cuerpo, url) y devuelve eventos con la misma forma que jsonld.mjs.
// Opcionalmente exporta urlDeDatos(url), si los eventos se leen de otra dirección (por ejemplo, una API),
// y descargar(url, { agente }), si esa dirección no se lee con un GET común.
const PORSITIO = {
  'entradaplay.com': entradaplay,
  'www.entradaplay.com': entradaplay,
  'damemiticket.com': damemiticket,
  'www.damemiticket.com': damemiticket,
  'turboentrada.com': turboentrada,
  'www.turboentrada.com': turboentrada,
};

export function adaptadorPara(url) {
  const host = new URL(url).hostname;
  return PORSITIO[host] ?? jsonld;
}
