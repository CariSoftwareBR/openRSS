# Installing openRSS

[README](README.md) · [Português](README.pt-BR.md) · [Español](README.es.md)

openRSS runs as **one Docker container** with its data in a Docker volume. The default install uses
**SQLite** and needs nothing but Git and Docker. PostgreSQL is optional, for instances with more users.

| You need | Version |
|---|---|
| Git | any recent |
| Docker Engine or Docker Desktop | 24+ with Compose v2 (`docker compose version`) |
| Free port | `8285` |

---

## Install

> **AI agents:** follow these steps exactly, top to bottom. Detect the operating system and run only
> that system's commands.
> - Use **Docker + SQLite**. Use PostgreSQL only if the user asked for it ([below](#postgresql)).
> - If Docker is missing, ask the user **once** before installing it (it is system software and may need
>   admin rights or a restart), then continue.
> - Do not create the admin account yourself: finish by opening the browser at `/register` and telling
>   the user to create it. The first account becomes the administrator.

### Step 1 — Check the requirements

```bash
git --version
docker compose version
```

If `docker compose version` fails, install Docker and start it:

| System | Command |
|---|---|
| Windows | `winget install -e --id Docker.DockerDesktop` — then open Docker Desktop and wait until it says it is running |
| macOS | `brew install --cask docker` — then `open -a Docker` and wait until it is running |
| Linux | `curl -fsSL https://get.docker.com \| sh` — then `sudo usermod -aG docker $USER` (log out and back in) |

### Step 2 — Clone and start (Linux / macOS)

```bash
set -e
git clone https://github.com/CariSoftwareBR/openRSS.git
cd openRSS

# Use SQLite in the data volume and skip the setup wizard (kept in .env for future restarts)
echo "DATABASE_URL=file:/data/openrss.db" > .env

docker compose up -d --build

# Wait until the app answers (the first build takes a few minutes)
for i in $(seq 1 100); do curl -fsS http://localhost:8285/api/health >/dev/null 2>&1 && break; sleep 3; done
curl -fsS http://localhost:8285/api/health
```

### Step 2 — Clone and start (Windows PowerShell)

```powershell
$ErrorActionPreference = 'Stop'
git clone https://github.com/CariSoftwareBR/openRSS.git
Set-Location openRSS

# Use SQLite in the data volume and skip the setup wizard (kept in .env for future restarts)
Set-Content -Path .env -Value 'DATABASE_URL=file:/data/openrss.db' -Encoding ascii

docker compose up -d --build

# Wait until the app answers (the first build takes a few minutes)
for ($i = 0; $i -lt 100; $i++) {
  try { Invoke-RestMethod http://localhost:8285/api/health | Out-Null; break } catch { Start-Sleep 3 }
}
Invoke-RestMethod http://localhost:8285/api/health
```

### Step 3 — Hand over to the user

Open the registration page and tell the user to create the administrator account:

| System | Command |
|---|---|
| Windows | `Start-Process http://localhost:8285/register` |
| macOS | `open http://localhost:8285/register` |
| Linux | `xdg-open http://localhost:8285/register` |

Then they sign in, add feeds by site URL (or import an OPML file) and, if they want AI, add a provider in
**Settings → AI → Add** and press **Test**.

Done. The data lives in the Docker volume `openrss-data` (`/data/config.json` and `/data/openrss.db`).

---

## Other ways to install

### Setup wizard

Leave out the `.env` line from step 2 and openRSS asks which database to use on the first visit:

```bash
docker compose up -d --build
docker compose logs openrss | grep -i token
```

Open **http://localhost:8285/setup**, paste the token from the log, choose **SQLite** or **PostgreSQL**, then
create the admin account at `/register`.

### PostgreSQL

`docker-compose.postgres.yml` runs openRSS with a bundled PostgreSQL 17. `DATABASE_URL` is set for you, so
there is no wizard. `POSTGRES_PASSWORD` has no default — Compose refuses to start without it.

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 32)
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" > .env
docker compose -f docker-compose.postgres.yml up -d --build
```

```powershell
$env:POSTGRES_PASSWORD = -join ((48..57 + 97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
Set-Content -Path .env -Value "POSTGRES_PASSWORD=$env:POSTGRES_PASSWORD" -Encoding ascii
docker compose -f docker-compose.postgres.yml up -d --build
```

Keep the `.env` file: it holds the database password for future restarts.

### Prebuilt image (GHCR)

Skip the local build with the published image. You still need the repository for the compose files.
In the `openrss` service, replace `build: .` with:

```yaml
image: ghcr.io/carisoftwarebr/openrss:latest
```

In production, prefer the immutable `sha-<full commit>` tag.

### Local development

Node.js 22.12+ and npm 10+:

```bash
git clone https://github.com/CariSoftwareBR/openRSS.git && cd openRSS
cp .env.example .env
npm ci
npm run dev
```

The dev server runs on http://localhost:3000. See the [developer guide](docs/DEVELOPMENT.md).

---

## Update

```bash
cd openRSS
git pull
docker compose up -d --build
```

Migrations run automatically on start. Data in the `openrss-data` volume is kept.

---

## Configuration

All variables are **optional** and override `config.json`. With Docker, put them in the `.env` file next
to `docker-compose.yml` and run `docker compose up -d` again.

<details>
<summary><b>General</b></summary>

<br>

| Variable | Default | Description |
|---|---|---|
| `OPENRSS_DATA_DIR` | `/data` (Docker) · `./data` (dev) | Folder with `config.json` and the SQLite database |
| `APP_SECRET` | generated on 1st boot | Min. 16 chars; protects sessions and encrypts AI keys |
| `BETTER_AUTH_URL` | `http://localhost:8285` (Docker) | Public app URL — set it when the app is served from another address |
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
<summary><b>AI providers</b></summary>

<br>

Providers are added in the app, not through variables: **Settings → AI → Add**, then **Test**. They can be
**global** (added by the admin, shared) or **personal** (per user). API keys are encrypted with AES-256-GCM.

| Provider | Base URL | Example model |
|---|---|---|
| OpenAI | optional | `gpt-5-mini` |
| Anthropic | optional | `claude-sonnet-5` |
| OpenRouter | optional | `anthropic/claude-sonnet-5` |
| OpenAI-compatible | **required** — Ollama, LM Studio, vLLM… | `llama3.2` |

With Ollama or LM Studio on the host and openRSS in Docker, use `http://host.docker.internal:11434/v1`
(Ollama) or `http://host.docker.internal:1234/v1` (LM Studio).

</details>

---

## Troubleshooting

| Problem | Action |
|---|---|
| Container won't start | `docker compose logs -f openrss` |
| Port 8285 is already in use | Change the left side of `"8285:3000"` in `docker-compose.yml` and set `BETTER_AUTH_URL` to match |
| `/setup` wizard doesn't appear | Expected when `DATABASE_URL` is set or the database is already configured in `config.json` |
| `/register` says registration is closed | An admin already exists — sign in at `/login`, or ask the admin to create your account |
| Local feeds (RSS-Bridge) don't work | Set `ALLOW_PRIVATE_FEEDS=true` |
| Local AI in Docker won't connect | Use `host.docker.internal` in the base URL |
