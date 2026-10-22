import * as jsonld from './jsonld.mjs';
import * as entradaplay from './entradaplay.mjs';

// Adaptadores específicos por dominio, para ticketeras que no publican JSON-LD.
// Cada uno exporta extraer(cuerpo, url) y devuelve eventos con la misma forma que jsonld.mjs.
// Opcionalmente exporta urlDeDatos(url), si los eventos se leen de otra dirección (por ejemplo, una API).
const PORSITIO = {
  'entradaplay.com': entradaplay,
  'www.entradaplay.com': entradaplay,
};

export function adaptadorPara(url) {
  const host = new URL(url).hostname;
  return PORSITIO[host] ?? jsonld;
}
