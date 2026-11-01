import Parser from "rss-parser";
import { createHash } from "node:crypto";
import { stripHtml, truncate } from "@/lib/utils";
import { firstImage, sanitizeArticleHtml } from "./sanitize";

type MediaNode = { $?: { url?: string; medium?: string; type?: string } };
type OneOrMany<T> = T | T[];

type CustomItem = {
  "content:encoded"?: string;
  "media:content"?: OneOrMany<MediaNode>;
  "media:thumbnail"?: OneOrMany<MediaNode>;
  "media:group"?: OneOrMany<{ "media:thumbnail"?: OneOrMany<MediaNode>; "media:content"?: OneOrMany<MediaNode> }>;
  enclosure?: { url?: string; type?: string };
  id?: string;
  date?: string;
  published?: string;
  updated?: string;
};

const parser = new Parser<Record<string, unknown>, CustomItem>({
  customFields: {
    item: [
      ["content:encoded", "content:encoded"],
      ["media:content", "media:content"],
      ["media:thumbnail", "media:thumbnail"],
      ["media:group", "media:group"],
      ["id", "id"],
      ["published", "published"],
      ["updated", "updated"],
    ],
  },
});

const first = <T,>(value: OneOrMany<T> | undefined): T | undefined => (Array.isArray(value) ? value[0] : value);

const DAY_MS = 86400000;
const TRACKING_PARAM = /^(utm_|fbclid|gclid|gclsrc|mc_|yclid|igshid|spm$|ref$|ref_src|ncid|cmpid|s_cid|mkt_tok|vero_id|oly_|__hs|msclkid|_hs)/i;

/** URL de imagem em media:content (se for imagem) ou media:thumbnail. */
function mediaImage(content?: OneOrMany<MediaNode>, thumbnail?: OneOrMany<MediaNode>): string | undefined {
  const contents = Array.isArray(content) ? content : content ? [content] : [];
  const image = contents.find((c) => c.$?.url && (!c.$.medium || c.$.medium === "image") && !c.$.type?.startsWith("video/"));
  return image?.$?.url ?? first(thumbnail)?.$?.url;
}

export type ParsedArticle = {
  guid: string;
  url: string | null;
  title: string;
  author: string | null;
  contentHtml: string | null;
  snippet: string | null;
  imageUrl: string | null;
  publishedAt: Date;
  /** false: o XML não tinha data; `publishedAt` é a hora da coleta. */
  hasPublishDate: boolean;
};

/** Item que já está no banco: só guid e data (para corrigir uma data de fallback). */
export type KnownItem = { guid: string; publishedAt: Date; hasPublishDate: boolean };

export type ParsedFeed = {
  title: string;
  siteUrl: string | null;
  description: string | null;
  iconUrl: string | null;
  /** Itens novos, completos (HTML saneado, imagem, resumo). */
  items: ParsedArticle[];
  /** Itens já gravados (quando `existing` foi informado): não passam pelo saneamento. */
  known: KnownItem[];
};

type ParseOptions = {
  /**
   * Retorna, dos guids informados, os que já existem no banco e a data gravada. Itens conhecidos
   * pulam o saneamento do HTML, que é a parte cara do parse e se repetia a cada atualização.
   */
  existing?: (guids: string[]) => Promise<Map<string, Date>>;
};

export function looksLikeFeed(body: string): boolean {
  const head = body.slice(0, 2000).trimStart();
  let i = 0;

  const skipWs = () => {
    while (i < head.length && /\s/.test(head[i])) i++;
  };

  if (head.startsWith("<?xml", i)) {
    const endDecl = head.indexOf("?>", i + 5);
    if (endDecl === -1) return false;
    i = endDecl + 2;
    skipWs();
  }

  while (head.startsWith("<!--", i)) {
    const endComment = head.indexOf("-->", i + 4);
    if (endComment === -1) return false;
    i = endComment + 3;
    skipWs();
  }

  const rest = head.slice(i);
  const m = /^<(rss|feed|rdf:RDF)(\W|$)/i.exec(rest);
  return m !== null;
}

export async function parseFeed(xml: string, feedUrl: string, opts: ParseOptions = {}): Promise<ParsedFeed> {
  const feed = await parser.parseString(xml);
  const siteUrl = feed.link ? safeUrl(feed.link, feedUrl) : null;

  // Fase 1 (barata): link, data e guid de cada item.
  const heads = feed.items.slice(0, 200).map((item) => {
    const rawLink = item.link ? safeUrl(item.link, siteUrl ?? feedUrl) : null;
    const link = rawLink ? (canonicalizeUrl(rawLink) ?? rawLink) : null;
    const rawHtml = item["content:encoded"] ?? item.content ?? item.summary ?? "";
    const { publishedAt, hasPublishDate } = resolvePublishedAt(item, link);
    const dateKey = hasPublishDate ? publishedAt.toISOString() : "";
    // Sem guid/id/link: o conteúdo entra no hash para itens sem título nem data não colidirem entre si.
    const guid = itemGuid(item.guid ?? item.id, link, `${item.title ?? ""}|${dateKey}|${rawHtml || item.contentSnippet || ""}`);
    return { item, link, rawHtml, publishedAt, hasPublishDate, guid };
  });

  const stored = opts.existing && heads.length ? await opts.existing([...new Set(heads.map((h) => h.guid))]) : null;
  const known: KnownItem[] = [];
  const items: ParsedArticle[] = [];

  // Fase 2 (cara): saneamento e extração só dos itens novos.
  for (const { item, link, rawHtml, publishedAt, hasPublishDate, guid } of heads) {
    if (stored?.has(guid)) {
      known.push({ guid, publishedAt, hasPublishDate });
      continue;
    }
    const contentHtml = rawHtml ? sanitizeArticleHtml(rawHtml, link ?? siteUrl ?? feedUrl) : null;
    const text = stripHtml(rawHtml || item.contentSnippet || "");
    const group = first(item["media:group"]);
    const imageUrl =
      mediaImage(item["media:content"], item["media:thumbnail"]) ??
      mediaImage(group?.["media:content"], group?.["media:thumbnail"]) ??
      (item.enclosure?.type?.startsWith("image/") ? item.enclosure.url : null) ??
      firstImage(contentHtml);

    items.push({
      guid,
      url: link,
      title: (item.title && stripHtml(item.title)) || truncate(text, 80) || "(sem título)",
      author: item.creator ?? (item as { author?: string }).author ?? null,
      contentHtml,
      snippet: text ? truncate(text, 280) : null,
      imageUrl: imageUrl ?? null,
      publishedAt,
      hasPublishDate,
    });
  }

  return {
    title: feed.title?.trim() || new URL(feedUrl).hostname,
    siteUrl,
    description: feed.description ?? null,
    iconUrl: (feed.image as { url?: string } | undefined)?.url ?? (siteUrl ? faviconFor(siteUrl) : null),
    items,
    known,
  };
}

export function faviconFor(siteUrl: string): string | null {
  try {
    return new URL("/favicon.ico", siteUrl).toString();
  } catch {
    return null;
  }
}

export function parseArticleDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  // dd/MM/yyyy antes do Date.parse nativo, que lê 03/09 como 9 de março.
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (br) {
    const date = new Date(Date.UTC(+br[3], +br[2] - 1, +br[1], +(br[4] ?? 12), +(br[5] ?? 0), +(br[6] ?? 0)));
    return Number.isNaN(+date) ? null : date;
  }
  const native = Date.parse(text);
  if (!Number.isNaN(native)) return new Date(native);
  if (/^\d{10,13}$/.test(text)) {
    const n = Number(text);
    const date = new Date(text.length <= 10 ? n * 1000 : n);
    return Number.isNaN(+date) ? null : date;
  }
  return null;
}

export function dateFromUrl(url: string | null): Date | null {
  if (!url) return null;
  const m = url.match(/\/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:\/|$|\?|#)/);
  if (!m) return null;
  const month = +m[2];
  const day = +m[3];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(+m[1], month - 1, day, 12));
}

function resolvePublishedAt(item: CustomItem & { isoDate?: string; pubDate?: string }, link: string | null) {
  const fromFeed =
    parseArticleDate(item.published) ?? parseArticleDate(item.pubDate) ?? parseArticleDate(item.date) ?? parseArticleDate(item.isoDate);
  const fromUrl = dateFromUrl(link);
  const fromUpdated = parseArticleDate(item.updated);
  let resolved = fromFeed ?? fromUrl ?? fromUpdated;
  // Site bumpou <updated>/pubDate para hoje, mas a URL ainda tem a data real da matéria.
  if (resolved && fromUrl && resolved.getTime() - fromUrl.getTime() > 2 * DAY_MS) resolved = fromUrl;
  if (!resolved) return { publishedAt: new Date(), hasPublishDate: false };
  return {
    publishedAt: resolved.getTime() > Date.now() + DAY_MS ? new Date() : resolved,
    hasPublishDate: true,
  };
}

function itemGuid(raw: unknown, link: string | null, fallback: string): string {
  const value = asText(raw) ?? link;
  if (!value) return createHash("sha1").update(fallback).digest("hex");
  if (/^https?:\/\//i.test(value)) return canonicalizeUrl(value) ?? value;
  return value;
}

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function canonicalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    url.hash = "";
    if (url.protocol === "http:" || url.protocol === "https:") {
      for (const key of [...url.searchParams.keys()]) {
        if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

function safeUrl(value: string, base: string): string | null {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}
