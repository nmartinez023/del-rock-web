// Marcador ("bookmarklet") para AllAccess. Su firewall bloquea los pedidos desde servidores, y su sitio
// no deja que otra web lea sus páginas, así que se usa desde tu navegador estando en allaccess.com.ar:
// recorre los eventos de la página que estás viendo, lee el JSON-LD de cada uno (de a uno, con pausa)
// y te muestra el resultado para copiarlo y pegarlo en /admin/ticketeras.

/** Corre dentro de allaccess.com.ar: tiene que ser autocontenida (no puede usar nada de afuera). */
function copiarAllAccess() {
  if (!/(^|\.)allaccess\.com\.ar$/.test(location.hostname)) {
    alert('Usá este marcador estando en www.allaccess.com.ar');
    return;
  }
  const slugs = [
    ...new Set(
      [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/event/"]')]
        .map((a) => new URL(a.href, location.href).pathname.split('/event/')[1]?.split('/')[0])
        .filter((s): s is string => !!s && /^[\w-]+$/.test(s)),
    ),
  ];
  const caja = document.createElement('div');
  caja.style.cssText =
    'position:fixed;inset:16px;z-index:2147483647;background:#0c0c0e;color:#f5f5f4;padding:20px;font:15px/1.4 system-ui,sans-serif;border:3px solid #408AC9;border-radius:12px;display:flex;flex-direction:column;gap:12px;overflow:auto';
  const estado = document.createElement('p');
  caja.append(estado);
  document.body.append(caja);

  (async () => {
    const eventos: { url: string; jsonld: string; imagen: string }[] = [];
    for (const [i, slug] of slugs.entries()) {
      estado.textContent = `Del Rock: leyendo evento ${i + 1} de ${slugs.length}…`;
      try {
        const html = await (await fetch(`/event/${slug}`, { credentials: 'same-origin' })).text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        eventos.push({
          url: `https://www.allaccess.com.ar/event/${slug}`,
          jsonld: [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.outerHTML).join('\n'),
          imagen: doc.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? '',
        });
      } catch {
        // si una página falla, seguimos con las demás
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    const texto = JSON.stringify(eventos);
    estado.textContent = `Listo: ${eventos.length} eventos. Copialo y pegalo en Del Rock → /admin/ticketeras.`;
    const area = document.createElement('textarea');
    area.value = texto;
    area.readOnly = true;
    area.style.cssText = 'flex:1;min-height:200px;width:100%;background:#1a1a1e;color:#f5f5f4;border:1px solid #333;border-radius:8px;padding:8px;font:12px monospace';
    const copiar = document.createElement('button');
    copiar.textContent = 'Copiar';
    const cerrar = document.createElement('button');
    cerrar.textContent = 'Cerrar';
    for (const b of [copiar, cerrar]) b.style.cssText = 'padding:10px 18px;border-radius:20px;border:0;font-weight:700;cursor:pointer;background:#408AC9;color:#0c0c0e;margin-right:8px';
    copiar.onclick = async () => {
      area.select();
      try {
        await navigator.clipboard.writeText(texto);
      } catch {
        document.execCommand('copy');
      }
      copiar.textContent = '¡Copiado!';
    };
    cerrar.onclick = () => caja.remove();
    const botones = document.createElement('div');
    botones.append(copiar, cerrar);
    caja.append(botones, area);
  })();
}

/** El link para arrastrar a la barra de marcadores. */
export const MARCADOR_ALLACCESS = `javascript:${encodeURIComponent(`(${copiarAllAccess.toString()})()`)}`;
