// Turbo Entrada (turboentrada.com), sobre la plataforma EntradaUno: app Vue sin eventos en el HTML.
// La cartelera sale de su API pública (GET /v2/Cartelera): espectáculos con sus funciones (fecha y lugar)
// y la lista de lugares. Cada función es un evento. Vende en Rosario y también en otras ciudades.
import { limpiar } from '../texto.mjs';
import { htmlATexto } from './entradaplay.mjs';

const API = 'https://api-ecommerce-live-turboentrada.entradauno.com/v1/api/v2/Cartelera';

export function urlDeDatos() {
  return API;
}

/** La descripción viene como HTML codificado para URL ("%3Cdiv%3E..."). */
function descripcion(cruda) {
  if (!cruda) return '';
  let html = cruda;
  try {
    html = decodeURIComponent(cruda);
  } catch {
    // ya venía decodificada
  }
  return htmlATexto(html);
}

export function extraer(cuerpo) {
  let cartelera;
  try {
    cartelera = JSON.parse(cuerpo)?.oData?.oCartelera;
  } catch {
    return [];
  }
  if (!cartelera) return [];
  const lugares = new Map((cartelera.listaEstablecimiento ?? []).map((l) => [l.idEstablecimiento, l]));

  return (cartelera.listaEspectaculoCartel ?? []).flatMap((esp) => {
    const funciones = esp.oFuncionLista?.length
      ? esp.oFuncionLista
      : esp.oFuncionMenor?.oFuncionFecha?.dFuncion
        ? [{ idFuncion: esp.oFuncionMenor.idFuncion, idEstablecimiento: esp.listaIdEstablecimiento?.[0], dFuncion: esp.oFuncionMenor.oFuncionFecha.dFuncion }]
        : [];
    return funciones.map((f) => {
      const lugar = lugares.get(f.idEstablecimiento) ?? {};
      return {
        nombre: limpiar(esp.cNombre ?? ''),
        inicio: String(f.dFuncion ?? '').slice(0, 16), // hora local, sin zona
        cancelado: false,
        lugar: limpiar(lugar.cNombre ?? ''),
        localidad: limpiar(lugar.cZona ?? ''),
        region: limpiar(lugar.cZona ?? ''),
        direccion: limpiar(String(lugar.cDomicilio ?? '').replace(/\s+-\s+[^-]+$/, '')),
        url: esp.cWebUri || 'https://turboentrada.com/',
        imagen: esp.listaImagen?.[0]?.cUri ?? '',
        precioDesde: esp.fPrecioDesde > 0 ? Math.round(esp.fPrecioDesde) : null,
        descripcion: descripcion(esp.cDescripcion),
        artistas: [],
        id: `${esp.idEspectaculoCartel}-${f.idFuncion}`,
      };
    });
  });
}
