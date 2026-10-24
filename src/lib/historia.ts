// Imagen 9:16 para historias de Instagram, dibujada en el navegador (canvas).
// Arriba el logo y la web, el flyer (cuadrado con relleno; si es banner, con su proporción),
// el título y los datos de cuándo y dónde. Abajo queda libre para el sticker de enlace a las entradas.

export interface DatosHistoria {
  partes: { texto: string; azul: boolean }[];
  cuando: string;
  hora: string | null;
  venue: string;
  direccion: string;
  flyer: string | null;
  dia: string;
  mes: string;
}

const W = 1080;
const H = 1920;
const MARGEN = 50;
const ANCHO = W - MARGEN * 2; // 980
const CAB_FIN = 280; // donde puede empezar el flyer (debajo del logo)
const TOPE = 1610; // los datos terminan acá: abajo va el sticker de enlace
const GAP_TXT = 36;

const C = {
  fondo: '#000',
  fg: '#f2f2f0',
  muted: '#b4b4b9',
  line: '#26262b',
  azul: '#408ac9',
  papel: '#ece7dc',
  tinta: '#111111',
};

const anton = (px: number) => `400 ${px}px Anton, Impact, sans-serif`;
const archivo = (peso: number, px: number) => `${peso} ${px}px Archivo, system-ui, sans-serif`;

function cargarImagen(src: string) {
  return new Promise<HTMLImageElement>((ok, mal) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // si la ticketera no permite CORS, falla y se usa el cuadro de fecha
    img.onload = () => ok(img);
    img.onerror = mal;
    img.src = src;
  });
}

/** Alto de una línea con line-height de CSS, y dónde cae la línea base dentro de ella. */
function linea(ctx: CanvasRenderingContext2D, alto: number) {
  const m = ctx.measureText('Hg');
  const asc = m.fontBoundingBoxAscent ?? alto * 0.8;
  const desc = m.fontBoundingBoxDescent ?? alto * 0.2;
  return { alto, base: (alto - (asc + desc)) / 2 + asc };
}

/** Corta un texto en líneas que entren en `ancho`; la última se recorta con "…". */
function cortar(ctx: CanvasRenderingContext2D, texto: string, ancho: number, max: number) {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba;
    else {
      lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  if (lineas.length > max) {
    lineas.length = max;
    let ult = lineas[max - 1];
    while (ult && ctx.measureText(`${ult}…`).width > ancho) ult = ult.slice(0, -1);
    lineas[max - 1] = `${ult.trimEnd()}…`;
  }
  return lineas;
}

type Palabra = { texto: string; azul: boolean; ancho: number };

/** Título en hasta 2 líneas parejas; si no entra, se achica la letra. */
function armarTitulo(ctx: CanvasRenderingContext2D, partes: DatosHistoria['partes']) {
  const crudas = partes.flatMap((p) =>
    p.texto.toLocaleUpperCase('es').split(/\s+/).filter(Boolean).map((texto) => ({ texto, azul: p.azul })),
  );
  const anchoDe = (ps: Palabra[], esp: number) => ps.reduce((s, p) => s + p.ancho, 0) + esp * Math.max(0, ps.length - 1);

  for (let tam = 106; ; tam -= 4) {
    ctx.font = anton(tam);
    const esp = ctx.measureText(' ').width;
    const pals = crudas.map((p) => ({ ...p, ancho: ctx.measureText(p.texto).width }));
    if (anchoDe(pals, esp) <= ANCHO) return { tam, esp, lineas: [pals] };
    let mejor: Palabra[][] | null = null;
    let mejorAncho = Infinity;
    for (let i = 1; i < pals.length; i++) {
      const a = pals.slice(0, i);
      const b = pals.slice(i);
      const max = Math.max(anchoDe(a, esp), anchoDe(b, esp));
      if (max <= ANCHO && max < mejorAncho) [mejor, mejorAncho] = [[a, b], max];
    }
    if (mejor) return { tam, esp, lineas: mejor };
    if (tam <= 60) {
      // Último recurso: tantas líneas como hagan falta.
      const lineas: Palabra[][] = [[]];
      for (const p of pals) {
        const l = lineas[lineas.length - 1];
        if (l.length && anchoDe([...l, p], esp) > ANCHO) lineas.push([p]);
        else l.push(p);
      }
      return { tam, esp, lineas };
    }
  }
}

function conLetterSpacing(ctx: CanvasRenderingContext2D, valor: string, dibujar: () => void) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  const antes = c.letterSpacing;
  if (antes !== undefined) c.letterSpacing = valor;
  dibujar();
  if (antes !== undefined) c.letterSpacing = antes;
}

function recorteRedondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.clip();
}

export async function generarHistoria(d: DatosHistoria): Promise<Blob> {
  await Promise.all([
    document.fonts.load(anton(106)),
    document.fonts.load(archivo(400, 30)),
    document.fonts.load(archivo(700, 36)),
    document.fonts.load(archivo(800, 24)),
  ]);
  const [logo, flyer] = await Promise.all([
    cargarImagen('/logo.png').catch(() => null),
    d.flyer ? cargarImagen(d.flyer).catch(() => null) : Promise.resolve(null),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.fondo;
  ctx.fillRect(0, 0, W, H);

  // --- Medidas del texto (definen cuánto lugar queda para el flyer) ---
  const titulo = armarTitulo(ctx, d.partes);
  ctx.font = anton(titulo.tam);
  const lt = linea(ctx, titulo.tam);
  const altoTitulo = lt.alto * titulo.lineas.length;

  const COL = (ANCHO - 40) / 2;
  ctx.font = archivo(800, 24);
  const le = linea(ctx, 29);
  ctx.font = archivo(700, 36);
  const lf = linea(ctx, 41);
  const cuandoL = cortar(ctx, d.cuando, COL, 2);
  const venueL = cortar(ctx, d.venue, COL, 2);
  ctx.font = archivo(400, 30);
  const ls = linea(ctx, 37.5);
  const horaL = d.hora ? cortar(ctx, d.hora, COL, 1) : [];
  const dirL = d.direccion ? cortar(ctx, d.direccion, COL, 2) : [];
  const altoCol = (f: string[], s: string[]) => le.alto + 12 + f.length * lf.alto + (s.length ? 8 + s.length * ls.alto : 0);
  const altoTexto = altoTitulo + 30 + 2 + 30 + Math.max(altoCol(cuandoL, horaL), altoCol(venueL, dirL));

  // --- Flyer: cuadrado; banner (≥ 1,4:1) con su proporción ---
  const disponible = TOPE - CAB_FIN - GAP_TXT - altoTexto;
  const proporcion = flyer ? flyer.naturalWidth / flyer.naturalHeight : 1;
  const banner = proporcion >= 1.4;
  let fw = Math.min(ANCHO, disponible);
  let fh = fw;
  if (banner) {
    fw = Math.min(ANCHO, disponible * proporcion);
    fh = fw / proporcion;
  }
  // El bloque flyer + texto se centra en el espacio libre (con un flyer cuadrado lo llena).
  const fy = CAB_FIN + Math.max(0, (disponible - fh) / 2);
  const fx = (W - fw) / 2;

  ctx.save();
  recorteRedondeado(ctx, fx, fy, fw, fh, 6);
  if (flyer && banner) {
    ctx.drawImage(flyer, fx, fy, fw, fh);
  } else if (flyer) {
    // Relleno: la misma foto achicada y vuelta a agrandar (difumina sin depender de ctx.filter) y oscurecida.
    const chico = document.createElement('canvas');
    chico.width = 24;
    chico.height = 24;
    const cc = chico.getContext('2d')!;
    const lado = Math.min(flyer.naturalWidth, flyer.naturalHeight);
    cc.drawImage(flyer, (flyer.naturalWidth - lado) / 2, (flyer.naturalHeight - lado) / 2, lado, lado, 0, 0, 24, 24);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(chico, fx - 40, fy - 40, fw + 80, fh + 80);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(fx, fy, fw, fh);
    const k = Math.min(fw / flyer.naturalWidth, fh / flyer.naturalHeight);
    const iw = flyer.naturalWidth * k;
    const ih = flyer.naturalHeight * k;
    ctx.drawImage(flyer, fx + (fw - iw) / 2, fy + (fh - ih) / 2, iw, ih);
  } else {
    // Sin flyer: el cuadro de papel con la fecha, como en la página.
    ctx.fillStyle = C.papel;
    ctx.fillRect(fx, fy, fw, fh);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.tinta;
    ctx.font = anton(Math.round(fw * 0.4));
    ctx.fillText(d.dia, W / 2, fy + fh * 0.6);
    ctx.fillStyle = '#2f6ea6';
    ctx.font = anton(Math.round(fw * 0.11));
    ctx.fillText(d.mes.toLocaleUpperCase('es'), W / 2, fy + fh * 0.6 + fw * 0.15);
  }
  ctx.restore();

  // --- Cabecera: logo fijo a la izquierda; la web apoyada sobre el flyer ---
  if (logo) ctx.drawImage(logo, MARGEN, 150, 106, 106);
  ctx.font = archivo(400, 34);
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  conLetterSpacing(ctx, '0.5px', () => ctx.fillText('www.delrock.ar/agenda', W / 2, fy - 32));

  // --- Título centrado ---
  let y = fy + fh + GAP_TXT;
  ctx.font = anton(titulo.tam);
  ctx.textAlign = 'left';
  for (const l of titulo.lineas) {
    const ancho = l.reduce((s, p) => s + p.ancho, 0) + titulo.esp * (l.length - 1);
    let x = (W - ancho) / 2;
    for (const p of l) {
      ctx.fillStyle = p.azul ? C.azul : C.fg;
      ctx.fillText(p.texto, x, y + lt.base);
      x += p.ancho + titulo.esp;
    }
    y += lt.alto;
  }

  // --- Línea y datos ---
  y += 30;
  ctx.fillStyle = C.line;
  ctx.fillRect(MARGEN, y, ANCHO, 2);
  y += 32;
  const columna = (x: number, etiqueta: string, fuerte: string[], suave: string[]) => {
    let cy = y;
    ctx.font = archivo(800, 24);
    ctx.fillStyle = C.azul;
    conLetterSpacing(ctx, '5px', () => ctx.fillText(etiqueta, x, cy + le.base));
    cy += le.alto + 12;
    ctx.font = archivo(700, 36);
    ctx.fillStyle = C.fg;
    for (const t of fuerte) {
      ctx.fillText(t, x, cy + lf.base);
      cy += lf.alto;
    }
    if (suave.length) cy += 8;
    ctx.font = archivo(400, 30);
    ctx.fillStyle = C.muted;
    for (const t of suave) {
      ctx.fillText(t, x, cy + ls.base);
      cy += ls.alto;
    }
  };
  columna(MARGEN, 'CUÁNDO', cuandoL, horaL);
  columna(MARGEN + COL + 40, 'DÓNDE', venueL, dirL);

  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('Sin imagen'))), 'image/png'));
}
