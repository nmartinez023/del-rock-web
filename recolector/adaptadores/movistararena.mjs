// Movistar Arena (movistararena.com.ar): vende con su propia boletería, así que sus shows no están en
// las otras ticketeras. El sitio es Blazor Server: el HTML viene vacío y los shows se dibujan en el
// navegador. Por eso se lee con un navegador sin pantalla (Playwright + Chromium), como lo haría una
// persona: el listado /shows y la ficha de cada show (fechas, horario, descripción). robots.txt lo permite.
import { limpiar } from '../texto.mjs';
import { hoyEnArgentina } from '../normalizar.mjs';

const WEB = 'https://www.movistararena.com.ar/';
const MAX_SHOWS = 80;
const EN_PARALELO = 2;

export function urlDeDatos() {
  return `${WEB}shows`;
}

/** Lo que se lee del listado: una tarjeta por show. Corre dentro del navegador. */
function leerListado() {
  return [...document.querySelectorAll('.evento')].map((e) => ({
    nombre: e.querySelector('h3')?.innerText ?? '',
    fecha: e.querySelector('.fecha')?.innerText ?? '',
    precio: e.querySelector('.precio-desde')?.innerText ?? '',
    imagen: e.querySelector('img')?.src ?? '',
    url: e.querySelector('a[href*="/show/"]')?.href ?? '',
  }));
}

/** Lo que se lee de la ficha de un show: sus funciones y la descripción. Corre dentro del navegador. */
function leerFicha() {
  const ficha = document.querySelector('.main-evento-ficha') ?? document;
  return {
    descripcion: ficha.querySelector('.descripcion')?.innerText ?? '',
    imagen: ficha.querySelector('img[src*="FotoFichaDesktop"]')?.src ?? '',
    precio: ficha.querySelector('aside .top span')?.innerText ?? '',
    funciones: [...ficha.querySelectorAll('aside .evento-row')].map((r) => ({
      dia: r.querySelector('.fecha p')?.innerText ?? '',
      mes: r.querySelector('.fecha span')?.innerText ?? '',
      horas: [...r.querySelectorAll('.hora')].map((h) => ({ hora: h.querySelector('p')?.innerText ?? '', tipo: h.querySelector('span')?.innerText ?? '' })),
      estado: r.querySelector('button')?.innerText ?? '',
    })),
  };
}

export async function descargar(url, { agente } = {}) {
  const { chromium } = await import('playwright'); // solo se carga para esta fuente
  const navegador = await chromium.launch();
  try {
    const contexto = await navegador.newContext({ userAgent: agente, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
    // Sin imágenes ni tipografías: no hacen falta para leer los datos y así la carga es más liviana.
    await contexto.route(/\.(png|jpe?g|gif|webp|svg|woff2?|ttf)(\?|$)|\/static\/artistas\//i, (r) => r.abort());

    const pagina = await contexto.newPage();
    await pagina.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await pagina.waitForSelector('.evento h3', { timeout: 60_000 });
    const shows = (await pagina.evaluate(leerListado)).filter((s) => s.nombre && s.url).slice(0, MAX_SHOWS);
    await pagina.close();

    const cola = [...shows];
    const trabajar = async () => {
      const p = await contexto.newPage();
      for (let show = cola.shift(); show; show = cola.shift()) {
        for (let intento = 0; intento < 2 && !show.ficha; intento++) {
          try {
            await p.goto(show.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
            await p.waitForSelector('aside .evento-row', { timeout: 20_000 });
            show.ficha = await p.evaluate(leerFicha);
          } catch {
            // Se reintenta una vez; si igual no carga, queda la fecha del listado (sin horario).
          }
        }
      }
      await p.close();
    };
    await Promise.all(Array.from({ length: EN_PARALELO }, trabajar));
    return JSON.stringify({ leido: hoyEnArgentina(), shows });
  } finally {
    await navegador.close();
  }
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesDe = (texto) => MESES.indexOf(String(texto).trim().toLowerCase().replace('setiembre', 'septiembre')) + 1;
const dos = (n) => String(n).padStart(2, '0');

/** "$ 60.000" / "Desde $55.000" → 60000 */
function precio(texto) {
  const n = Number(String(texto ?? '').replace(/[^\d,]/g, '').replace(/,\d*$/, ''));
  return n > 0 ? n : null;
}

/** La ficha muestra día y mes sin año: es la próxima vez que cae esa fecha desde el día de la lectura. */
function conAnio(dia, mes, leido) {
  const anio = Number(leido.slice(0, 4));
  const fecha = `${anio}-${dos(mes)}-${dos(dia)}`;
  return fecha >= leido ? fecha : `${anio + 1}-${dos(mes)}-${dos(dia)}`;
}

/** "31 octubre 2026" o "22 octubre 2026 y 1 fecha más" (la del listado) → "2026-10-31" */
function fechaDelListado(texto) {
  const m = /(\d{1,2})\s+([a-záéíóú]+)\s+(\d{4})/i.exec(texto ?? '');
  return m && mesDe(m[2]) ? `${m[3]}-${dos(mesDe(m[2]))}-${dos(m[1])}` : null;
}

export function extraer(cuerpo) {
  let datos;
  try {
    datos = JSON.parse(cuerpo);
  } catch {
    return [];
  }
  const { leido = hoyEnArgentina(), shows = [] } = datos ?? {};

  return shows.flatMap((s) => {
    const guid = /\/show\/([\w-]+)/.exec(s.url)?.[1] ?? s.url;
    const base = {
      nombre: limpiar(s.nombre),
      cancelado: false,
      lugar: 'Movistar Arena',
      localidad: 'Buenos Aires',
      region: 'CABA',
      direccion: 'Humboldt 450',
      url: s.url,
      imagen: s.ficha?.imagen || s.imagen || '',
      precioDesde: precio(s.ficha?.precio) ?? precio(s.precio),
      descripcion: limpiar(s.ficha?.descripcion ?? '').slice(0, 3000),
      artistas: [],
    };

    const funciones = (s.ficha?.funciones ?? []).flatMap((f) => {
      const mes = mesDe(f.mes);
      if (!mes || !/^\d{1,2}$/.test(f.dia.trim())) return [];
      const fecha = conAnio(Number(f.dia), mes, leido);
      const show = f.horas.find((h) => /show/i.test(h.tipo)) ?? f.horas.at(-1);
      const hora = /(\d{1,2}):(\d{2})/.exec(show?.hora ?? '');
      return [{ ...base, inicio: hora ? `${fecha}T${dos(hora[1])}:${hora[2]}` : fecha, id: `${guid}-${fecha}` }];
    });
    if (funciones.length) {
      // La ficha repite el panel de fechas (escritorio / celular): una función por fecha y hora.
      const unicas = [...new Map(funciones.map((f) => [f.inicio, f])).values()];
      // Dos funciones el mismo día (matiné y noche): la segunda lleva la hora en el id.
      return unicas.map((f, i) => (unicas.findIndex((o) => o.id === f.id) < i ? { ...f, id: `${f.id}-${f.inicio.slice(11).replace(':', '')}` } : f));
    }

    const fecha = fechaDelListado(s.fecha);
    return fecha ? [{ ...base, inicio: fecha, id: `${guid}-${fecha}` }] : [];
  });
}
