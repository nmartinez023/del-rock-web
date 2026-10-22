import * as jsonld from './jsonld.mjs';
import * as entradaplay from './entradaplay.mjs';
import * as damemiticket from './damemiticket.mjs';
import * as turboentrada from './turboentrada.mjs';
import * as ticketek from './ticketek.mjs';
import * as allaccess from './allaccess.mjs';
import * as tuentrada from './tuentrada.mjs';
import * as movistararena from './movistararena.mjs';
import * as passline from './passline.mjs';

// Adaptadores específicos por dominio, para ticketeras que no publican JSON-LD.
// Cada uno exporta extraer(cuerpo, url) y devuelve eventos con la misma forma que jsonld.mjs.
// Opcionalmente exporta urlDeDatos(url), si los eventos se leen de otra dirección (por ejemplo, una API),
// y descargar(url, { agente }), si esa dirección no se lee con un GET común.
// Si exporta importado (una ruta del repo), los datos no se piden: los trae una persona desde
// /admin/ticketeras (ticketeras que bloquean bots) y el recolector lee ese archivo.
const PORSITIO = {
  'entradaplay.com': entradaplay,
  'www.entradaplay.com': entradaplay,
  'damemiticket.com': damemiticket,
  'www.damemiticket.com': damemiticket,
  'turboentrada.com': turboentrada,
  'www.turboentrada.com': turboentrada,
  'ticketek.com.ar': ticketek,
  'www.ticketek.com.ar': ticketek,
  'allaccess.com.ar': allaccess,
  'www.allaccess.com.ar': allaccess,
  'tuentrada.com': tuentrada,
  'www.tuentrada.com': tuentrada,
  'movistararena.com.ar': movistararena,
  'www.movistararena.com.ar': movistararena,
  'passline.com': passline,
  'www.passline.com': passline,
  'home.passline.com': passline,
};

export function adaptadorPara(url) {
  const host = new URL(url).hostname;
  return PORSITIO[host] ?? jsonld;
}
