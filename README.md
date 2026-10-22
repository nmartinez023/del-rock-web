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
Cada push a `main` dispara un build en Cloudflare (Workers Builds): `npm run build` y después `wrangler deploy`.

- Node: sale de `.node-version` (24).
- `SITE_URL` (variable de build): cargala cuando haya dominio propio.

**Rebuild diario:** `.github/workflows/rebuild-diario.yml` llama todos los días a las 06:00 (hora argentina) a un
*Deploy Hook* del Worker, para traer los posts nuevos de Instagram y sacar las fechas pasadas de la agenda.
La URL del hook está guardada como secret `CF_DEPLOY_HOOK` en el repo de GitHub.
