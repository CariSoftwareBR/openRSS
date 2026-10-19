<div align="center">

<img src="public/icons/icon-512.png" alt="openRSS" width="104" height="104">

<h1>openRSS</h1>

<p><strong>Tus feeds, tu IA, tu servidor.</strong><br>
Un lector RSS self-hosted, rápido y silencioso — con inteligencia artificial que trabaja para ti.</p>

<p>
  <a href="https://github.com/CariSoftwareBR/openRSS/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/CariSoftwareBR/openRSS/ci.yml?branch=main&style=flat-square&label=CI&labelColor=1b3d63&color=2f6fa5" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-Apache%202.0-2f6fa5?style=flat-square&labelColor=1b3d63" alt="Licencia Apache 2.0"></a>
  <a href="https://github.com/CariSoftwareBR/openRSS/pkgs/container/openrss"><img src="https://img.shields.io/badge/ghcr.io-openrss-2f6fa5?style=flat-square&logo=docker&logoColor=white&labelColor=1b3d63" alt="Imagen en GHCR"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2022.12-2f6fa5?style=flat-square&logo=node.js&logoColor=white&labelColor=1b3d63" alt="Node.js 22.12+">
</p>

<p>
  <a href="#recursos">Recursos</a>
  &nbsp;·&nbsp;
  <a href="#inteligencia-artificial">IA</a>
  &nbsp;·&nbsp;
  <a href="#instalación">Instalación</a>
  &nbsp;·&nbsp;
  <a href="#configuración">Configuración</a>
  &nbsp;·&nbsp;
  <a href="docs/DEVELOPMENT.md">Desarrollo</a>
</p>

<p><sub><a href="README.md">Português</a> &nbsp;·&nbsp; <a href="README.en.md">English</a> &nbsp;·&nbsp; <b>Español</b></sub></p>

<br>

<img src="docs/screenshots/reader.png" alt="Lector de artículos de openRSS con modo artículo completo y resumen por IA" width="100%">

</div>

<br>

## ¿Por qué openRSS?

Inspirado en Feedly, pero realmente tuyo. openRSS corre en **un solo contenedor**, guarda todo en **SQLite** (o **PostgreSQL** si necesitas escala) y habla con **cualquier IA** — OpenAI, Anthropic, OpenRouter o modelos locales vía Ollama, LM Studio y vLLM.

Pensado para instancias pequeñas, para ti y quien quieras invitar (hasta ~5 usuarios simultáneos con SQLite).

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>📖 Lectura sin ruido</h3>
      Modo artículo completo, vista <i>Hoy</i> priorizada por IA y noticias repetidas agrupadas automáticamente.
    </td>
    <td width="33%" valign="top">
      <h3>✨ IA realmente útil</h3>
      Resúmenes, preguntas sobre el artículo, búsqueda semántica, digest diario y un chat que lee tus feeds por ti.
    </td>
    <td width="33%" valign="top">
      <h3>🔒 Tus datos, en tu casa</h3>
      Self-hosted, inicio de sesión OIDC, claves de API cifradas y compatible con las apps que ya usas.
    </td>
  </tr>
</table>

<br>

## Recursos

### Lectura

- **Vistas** Hoy (priorizada por IA), Todos, Guardados, carpetas y feeds individuales
- **Diseños** en tarjetas, cuadrícula o solo títulos
- **Modo artículo completo** con Readability y búsqueda instantánea
- **Agrupación de noticias** — el mismo hecho desde feeds distintos aparece como “+N fuentes”; leer una marca las demás como leídas
- **Apps nativas** mediante las APIs Google Reader y Fever — NetNewsWire, Reeder, ReadYou, FluentReader, Unread… (contraseñas de aplicación en *Ajustes → Apps*)
- **PWA instalable** en el móvil y el escritorio, con lectura sin conexión de los artículos guardados y leídos recientemente
- **Atajos de teclado** — <kbd>j</kbd> <kbd>k</kbd> navegar · <kbd>o</kbd> abrir · <kbd>m</kbd> marcar leído · <kbd>s</kbd> guardar · <kbd>Shift</kbd>+<kbd>A</kbd> marcar todos · <kbd>/</kbd> buscar

### Feeds

- **Descubrimiento automático** a partir de la URL del sitio — RSS, Atom y RDF
- **Actualización en segundo plano** con ETag/Last-Modified y backoff en errores
- **OPML** para importar y exportar
- **Leer después** — guarda cualquier enlace (texto extraído en modo lectura) con el botón en Guardados, un bookmarklet o el menú Compartir del móvil
- **Etiquetas** para organizar los artículos guardados
- **Reglas automáticas** por título, contenido, autor, URL o nota de la IA: marcar como leído, guardar, destacar o notificar vía ntfy, Discord, Slack, Telegram o webhook
- **Salud de los feeds** (*Ajustes → Salud*) — feeds con errores, parados, poco leídos o demasiado activos, con limpieza en lote
- **Retención** de artículos configurable

### Usuarios y apariencia

- **Autenticación** por email y contraseña (Better Auth) o **inicio de sesión único OIDC** (Authentik, Authelia, Keycloak…), con vinculación de cuentas existentes
- **El primer registro se convierte en administrador**; registro abierto o cerrado, y el admin puede crear usuarios
- **Temas claro y oscuro** — mira el design system en [`docs/design/`](docs/design/)

<br>

## Inteligencia artificial

<img src="docs/screenshots/chat.png" alt="Chat con IA que busca y lee artículos de tus feeds" width="100%">

<p align="center"><sub>Conversa con tus feeds — la IA busca y lee los artículos por ti.</sub></p>

| | Qué hace la IA |
|:---:|---|
| 📝 | **Resume artículos** en streaming, con caché |
| 💬 | **Responde preguntas** sobre el artículo, directamente en el lector |
| 🔎 | **Búsqueda semántica** por tema en las listas y en el chat, con embeddings de un proveedor global |
| 📬 | **Digest diario** de no leídos, agrupado por tema — automático, bajo demanda o por correo |
| 🧭 | **Chat con tus feeds** — la IA busca y lee artículos mediante herramientas |
| ⭐ | **Prioriza** artículos nuevos con una puntuación de 0 a 100 según tus intereses |

### Proveedores compatibles

| Proveedor | Base URL | Modelo de ejemplo |
|---|---|---|
| OpenAI | opcional | `gpt-5-mini` |
| Anthropic | opcional | `claude-sonnet-5` |
| OpenRouter | opcional | `anthropic/claude-sonnet-5` |
| OpenAI-compatible | **obligatoria** — Ollama, LM Studio, vLLM… | `llama3.2` |

Los proveedores pueden ser **globales** (definidos por el admin) o **personales** (de cada usuario), y las claves de API se cifran con **AES-256-GCM**. Configúralos en *Configuración → IA → Añadir* y usa **Probar** para validar la conexión antes de guardar.

> [!TIP]
> Con Ollama o LM Studio corriendo en tu máquina y openRSS en Docker, usa la base URL `http://host.docker.internal:11434/v1` (Ollama) o `http://host.docker.internal:1234/v1` (LM Studio).

<br>

## Instalación

> [!NOTE]
> **Para agentes automatizados:** sigue los pasos abajo en orden. Todos los comandos asumen un terminal con Git y Docker (Compose v2) — o Node.js 22.12+ para desarrollo local.

### Inicio rápido — Docker + SQLite

> Requiere Docker 24+ y Docker Compose v2.

```bash
git clone https://github.com/CariSoftwareBR/openRSS.git
cd openRSS
docker compose up -d --build
```

Espera 30–60 segundos y comprueba que está en marcha:

```bash
curl -sf http://localhost:8285/api/health
```

Después:

1. Abre **http://localhost:8285/setup**
2. Introduce el token de instalación que aparece en el log (`docker compose logs openrss`), elige **SQLite** y completa el asistente
3. Crea la cuenta de administrador en **http://localhost:8285/register**
4. Inicia sesión en **http://localhost:8285/login** — y añade feeds por la URL del sitio o importa un OPML

Los datos persisten en el volumen Docker `openrss-data` (`/data/config.json` y `/data/openrss.db`).

### Otras formas de instalar

<details>
<summary><b>Docker + PostgreSQL integrado</b> — para instancias más grandes</summary>

<br>

El asistente `/setup` se omite porque `DATABASE_URL` ya está definida.

**Linux / macOS**

```bash
git clone https://github.com/CariSoftwareBR/openRSS.git
cd openRSS
export POSTGRES_PASSWORD=$(openssl rand -hex 32)
docker compose -f docker-compose.postgres.yml up -d --build
curl -sf http://localhost:8285/api/health
```

**Windows (PowerShell)**

```powershell
git clone https://github.com/CariSoftwareBR/openRSS.git
cd openRSS
$env:POSTGRES_PASSWORD = -join ((48..57 + 65..70) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
docker compose -f docker-compose.postgres.yml up -d --build
curl http://localhost:8285/api/health
```

Después crea el admin en http://localhost:8285/register.

> [!IMPORTANT]
> `POSTGRES_PASSWORD` no tiene valor predeterminado — Compose se detiene antes de iniciar si no está definida.

</details>

<details>
<summary><b>Imagen prepublicada (GHCR)</b> — sin build local</summary>

<br>

El repositorio sigue siendo necesario para los archivos `docker-compose*.yml`. Imagen publicada:

```
ghcr.io/carisoftwarebr/openrss:latest
```

En el servicio `openrss` del compose, reemplaza `build: .` por `image: ghcr.io/carisoftwarebr/openrss:latest`. En producción, prefiere la etiqueta inmutable `sha-<commit completo>`.

</details>

<details>
<summary><b>Desarrollo local</b> — Node.js 22.12+ y npm 10+</summary>

<br>

```bash
git clone https://github.com/CariSoftwareBR/openRSS.git
cd openRSS
cp .env.example .env
npm ci
npm run dev
```

- La app abre en http://localhost:3000 (dev usa el puerto 3000; Docker usa 8285)
- Sin `DATABASE_URL` en `.env`, el asistente aparece en `/setup`

Más detalles en la [guía para desarrolladores](docs/DEVELOPMENT.md).

</details>

### Después de instalar

1. Verifica la salud en `GET /api/health`
2. Inicia sesión en `/login`
3. Añade feeds por la URL del sitio o importa un OPML
4. Configura la IA en *Configuración → IA → Añadir → Probar*

<br>

## Configuración

Todas las variables son **opcionales** y tienen precedencia sobre `config.json`.

<details>
<summary><b>General</b></summary>

<br>

| Variable | Predeterminado | Descripción |
|---|---|---|
| `OPENRSS_DATA_DIR` | `/data` (Docker) · `./data` (dev) | Carpeta con `config.json` y la base SQLite |
| `APP_SECRET` | generado en el 1.er arranque | Mín. 16 caracteres; protege sesiones y cifra claves de IA |
| `BETTER_AUTH_URL` | `http://localhost:8285` (Docker) | URL pública de la app |
| `DATABASE_URL` | — | Definir para omitir el asistente (`file:...` o `postgresql://...`) |
| `DATABASE_PROVIDER` | inferido | `sqlite` o `postgresql` |
| `ALLOW_PRIVATE_FEEDS` | `false` | Permite feeds en IPs privadas/localhost (ej.: RSS-Bridge) |
| `ALLOW_PRIVATE_WEBHOOKS` | `false` | Permite notificaciones de reglas a IPs privadas/localhost (ej.: ntfy en la red local) |
| `DISABLE_SCHEDULER` | `false` | Desactiva el planificador interno |

</details>

<details>
<summary><b>Inicio de sesión único (OIDC)</b></summary>

<br>

| Variable | Predeterminado | Descripción |
|---|---|---|
| `OIDC_ISSUER` | — | Emisor OIDC (ej.: `https://auth.ejemplo.com/realms/casa`). Callback: `<BETTER_AUTH_URL>/api/auth/callback/oidc` |
| `OIDC_DISCOVERY_URL` | — | Alternativa a `OIDC_ISSUER`: URL completa de `.well-known/openid-configuration` |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | — | Credenciales del cliente en el proveedor (Authentik, Authelia, Keycloak…) |
| `OIDC_PROVIDER_NAME` | `SSO` | Nombre en el botón “Entrar con …” |
| `OIDC_SCOPES` | `openid email profile` | Scopes solicitados |
| `OIDC_AUTO_REGISTER` | `true` | Crea cuenta para quien el proveedor autentique; con `false`, se aplica el “registro abierto” de la instancia |
| `OIDC_DISABLE_PASSWORD_LOGIN` | `false` | Solo SSO: oculta y desactiva el inicio de sesión con contraseña |

</details>

<details>
<summary><b>Correo (SMTP)</b></summary>

<br>

| Variable | Predeterminado | Descripción |
|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` | — / `587` | Servidor de correo para restablecer contraseñas y enviar el digest (puerto 465 = TLS directo) |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Credenciales SMTP (opcionales) |
| `SMTP_FROM` | `SMTP_USER` | Remitente, ej.: `openRSS <noreply@ejemplo.com>` |

</details>

<details>
<summary><b>Solución de problemas</b></summary>

<br>

| Problema | Acción |
|---|---|
| El contenedor no arranca | `docker compose logs -f openrss` |
| El asistente `/setup` no aparece | `DATABASE_URL` ya definida o base configurada en `config.json` |
| Feeds locales (RSS-Bridge) no funcionan | Define `ALLOW_PRIVATE_FEEDS=true` |
| IA local en Docker no conecta | Usa `host.docker.internal` en la base URL |

</details>

<br>

## Hecho con

<p>
  <img src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind_CSS_4-0f172a?style=flat-square&logo=tailwindcss&logoColor=38bdf8" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/Prisma_7-2d3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma 7">
  <img src="https://img.shields.io/badge/Better_Auth-111111?style=flat-square" alt="Better Auth">
  <img src="https://img.shields.io/badge/AI_SDK_7-111111?style=flat-square&logo=vercel&logoColor=white" alt="AI SDK 7">
</p>

¿Quieres contribuir? Empieza por la [guía para desarrolladores](docs/DEVELOPMENT.md).

<br>

---

<div align="center">

<sub>Distribuido bajo la <a href="LICENSE">Apache License 2.0</a> · <a href="NOTICE">NOTICE</a></sub>

<br><br>

<a href="https://buymeacoffee.com/pcarinhena"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>

<br>

<sub>¿Te gusta openRSS? Una ⭐ en el repositorio ayuda mucho.</sub>

</div>
