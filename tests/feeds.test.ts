import { describe, expect, it } from "vitest";
import { looksLikeFeed, parseFeed } from "@/lib/feeds/parse";
import { decodeFeedBody, sameSite } from "@/lib/feeds/net";
import { buildOpml, parseOpml } from "@/lib/feeds/opml";
import { parseSrcset, sanitizeArticleHtml } from "@/lib/feeds/sanitize";

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
    expect(
      looksLikeFeed(`<?xml version="1.0"?>
<!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//EN" "http://my.netscape.com/publish/formats/rss-0.91.dtd">
<rss version="0.91"><channel></channel></rss>`),
    ).toBe(true);
    expect(looksLikeFeed(`<?xml version="1.0"?>\n<?xml-stylesheet type="text/xsl" href="style.xsl"?>\n<rss version="2.0"><channel></channel></rss>`)).toBe(true);
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

  it("separa itens já gravados sem saneá-los", async () => {
    const asked: string[][] = [];
    const feed = await parseFeed(rss, "https://exemplo.com/feed.xml", {
      existing: async (guids) => {
        asked.push(guids);
        return new Map([["post-1", { publishedAt: new Date("2026-09-15T00:00:00Z"), contentHash: null }]]);
      },
    });
    expect(asked).toEqual([["post-1", "https://exemplo.com/posts/2"]]);
    expect(feed.items.map((i) => i.guid)).toEqual(["https://exemplo.com/posts/2"]);
    expect(feed.known).toEqual([{ guid: "post-1", publishedAt: new Date("2026-09-14T10:00:00.000Z"), hasPublishDate: true }]);
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

  it("filtra pela retenção antes do teto de 200 itens", async () => {
    const old = Array.from({ length: 200 }, (_, i) => `<item><title>old ${i}</title><guid>old-${i}</guid><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>`).join("");
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${old}
      <item><title>novo</title><guid>new-1</guid><pubDate>Mon, 14 Sep 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const feed = await parseFeed(xml, "https://exemplo.com/feed.xml", { skipBefore: new Date("2026-01-01T00:00:00Z") });
    expect(feed.items.map((item) => item.guid)).toEqual(["new-1"]);
  });

  it("marca item republicado para atualização", async () => {
    const first = await parseFeed(rss, "https://exemplo.com/feed.xml");
    const feed = await parseFeed(rss.replace("Olá", "Olá de novo"), "https://exemplo.com/feed.xml", {
      existing: async () => new Map([["post-1", { publishedAt: first.items[0].publishedAt, contentHash: first.items[0].contentHash ?? null }]]),
    });
    expect(feed.items.map((item) => item.guid)).toEqual(["https://exemplo.com/posts/2"]);
    expect(feed.changed).toHaveLength(1);
    expect(feed.changed[0].guid).toBe("post-1");
    expect(feed.changed[0].contentHtml).toContain("Olá de novo");
  });
});

describe("decode and same site", () => {
  it("tira aspas do charset antes de decodificar", () => {
    expect(decodeFeedBody(Buffer.from("café", "latin1"), 'text/xml; charset="iso-8859-1"')).toBe("café");
  });

  it("aceita redirect permanente só no mesmo site", () => {
    expect(sameSite("https://www.example.com/rss", "https://feeds.example.com/rss.xml")).toBe(true);
    expect(sameSite("https://news.com.br/rss", "https://www.news.com.br/atom")).toBe(true);
    expect(sameSite("https://example.com/rss", "https://evil.test/rss")).toBe(false);
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

describe("refresh scheduling", async () => {
  const { failureDelayMinutes, nextFetchDelayMinutes } = await import("@/lib/feeds/refresh");
  const { FetchError, parseRetryAfter } = await import("@/lib/feeds/net");

  it("respects Cache-Control max-age up to 2h, never below the interval", () => {
    expect(nextFetchDelayMinutes(30, null)).toBe(30);
    expect(nextFetchDelayMinutes(30, "public, max-age=600")).toBe(30);
    expect(nextFetchDelayMinutes(30, "max-age=3600")).toBe(60);
    expect(nextFetchDelayMinutes(30, "max-age=86400")).toBe(120);
  });

  it("backs off, honors Retry-After and pauses dead feeds", () => {
    expect(failureDelayMinutes(30, 1, new Error("x"))).toBe(60);
    expect(failureDelayMinutes(30, 10, new Error("x"))).toBe(24 * 60);
    expect(failureDelayMinutes(30, 1, new FetchError("httpStatus", { status: 429 }, 429, 3 * 3600))).toBe(180);
    expect(failureDelayMinutes(30, 1, new FetchError("httpStatus", { status: 410 }, 410))).toBe(7 * 24 * 60);
    expect(failureDelayMinutes(30, 14, new Error("x"))).toBe(7 * 24 * 60);
  });

  it("parses Retry-After in seconds or HTTP date", () => {
    const now = Date.parse("2026-11-01T12:00:00Z");
    expect(parseRetryAfter("120", now)).toBe(120);
    expect(parseRetryAfter("Sun, 01 Nov 2026 12:10:00 GMT", now)).toBe(600);
    expect(parseRetryAfter("garbage", now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });
});

describe("sanitizeArticleHtml extras", () => {
  it("makes srcset and poster absolute", () => {
    const html = sanitizeArticleHtml(
      '<img src="/a.png" srcset="/a-1x.png 1x, /a-2x.png 2x"><video poster="/p.jpg" src="/v.mp4"></video>',
      "https://site.test/post/1",
    );
    expect(html).toContain('srcset="https://site.test/a-1x.png 1x, https://site.test/a-2x.png 2x"');
    expect(html).toContain('poster="https://site.test/p.jpg"');
    expect(html).toContain('src="https://site.test/v.mp4"');
  });

  it("sandboxes allowed embeds and drops others", () => {
    const html = sanitizeArticleHtml('<iframe src="https://www.youtube.com/embed/x"></iframe><iframe src="https://evil.test/x"></iframe>');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"');
    expect(html).not.toContain("evil.test");
  });
});

describe("parseSrcset", () => {
  it("keeps commas inside URLs (data:, Cloudinary)", () => {
    expect(parseSrcset("https://res.cloudinary.com/x/upload/w_400,c_fill/a.jpg 400w, /b.jpg 800w")).toEqual([
      { url: "https://res.cloudinary.com/x/upload/w_400,c_fill/a.jpg", descriptor: "400w" },
      { url: "/b.jpg", descriptor: "800w" },
    ]);
    expect(parseSrcset("data:image/gif;base64,R0lGOD 1x")).toEqual([{ url: "data:image/gif;base64,R0lGOD", descriptor: "1x" }]);
    expect(parseSrcset("/a.jpg, /b.jpg 2x")).toEqual([
      { url: "/a.jpg", descriptor: "" },
      { url: "/b.jpg", descriptor: "2x" },
    ]);
  });
});
