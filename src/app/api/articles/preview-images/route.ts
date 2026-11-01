import { accessibleArticles } from "@/lib/article-state";
import { db } from "@/lib/db";
import { resolvePreviewImages } from "@/lib/feeds/preview-image";
import { getApiUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_IDS = 12;

/**
 * Capa (og:image) dos artigos cujo feed não traz imagem. É uma rota e não uma server action
 * porque o cliente despacha server actions uma por vez: a busca nas páginas originais (até
 * 8 s cada) deixava abrir artigo, marcar como lido e salvar esperando na fila.
 */
export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const ids = [...new Set((new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean))].slice(0, MAX_IDS);
  if (ids.length === 0) return Response.json({});

  const articles = await db.article.findMany({
    where: { id: { in: ids }, imageUrl: null, url: { not: null }, ...accessibleArticles(user.id) },
    select: { id: true, url: true },
  });
  const found = await resolvePreviewImages(articles.map((a) => ({ id: a.id, url: a.url! })));
  return Response.json(found, { headers: { "cache-control": "private, no-store" } });
}
