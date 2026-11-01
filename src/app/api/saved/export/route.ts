import { db } from "@/lib/db";
import { getApiUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Exporta os artigos salvos: ?format=html (favoritos no formato Netscape, importável em
 * navegadores, Raindrop, Pocket/Wallabag) ou ?format=json (com tags, feed e datas).
 */
export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "html";

  const rows = await db.userArticle.findMany({
    where: { userId: user.id, isSaved: true },
    orderBy: { savedAt: "desc" },
    select: {
      savedAt: true,
      article: {
        select: {
          title: true,
          url: true,
          author: true,
          snippet: true,
          publishedAt: true,
          feed: { select: { title: true } },
          tags: { where: { tag: { userId: user.id } }, select: { tag: { select: { name: true } } } },
        },
      },
    },
  });
  const items = rows.map(({ savedAt, article: a }) => ({
    title: a.title,
    url: a.url,
    author: a.author,
    feed: a.feed.title,
    excerpt: a.snippet,
    publishedAt: a.publishedAt.toISOString(),
    savedAt: savedAt?.toISOString() ?? null,
    tags: a.tags.map((t) => t.tag.name),
  }));

  const day = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), count: items.length, items }, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="openrss-salvos-${day}.json"`,
      },
    });
  }

  const lines = items
    .filter((i) => i.url)
    .map((i) => {
      const added = Math.floor(Date.parse(i.savedAt ?? i.publishedAt) / 1000);
      const tags = i.tags.length ? ` TAGS="${escapeHtml(i.tags.join(","))}"` : "";
      const note = i.excerpt ? `\n    <DD>${escapeHtml(i.excerpt)}` : "";
      return `    <DT><A HREF="${escapeHtml(i.url!)}" ADD_DATE="${added}"${tags}>${escapeHtml(i.title)}</A>${note}`;
    });
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- Exportado pelo openRSS -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>openRSS</TITLE>
<H1>openRSS</H1>
<DL><p>
  <DT><H3>openRSS</H3>
  <DL><p>
${lines.join("\n")}
  </DL><p>
</DL><p>
`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="openrss-salvos-${day}.html"`,
    },
  });
}
