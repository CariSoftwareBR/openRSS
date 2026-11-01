import { getLocale, getTranslations } from "next-intl/server";
import { accessibleArticles } from "@/lib/article-state";
import { db } from "@/lib/db";
import { extractFullContent } from "@/lib/feeds/extract";
import { sanitizeArticleHtml } from "@/lib/feeds/sanitize";
import { localizeError } from "@/lib/localized-error";
import { getApiUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Conteúdo completo do artigo original (Readability), guardado depois da primeira extração.
 * É uma rota e não uma server action: o leitor pede isto ao abrir cada artigo, e como o cliente
 * despacha actions uma por vez, marcar como lido, salvar ou ir ao próximo esperavam a extração.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/articles/[id]/full-content">) {
  const user = await getApiUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const t = await getTranslations("articles.errors");
  const article = await db.article.findFirst({
    where: { id, ...accessibleArticles(user.id) },
    select: { id: true, url: true, fullContentHtml: true },
  });
  if (!article) return Response.json({ error: t("notFound") }, { status: 404 });
  const headers = { "cache-control": "private, no-store" };

  // Reaplica o saneamento: conteúdo extraído antes de uma correção no sanitizador
  // (ex.: forçar target="_blank" nos links) fica com o HTML cru gravado no banco.
  if (article.fullContentHtml) return Response.json({ html: sanitizeArticleHtml(article.fullContentHtml, article.url) }, { headers });
  if (!article.url) return Response.json({ error: t("noOriginalLink") }, { headers });
  try {
    const html = await extractFullContent(article.url);
    if (!html) return Response.json({ error: t("extractFailed") }, { headers });
    await db.article.update({ where: { id: article.id }, data: { fullContentHtml: html } });
    return Response.json({ html }, { headers });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? localizeError(err, await getLocale()) : t("fetchFailed") }, { headers });
  }
}
