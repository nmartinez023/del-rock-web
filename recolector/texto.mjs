import { createHash } from 'node:crypto';

/** Minúsculas, sin acentos ni signos: para comparar nombres de bandas y venues. */
export function plano(texto = '') {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slug(texto = '') {
  return plano(texto).replace(/ /g, '-');
}

export function limpiar(texto = '') {
  return decodificarEntidades(String(texto)).replace(/\s+/g, ' ').trim();
}

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª', deg: '°', laquo: '«', raquo: '»',
  hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•',
};
// &aacute; &Eacute; &ntilde; &uuml; ... (las del español)
for (const v of 'aeiou') {
  ENTIDADES[`${v}acute`] = v.normalize('NFD') + '́';
  ENTIDADES[`${v.toUpperCase()}acute`] = v.toUpperCase() + '́';
}
Object.assign(ENTIDADES, { ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü' });
for (const k of Object.keys(ENTIDADES)) ENTIDADES[k] = ENTIDADES[k].normalize('NFC');

export function decodificarEntidades(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cod = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cod) ? String.fromCodePoint(cod) : m;
    }
    return ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? m;
  });
}

export function hash(valor) {
  return createHash('sha1').update(JSON.stringify(valor)).digest('hex').slice(0, 16);
}
