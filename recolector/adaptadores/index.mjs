import * as jsonld from './jsonld.mjs';

// Adaptadores específicos por dominio, para ticketeras que no publican JSON-LD.
// Cada uno exporta extraer(html, url) y devuelve eventos con la misma forma que jsonld.mjs.
const PORSITIO = {
  // 'www.ejemplo.com.ar': ejemplo,
};

export function adaptadorPara(url) {
  const host = new URL(url).hostname;
  return PORSITIO[host] ?? jsonld;
}
