"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { markStorySiblingsRead, setArticleStates } from "@/lib/article-state";
import { nextUnreadFeedId, orderedSidebarFeeds } from "@/lib/feeds/next-unread";
import { articleScopeWhere, getArticle, getSidebarData, listArticles, type ArticleScope, type ListCursor } from "@/lib/queries";

/** Carrega o artigo para o leitor e marca como lido. */
export async function openArticleAction(articleId: string) {
  const user = await requireUser();
  const article = await getArticle(user.id, articleId);
  if (!article) return null;
  if (!article.state?.isRead) {
    await db.userArticle.upsert({
      where: { userId_articleId: { userId: user.id, articleId } },
      create: { userId: user.id, articleId, isRead: true, readAt: new Date() },
      update: { isRead: true, readAt: new Date() },
    });
    await markStorySiblingsRead(user.id, articleId);
  }
  return article;
}

async function assertAccess(userId: string, articleId: string) {
  const ok = await db.article.count({
    where: {
      id: articleId,
      OR: [{ feed: { subscriptions: { some: { userId } } } }, { states: { some: { userId, isSaved: true } } }],
    },
  });
  if (!ok) throw new Error((await getTranslations("articles.errors"))("notFound"));
}

export async function setRead(articleId: string, isRead: boolean) {
  const user = await requireUser();
  await assertAccess(user.id, articleId);
  await db.userArticle.upsert({
    where: { userId_articleId: { userId: user.id, articleId } },
    create: { userId: user.id, articleId, isRead, readAt: isRead ? new Date() : null },
    update: { isRead, readAt: isRead ? new Date() : null },
  });
  if (isRead) await markStorySiblingsRead(user.id, articleId);
  // Sem revalidatePath: a lista já está atualizada no cliente e a barra lateral busca só os
  // contadores (/api/sidebar/counts). Revalidar remontava a página inteira a cada clique.
}

/** Marca vários como lidos de uma vez (rolagem da lista). Ignora ids sem acesso. */
export async function markReadMany(articleIds: string[]) {
  const user = await requireUser();
  const ids = articleIds.filter((id) => typeof id === "string").slice(0, 200);
  await setArticleStates(user.id, ids, { isRead: true });
  // Como em setRead: as outras fontes do mesmo fato (escondidas pelo agrupamento) também.
  for (const id of ids) await markStorySiblingsRead(user.id, id);
}

export async function setSaved(articleId: string, isSaved: boolean) {
  const user = await requireUser();
  await assertAccess(user.id, articleId);
  await db.userArticle.upsert({
    where: { userId_articleId: { userId: user.id, articleId } },
    create: { userId: user.id, articleId, isSaved, savedAt: isSaved ? new Date() : null },
    update: { isSaved, savedAt: isSaved ? new Date() : null },
  });
}

/** Marca como lidos todos os artigos do escopo publicados até o início da operação. */
export async function markAllRead(scope: ArticleScope) {
  const user = await requireUser();
  const cutoff = new Date();
  const rows = await db.article.findMany({
    where: {
      AND: [
        await articleScopeWhere(user.id, scope),
        { publishedAt: { lte: cutoff } },
        { NOT: { states: { some: { userId: user.id, isRead: true } } } },
      ],
    },
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    const now = new Date();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await db.$transaction(async (tx) => {
        // Atualiza os estados existentes de uma vez e cria só os que faltam (em vez de um upsert por artigo).
        await tx.userArticle.updateMany({
          where: { userId: user.id, articleId: { in: chunk } },
          data: { isRead: true, readAt: now },
        });
        const existing = await tx.userArticle.findMany({
          where: { userId: user.id, articleId: { in: chunk } },
          select: { articleId: true },
        });
        const known = new Set(existing.map((row) => row.articleId));
        const missing = chunk.filter((articleId) => !known.has(articleId));
        if (missing.length > 0) {
          await tx.userArticle.createMany({
            data: missing.map((articleId) => ({ userId: user.id, articleId, isRead: true, readAt: now })),
          });
        }
      });
    }
    // Ação rara: invalida também o cache do roteador (o "Voltar" não mostra o estado antigo).
    revalidatePath("/", "layout");
  }
  const nextFeedId = scope.kind === "feed" ? await findNextUnreadFeedId(user.id, scope.feedId) : null;
  return { count: ids.length, nextFeedId };
}

async function findNextUnreadFeedId(userId: string, currentFeedId: string) {
  const sidebar = await getSidebarData(userId);
  return nextUnreadFeedId(orderedSidebarFeeds(sidebar), currentFeedId);
}

export async function loadMoreArticles(scope: ArticleScope, cursor: ListCursor | null, unreadOnly: boolean, query?: string) {
  const user = await requireUser();
  // Vem do cliente: só aceita o formato esperado.
  const valid =
    cursor &&
    typeof cursor.id === "string" &&
    cursor.id.length <= 64 &&
    typeof cursor.publishedAt === "string" &&
    !Number.isNaN(Date.parse(cursor.publishedAt)) &&
    (cursor.score === undefined || cursor.score === null || typeof cursor.score === "number")
      ? { id: cursor.id, publishedAt: cursor.publishedAt, score: cursor.score ?? null }
      : null;
  return listArticles(user.id, scope, { cursor: valid, unreadOnly, query });
}
