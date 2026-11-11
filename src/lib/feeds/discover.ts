import "server-only";
import { staticTranslator } from "@/i18n/static";
import { LocalizedError } from "@/lib/localized-error";
import { commonPathCandidates, extractFeedCandidates, platformFeedCandidates, youtubeFeedFromHtml } from "./discover-candidates";
import { FetchError, safeFetch, type SafeFetchResult } from "./net";
import { looksLikeFeed, parseFeed, type ParsedFeed } from "./parse";

export type DiscoveredFeed = { url: string; title: string; siteUrl: string | null; itemCount: number; feed: ParsedFeed };

/** Teto de URLs testadas por descoberta (além da página colada). */
const MAX_CANDIDATES = 32;
/** Parte do teto que links da página podem usar; o resto fica para os caminhos comuns. */
const MAX_LINK_CANDIDATES = 20;
/** Páginas "RSS" (só pelo texto do link) testadas a partir da página colada. */
const MAX_TEXT_PAGES = 3;
/** Requisições simultâneas ao testar candidatos. */
const MAX_PARALLEL = 6;
/** Páginas "RSS" (listas de feeds) seguidas a partir da página colada. */
const MAX_PAGES_FOLLOWED = 2;
const PROBE_TIMEOUT_MS = 8000;

export type DiscoveryErrorKey = "siteBlocked" | "siteNotFound" | "siteUnreachable";

/** A página não abriu e nenhum caminho comum tinha feed. Chave em `feeds.errors`. */
export class DiscoveryError extends Error {
  constructor(
    readonly key: DiscoveryErrorKey,
    cause?: unknown,
  ) {
    super(staticTranslator("en", "feeds.errors")(key), { cause });
    this.name = "DiscoveryError";
  }
}

function normalizeInput(input: string): string {
  const trimmed = input.trim().replace(/^feed:(\/\/)?/i, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    throw new LocalizedError("invalidUrl");
  }
}

/** Erros que não adianta contornar testando outros endereços do mesmo site. */
function isFatal(error: unknown): boolean {
  return error instanceof LocalizedError && (error.key === "invalidUrl" || error.key === "privateNetwork");
}

function toDiscoveryError(error: unknown): DiscoveryError {
  const status = error instanceof FetchError ? error.status : undefined;
  if (status === 401 || status === 403 || status === 429 || status === 451 || status === 503) return new DiscoveryError("siteBlocked", error);
  if (status === 404 || status === 410) return new DiscoveryError("siteNotFound", error);
  return new DiscoveryError("siteUnreachable", error);
}

async function toDiscovered(res: SafeFetchResult): Promise<DiscoveredFeed> {
  const feed = await parseFeed(res.body, res.url);
  return { url: res.url, title: feed.title, siteUrl: feed.siteUrl, itemCount: feed.items.length, feed };
}

/** Executa `fn` em `items` com no máximo `limit` chamadas simultâneas, mantendo a ordem. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

type Probe = { feed: DiscoveredFeed } | { html: string; url: string } | null;

class Discovery {
  private readonly tried = new Set<string>();
  private probed = 0;
  private readonly byUrl = new Map<string, DiscoveredFeed>();
  private pagesFollowed = 0;

  get feeds(): DiscoveredFeed[] {
    return [...this.byUrl.values()];
  }

  markTried(url: string) {
    this.tried.add(url);
  }

  add(feed: DiscoveredFeed) {
    if (!this.byUrl.has(feed.url)) this.byUrl.set(feed.url, feed);
  }

  /** Reserva URLs ainda não testadas, dentro do teto. */
  private take(urls: string[], ceiling: number): string[] {
    const out: string[] = [];
    for (const url of urls) {
      if (this.probed >= ceiling) break;
      if (this.tried.has(url)) continue;
      this.tried.add(url);
      this.probed++;
      out.push(url);
    }
    return out;
  }

  private async probe(url: string): Promise<Probe> {
    try {
      const res = await safeFetch(url, { timeoutMs: PROBE_TIMEOUT_MS });
      this.tried.add(res.url);
      if (looksLikeFeed(res.body)) return { feed: await toDiscovered(res) };
      return { html: res.body, url: res.url };
    } catch {
      return null;
    }
  }

  /** Testa todas as URLs; com `follow`, páginas HTML retornadas são lidas em busca de feeds (um nível). */
  async probeAll(urls: string[], opts: { follow?: boolean } = {}): Promise<void> {
    const results = await mapLimit(this.take(urls, MAX_LINK_CANDIDATES), MAX_PARALLEL, (url) => this.probe(url));
    const toFollow: { html: string; url: string }[] = [];
    for (const result of results) {
      if (!result) continue;
      if ("feed" in result) this.add(result.feed);
      else if (opts.follow && this.pagesFollowed < MAX_PAGES_FOLLOWED) {
        this.pagesFollowed++;
        toFollow.push(result);
      }
    }
    for (const page of toFollow) {
      const { alternates, anchors } = extractFeedCandidates(page.html, page.url);
      await this.probeAll([...alternates, ...anchors]);
    }
  }

  /** Testa em lotes e para no primeiro lote que achar feed (caminhos comuns costumam ser o mesmo feed). */
  async probeUntilFound(urls: string[]): Promise<void> {
    const pending = this.take(urls, MAX_CANDIDATES);
    for (let i = 0; i < pending.length && this.byUrl.size === 0; i += MAX_PARALLEL) {
      const batch = pending.slice(i, i + MAX_PARALLEL);
      const results = await Promise.all(batch.map((url) => this.probe(url)));
      for (const result of results) if (result && "feed" in result) this.add(result.feed);
    }
  }
}

/**
 * Aceita URL de feed ou de site e retorna os feeds encontrados.
 * Ordem: regras de plataforma → a própria URL (feed ou `<link rel="alternate">`) →
 * links `<a>` e páginas "RSS" (um nível) → caminhos comuns no caminho atual e na origem.
 * Tudo passa por `safeFetch` (SSRF, timeout, tamanho) e respeita o teto de candidatos.
 */
export async function discoverFeeds(input: string): Promise<DiscoveredFeed[]> {
  const url = normalizeInput(input);
  const discovery = new Discovery();

  const platform = platformFeedCandidates(url);
  if (platform.length > 0) {
    await discovery.probeAll(platform);
    if (discovery.feeds.length > 0) return discovery.feeds;
  }

  let page: SafeFetchResult | null = null;
  let pageError: unknown = null;
  discovery.markTried(url);
  try {
    page = await safeFetch(url);
  } catch (error) {
    if (isFatal(error)) throw error;
    pageError = error;
  }

  if (page) {
    discovery.markTried(page.url);
    if (looksLikeFeed(page.body)) {
      try {
        return [await toDiscovered(page)];
      } catch {
        // Parece feed mas não abre: segue para os outros caminhos.
      }
    }
    const youtube = youtubeFeedFromHtml(page.body, page.url);
    const { alternates, anchors, pages } = extractFeedCandidates(page.body, page.url);
    await discovery.probeAll(youtube ? [youtube, ...alternates] : alternates);
    if (discovery.feeds.length > 0) return discovery.feeds;

    await discovery.probeAll([...anchors, ...pages.slice(0, MAX_TEXT_PAGES)], { follow: true });
    if (discovery.feeds.length > 0) return discovery.feeds;
  }

  await discovery.probeUntilFound(commonPathCandidates(page?.url ?? url));
  if (discovery.feeds.length > 0) return discovery.feeds;

  if (pageError) throw toDiscoveryError(pageError);
  return [];
}
