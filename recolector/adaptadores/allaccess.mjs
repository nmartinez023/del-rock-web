// AllAccess (allaccess.com.ar): su firewall bloquea los pedidos desde servidores (GitHub Actions da 403),
// así que el recolector no la pide. Los eventos los juntás vos con el marcador de /admin/ticketeras
// (corre en tu navegador, en allaccess.com.ar) y quedan en recolector/entradas/allaccess.json:
// por cada evento, su URL, el JSON-LD de su página (fecha, lugar, precios) y la imagen (og:image).
import { extraer as extraerJsonLd } from './jsonld.mjs';
import { eventosDe } from './passline.mjs';

export const importado = 'recolector/entradas/allaccess.json';

export function extraer(cuerpo) {
  return eventosDe(cuerpo).flatMap((p) =>
    extraerJsonLd(p.jsonld ?? '').map((ev, i) => {
      const slug = String(p.url).split('/event/')[1] ?? '';
      return {
        ...ev,
        url: p.url,
        imagen: ev.imagen || p.imagen || '',
        // La "descripción" del JSON-LD es solo la fecha o el lugar en texto ("Domingo 25 de Octubre 2026", "En River").
        descripcion: '',
        localidad: ev.localidad.replace(/^[A-Z]\d{4}[A-Z]{0,3}\s+/, ''), // sin código postal ("W3400 Corrientes")
        region: /^buenos aires$/i.test(ev.localidad.trim()) ? 'CABA' : ev.region, // "San Isidro, Buenos Aires" sí es provincia
        id: i ? `${slug}-${i}` : slug,
      };
    }),
  );
}
