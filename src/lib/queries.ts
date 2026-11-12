import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getLocale } from "next-intl/server";
import { db, icontains } from "@/lib/db";
import { localizeError } from "@/lib/localized-error";
import { semanticSearch } from "@/lib/ai/embeddings";
import { getUserSettings } from "@/lib/app-settings";
import { sanitizeArticleHtml } from "@/lib/feeds/sanitize";
import { stripHtml, truncate } from "@/lib/utils";

export type ArticleScope =
  | { kind: "today" }
  | { kind: "all" }
  | { kind: "saved"; tag?: string }
  | { kind: "feed"; feedId: string }
  | { kind: "folder"; folderId: string };

export const PAGE_SIZE = 40;

export async function getSidebarData(userId: string) {
  const [locale, folders, subscriptions, savedCount] = await Promise.all([
    getLocale(),
    db.folder.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    db.subscription.findMany({
      where: { userId },
      include: { feed: { select: { id: true, title: true, iconUrl: true, siteUrl: true, url: true, errorCount: true, lastError: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.userArticle.count({ where: { userId, isSaved: true } }),
  ]);

  const unreadByFeed = await unreadCountsByFeed(userId, subscriptions.map((s) => s.feedId));

  const subs = subscriptions
    .map((s) => ({
      id: s.id,
      feedId: s.feedId,
      folderId: s.folderId,
      title: s.customTitle ?? s.feed.title,
      iconUrl: s.feed.iconUrl,
      siteUrl: s.feed.siteUrl,
      url: s.feed.url,
      hasError: s.feed.errorCount >= 3,
      lastError: s.feed.lastError ? localizeError(s.feed.lastError, locale) : null,
      unread: unreadByFeed.get(s.feedId) ?? 0,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    folders: folders.map((f) => {
      const items = subs.filter((s) => s.folderId === f.id);
      return { id: f.id, name: f.name, subscriptions: items, unread: items.reduce((n, s) => n + s.unread, 0) };
    }),
    unfiled: subs.filter((s) => !s.folderId || !folders.some((f) => f.id === s.folderId)),
    totalUnread: subs.reduce((n, s) => n + s.unread, 0),
    savedCount,
  };
}

export type SidebarData = Awaited<ReturnType<typeof getSidebarData>>;

/** Não lidos por feed (só os feeds com algum não lido aparecem no mapa). */
export async function unreadCountsByFeed(userId: string, feedIds: string[]) {
  if (feedIds.length === 0) return new Map<string, number>();
  const counts = await db.article.groupBy({
    by: ["feedId"],
    where: { feedId: { in: feedIds }, NOT: { states: { some: { userId, isRead: true } } } },
    _count: { _all: true },
  });
  return new Map(counts.map((c) => [c.feedId, c._count._all]));
}

/** Contadores da barra lateral, sem o resto dos dados: usados para atualizá-la depois de um clique. */
export async function getSidebarCounts(userId: string) {
  const [subscriptions, saved] = await Promise.all([
    db.subscription.findMany({ where: { userId }, select: { feedId: true } }),
    db.userArticle.count({ where: { userId, isSaved: true } }),
  ]);
  const unread = await unreadCountsByFeed(userId, subscriptions.map((s) => s.feedId));
  return { unread: Object.fromEntries(unread), saved };
}

export type SidebarCounts = Awaited<ReturnType<typeof getSidebarCounts>>;

function dayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function firstInstantOfDay(day: string, timeZone: string) {
  const utcMidnight = Date.parse(`${day}T00:00:00.000Z`);
  let low = utcMidnight - 36 * 3600_000;
  let high = utcMidnight + 36 * 3600_000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (dayKey(new Date(mid), timeZone) < day) low = mid + 1;
    else high = mid;
  }
  return new Date(low);
}

export function dayRangeInTimezone(date: Date, timeZone: string) {
  const day = dayKey(date, timeZone);
  const [year, month, dateOfMonth] = day.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, dateOfMonth + 1)).toISOString().slice(0, 10);
  return { start: firstInstantOfDay(day, timeZone), end: firstInstantOfDay(nextDay, timeZone) };
}

export async function articleScopeWhere(userId: string, scope: ArticleScope): Promise<Prisma.ArticleWhereInput> {
  const subscribed: Prisma.ArticleWhereInput = { feed: { subscriptions: { some: { userId } } } };
  switch (scope.kind) {
    case "saved":
      return {
        states: { some: { userId, isSaved: true } },
        ...(scope.tag ? { tags: { some: { tag: { userId, name: scope.tag } } } } : {}),
      };
    case "feed":
      return { feedId: scope.feedId, ...subscribed };
    case "folder":
      return { feed: { subscriptions: { some: { userId, folderId: scope.folderId } } } };
    case "today": {
      const settings = await getUserSettings(userId);
      const { start, end } = dayRangeInTimezone(new Date(), settings.timezone);
      return { ...subscribed, publishedAt: { gte: start, lt: end } };
    }
    default:
      return subscribed;
  }
}

const articleSelect = (userId: string) =>
  ({
    id: true,
    title: true,
    url: true,
    author: true,
    snippet: true,
    contentHtml: true,
    imageUrl: true,
    publishedAt: true,
    storyId: true,
    feed: { select: { id: true, title: true, iconUrl: true } },
    tags: { where: { tag: { userId } }, select: { tag: { select: { id: true, name: true } } }, orderBy: { tag: { name: "asc" } } },
    states: { where: { userId }, select: { isRead: true, isSaved: true, isHighlighted: true, priorityScore: true, priorityReason: true } },
  }) satisfies Prisma.ArticleSelect;

/** A lista de "Hoje" carrega o dia inteiro para ordenar pela nota: sem o HTML, que só entra na página visível. */
function articleSelectWithoutContent(userId: string) {
  const { contentHtml: _contentHtml, ...rest } = articleSelect(userId);
  return rest;
}

/**
 * Posição na lista para a próxima página. Cursor e não offset: com "só não lidos", ler artigos
 * (abrir, marcar, rolar) encolhe o conjunto e um offset pularia páginas inteiras.
 */
export type ListCursor = { publishedAt: string; id: string; score?: number | null };

/** Ordem de "Hoje": nota da IA (quando houver), data e id (desempate estável para o cursor). */
function todayOrder(a: { priorityScore: number | null; publishedAt: Date; id: string }, b: { priorityScore: number | null; publishedAt: Date; id: string }) {
  return (b.priorityScore ?? -1) - (a.priorityScore ?? -1) || +b.publishedAt - +a.publishedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

const cursorOf = (item: { id: string; publishedAt: Date; priorityScore?: number | null }): ListCursor => ({
  publishedAt: item.publishedAt.toISOString(),
  id: item.id,
  score: item.priorityScore ?? null,
});

export async function listArticles(
  userId: string,
  scope: ArticleScope,
  opts: { unreadOnly?: boolean; cursor?: ListCursor | null; query?: string } = {},
) {
  const unreadOnly = opts.unreadOnly ?? scope.kind !== "saved";
  const base: Prisma.ArticleWhereInput = {
    AND: [await articleScopeWhere(userId, scope), unreadOnly ? { NOT: { states: { some: { userId, isRead: true } } } } : {}],
  };
  const where: Prisma.ArticleWhereInput = {
    AND: [base, opts.query ? { OR: [{ title: icontains(opts.query) }, { snippet: icontains(opts.query) }] } : {}],
  };
  const cursor = opts.cursor ?? null;
  const { groupStories } = await getUserSettings(userId);
  const group = (items: ArticleListItem[]) => (groupStories ? groupByStory(items) : items);

  /**
   * Busca por assunto: na primeira página, depois dos resultados por palavra, entram os artigos
   * do escopo mais parecidos com a consulta (se o admin ligou a busca semântica).
   */
  const withSemantic = async (items: ArticleListItem[]) => {
    if (!opts.query || cursor) return items;
    const matches = await semanticSearch(opts.query, base).catch((err) => {
      console.error("[semantic]", err instanceof Error ? err.message : err);
      return null;
    });
    const known = new Set(items.map((i) => i.id));
    const extra = (matches ?? []).filter((m) => !known.has(m.id));
    if (extra.length === 0) return items;
    const rows = await db.article.findMany({ where: { id: { in: extra.map((m) => m.id) } }, select: articleSelect(userId) });
    const byId = new Map(rows.map((r) => [r.id, toListItem(r)]));
    // Reagrupa: um resultado por assunto pode ser outra fonte de um fato já listado.
    return group([...items, ...extra.flatMap((m) => (byId.has(m.id) ? [{ ...byId.get(m.id)!, matchedBySubject: true }] : []))]);
  };

  if (scope.kind === "today") {
    // Ordena por prioridade da IA (quando houver) e depois por data, em memória (só o dia).
    const rows = await db.article.findMany({ where, select: articleSelectWithoutContent(userId), orderBy: { publishedAt: "desc" } });
    const sorted = group(rows.map((row) => toListItem(row)).sort(todayOrder));
    const at = cursor ? { id: cursor.id, publishedAt: new Date(cursor.publishedAt), priorityScore: cursor.score ?? null } : null;
    const rest = at ? sorted.filter((item) => todayOrder(at, item) < 0) : sorted;
    const items = rest.slice(0, PAGE_SIZE);
    const hasMore = rest.length > PAGE_SIZE;
    return { items: await withSemantic(await withExcerpts(items)), hasMore, nextCursor: hasMore ? cursorOf(items.at(-1)!) : null };
  }

  const after: Prisma.ArticleWhereInput = cursor
    ? { OR: [{ publishedAt: { lt: new Date(cursor.publishedAt) } }, { publishedAt: new Date(cursor.publishedAt), id: { lt: cursor.id } }] }
    : {};
  const rows = await db.article.findMany({
    where: { AND: [where, after] },
    select: articleSelect(userId),
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });
  const page = rows.slice(0, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;
  return {
    items: await withSemantic(group(page.map(toListItem))),
    hasMore,
    // Do último registro buscado (não do último exibido: o agrupamento pode juntar os do fim).
    nextCursor: hasMore ? cursorOf({ id: page.at(-1)!.id, publishedAt: page.at(-1)!.publishedAt }) : null,
  };
}

/**
 * Junta artigos do mesmo fato (storyId) no primeiro que aparece na lista; os outros viram
 * "outras fontes" dele. Como a lista é paginada, o agrupamento vale dentro de cada página.
 */
export function groupByStory<T extends { id: string; storyId: string | null; title: string; isRead: boolean; feed: { title: string }; related: RelatedSource[] }>(
  items: T[],
): T[] {
  const lead = new Map<string, T>();
  const out: T[] = [];
  for (const item of items) {
    const leader = item.storyId ? lead.get(item.storyId) : undefined;
    if (leader) {
      leader.related.push({ id: item.id, title: item.title, feedTitle: item.feed.title, isRead: item.isRead });
      continue;
    }
    if (item.storyId) lead.set(item.storyId, item);
    out.push(item);
  }
  return out;
}

export type RelatedSource = { id: string; title: string; feedTitle: string; isRead: boolean };

type ListedArticle = Omit<Prisma.ArticleGetPayload<{ select: ReturnType<typeof articleSelect> }>, "contentHtml"> & {
  contentHtml?: string | null;
};

async function withExcerpts(items: ArticleListItem[]) {
  if (items.length === 0) return items;
  const bodies = await db.article.findMany({
    where: { id: { in: items.map((item) => item.id) } },
    select: { id: true, contentHtml: true, snippet: true },
  });
  const byId = new Map(bodies.map((row) => [row.id, row]));
  return items.map((item) => {
    const body = byId.get(item.id);
    if (!body) return item;
    return { ...item, excerpt: truncate(stripHtml(body.contentHtml ?? body.snippet ?? ""), 700) || null };
  });
}

function toListItem(a: ListedArticle) {
  const s = a.states[0];
  return {
    id: a.id,
    title: a.title,
    url: a.url,
    author: a.author,
    snippet: a.snippet,
    /** Trecho maior do texto para os cards (o HTML completo não vai para o cliente). */
    excerpt: truncate(stripHtml(a.contentHtml ?? a.snippet ?? ""), 700) || null,
    /** "" no banco = já verificado e sem imagem. */
    imageUrl: a.imageUrl || null,
    imageChecked: a.imageUrl !== null,
    publishedAt: a.publishedAt,
    feed: a.feed,
    isRead: s?.isRead ?? false,
    isSaved: s?.isSaved ?? false,
    isHighlighted: s?.isHighlighted ?? false,
    priorityScore: s?.priorityScore ?? null,
    priorityReason: s?.priorityReason ?? null,
    storyId: a.storyId,
    tags: a.tags.map((t) => t.tag),
    /** Outras fontes do mesmo fato, preenchido por groupByStory. */
    related: [] as RelatedSource[],
    /** Veio da busca semântica (parecido por assunto), não das palavras da consulta. */
    matchedBySubject: false,
  };
}

export type ArticleListItem = ReturnType<typeof toListItem>;

export async function getArticle(userId: string, articleId: string) {
  const article = await db.article.findFirst({
    where: {
      id: articleId,
      OR: [{ feed: { subscriptions: { some: { userId } } } }, { states: { some: { userId, isSaved: true } } }],
    },
    include: {
      feed: { select: { id: true, title: true, iconUrl: true, siteUrl: true } },
      states: { where: { userId } },
      tags: { where: { tag: { userId } }, select: { tag: { select: { id: true, name: true } } }, orderBy: { tag: { name: "asc" } } },
    },
  });
  if (!article) return null;
  const { states, tags, ...rest } = article;
  return {
    ...rest,
    // Reaplica o saneamento: artigos extraídos/ingeridos antes de uma correção no sanitizador
    // (ex.: forçar target="_blank" nos links) ficam com o HTML cru gravado no banco.
    contentHtml: rest.contentHtml ? sanitizeArticleHtml(rest.contentHtml, rest.url) : rest.contentHtml,
    fullContentHtml: rest.fullContentHtml ? sanitizeArticleHtml(rest.fullContentHtml, rest.url) : rest.fullContentHtml,
    state: states.at(0) ?? null,
    tags: tags.map((t) => t.tag),
  };
}

export type ArticleDetail = NonNullable<Awaited<ReturnType<typeof getArticle>>>;

/**
 * Título do escopo (null = escopo inexistente para o usuário) e, num feed, o último erro de
 * atualização, na mesma consulta. Os títulos fixos vêm traduzidos em `labels` (articles.scopes.*).
 */
export async function scopeHeader(
  userId: string,
  scope: ArticleScope,
  labels: { today: string; all: string; saved: string },
): Promise<{ title: string; lastError: string | null } | null> {
  switch (scope.kind) {
    case "today":
      return { title: labels.today, lastError: null };
    case "all":
      return { title: labels.all, lastError: null };
    case "saved":
      return { title: scope.tag ? `${labels.saved} · ${scope.tag}` : labels.saved, lastError: null };
    case "feed": {
      const sub = await db.subscription.findFirst({
        where: { userId, feedId: scope.feedId },
        select: { customTitle: true, feed: { select: { title: true, lastError: true, errorCount: true } } },
      });
      if (!sub) return null;
      return { title: sub.customTitle ?? sub.feed.title, lastError: sub.feed.errorCount > 0 ? sub.feed.lastError : null };
    }
    case "folder": {
      const folder = await db.folder.findFirst({ where: { id: scope.folderId, userId }, select: { name: true } });
      return folder ? { title: folder.name, lastError: null } : null;
    }
  }
}
