<div align="center">

<img src="public/icons/icon-512.png" alt="openRSS" width="104" height="104">

<h1>openRSS</h1>

<p><strong>Your feeds, your AI, your server.</strong><br>
A fast, quiet, self-hosted RSS reader — with AI that works for you.</p>

<p>
  <a href="https://github.com/CariSoftwareBR/openRSS/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/CariSoftwareBR/openRSS/ci.yml?branch=main&style=flat-square&label=CI&labelColor=1b3d63&color=2f6fa5" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-2f6fa5?style=flat-square&labelColor=1b3d63" alt="Apache 2.0 license"></a>
  <a href="https://github.com/CariSoftwareBR/openRSS/pkgs/container/openrss"><img src="https://img.shields.io/badge/ghcr.io-openrss-2f6fa5?style=flat-square&logo=docker&logoColor=white&labelColor=1b3d63" alt="GHCR image"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2022.12-2f6fa5?style=flat-square&logo=node.js&logoColor=white&labelColor=1b3d63" alt="Node.js 22.12+">
</p>

<p>
  <a href="#features">Features</a>
  &nbsp;·&nbsp;
  <a href="#artificial-intelligence">AI</a>
  &nbsp;·&nbsp;
  <a href="#installation">Installation</a>
  &nbsp;·&nbsp;
  <a href="#configuration">Configuration</a>
  &nbsp;·&nbsp;
  <a href="docs/DEVELOPMENT.md">Development</a>
</p>

<p><sub><a href="README.md">Português</a> &nbsp;·&nbsp; <b>English</b> &nbsp;·&nbsp; <a href="README.es.md">Español</a></sub></p>

<br>

<img src="docs/screenshots/reader.png" alt="openRSS article reader with full-text mode and AI summary" width="100%">

</div>

<br>

## Why openRSS?

Inspired by Feedly, but truly yours. openRSS runs in **a single container**, keeps everything in **SQLite** (or **PostgreSQL** when you need scale) and talks to **any AI** — OpenAI, Anthropic, OpenRouter, or local models via Ollama, LM Studio and vLLM.

Built for small instances — you and whoever you invite (up to ~5 concurrent users on SQLite).

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>📖 Noise-free reading</h3>
      Full article mode, an AI-prioritized <i>Today</i> view, and duplicate stories grouped automatically.
    </td>
    <td width="33%" valign="top">
      <h3>✨ AI that actually helps</h3>
      Summaries, questions about the article, semantic search, a daily digest, and a chat that reads your feeds for you.
    </td>
    <td width="33%" valign="top">
      <h3>🔒 Your data, your home</h3>
      Self-hosted, OIDC sign-in, encrypted API keys, and compatible with the apps you already use.
    </td>
  </tr>
</table>

<br>

## Features

### Reading

- **Views** — Today (AI-prioritized), All, Saved, folders, and individual feeds
- **Layouts** — cards, grid, or titles only
- **Full article mode** with Readability, plus instant search
- **Story grouping** — the same event from different feeds shows up as “+N sources”; reading one marks the others as read
- **Native apps** through the Google Reader and Fever APIs — NetNewsWire, Reeder, ReadYou, FluentReader, Unread… (app passwords in *Settings → Apps*)
- **Installable PWA** on phone and desktop, with offline reading of saved and recently read articles
- **Keyboard shortcuts** — <kbd>j</kbd> <kbd>k</kbd> navigate · <kbd>o</kbd> open · <kbd>m</kbd> mark read · <kbd>s</kbd> save · <kbd>Shift</kbd>+<kbd>A</kbd> mark all · <kbd>/</kbd> search

### Feeds

- **Automatic discovery** from a website URL — RSS, Atom, and RDF
- **Background refresh** with ETag/Last-Modified and error backoff
- **OPML** import and export
- **Read later** — save any link (text extracted in reader mode) from the button in Saved, a bookmarklet, or the phone's Share menu
- **Tags** to organize saved articles
- **Automatic rules** by title, content, author, URL, or AI score: mark as read, save, highlight, or notify via ntfy, Discord, Slack, Telegram, or webhook
- **Feed health** (*Settings → Health*) — failing, stale, rarely read, or overly active feeds, with bulk cleanup
- **Configurable** article retention

### Users & appearance

- **Authentication** with email and password (Better Auth) or **OIDC single sign-on** (Authentik, Authelia, Keycloak…), with linking of existing accounts
- **The first signup becomes administrator**; open or closed registration, and the admin can create users
- **Light and dark themes** — see the design system in [`docs/design/`](docs/design/)

<br>

## Artificial intelligence

<img src="docs/screenshots/chat.png" alt="AI chat that searches and reads articles from your feeds" width="100%">

<p align="center"><sub>Chat with your feeds — the AI searches and reads articles for you.</sub></p>

| | What the AI does |
|:---:|---|
| 📝 | **Summarizes articles** with streaming and caching |
| 💬 | **Answers questions** about the article, right in the reader |
| 🔎 | **Semantic search** by topic in lists and chat, using embeddings from a global provider |
| 📬 | **Daily digest** of unread articles, grouped by topic — automatic, on demand, or by email |
| 🧭 | **Chat with your feeds** — the AI searches and reads articles via tools |
| ⭐ | **Prioritizes** new articles with a 0–100 score based on your interests |

### Supported providers

| Provider | Base URL | Example model |
|---|---|---|
| OpenAI | optional | `gpt-5-mini` |
| Anthropic | optional | `claude-sonnet-5` |
| OpenRouter | optional | `anthropic/claude-sonnet-5` |
| OpenAI-compatible | **required** — Ollama, LM Studio, vLLM… | `llama3.2` |

Providers can be **global** (set by the admin) or **personal** (per user), and API keys are encrypted with **AES-256-GCM**. Configure them at *Settings → AI → Add* and use **Test** to validate the connection before saving.

> [!TIP]
> With Ollama or LM Studio running on your machine and openRSS in Docker, use the base URL `http://host.docker.internal:11434/v1` (Ollama) or `http://host.docker.internal:1234/v1` (LM Studio).

<br>

## Installation

> [!NOTE]
> **For automated agents:** follow the steps below in order. All commands assume a terminal with Git and Docker (Compose v2) — or Node.js 22.12+ for local development.

### Quick start — Docker + SQLite

> Requires Docker 24+ and Docker Compose v2.

```bash
git clone https://github.com/CariSoftwareBR/openRSS.git
cd openRSS
docker compose up -d --build
```

Wait 30–60 seconds and check that it's up:

```bash
curl -sf http://localhost:8285/api/health
```

Then:

1. Open **http://localhost:8285/setup**
2. Enter the setup token printed in the log (`docker compose logs openrss`), choose **SQLite**, and complete the wizard
3. Create the admin account at **http://localhost:8285/register**
4. Sign in at **http://localhost:8285/login** — and add feeds by website URL or import an OPML file

Data persists in the Docker volume `openrss-data` (`/data/config.json` and `/data/openrss.db`).

### Other ways to install

<details>
<summary><b>Docker + bundled PostgreSQL</b> — for larger instances</summary>

<br>

The `/setup` wizard is skipped because `DATABASE_URL` is preconfigured.

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

Then create the admin at http://localhost:8285/register.

> [!IMPORTANT]
> `POSTGRES_PASSWORD` has no default — Compose stops before starting if it is not set.

</details>

<details>
<summary><b>Pre-built image (GHCR)</b> — no local build</summary>

<br>

You still need the repository for the `docker-compose*.yml` files. Published image:

```
ghcr.io/carisoftwarebr/openrss:latest
```

In the compose `openrss` service, replace `build: .` with `image: ghcr.io/carisoftwarebr/openrss:latest`. In production, prefer the immutable `sha-<full commit>` tag.

</details>

<details>
<summary><b>Local development</b> — Node.js 22.12+ and npm 10+</summary>

<br>

```bash
git clone https://github.com/CariSoftwareBR/openRSS.git
cd openRSS
cp .env.example .env
npm ci
npm run dev
```

- The app runs at http://localhost:3000 (dev uses port 3000; Docker uses 8285)
- Without `DATABASE_URL` in `.env`, the wizard shows up at `/setup`

More in the [developer guide](docs/DEVELOPMENT.md).

</details>

### After installing

1. Check health at `GET /api/health`
2. Sign in at `/login`
3. Add feeds by website URL or import an OPML file
4. Configure AI at *Settings → AI → Add → Test*

<br>

## Configuration

All variables are **optional** and override `config.json`.

<details>
<summary><b>General</b></summary>

<br>

| Variable | Default | Description |
|---|---|---|
| `OPENRSS_DATA_DIR` | `/data` (Docker) · `./data` (dev) | Folder with `config.json` and the SQLite database |
| `APP_SECRET` | generated on 1st boot | Min. 16 chars; protects sessions and encrypts AI keys |
| `BETTER_AUTH_URL` | `http://localhost:8285` (Docker) | Public app URL |
| `DATABASE_URL` | — | Set to skip the wizard (`file:...` or `postgresql://...`) |
| `DATABASE_PROVIDER` | inferred | `sqlite` or `postgresql` |
| `ALLOW_PRIVATE_FEEDS` | `false` | Allow feeds on private/localhost IPs (e.g. RSS-Bridge) |
| `ALLOW_PRIVATE_WEBHOOKS` | `false` | Allow rule notifications to private/localhost IPs (e.g. ntfy on your LAN) |
| `DISABLE_SCHEDULER` | `false` | Disable the internal scheduler |

</details>

<details>
<summary><b>Single sign-on (OIDC)</b></summary>

<br>

| Variable | Default | Description |
|---|---|---|
| `OIDC_ISSUER` | — | OIDC issuer (e.g. `https://auth.example.com/realms/home`). Callback: `<BETTER_AUTH_URL>/api/auth/callback/oidc` |
| `OIDC_DISCOVERY_URL` | — | Alternative to `OIDC_ISSUER`: full `.well-known/openid-configuration` URL |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | — | Client credentials at the provider (Authentik, Authelia, Keycloak…) |
| `OIDC_PROVIDER_NAME` | `SSO` | Name on the “Sign in with …” button |
| `OIDC_SCOPES` | `openid email profile` | Requested scopes |
| `OIDC_AUTO_REGISTER` | `true` | Create an account for anyone the provider authenticates; with `false`, the instance's open-registration setting applies |
| `OIDC_DISABLE_PASSWORD_LOGIN` | `false` | SSO only: hides and disables password sign-in |

</details>

<details>
<summary><b>Email (SMTP)</b></summary>

<br>

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` | — / `587` | Mail server for password resets and the email digest (port 465 = implicit TLS) |
| `SMTP_USER` / `SMTP_PASSWORD` | — | SMTP credentials (optional) |
| `SMTP_FROM` | `SMTP_USER` | Sender, e.g. `openRSS <noreply@example.com>` |

</details>

<details>
<summary><b>Troubleshooting</b></summary>

<br>

| Problem | Action |
|---|---|
| Container won't start | `docker compose logs -f openrss` |
| `/setup` wizard doesn't appear | `DATABASE_URL` already set or database configured in `config.json` |
| Local feeds (RSS-Bridge) don't work | Set `ALLOW_PRIVATE_FEEDS=true` |
| Local AI in Docker won't connect | Use `host.docker.internal` in the base URL |

</details>

<br>

## Built with

<p>
  <img src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind_CSS_4-0f172a?style=flat-square&logo=tailwindcss&logoColor=38bdf8" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/Prisma_7-2d3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma 7">
  <img src="https://img.shields.io/badge/Better_Auth-111111?style=flat-square" alt="Better Auth">
  <img src="https://img.shields.io/badge/AI_SDK_7-111111?style=flat-square&logo=vercel&logoColor=white" alt="AI SDK 7">
</p>

Want to contribute? Start with the [developer guide](docs/DEVELOPMENT.md).

<br>

---

<div align="center">

<sub>Released under the <a href="LICENSE">Apache License 2.0</a> · <a href="NOTICE">NOTICE</a></sub>

<br><br>

<a href="https://buymeacoffee.com/pcarinhena"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>

<br>

<sub>Enjoying openRSS? A ⭐ on the repo goes a long way.</sub>

</div>
