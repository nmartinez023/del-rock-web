# Del Rock Arg — web

Sitio estático de [@del.rock.arg](https://www.instagram.com/del.rock.arg/): noticias, agenda, coberturas y bandas.
Astro + Keystatic (CMS que guarda el contenido en este repo) + Cloudflare Pages.

## Desarrollo

```bash
npm install
npm run dev
```

- Sitio: http://localhost:4321
- Panel para cargar contenido: http://localhost:4321/keystatic

## Cargar contenido

Todo se carga desde `/keystatic` y queda como archivos en `src/content/`:

| Colección | Carpeta | Qué es |
|---|---|---|
| Noticias | `src/content/noticias/*.mdoc` | Notas y coberturas. La **palabra destacada** se pinta en azul en el título. |
| Bandas | `src/content/bandas/*.yaml` | Cada banda tiene su página con sus notas y fechas. |
| Agenda | `src/content/agenda/*.yaml` | Shows y festivales. Las fechas pasadas se ocultan solas. |

Las fotos van a `src/assets/` y Astro las optimiza (WebP, varios tamaños) en el build.
Para publicar: commit + push, y Cloudflare Pages recompila.

> El contenido actual es de ejemplo (salvo la nota de *Infame*). Borralo cuando cargues el real.

## Instagram

La home muestra los últimos 6 posts usando la **Instagram API with Instagram Login**.
Se consulta una sola vez por build; sin token, la sección muestra solo el botón al perfil.

1. Creá una app en [developers.facebook.com](https://developers.facebook.com/) con el producto *Instagram* → *API setup with Instagram login*.
2. Agregá la cuenta @del.rock.arg y generá un token de larga duración (permiso `instagram_business_basic`).
3. Copiá `.env.example` a `.env` y pegá el token en `INSTAGRAM_TOKEN`. En Cloudflare Pages cargalo como variable de entorno.
4. El token dura 60 días: renovalo con `npm run ig:renovar`.

Para mostrar un post dentro de una nota, pegá su link en el campo *Link al post de Instagram*.

## Deploy (Cloudflare Pages)

Cada push a `main` publica el sitio. Configuración del proyecto en Cloudflare:

| Campo | Valor |
|---|---|
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node | sale de `.node-version` (24) |
| Variables | `INSTAGRAM_TOKEN` (opcional), `SITE_URL` cuando haya dominio propio |

**Rebuild diario:** `.github/workflows/rebuild-diario.yml` llama todos los días a las 06:00 (hora argentina) a un
*Deploy Hook* de Cloudflare, para traer los posts nuevos de Instagram y sacar las fechas pasadas de la agenda.
Creá el hook en *Settings › Builds › Deploy hooks* y guardá su URL como secret `CF_DEPLOY_HOOK` en el repo de GitHub.
