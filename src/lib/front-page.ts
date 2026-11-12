import "server-only";
import { db } from "@/lib/db";
import { rankStories, type FrontRow } from "@/lib/front-page-rank";
import { decodeTextEntities } from "@/lib/utils";

export type { FrontArticle, FrontStory, FrontSection, FrontPage } from "@/lib/front-page-rank";

/** Janela da capa: o noticiário das últimas horas, como num portal. */
const WINDOW_MS = 72 * 3600_000;
/** Folga de relógio. Datas mais à frente que isto (feed carimbado em 2030) não entram na capa. */
const FUTURE_SKEW_MS = 24 * 3600_000;
const MAX_ROWS = 600;
/** Com pouca coisa na janela (feeds parados, instalação nova), cai para os mais recentes. */
const MIN_ROWS = 30;
const FALLBACK_ROWS = 200;

/** Monta a capa do usuário: manchete, destaques, faixa de fotos e uma seção por pasta. */
export async function getFrontPage(userId: string, now = new Date()) {
  const subscribed = { feed: { subscriptions: { some: { userId } } } };
  const select = {
    id: true,
    title: true,
    url: true,
    snippet: true,
    imageUrl: true,
    publishedAt: true,
    storyId: true,
    feed: { select: { id: true, title: true, iconUrl: true, subscriptions: { where: { userId }, select: { folderId: true, customTitle: true } } } },
    states: { where: { userId }, select: { isRead: true, isSaved: true, isHighlighted: true, priorityScore: true } },
  } as const;

  const latest = new Date(now.getTime() + FUTURE_SKEW_MS);
  const [folders, recent] = await Promise.all([
    db.folder.findMany({ where: { userId }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.article.findMany({
      where: { ...subscribed, publishedAt: { gte: new Date(now.getTime() - WINDOW_MS), lte: latest } },
      select,
      orderBy: { publishedAt: "desc" },
      take: MAX_ROWS,
    }),
  ]);
  const rows =
    recent.length >= MIN_ROWS
      ? recent
      : await db.article.findMany({ where: { ...subscribed, publishedAt: { lte: latest } }, select, orderBy: { publishedAt: "desc" }, take: FALLBACK_ROWS });

  const flat: FrontRow[] = rows.map((a) => {
    const sub = a.feed.subscriptions[0];
    const s = a.states[0];
    return {
      id: a.id,
      title: decodeTextEntities(a.title),
      url: a.url,
      snippet: a.snippet ? decodeTextEntities(a.snippet) : null,
      imageUrl: a.imageUrl,
      publishedAt: a.publishedAt,
      storyId: a.storyId,
      feed: { id: a.feed.id, title: sub?.customTitle ?? a.feed.title, iconUrl: a.feed.iconUrl },
      folderId: sub?.folderId ?? null,
      isRead: s?.isRead ?? false,
      isSaved: s?.isSaved ?? false,
      isHighlighted: s?.isHighlighted ?? false,
      priorityScore: s?.priorityScore ?? null,
    };
  });

  return rankStories(flat, folders, now);
}
