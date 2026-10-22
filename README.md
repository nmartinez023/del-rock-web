# Del Rock Arg — web

Sitio de [@del.rock.arg](https://www.instagram.com/del.rock.arg/): noticias, agenda, coberturas y bandas.
Astro + Keystatic (CMS que guarda el contenido en este repo) + Cloudflare Workers.

## Cargar contenido

Entrá a **https://del-rock-web.delrockarg.workers.dev/keystatic** e iniciá sesión con GitHub (cuenta `nmartinez023`).
Cada **Save** es un commit en `main`, y ese commit publica el sitio solo en un par de minutos.

| Colección | Carpeta | Qué es |
|---|---|---|
| Noticias | `src/content/noticias/*.mdoc` | Notas y coberturas. La **palabra destacada** se pinta en azul en el título. |
| Bandas | `src/content/bandas/*.yaml` | Cada banda tiene su página con sus notas y fechas. |
| Agenda | `src/content/agenda/*.yaml` | Shows y festivales. Las fechas pasadas se ocultan solas. |

Las fotos van a `src/assets/` y Astro las optimiza (WebP, varios tamaños) en el build.

> El contenido actual es de ejemplo (salvo la nota de *Infame*). Borralo cuando cargues el real.

## Panel /admin

**https://del-rock-web.delrockarg.workers.dev/admin** — revisar la agenda de a muchos: lista los eventos pendientes
(leídos en vivo del repo), con un checkbox por fila y "seleccionar todos", y **Publicar / Descartar / Pasar a la otra
lista** lo seleccionado en **un solo commit**. Pestañas para la Agenda (rock) y "Otros eventos de Rosario".

- Usa la misma sesión de GitHub que Keystatic (cookie `keystatic-gh-access-token`); si venció, la renueva sola o pide
  iniciar sesión. Cada pedido verifica que el usuario tenga permiso de escritura en el repo.
- Edita una sola línea del YAML (`estado` o `rockNacional`), sin tocar el resto. "Pasar a la otra lista" cambia
  `rockNacional` y el Action "Reubicar eventos" mueve el archivo.
- Código: `src/pages/admin/` (página y API) y `src/lib/admin/github.ts`. Lugar para sumar otras herramientas a futuro.

## Recolector de agenda

Un GitHub Action (`.github/workflows/recolector.yml`) corre 4 veces por día, y también cuando cambia una fuente o el
recolector. Recorre las fuentes cargadas en el panel (**Fuentes de agenda**), clasifica cada evento con IA y lo guarda
con estado **⏳ Pendiente**:

| Evento | Fuente de Rosario | Fuente de otro lado |
|---|---|---|
| Rock nacional | **Agenda (rock nacional)** — `src/content/agenda/` | **Agenda (rock nacional)** |
| Otro género | **Otros eventos de Rosario** — `src/content/otros-eventos/` | No se guarda |

En la web solo aparecen los de la Agenda con estado **✅ Publicado**. Los "otros eventos" no se muestran en Del Rock:
salen, junto con los de rock, por `/api/eventos.json` para usarlos desde otra app.

- **IA:** Claude Haiku 5.5 vía OpenRouter (`OPENROUTER_API_KEY` en los secrets de GitHub; el modelo se puede cambiar con la
  variable `RECOLECTOR_MODELO`). Para cada evento nuevo decide si es rock nacional, si es festival, el título limpio y quiénes tocan.
  Las respuestas se guardan en `recolector/cache-ia.json`: un evento no se vuelve a consultar mientras no cambie. El costo de cada
  corrida figura en el resumen del Action. Si la IA no responde, esos eventos se reintentan en la corrida siguiente.
- **Primero, la banda:** si en el título o entre los artistas aparece una banda de la colección Bandas, el evento
  es rock nacional y no se consulta a la IA (salvo tributos y homenajes, que decide la IA).
- **Bandas:** las de los eventos de rock se vinculan a la colección Bandas; las que no existen se crean ocultas
  (aparecen en la web cuando tienen una fecha publicada o una nota). Las bandas que creó el recolector y quedaron sin
  fechas de rock ni notas (por ejemplo, porque destildaste el evento) se borran solas, salvo que tengan tildado
  "Siempre es rock nacional".
- **Corregir a la IA:** destildá o tildá **Rock nacional** en el evento y el recolector lo pasa a la otra lista en la corrida siguiente.
- **Detalle de cada evento:** del listado salen precio e imagen; de la página de cada evento, dirección, aviso y descripción
  (se lee al cargar el evento y después como mucho una vez por semana).
- **Imágenes:** se guarda solo la URL. La web las muestra en `/agenda/<evento>/imagen`, un endpoint del Worker que las pide
  a la ticketera y las deja en caché. Si subís un *Flyer propio* en el panel, se usa ese.
- **Duplicados:** el mismo evento (fecha + lugar + título) no se carga dos veces.
- **Ediciones a mano:** si editás un evento que trajo el recolector, no lo vuelve a pisar (cambiar el estado no cuenta como edición).
- **Respeta `robots.txt`** y se identifica como `DelRockBot`. Para sitios sin JSON-LD hay adaptadores en `recolector/adaptadores/` (Entrada Play, Dame mi Ticket, Turbo Entrada, Ticketek, AllAccess, TuEntrada, Movistar Arena). Movistar Arena arma la página en el navegador, así que se lee con Playwright (Chromium sin pantalla, instalado en el Action). Passline no se lee: bloquea bots con Cloudflare. El resumen de la última corrida queda en `recolector/ultimo-resumen.md`.

```bash
npm run recolectar -- --seco
```

```bash
npm run test:recolector
```

## Keystatic en la nube (GitHub App)

Todo el sitio es HTML prerenderizado. Lo único que corre en el Worker es el panel (`/keystatic` y `/api/keystatic`),
que se autentica con una GitHub App instalada en este repo:

- Permisos: *Contents* lectura y escritura, *Metadata* lectura, *Pull requests* lectura.
- *Request user authorization (OAuth) during installation*: activado.
- Callback URLs: `https://del-rock-web.delrockarg.workers.dev/api/keystatic/github/oauth/callback`
  y `http://127.0.0.1:4321/api/keystatic/github/oauth/callback` (para desarrollo local).

Variables en Cloudflare (Worker `del-rock-web`):

| Variable | Dónde | Tipo |
|---|---|---|
| `KEYSTATIC_GITHUB_CLIENT_ID` | *Settings › Variables and Secrets* | Secret |
| `KEYSTATIC_GITHUB_CLIENT_SECRET` | *Settings › Variables and Secrets* | Secret |
| `KEYSTATIC_SECRET` | *Settings › Variables and Secrets* | Secret (64 caracteres al azar) |
| `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` | *Settings › Builds › Variables* | Variable de build |

Cargá las tres primeras como **Secret**: `wrangler deploy` borra las variables de texto que no están en `wrangler.jsonc`, pero no los secrets.

## Desarrollo local

```bash
npm install
npm run dev
```

`astro dev` corre sobre el runtime de Workers. Para usar el panel en local, copiá los mismos valores en
`.dev.vars` (los tres secrets) y en `.env` (`PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` e `INSTAGRAM_TOKEN`). Ninguno de los dos se sube a git.

## Instagram

La home muestra los últimos 6 posts usando la **Instagram API with Instagram Login**.
Se consulta una sola vez por build; sin token, la sección muestra solo el botón al perfil.

1. Creá una app en [developers.facebook.com](https://developers.facebook.com/) con el caso de uso de Instagram → *Configuración de la API con inicio de sesión de empresa de Instagram*.
2. Agregá la cuenta @del.rock.arg y generá el token (permiso `instagram_business_basic`).
3. Cargalo como `INSTAGRAM_TOKEN` en *Settings › Builds › Variables* del Worker (y en `.env` para desarrollo local).
4. El token dura 60 días: renovalo con `npm run ig:renovar`.

Para mostrar un post dentro de una nota, pegá su link en el campo *Link al post de Instagram*.

## Deploy (Cloudflare Workers)

El sitio se publica en https://del-rock-web.delrockarg.workers.dev con el adapter `@astrojs/cloudflare`.
Los deploys se agrupan: `.github/workflows/deploy.yml` corre con cada push a `main`, espera **5 minutos sin cambios
nuevos** y recién ahí llama al *Deploy Hook* de Cloudflare (que hace `npm run build` y `wrangler deploy`). Si llega otro
cambio en esos 5 minutos, la espera vuelve a empezar: publicar 100 eventos seguidos son 100 commits pero 1 deploy.
El recolector y "Reubicar eventos" también lo disparan al subir cambios.

Para que funcione, en Cloudflare los builds automáticos por push están apagados con un truco:
*Workers & Pages › del-rock-web › Settings › Builds › Build watch paths (Production) › Include paths:* `.solo-deploy-hook`,
un archivo que no existe y nunca se crea, así que ningún push coincide (no sirve dejarlo vacío ni excluir `*`).
El Deploy Hook compila igual. Cloudflare sí compila un push con 20 commits o más.

- Node: sale de `.node-version` (24).
- `SITE_URL` (variable de build): cargala cuando haya dominio propio.

**Rebuild diario:** `.github/workflows/rebuild-diario.yml` llama todos los días a las 06:00 (hora argentina) a un
*Deploy Hook* del Worker, para traer los posts nuevos de Instagram y sacar las fechas pasadas de la agenda.
La URL del hook está guardada como secret `CF_DEPLOY_HOOK` en el repo de GitHub.
