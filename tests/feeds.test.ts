import { describe, expect, it } from "vitest";
import { looksLikeFeed, parseFeed } from "@/lib/feeds/parse";
import { buildOpml, parseOpml } from "@/lib/feeds/opml";
import { sanitizeArticleHtml } from "@/lib/feeds/sanitize";

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Blog Exemplo</title>
    <link>https://exemplo.com/</link>
    <description>Um blog</description>
    <item>
      <title>Primeiro post</title>
      <link>/posts/1</link>
      <guid>post-1</guid>
      <pubDate>Mon, 14 Sep 2026 10:00:00 GMT</pubDate>
      <content:encoded><![CDATA[<p>Olá <a href="/x">link</a></p><script>alert(1)</script><img src="/img.png">]]></content:encoded>
    </item>
    <item>
      <title>Sem guid</title>
      <link>https://exemplo.com/posts/2</link>
      <description>Texto simples</description>
    </item>
  </channel>
</rss>`;

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<link href="https://atom.test/"/><entry><id>tag:1</id><title>A1</title><link href="https://atom.test/1"/><updated>2026-09-01T00:00:00Z</updated><content type="html">&lt;b&gt;oi&lt;/b&gt;</content></entry></feed>`;

describe("parseFeed", () => {
  it("detecta feeds", () => {
    expect(looksLikeFeed(rss)).toBe(true);
    expect(looksLikeFeed(atom)).toBe(true);
    expect(looksLikeFeed("<!doctype html><html></html>")).toBe(false);
  });

  it("normaliza itens RSS com URLs absolutas e HTML sanitizado", async () => {
    const feed = await parseFeed(rss, "https://exemplo.com/feed.xml");
    expect(feed.title).toBe("Blog Exemplo");
    expect(feed.items).toHaveLength(2);

    const [first, second] = feed.items;
    expect(first.guid).toBe("post-1");
    expect(first.url).toBe("https://exemplo.com/posts/1");
    expect(first.contentHtml).not.toContain("<script");
    expect(first.contentHtml).toContain('href="https://exemplo.com/x"');
    expect(first.imageUrl).toBe("https://exemplo.com/img.png");
    expect(first.publishedAt.toISOString()).toBe("2026-09-14T10:00:00.000Z");

    expect(second.guid).toBe("https://exemplo.com/posts/2");
    expect(second.snippet).toBe("Texto simples");
  });

  it("lê Atom", async () => {
    const feed = await parseFeed(atom, "https://atom.test/feed");
    expect(feed.items[0]).toMatchObject({ guid: "tag:1", title: "A1", url: "https://atom.test/1" });
  });

  it("lê pubDate em dd/MM/yyyy", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item><title>BR</title><link>https://br.test/p</link><guid>br-1</guid>
      <pubDate>03/09/2026 10:00:00</pubDate></item>
    </channel></rss>`;
    const feed = await parseFeed(xml, "https://br.test/feed");
    expect(feed.items[0]).toMatchObject({ hasPublishDate: true });
    expect(feed.items[0].publishedAt.toISOString()).toBe("2026-09-03T10:00:00.000Z");
  });

  it("usa a data da URL quando o feed só bumpa pubDate", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item>
        <title>Velha</title>
        <link>https://g1.example/2026/09/01/noticia.html?utm_source=rss</link>
        <guid>https://g1.example/2026/09/01/noticia.html?utm_source=rss</guid>
        <pubDate>Sat, 17 Oct 2026 12:00:00 GMT</pubDate>
      </item>
    </channel></rss>`;
    const feed = await parseFeed(xml, "https://g1.example/feed");
    expect(feed.items[0].publishedAt.toISOString()).toBe("2026-09-01T12:00:00.000Z");
    expect(feed.items[0].guid).toBe("https://g1.example/2026/09/01/noticia.html");
    expect(feed.items[0].url).toBe("https://g1.example/2026/09/01/noticia.html");
  });

  it("prefere Atom published a updated", async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
      <entry><id>tag:2</id><title>A2</title><link href="https://atom.test/2"/>
      <published>2026-09-01T00:00:00Z</published>
      <updated>2026-10-17T00:00:00Z</updated>
      </entry></feed>`;
    const feed = await parseFeed(xml, "https://atom.test/feed");
    expect(feed.items[0].publishedAt.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("marca item sem data como hasPublishDate false", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item><title>X</title><link>https://nodate.test/p</link><guid>x</guid></item>
    </channel></rss>`;
    const feed = await parseFeed(xml, "https://nodate.test/feed");
    expect(feed.items[0].hasPublishDate).toBe(false);
  });
});

describe("sanitizeArticleHtml", () => {
  it("remove handlers e iframes não permitidos", () => {
    const html = sanitizeArticleHtml('<p onclick="x()">a</p><iframe src="https://evil.test/"></iframe><iframe src="https://www.youtube.com/embed/1"></iframe>');
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("evil.test");
    expect(html).toContain("youtube.com/embed/1");
  });

  it("mantém lazy loading e no-referrer nas imagens", () => {
    const html = sanitizeArticleHtml('<img src="/a.png" alt="a">', "https://site.test/post");
    expect(html).toContain('src="https://site.test/a.png"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });
});

describe("parseFeed guid", () => {
  it("não colide itens sem guid, link, título ou data", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item><description>primeiro</description></item>
      <item><description>segundo</description></item>
    </channel></rss>`;
    const feed = await parseFeed(xml, "https://noguid.test/feed");
    expect(new Set(feed.items.map((i) => i.guid)).size).toBe(2);
  });

  it("é o mesmo artigo com ou sem utm na URL", async () => {
    const xml = (guid: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item><title>A</title><guid>${guid}</guid><link>${guid}</link></item>
    </channel></rss>`;
    const withUtm = await parseFeed(xml("https://site.test/a?utm_source=rss&amp;fbclid=1"), "https://site.test/feed");
    const clean = await parseFeed(xml("https://site.test/a"), "https://site.test/feed");
    expect(withUtm.items[0].guid).toBe(clean.items[0].guid);
    expect(withUtm.items[0].guid).toBe("https://site.test/a");
  });
});

describe("OPML", () => {
  it("faz ida e volta com pastas", () => {
    const xml = buildOpml("teste", [
      { url: "https://a.test/feed", title: "A & B", siteUrl: "https://a.test", folder: "Tech" },
      { url: "https://c.test/rss", title: "C", siteUrl: null, folder: null },
    ]);
    expect(parseOpml(xml)).toEqual([
      { url: "https://a.test/feed", title: "A & B", folder: "Tech" },
      { url: "https://c.test/rss", title: "C", folder: null },
    ]);
  });
});
