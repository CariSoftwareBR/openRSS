import { parseHTML } from "linkedom";

/**
 * Regras puras (sem rede) usadas por `discoverFeeds`: extrair candidatos a feed
 * de um HTML, montar caminhos comuns e converter URLs de plataformas conhecidas.
 */

/** Caminhos testados na origem do site quando a página não anuncia feed. */
export const COMMON_PATHS = [
  "/feed",
  "/feed/",
  "/rss",
  "/rss/",
  "/rss.xml",
  "/atom.xml",
  "/feed.xml",
  "/index.xml",
  "/index.rss",
  "/?feed=rss2",
  "/feeds/posts/default",
];

/** Caminhos testados abaixo do caminho atual (ex.: `/blog/` → `/blog/feed`). */
const RELATIVE_PATHS = ["feed", "feed/", "rss", "rss.xml", "atom.xml", "feed.xml", "index.xml"];

const FEED_TYPE = /(rss|atom|feed)\+xml|application\/(rss|atom|feed)|text\/xml/i;
const FEED_HREF = /\.(rss|atom|xml)(?:[?#]|$)|[/.](rss2?|atom|feeds?)(?:[/.?#]|$)|[?&]feed=|\/rss[\w-]*\.\w+(?:[?#]|$)/i;
const FEED_TEXT = /\b(rss|atom|feeds?)\b/i;
// Links que contêm "feed"/"xml" mas nunca são feeds (sitemaps, leitores de terceiros, redes sociais).
const NOT_FEED_HOST = /(^|\.)(feedly|inoreader|newsblur|facebook|twitter|x|instagram|linkedin|whatsapp|threads|tiktok)\.com$|^wa\.me$|^t\.me$/i;
const NOT_FEED_PATH = /sitemap|\/wp-json\/|\/oembed|\/xmlrpc/i;
// Texto de link longo é manchete, não um link "RSS"/"Feeds".
const MAX_LINK_TEXT = 40;

function isNotFeed(url: string): boolean {
  const { hostname, pathname, search } = new URL(url);
  return NOT_FEED_HOST.test(hostname) || NOT_FEED_PATH.test(pathname + search);
}

export type HtmlCandidates = {
  /** `<link rel="alternate">` com tipo de feed: o próprio site diz que são feeds. */
  alternates: string[];
  /** `<a>` cujo href parece de feed (`/feed`, `.xml`, `?feed=rss2`…). */
  anchors: string[];
  /** `<a>` que só o texto liga a feeds ("RSS", "Feeds"): provável página que lista feeds. */
  pages: string[];
};

/** Aproxima o "site" de um host pelos dois últimos rótulos (três em domínios como .com.br). */
function siteKey(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/^www\./, "").split(".");
  const take = labels.length > 2 && /^(com|net|org|gov|edu|co|ac)$/.test(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-take).join(".");
}

function resolve(href: string | null, base: string): string | null {
  if (!href) return null;
  const value = href.trim();
  if (!value || /^(javascript|mailto|tel|data):/i.test(value) || value.startsWith("#")) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/** Extrai candidatos a feed de um HTML, na ordem em que aparecem. */
export function extractFeedCandidates(html: string, baseUrl: string): HtmlCandidates {
  const { document } = parseHTML(html);
  const base = resolve(document.querySelector("base[href]")?.getAttribute("href") ?? null, baseUrl) ?? baseUrl;

  const alternates = new Set<string>();
  for (const link of document.querySelectorAll('link[rel~="alternate"], link[rel~="feed"]')) {
    const type = link.getAttribute("type") ?? "";
    const rel = (link.getAttribute("rel") ?? "").toLowerCase();
    const url = resolve(link.getAttribute("href"), base);
    if (!url || isNotFeed(url)) continue;
    if (FEED_TYPE.test(type) || (rel.split(/\s+/).includes("feed") && !type)) alternates.add(url);
  }

  const anchors = new Set<string>();
  const pages = new Set<string>();
  for (const a of document.querySelectorAll("a[href]")) {
    const url = resolve(a.getAttribute("href"), base);
    if (!url || isNotFeed(url) || alternates.has(url)) continue;
    const text = [a.textContent, a.getAttribute("title"), a.getAttribute("aria-label")]
      .map((t) => (t ?? "").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 0 && t.length <= MAX_LINK_TEXT)
      .join(" ");
    const { pathname, search } = new URL(url);
    if (FEED_TYPE.test(a.getAttribute("type") ?? "") || FEED_HREF.test(pathname + search)) anchors.add(url);
    else if (FEED_TEXT.test(text) && url !== baseUrl) pages.add(url);
  }

  // Ordem: feeds do próprio site antes de links para outros sites (blogroll, parceiros);
  // comentários do WordPress ("…/comments/feed/") por último: raramente é o que se quer.
  const site = siteKey(new URL(baseUrl).hostname);
  const rank = (u: string) => (siteKey(new URL(u).hostname) === site ? 0 : 2) + (/\/comments\/feed/i.test(u) ? 1 : 0);
  const ordered = (list: Iterable<string>) =>
    [...list].map((u, i) => ({ u, i, r: rank(u) })).sort((a, b) => a.r - b.r || a.i - b.i).map(({ u }) => u);
  return { alternates: ordered(alternates), anchors: ordered(anchors), pages: ordered([...pages].filter((u) => !anchors.has(u))) };
}

/** Caminhos comuns relativos ao caminho atual e depois à origem, sem repetir. */
export function commonPathCandidates(pageUrl: string): string[] {
  const url = new URL(pageUrl);
  const out = new Set<string>();
  const path = url.pathname.replace(/\/+$/, "");
  // Só desce para o caminho atual se ele parece uma seção (até dois níveis, sem extensão).
  if (path && path.split("/").length <= 3 && !/\.\w{2,5}$/.test(path)) {
    for (const rel of RELATIVE_PATHS) out.add(new URL(`${path}/${rel}`, url.origin).toString());
  }
  for (const p of COMMON_PATHS) out.add(new URL(p, url.origin).toString());
  return [...out];
}

const YOUTUBE_HOSTS = /^(www\.|m\.|music\.)?youtube\.com$/i;
const YOUTUBE_FEED = "https://www.youtube.com/feeds/videos.xml";

/** Codifica um segmento de caminho preservando "@" (perfis do Medium, Mastodon…). */
const encodeSegment = (value: string) => encodeURIComponent(value).replace(/%40/g, "@");

function segments(url: URL): string[] {
  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

/**
 * Converte a URL colada direto para o feed em plataformas conhecidas.
 * Lista vazia quando a plataforma não é reconhecida ou a URL precisa da página
 * (ex.: YouTube por @handle: o id do canal sai de `youtubeFeedFromHtml`).
 */
export function platformFeedCandidates(input: string): string[] {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return [];
  }
  const host = url.hostname.toLowerCase();
  const parts = segments(url);

  if (YOUTUBE_HOSTS.test(host) || host === "youtu.be") {
    const playlist = url.searchParams.get("list");
    if (playlist && /^[\w-]+$/.test(playlist)) return [`${YOUTUBE_FEED}?playlist_id=${playlist}`];
    if (parts[0] === "channel" && /^UC[\w-]{22}$/.test(parts[1] ?? "")) return [`${YOUTUBE_FEED}?channel_id=${parts[1]}`];
    if (parts[0] === "feeds") return [url.toString()];
    return [];
  }

  if (/(^|\.)reddit\.com$/i.test(host)) {
    const origin = "https://www.reddit.com";
    if ((parts[0] === "r" || parts[0] === "user" || parts[0] === "u") && parts[1]) {
      const kind = parts[0] === "r" ? "r" : "user";
      // Mantém subcaminhos (ex.: /r/x/top, /r/x/comments/…) e acrescenta ".rss".
      const rest = parts.slice(2).filter((p) => p !== ".rss");
      const path = [kind, parts[1], ...rest].map(encodeSegment).join("/");
      return [`${origin}/${path}/.rss`];
    }
    if (parts.length === 0) return [`${origin}/.rss`];
    return [];
  }

  if (host === "github.com" || host === "www.github.com") {
    const reserved = new Set(["orgs", "settings", "marketplace", "explore", "topics", "trending", "features", "about", "sponsors", "login", "search"]);
    const [owner, repo] = parts;
    if (!owner || reserved.has(owner.toLowerCase())) return [];
    if (!repo) return [`https://github.com/${owner}.atom`];
    const name = repo.replace(/\.git$/, "");
    return [`https://github.com/${owner}/${name}/releases.atom`, `https://github.com/${owner}/${name}/commits.atom`];
  }

  if (host === "medium.com" || host === "www.medium.com") {
    if (parts[0] === "feed") return [url.toString()];
    if (parts[0] === "tag" && parts[1]) return [`https://medium.com/feed/tag/${encodeSegment(parts[1])}`];
    if (parts[0]) return [`https://medium.com/feed/${encodeSegment(parts[0])}`];
    return [];
  }
  if (host.endsWith(".medium.com")) return [`https://${host}/feed`];

  if (host.endsWith(".substack.com")) return [`https://${host}/feed`];
  if (host === "substack.com" || host === "www.substack.com") {
    const handle = parts[0]?.startsWith("@") ? parts[0].slice(1) : null;
    return handle && /^[\w-]+$/.test(handle) ? [`https://${handle.toLowerCase()}.substack.com/feed`] : [];
  }

  // Portais da Globo (g1, ge, oglobo…): não anunciam feed, mas publicam /rss/<site>/[<seção>/].
  if (host.endsWith(".globo.com")) {
    const site = host.replace(/\.globo\.com$/, "");
    if (!site || site === "www" || site.includes(".")) return [];
    const section = parts.length > 0 && parts.length <= 2 && !parts.some((p) => /\.\w+$/.test(p)) ? parts : [];
    const out = [`https://${host}/rss/${site}/`];
    if (section.length > 0 && section[0] !== "rss") out.unshift(`https://${host}/rss/${site}/${section.map(encodeSegment).join("/")}/`);
    return out;
  }

  // Mastodon (e outros servidores ActivityPub compatíveis): /@user → /@user.rss; /tags/x → /tags/x.rss.
  if (parts.length === 1 && /^@[\w.-]+$/.test(parts[0]) && !parts[0].endsWith(".rss")) {
    return [`${url.origin}/${parts[0]}.rss`];
  }
  if (parts.length === 2 && parts[0] === "tags" && /^[\w-]+$/.test(parts[1])) {
    return [`${url.origin}/tags/${parts[1]}.rss`];
  }

  return [];
}

/** Feed de um canal do YouTube a partir do HTML da página (canal, @handle ou vídeo). */
export function youtubeFeedFromHtml(html: string, pageUrl: string): string | null {
  let host: string;
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    return null;
  }
  if (!YOUTUBE_HOSTS.test(host)) return null;
  const id =
    /<link[^>]+rel=["']canonical["'][^>]+href=["'][^"']*\/channel\/(UC[\w-]{22})/i.exec(html)?.[1] ??
    /"externalId":"(UC[\w-]{22})"/.exec(html)?.[1] ??
    /"videoDetails":\{[^}]*?"channelId":"(UC[\w-]{22})"/.exec(html)?.[1] ??
    /"externalChannelId":"(UC[\w-]{22})"/.exec(html)?.[1] ??
    /<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[\w-]{22})/i.exec(html)?.[1];
  return id ? `${YOUTUBE_FEED}?channel_id=${id}` : null;
}
