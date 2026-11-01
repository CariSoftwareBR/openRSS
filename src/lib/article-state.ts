import "server-only";
import { db } from "@/lib/db";

/** Só artigos de feeds que o usuário assina, ou que ele salvou. */
export function accessibleArticles(userId: string) {
  return { OR: [{ feed: { subscriptions: { some: { userId } } } }, { states: { some: { userId, isSaved: true } } }] };
}

/**
 * Liga/desliga lido e salvo em lote (APIs externas marcam dezenas de itens por vez).
 * Ignora ids de artigos a que o usuário não tem acesso.
 */
export async function setArticleStates(userId: string, articleIds: string[], change: { isRead?: boolean; isSaved?: boolean }) {
  if (articleIds.length === 0 || (change.isRead === undefined && change.isSaved === undefined)) return 0;
  const allowed = await db.article.findMany({ where: { id: { in: [...new Set(articleIds)] }, ...accessibleArticles(userId) }, select: { id: true } });
  const ids = allowed.map((a) => a.id);
  const now = new Date();
  const data = {
    ...(change.isRead !== undefined ? { isRead: change.isRead, readAt: change.isRead ? now : null } : {}),
    ...(change.isSaved !== undefined ? { isSaved: change.isSaved, savedAt: change.isSaved ? now : null } : {}),
  };
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    await db.$transaction(async (tx) => {
      await tx.userArticle.updateMany({ where: { userId, articleId: { in: chunk } }, data });
      const existing = await tx.userArticle.findMany({ where: { userId, articleId: { in: chunk } }, select: { articleId: true } });
      const known = new Set(existing.map((r) => r.articleId));
      const missing = chunk.filter((id) => !known.has(id));
      if (missing.length) await tx.userArticle.createMany({ data: missing.map((articleId) => ({ userId, articleId, ...data })) });
    });
  }
  return ids.length;
}

/** Ao ler um artigo agrupado, as outras fontes do mesmo fato (nos feeds do usuário) também contam como lidas. */
export async function markStorySiblingsRead(userId: string, articleId: string) {
  return markStorySiblingsReadMany(userId, [articleId]);
}

/** Versão em lote (rolagem): três consultas no total, não três por artigo. */
export async function markStorySiblingsReadMany(userId: string, articleIds: string[]) {
  if (articleIds.length === 0) return 0;
  const read = await db.article.findMany({ where: { id: { in: articleIds }, storyId: { not: null } }, select: { storyId: true } });
  const storyIds = [...new Set(read.map((a) => a.storyId!))];
  if (storyIds.length === 0) return 0;
  const siblings = await db.article.findMany({
    where: {
      storyId: { in: storyIds },
      id: { notIn: articleIds },
      feed: { subscriptions: { some: { userId } } },
      NOT: { states: { some: { userId, isRead: true } } },
    },
    select: { id: true },
  });
  return setArticleStates(userId, siblings.map((s) => s.id), { isRead: true });
}
