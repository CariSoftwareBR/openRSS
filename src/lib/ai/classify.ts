import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { stripHtml, truncate } from "@/lib/utils";
import { applyRulesToArticles } from "@/lib/rules/apply";
import { resolveModel } from "./providers";
import { errorMessage, languageName, languageInstruction } from "./content";

const BATCH = 20;

const schema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      score: z.number().int().min(0).max(100),
      reason: z.string(),
    }),
  ),
});

/** Pontua artigos de acordo com os interesses do usuário e grava em UserArticle. */
export async function classifyForUser(userId: string, articleIds: string[]) {
  const settings = await db.userSettings.findUnique({ where: { userId } });
  if (!settings?.classifyEnabled || !settings.interests?.trim() || articleIds.length === 0) return 0;

  const already = await db.userArticle.findMany({
    where: { userId, articleId: { in: articleIds }, classifiedAt: { not: null } },
    select: { articleId: true },
  });
  const done = new Set(already.map((a) => a.articleId));
  const articles = await db.article.findMany({
    where: { id: { in: articleIds.filter((id) => !done.has(id)) }, feed: { subscriptions: { some: { userId } } } },
    select: { id: true, title: true, snippet: true, contentHtml: true, feed: { select: { title: true } } },
    orderBy: { publishedAt: "desc" },
  });
  if (articles.length === 0) return 0;

  const { model } = await resolveModel(userId);
  let count = 0;
  const scored: string[] = [];

  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH);
    try {
      const { output } = await generateText({
        model,
        abortSignal: AbortSignal.timeout(90_000),
        output: Output.object({ schema }),
        instructions: `Você é um filtro de relevância para um leitor de RSS. Dê uma nota de 0 a 100 para cada artigo segundo os interesses do usuário (100 = imperdível, 0 = irrelevante). "reason" deve ter no máximo 12 palavras, em ${languageName(settings.language)}. Retorne todos os ids recebidos.
${languageInstruction(settings.language)}

Interesses do usuário:
${settings.interests}`,
        prompt: batch
          .map((a) => `id: ${a.id}\nfeed: ${a.feed.title}\ntítulo: ${a.title}\ntrecho: ${truncate(a.snippet ?? stripHtml(a.contentHtml ?? ""), 400)}`)
          .join("\n---\n"),
      });

      const valid = new Set(batch.map((a) => a.id));
      const now = new Date();
      await db.$transaction(
        (output?.items ?? [])
          .filter((it) => valid.has(it.id))
          .map((it) =>
            db.userArticle.upsert({
              where: { userId_articleId: { userId, articleId: it.id } },
              create: { userId, articleId: it.id, priorityScore: it.score, priorityReason: it.reason, classifiedAt: now },
              update: { priorityScore: it.score, priorityReason: it.reason, classifiedAt: now },
            }),
          ),
      );
      count += output?.items.length ?? 0;
      scored.push(...(output?.items ?? []).filter((it) => valid.has(it.id)).map((it) => it.id));
    } catch (err) {
      // Um lote que falha não descarta os seguintes. O que ficou sem nota volta em classifyPending.
      console.error(`[ai:classify] user=${userId}`, errorMessage(err));
    }
  }
  // Regras que dependem da nota da IA só podem rodar agora.
  await applyRulesToArticles(scored, "classified", userId).catch((err) => console.error(`[rules] user=${userId}`, errorMessage(err)));
  return count;
}

const PENDING_PER_USER = 100;

/**
 * Artigos recentes ainda sem nota (falha do provedor, ou um lote que passou do teto).
 * Cada rodada pega um pedaço; o minuto seguinte continua de onde parou.
 */
export async function classifyPending(limit = PENDING_PER_USER) {
  const since = new Date(Date.now() - 7 * 86400000);
  const users = await db.userSettings.findMany({
    where: { classifyEnabled: true, interests: { not: null } },
    select: { userId: true },
  });
  for (const { userId } of users) {
    const pending = await db.article.findMany({
      where: {
        publishedAt: { gte: since },
        feed: { subscriptions: { some: { userId } } },
        NOT: { states: { some: { userId, classifiedAt: { not: null } } } },
      },
      select: { id: true },
      orderBy: { publishedAt: "desc" },
      take: limit,
    });
    if (pending.length) await classifyForUser(userId, pending.map((a) => a.id));
  }
}

/** Após ingest: classifica artigos novos para cada assinante com classificação ativa. */
export async function classifyNewArticles(articleIds: string[]) {
  if (articleIds.length === 0) return;
  const users = await db.userSettings.findMany({
    where: {
      classifyEnabled: true,
      interests: { not: null },
      user: { subscriptions: { some: { feed: { articles: { some: { id: { in: articleIds } } } } } } },
    },
    select: { userId: true },
  });
  for (const { userId } of users) await classifyForUser(userId, articleIds);
}
