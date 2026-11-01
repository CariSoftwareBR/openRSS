import "server-only";
import { db } from "@/lib/db";
import { safeFetch } from "./net";

const PRIORITY = ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"];

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? match[4]) : undefined;
}

/** One pass. Chained replaces turn `&amp;quot;` into `"`. */
const decodeEntities = (value: string) =>
  value.replace(/&(?:amp|quot|#39|#(?:x|X)2(?:f|F));/g, (entity) => {
    switch (entity.toLowerCase()) {
      case "&amp;":
        return "&";
      case "&quot;":
        return '"';
      case "&#39;":
        return "'";
      default:
        return "/";
    }
  });

/** Extrai a imagem de capa (og:image / twitter:image / image_src) do HTML de uma página. */
export function extractPreviewImage(html: string, pageUrl: string): string | null {
  const head = html.slice(0, 300_000);
  const found = new Map<string, string>();

  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    const content = attr(tag, "content");
    if (key && content && PRIORITY.includes(key) && !found.has(key)) found.set(key, content);
  }
  const linkTag = /<link\b[^>]*rel\s*=\s*["']?image_src["']?[^>]*>/i.exec(head)?.[0];
  const linkHref = linkTag ? attr(linkTag, "href") : undefined;

  const candidate = PRIORITY.map((k) => found.get(k)).find(Boolean) ?? linkHref;
  if (!candidate) return null;
  try {
    const url = new URL(decodeEntities(candidate.trim()), pageUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Busca a página original e retorna a imagem de capa, ou null. */
export async function findPreviewImage(pageUrl: string): Promise<string | null> {
  const res = await safeFetch(pageUrl, { accept: "text/html,application/xhtml+xml", timeoutMs: 8000, maxBytes: 4 * 1024 * 1024 });
  return extractPreviewImage(res.body, res.url);
}

/** Falhas transitórias por artigo (em memória): espera crescente e desistência depois de algumas. */
const failures = new Map<string, { count: number; retryAt: number }>();
const MAX_FAILURES = 4;
const RETRY_BASE_MS = 10 * 60_000;

function coolingDown(id: string, now = Date.now()) {
  const entry = failures.get(id);
  return entry !== undefined && entry.retryAt > now;
}

/**
 * Resolve e grava a imagem de capa de artigos sem imagem ("" quando não há, para não buscar
 * de novo). Falhas transitórias só viram "" depois de algumas tentativas espaçadas.
 * Retorna o resultado só dos artigos que foram verificados.
 */
export async function resolvePreviewImages(
  articles: { id: string; url: string }[],
  concurrency = 6,
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const queue = articles.filter((a) => !coolingDown(a.id));
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let a = queue.shift(); a; a = queue.shift()) {
        let image: string | null;
        try {
          image = await findPreviewImage(a.url);
        } catch {
          const count = (failures.get(a.id)?.count ?? 0) + 1;
          if (count < MAX_FAILURES) {
            failures.set(a.id, { count, retryAt: Date.now() + RETRY_BASE_MS * 2 ** (count - 1) });
            continue;
          }
          image = null;
        }
        failures.delete(a.id);
        // imageUrl: null no where evita sobrescrever uma imagem gravada por outro caminho.
        await db.article.updateMany({ where: { id: a.id, imageUrl: null }, data: { imageUrl: image ?? "" } }).catch(() => {});
        result[a.id] = image;
      }
    }),
  );
  if (failures.size > 5000) {
    for (const [id, entry] of failures) if (entry.retryAt < Date.now()) failures.delete(id);
  }
  return result;
}

/** Janela dos artigos cuja capa o agendador busca em segundo plano. */
const BACKGROUND_WINDOW_MS = 3 * 86400_000;

/**
 * Busca em segundo plano a capa dos artigos recentes que ainda não foram verificados, para a
 * listagem já abrir com as imagens. Limitado por chamada para não martelar os sites.
 */
export async function fillPendingPreviewImages(limit = 20) {
  // Busca uma folga além do limite e descarta em memória os que estão esperando nova tentativa
  // (um NOT IN com milhares de ids ficaria caro e, limitado, deixaria só os "esfriando" no topo).
  const candidates = await db.article.findMany({
    where: {
      imageUrl: null,
      url: { not: null },
      publishedAt: { gte: new Date(Date.now() - BACKGROUND_WINDOW_MS) },
      feed: { subscriptions: { some: {} } },
    },
    orderBy: { publishedAt: "desc" },
    take: limit + Math.min(failures.size, 500),
    select: { id: true, url: true },
  });
  const pending = candidates.filter((a) => !coolingDown(a.id)).slice(0, limit);
  if (pending.length === 0) return 0;
  const found = await resolvePreviewImages(pending.map((a) => ({ id: a.id, url: a.url! })), 4);
  return Object.keys(found).length;
}
