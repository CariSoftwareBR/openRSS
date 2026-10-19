<div align="center">

<img src="public/icons/icon-512.png" alt="openRSS" width="104" height="104">

<h1>openRSS</h1>

<p><strong>Seus feeds, sua IA, seu servidor.</strong><br>
Um leitor RSS self-hosted, rápido e silencioso — com inteligência artificial que trabalha a seu favor.</p>

<p>
  <a href="https://github.com/CariSoftwareBR/openRSS/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/CariSoftwareBR/openRSS/ci.yml?branch=main&style=flat-square&label=CI&labelColor=1b3d63&color=2f6fa5" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licença-Apache%202.0-2f6fa5?style=flat-square&labelColor=1b3d63" alt="Licença Apache 2.0"></a>
  <a href="https://github.com/CariSoftwareBR/openRSS/pkgs/container/openrss"><img src="https://img.shields.io/badge/ghcr.io-openrss-2f6fa5?style=flat-square&logo=docker&logoColor=white&labelColor=1b3d63" alt="Imagem no GHCR"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2022.12-2f6fa5?style=flat-square&logo=node.js&logoColor=white&labelColor=1b3d63" alt="Node.js 22.12+">
</p>

<p>
  <a href="#recursos">Recursos</a>
  &nbsp;·&nbsp;
  <a href="#inteligência-artificial">IA</a>
  &nbsp;·&nbsp;
  <a href="#instalação">Instalação</a>
  &nbsp;·&nbsp;
  <a href="#configuração">Configuração</a>
  &nbsp;·&nbsp;
  <a href="docs/DEVELOPMENT.md">Desenvolvimento</a>
</p>

<p><sub><b>Português</b> &nbsp;·&nbsp; <a href="README.en.md">English</a> &nbsp;·&nbsp; <a href="README.es.md">Español</a></sub></p>

<br>

<img src="docs/screenshots/reader.png" alt="Leitor de artigos do openRSS com modo artigo completo e resumo por IA" width="100%">

</div>

<br>

## Por que openRSS?

Inspirado no Feedly, mas seu de verdade. O openRSS roda em **um único container**, guarda tudo em **SQLite** (ou **PostgreSQL**, se precisar de escala) e conversa com **qualquer IA** — OpenAI, Anthropic, OpenRouter ou modelos locais via Ollama, LM Studio e vLLM.

Pensado para instâncias pequenas, de você e de quem você quiser convidar (até ~5 usuários simultâneos com SQLite).

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>📖 Leitura sem ruído</h3>
      Modo artigo completo, visão <i>Hoje</i> priorizada por IA e notícias repetidas agrupadas automaticamente.
    </td>
    <td width="33%" valign="top">
      <h3>✨ IA de verdade útil</h3>
      Resumos, perguntas sobre o artigo, busca semântica, digest diário e um chat que lê seus feeds por você.
    </td>
    <td width="33%" valign="top">
      <h3>🔒 Seus dados, sua casa</h3>
      Self-hosted, login via OIDC, chaves de API criptografadas e compatível com os apps que você já usa.
    </td>
  </tr>
</table>

<br>

## Recursos

### Leitura

- **Visões** Hoje (priorizada por IA), Todos, Salvos, pastas e feeds individuais
- **Layouts** em cartões, grade ou só títulos
- **Modo artigo completo** com Readability e busca instantânea
- **Agrupamento de notícias** — o mesmo fato vindo de feeds diferentes aparece como “+N fontes”; ler uma marca as outras como lidas
- **Apps nativos** via APIs Google Reader e Fever — NetNewsWire, Reeder, ReadYou, FluentReader, Unread… (senhas de aplicativo em *Configurações → Apps*)
- **PWA instalável** no celular e no desktop, com leitura offline dos artigos salvos e lidos recentemente
- **Atalhos de teclado** — <kbd>j</kbd> <kbd>k</kbd> navegar · <kbd>o</kbd> abrir · <kbd>m</kbd> marcar lido · <kbd>s</kbd> salvar · <kbd>Shift</kbd>+<kbd>A</kbd> marcar todos · <kbd>/</kbd> buscar

### Feeds

- **Descoberta automática** a partir da URL do site — RSS, Atom e RDF
- **Atualização em segundo plano** com ETag/Last-Modified e backoff em erros
- **OPML** para importar e exportar
- **Ler depois** — salve qualquer link (texto extraído em modo leitura) pelo botão em Salvos, bookmarklet ou menu Compartilhar do celular
- **Tags** para organizar os artigos salvos
- **Regras automáticas** por título, conteúdo, autor, URL ou nota da IA: marcar como lido, salvar, destacar ou notificar via ntfy, Discord, Slack, Telegram ou webhook
- **Saúde dos feeds** (*Configurações → Saúde*) — feeds com erro, parados, pouco lidos ou ativos demais, com limpeza em lote
- **Retenção** de artigos configurável

### Usuários & aparência

- **Autenticação** por e-mail e senha (Better Auth) ou **login único OIDC** (Authentik, Authelia, Keycloak…), com vinculação de contas existentes
- **O primeiro cadastro vira administrador**; cadastro aberto ou fechado, e o admin pode criar usuários
- **Temas claro e escuro** — veja o design system em [`docs/design/`](docs/design/)

<br>

## Inteligência artificial

<img src="docs/screenshots/chat.png" alt="Chat com IA que busca e lê artigos dos seus feeds" width="100%">

<p align="center"><sub>Converse com seus feeds — a IA busca e lê os artigos por você.</sub></p>

| | O que a IA faz |
|:---:|---|
| 📝 | **Resume artigos** em streaming, com cache |
| 💬 | **Responde perguntas** sobre o artigo, direto no leitor |
| 🔎 | **Busca semântica** por assunto nas listas e no chat, com embeddings de um provedor global |
| 📬 | **Digest diário** dos não lidos, agrupado por tema — automático, sob demanda ou por e-mail |
| 🧭 | **Chat com seus feeds** — a IA busca e lê artigos via ferramentas |
| ⭐ | **Prioriza** artigos novos com uma nota de 0 a 100 baseada nos seus interesses |

### Provedores suportados

| Provedor | Base URL | Exemplo de modelo |
|---|---|---|
| OpenAI | opcional | `gpt-5-mini` |
| Anthropic | opcional | `claude-sonnet-5` |
| OpenRouter | opcional | `anthropic/claude-sonnet-5` |
| OpenAI-compatible | **obrigatória** — Ollama, LM Studio, vLLM… | `llama3.2` |

Provedores podem ser **globais** (definidos pelo admin) ou **pessoais** (de cada usuário), e as chaves de API ficam criptografadas com **AES-256-GCM**. Configure em *Configurações → IA → Adicionar* e use **Testar** para validar a conexão antes de salvar.

> [!TIP]
> Com Ollama ou LM Studio rodando na máquina e o openRSS no Docker, use a base URL `http://host.docker.internal:11434/v1` (Ollama) ou `http://host.docker.internal:1234/v1` (LM Studio).

<br>

## Instalação

> [!NOTE]
> **Para agentes automatizados:** siga os passos abaixo na ordem. Todos os comandos assumem um terminal com Git e Docker (Compose v2) — ou Node.js 22.12+ para desenvolvimento local.

### Início rápido — Docker + SQLite

> Requer Docker 24+ e Docker Compose v2.

```bash
git clone https://github.com/CariSoftwareBR/openRSS.git
cd openRSS
docker compose up -d --build
```

Aguarde 30–60 segundos e confira se está no ar:

```bash
curl -sf http://localhost:8285/api/health
```

Depois, é só seguir:

1. Abra **http://localhost:8285/setup**
2. Informe o token de instalação exibido no log (`docker compose logs openrss`), escolha **SQLite** e conclua o assistente
3. Crie a conta de administrador em **http://localhost:8285/register**
4. Entre em **http://localhost:8285/login** — e adicione seus feeds pela URL do site ou importe um OPML

Os dados ficam no volume Docker `openrss-data` (`/data/config.json` e `/data/openrss.db`).

### Outras formas de instalar

<details>
<summary><b>Docker + PostgreSQL embutido</b> — para instâncias com mais usuários</summary>

<br>

O assistente `/setup` é pulado porque `DATABASE_URL` já vem definida.

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

Depois crie o admin em http://localhost:8285/register.

> [!IMPORTANT]
> `POSTGRES_PASSWORD` não possui valor padrão — o Compose interrompe antes de subir se ela não for definida.

</details>

<details>
<summary><b>Imagem pré-publicada (GHCR)</b> — sem build local</summary>

<br>

O repositório ainda é necessário para os arquivos `docker-compose*.yml`. A imagem publicada fica em:

```
ghcr.io/carisoftwarebr/openrss:latest
```

No serviço `openrss` do compose, substitua `build: .` por `image: ghcr.io/carisoftwarebr/openrss:latest`. Em produção, prefira a tag imutável `sha-<commit completo>`.

</details>

<details>
<summary><b>Desenvolvimento local</b> — Node.js 22.12+ e npm 10+</summary>

<br>

```bash
git clone https://github.com/CariSoftwareBR/openRSS.git
cd openRSS
cp .env.example .env
npm ci
npm run dev
```

- O app abre em http://localhost:3000 (dev usa a porta 3000; Docker usa 8285)
- Sem `DATABASE_URL` no `.env`, o assistente aparece em `/setup`

Mais detalhes no [guia para desenvolvedores](docs/DEVELOPMENT.md).

</details>

### Depois de instalar

1. Verifique a saúde em `GET /api/health`
2. Entre em `/login`
3. Adicione feeds pela URL do site ou importe um OPML
4. Configure a IA em *Configurações → IA → Adicionar → Testar*

<br>

## Configuração

Todas as variáveis são **opcionais** e têm precedência sobre o `config.json`.

<details>
<summary><b>Geral</b></summary>

<br>

| Variável | Padrão | Descrição |
|---|---|---|
| `OPENRSS_DATA_DIR` | `/data` (Docker) · `./data` (dev) | Pasta com `config.json` e banco SQLite |
| `APP_SECRET` | gerado no 1º boot | Mín. 16 caracteres; protege sessões e criptografa chaves de IA |
| `BETTER_AUTH_URL` | `http://localhost:8285` (Docker) | URL pública do app |
| `DATABASE_URL` | — | Defina para pular o assistente (`file:...` ou `postgresql://...`) |
| `DATABASE_PROVIDER` | inferido | `sqlite` ou `postgresql` |
| `ALLOW_PRIVATE_FEEDS` | `false` | Permite feeds em IPs privados/localhost (ex.: RSS-Bridge) |
| `ALLOW_PRIVATE_WEBHOOKS` | `false` | Permite notificações de regras para IPs privados/localhost (ex.: ntfy na rede local) |
| `DISABLE_SCHEDULER` | `false` | Desliga o agendador interno |

</details>

<details>
<summary><b>Login único (OIDC)</b></summary>

<br>

| Variável | Padrão | Descrição |
|---|---|---|
| `OIDC_ISSUER` | — | Emissor OIDC (ex.: `https://auth.exemplo.com/realms/casa`). Callback: `<BETTER_AUTH_URL>/api/auth/callback/oidc` |
| `OIDC_DISCOVERY_URL` | — | Alternativa ao `OIDC_ISSUER`: URL completa do `.well-known/openid-configuration` |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | — | Credenciais do cliente no provedor (Authentik, Authelia, Keycloak…) |
| `OIDC_PROVIDER_NAME` | `SSO` | Nome no botão “Entrar com …” |
| `OIDC_SCOPES` | `openid email profile` | Escopos pedidos |
| `OIDC_AUTO_REGISTER` | `true` | Cria conta para quem o provedor autenticar; com `false`, vale o “cadastro aberto” da instância |
| `OIDC_DISABLE_PASSWORD_LOGIN` | `false` | Só SSO: esconde e desativa o login por senha |

</details>

<details>
<summary><b>E-mail (SMTP)</b></summary>

<br>

| Variável | Padrão | Descrição |
|---|---|---|
| `SMTP_HOST` / `SMTP_PORT` | — / `587` | Servidor de e-mail para redefinir senha e enviar o digest (porta 465 = TLS direto) |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Credenciais do SMTP (opcionais) |
| `SMTP_FROM` | `SMTP_USER` | Remetente, ex.: `openRSS <noreply@exemplo.com>` |

</details>

<details>
<summary><b>Solução de problemas</b></summary>

<br>

| Problema | Ação |
|---|---|
| Container não sobe | `docker compose logs -f openrss` |
| Assistente `/setup` não aparece | `DATABASE_URL` já definida ou banco configurado em `config.json` |
| Feeds locais (RSS-Bridge) não funcionam | Defina `ALLOW_PRIVATE_FEEDS=true` |
| IA local no Docker não conecta | Use `host.docker.internal` na base URL |

</details>

<br>

## Feito com

<p>
  <img src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb" alt="React 19">
  <img src="https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind_CSS_4-0f172a?style=flat-square&logo=tailwindcss&logoColor=38bdf8" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/Prisma_7-2d3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma 7">
  <img src="https://img.shields.io/badge/Better_Auth-111111?style=flat-square" alt="Better Auth">
  <img src="https://img.shields.io/badge/AI_SDK_7-111111?style=flat-square&logo=vercel&logoColor=white" alt="AI SDK 7">
</p>

Quer contribuir? Comece pelo [guia para desenvolvedores](docs/DEVELOPMENT.md).

<br>

---

<div align="center">

<sub>Distribuído sob a <a href="LICENSE">Apache License 2.0</a> · <a href="NOTICE">NOTICE</a></sub>

<br><br>

<a href="https://buymeacoffee.com/pcarinhena"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>

<br>

<sub>Gostou do openRSS? Uma ⭐ no repositório ajuda muito.</sub>

</div>
