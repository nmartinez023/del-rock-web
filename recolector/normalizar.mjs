// Pasa un evento crudo (como lo devuelve un adaptador) al formato de la agenda.
import { plano, limpiar } from './texto.mjs';

const TZ = 'America/Argentina/Buenos_Aires';

// Del texto más específico al más general: "La Plata, Buenos Aires" tiene que dar Buenos Aires.
const PROVINCIAS = [
  [/\b(ciudad autonoma|caba|c a b a|capital federal)\b/, 'CABA'],
  [/\bcordoba\b/, 'Córdoba'],
  [/\b(santa fe|rosario)\b/, 'Santa Fe'],
  [/\bmendoza\b/, 'Mendoza'],
  [/\btucuman\b/, 'Tucumán'],
  [/\bneuquen\b/, 'Neuquén'],
  [/\b(buenos aires|la plata|mar del plata|bahia blanca|quilmes|moron|lanus|avellaneda)\b/, 'Buenos Aires'],
];

/**
 * Provincia a partir de (en orden de confianza) región, localidad y dirección.
 * Se mira cada texto por separado: en Rosario hay una calle Córdoba, y eso no la hace de Córdoba.
 */
export function provinciaDe(...textos) {
  for (const texto of textos.filter(Boolean)) {
    const t = plano(texto);
    for (const [re, p] of PROVINCIAS) if (re.test(t)) return p;
  }
  return null;
}

/** "2026-11-14T21:00:00-03:00" → { fecha: "2026-11-14", hora: "21:00" } en hora argentina. */
export function fechaHora(inicio) {
  const soloFecha = /^(\d{4}-\d{2}-\d{2})$/.exec(inicio.trim());
  if (soloFecha) return { fecha: soloFecha[1], hora: '' };

  const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(inicio.trim());
  if (local) return { fecha: local[1], hora: `${local[2]}:${local[3]}` }; // sin zona: ya es hora local

  const d = new Date(inicio);
  if (Number.isNaN(d.getTime())) return null;
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

export function hoyEnArgentina(ahora = new Date()) {
  return ahora.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Devuelve el evento listo para la agenda, o null si no se puede usar. */
export function normalizar(crudo, fuente) {
  if (!crudo.nombre || crudo.cancelado) return null;
  const fh = fechaHora(crudo.inicio);
  if (!fh) return null;

  const provincia = provinciaDe(crudo.region, crudo.localidad, crudo.direccion) ?? fuente.provincia ?? 'Otra';
  const ciudad = crudo.localidad || (provincia === 'CABA' ? 'Buenos Aires' : provincia);

  return {
    titulo: limpiar(crudo.nombre),
    fecha: fh.fecha,
    hora: fh.hora,
    venue: crudo.lugar || 'A confirmar',
    direccion: crudo.direccion || '',
    ciudad,
    provincia,
    entradas: crudo.url || fuente.url,
    precioDesde: crudo.precioDesde ?? null,
    imagen: /^https?:\/\//.test(crudo.imagen ?? '') ? crudo.imagen : '',
    aviso: crudo.aviso || '',
    descripcion: crudo.descripcion || '',
    artistas: crudo.artistas,
    id: crudo.id || crudo.url || `${fh.fecha}|${plano(crudo.nombre)}`,
    ...(crudo.detalle ? { detalle: crudo.detalle } : {}),
  };
}

/** Suma al evento crudo lo que trae su página de detalle (sin pisar lo que ya tenía). */
export function completar(crudo, extra) {
  const salida = { ...crudo };
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v !== undefined && v !== null && v !== '' && (salida[k] === undefined || salida[k] === null || salida[k] === '')) salida[k] = v;
  }
  return salida;
}
