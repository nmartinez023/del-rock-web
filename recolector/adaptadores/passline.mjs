// Passline (passline.com): su API rechaza a los bots (desafío de Cloudflare), así que el recolector no la
// pide. Los eventos los traés vos con el botón de /admin/ticketeras (desde tu navegador) y quedan en
// recolector/entradas/passline.json; acá solo se leen. Campos: los de GetBillboardByFilters.
import { limpiar } from '../texto.mjs';

export const importado = 'recolector/entradas/passline.json';

/** "SAN CARLOS DE BARILOCHE" → "San Carlos De Bariloche" (Passline escribe muchas localidades en mayúsculas). */
const nombrePropio = (t) => (t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s(-])\p{L}/gu, (l) => l.toUpperCase()) : t);

/** Acepta el archivo guardado ({ guardado, eventos }) o directamente la lista. */
export function eventosDe(cuerpo) {
  try {
    const datos = JSON.parse(cuerpo);
    return Array.isArray(datos) ? datos : Array.isArray(datos?.eventos) ? datos.eventos : [];
  } catch {
    return [];
  }
}

export function extraer(cuerpo) {
  return eventosDe(cuerpo)
    .filter((e) => e.nombre && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha_inicio ?? ''))
    .map((e) => {
      // Passline a veces codifica dos veces ("CA&amp;Ntilde;UELAS"): se limpia dos veces.
      const region = limpiar(limpiar(e.nombre_region ?? ''));
      let comuna = limpiar(limpiar(e.nombre_communa ?? ''));
      // "CA" es su abreviatura de la Ciudad de Buenos Aires (Galpón B, Lalalá…); en otra provincia no dice nada.
      const caba = /capital federal/i.test(region) || /^c\.?\s?a\.?\s?b\.?\s?a\.?$/i.test(comuna) || (comuna === 'CA' && /^buenos aires$/i.test(region));
      if (comuna === 'CA') comuna = region;
      const hora = /^(\d{2}):(\d{2})/.exec(e.hora_inicio ?? '');
      return {
        nombre: limpiar(e.nombre),
        inicio: hora && hora[0] !== '00:00' ? `${e.fecha_inicio}T${hora[1]}:${hora[2]}` : e.fecha_inicio,
        cancelado: false,
        lugar: limpiar(e.lugar ?? ''),
        localidad: caba ? 'Buenos Aires' : nombrePropio(comuna),
        region: caba ? 'CABA' : region,
        direccion: '',
        url: e.url,
        imagen: e.recorte || e.miniatura || '',
        precioDesde: Number(e.precio_min) > 0 ? Math.round(Number(e.precio_min)) : null,
        descripcion: '',
        artistas: e.artistas ? limpiar(e.artistas).split(/\s*[,/]\s*|\s+y\s+/).filter(Boolean) : [],
        id: String(e.id),
      };
    });
}
