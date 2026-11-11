import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commonPathCandidates,
  extractFeedCandidates,
  platformFeedCandidates,
  youtubeFeedFromHtml,
} from "@/lib/feeds/discover-candidates";

const rss = (title: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${title}</title><link>https://exemplo.com/</link>` +
  `<item><title>Post</title><link>https://exemplo.com/1</link><guid>1</guid></item></channel></rss>`;

describe("extractFeedCandidates", () => {
  it("lê <link rel=alternate> de feed e ignora os demais", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed/">
      <link rel="alternate" type="application/atom+xml" href="https://exemplo.com/atom.xml">
      <link rel="alternate" type="application/rss+xml" href="/comments/feed/">
      <link rel="alternate" hreflang="en" href="/en/">
      <link rel="alternate" type="application/json+oembed" href="/wp-json/oembed/1.0/embed?url=x">
    </head><body></body></html>`;
    const { alternates } = extractFeedCandidates(html, "https://exemplo.com/");
    expect(alternates).toEqual(["https://exemplo.com/feed/", "https://exemplo.com/atom.xml", "https://exemplo.com/comments/feed/"]);
  });

  it("acha links <a> de feed no corpo e separa páginas que só citam RSS no texto", () => {
    const html = `<html><body>
      <a href="/rss/noticias.xml">Notícias</a>
      <a href="/feeds/posts/default">Assinar</a>
      <a href="/?feed=rss2">Posts</a>
      <a href="/index.rss">x</a>
      <a href="/siga-por-rss.html">Siga por RSS</a>
      <a href="/assine">Feeds</a>
      <a href="/sitemap.xml">Mapa do site</a>
      <a href="https://feedly.com/i/subscription/feed/https://exemplo.com/feed">Feedly</a>
      <a href="/feedback">Feedback</a>
      <a href="mailto:a@b.c">RSS por e-mail</a>
      <a href="/sobre">Sobre</a>
      <a href="https://netflix.com/feed">Netflix</a>
      <a href="https://x.com/exemplo/rss">X</a>
      <a href="/2026/manchete">Como montar um leitor de RSS em casa sem gastar nada com servidor</a>
    </body></html>`;
    const { alternates, anchors, pages } = extractFeedCandidates(html, "https://exemplo.com/blog/");
    expect(alternates).toEqual([]);
    expect(anchors).toEqual([
      "https://exemplo.com/rss/noticias.xml",
      "https://exemplo.com/feeds/posts/default",
      "https://exemplo.com/?feed=rss2",
      "https://exemplo.com/index.rss",
      "https://netflix.com/feed",
    ]);
    expect(pages).toEqual(["https://exemplo.com/siga-por-rss.html", "https://exemplo.com/assine"]);
  });

  it("põe feeds do próprio site antes de links para outros sites", () => {
    const html = `<html><body>
      <a href="https://amigo.net/feed/">Blog do amigo</a>
      <a href="/comments/feed/">Comentários</a>
      <a href="https://blog.exemplo.com.br/rss.xml">Blog</a>
      <a href="/feed/">Posts</a>
    </body></html>`;
    expect(extractFeedCandidates(html, "https://www.exemplo.com.br/").anchors).toEqual([
      "https://blog.exemplo.com.br/rss.xml",
      "https://www.exemplo.com.br/feed/",
      "https://www.exemplo.com.br/comments/feed/",
      "https://amigo.net/feed/",
    ]);
  });

  it("resolve hrefs relativos com <base> e descarta fragmentos", () => {
    const html = `<html><head><base href="https://cdn.exemplo.com/site/"></head><body><a href="feed.xml#topo">RSS</a></body></html>`;
    expect(extractFeedCandidates(html, "https://exemplo.com/").anchors).toEqual(["https://cdn.exemplo.com/site/feed.xml"]);
  });
});

describe("commonPathCandidates", () => {
  it("testa o caminho atual antes da origem", () => {
    const list = commonPathCandidates("https://site.com/blog/");
    expect(list.slice(0, 2)).toEqual(["https://site.com/blog/feed", "https://site.com/blog/feed/"]);
    expect(list).toContain("https://site.com/feed");
    expect(list).toContain("https://site.com/rss/");
    expect(list).toContain("https://site.com/index.rss");
    expect(list).toContain("https://site.com/?feed=rss2");
    expect(list).toContain("https://site.com/feeds/posts/default");
    expect(new Set(list).size).toBe(list.length);
  });

  it("na raiz e em páginas de artigo usa só a origem", () => {
    const root = commonPathCandidates("https://site.com/");
    expect(root[0]).toBe("https://site.com/feed");
    expect(commonPathCandidates("https://site.com/2026/11/10/post.html")[0]).toBe("https://site.com/feed");
    expect(commonPathCandidates("https://site.com/a/b/c/d")[0]).toBe("https://site.com/feed");
  });
});

describe("platformFeedCandidates", () => {
  it("YouTube: canal por id e playlist; @handle depende da página", () => {
    expect(platformFeedCandidates("https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA")).toEqual([
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnyfMqiRRG1u-2MsSQLbXA",
    ]);
    expect(platformFeedCandidates("https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG")).toEqual([
      "https://www.youtube.com/feeds/videos.xml?playlist_id=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG",
    ]);
    expect(platformFeedCandidates("https://www.youtube.com/@veritasium")).toEqual([]);
  });

  it("Reddit: subreddit, usuário e subcaminhos", () => {
    expect(platformFeedCandidates("https://www.reddit.com/r/brasil/")).toEqual(["https://www.reddit.com/r/brasil/.rss"]);
    expect(platformFeedCandidates("https://old.reddit.com/r/brasil/top")).toEqual(["https://www.reddit.com/r/brasil/top/.rss"]);
    expect(platformFeedCandidates("https://reddit.com/u/spez")).toEqual(["https://www.reddit.com/user/spez/.rss"]);
    expect(platformFeedCandidates("https://www.reddit.com/r/brasil/.rss")).toEqual(["https://www.reddit.com/r/brasil/.rss"]);
  });

  it("GitHub: releases e commits do repositório; atividade do usuário", () => {
    expect(platformFeedCandidates("https://github.com/vercel/next.js")).toEqual([
      "https://github.com/vercel/next.js/releases.atom",
      "https://github.com/vercel/next.js/commits.atom",
    ]);
    expect(platformFeedCandidates("https://github.com/vercel/next.js/issues/1")[0]).toBe("https://github.com/vercel/next.js/releases.atom");
    expect(platformFeedCandidates("https://github.com/torvalds")).toEqual(["https://github.com/torvalds.atom"]);
    expect(platformFeedCandidates("https://github.com/settings/profile")).toEqual([]);
  });

  it("Medium e Substack", () => {
    expect(platformFeedCandidates("https://medium.com/@dan_abramov")).toEqual(["https://medium.com/feed/@dan_abramov"]);
    expect(platformFeedCandidates("https://medium.com/@dan_abramov/um-post-123")).toEqual(["https://medium.com/feed/@dan_abramov"]);
    expect(platformFeedCandidates("https://medium.com/tag/javascript")).toEqual(["https://medium.com/feed/tag/javascript"]);
    expect(platformFeedCandidates("https://fulano.medium.com/")).toEqual(["https://fulano.medium.com/feed"]);
    expect(platformFeedCandidates("https://newsletter.substack.com/p/post")).toEqual(["https://newsletter.substack.com/feed"]);
    expect(platformFeedCandidates("https://substack.com/@Fulano")).toEqual(["https://fulano.substack.com/feed"]);
  });

  it("Mastodon: @usuário e tags em qualquer servidor", () => {
    expect(platformFeedCandidates("https://mastodon.social/@Gargron")).toEqual(["https://mastodon.social/@Gargron.rss"]);
    expect(platformFeedCandidates("https://bolha.us/tags/brasil")).toEqual(["https://bolha.us/tags/brasil.rss"]);
  });

  it("Globo: /rss/<site>/ e a seção atual", () => {
    expect(platformFeedCandidates("https://g1.globo.com/")).toEqual(["https://g1.globo.com/rss/g1/"]);
    expect(platformFeedCandidates("https://g1.globo.com/tecnologia/")).toEqual([
      "https://g1.globo.com/rss/g1/tecnologia/",
      "https://g1.globo.com/rss/g1/",
    ]);
    expect(platformFeedCandidates("https://g1.globo.com/tecnologia/noticia/2026/11/10/x.ghtml")).toEqual(["https://g1.globo.com/rss/g1/"]);
    expect(platformFeedCandidates("https://www.globo.com/")).toEqual([]);
  });

  it("não quebra com % malformado no caminho", () => {
    expect(platformFeedCandidates("https://mastodon.social/%E0%A4%A")).toEqual([]);
    expect(platformFeedCandidates("https://www.reddit.com/r/%E0%A4%A")).toEqual(["https://www.reddit.com/r/%25E0%25A4%25A/.rss"]);
  });

  it("sites comuns não têm regra", () => {
    expect(platformFeedCandidates("https://tecnoblog.net/")).toEqual([]);
    expect(platformFeedCandidates("https://exemplo.com/blog/")).toEqual([]);
  });
});

describe("youtubeFeedFromHtml", () => {
  const id = "UCHnyfMqiRRG1u-2MsSQLbXA";
  it("prefere o canonical do canal ao primeiro channelId da página", () => {
    const html = `<link rel="canonical" href="https://www.youtube.com/channel/${id}"><script>{"channelId":"UC1UmujXTizWokDHojdEOdow"}</script>`;
    expect(youtubeFeedFromHtml(html, "https://www.youtube.com/@veritasium")).toBe(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  });

  it("usa o dono do vídeo em páginas de vídeo", () => {
    const html = `<script>var x = {"videoDetails":{"videoId":"abc","channelId":"${id}","title":"t"}}</script>`;
    expect(youtubeFeedFromHtml(html, "https://www.youtube.com/watch?v=abc")).toBe(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  });

  it("ignora outros sites", () => {
    expect(youtubeFeedFromHtml(`{"externalId":"${id}"}`, "https://exemplo.com/")).toBeNull();
  });
});

// Orquestração com safeFetch falso: nenhuma requisição real.
const responses = new Map<string, { status: number; body?: string; location?: string }>();
const requested: string[] = [];

vi.mock("@/lib/feeds/net", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/feeds/net")>();
  return {
    ...actual,
    safeFetch: vi.fn(async (input: string) => {
      let url = input;
      for (let hop = 0; hop < 5; hop++) {
        requested.push(url);
        const res = responses.get(url);
        if (new URL(url).hostname === "fora.com") throw new actual.FetchError("connectFailed", { reason: "timeout" });
        if (!res) throw new actual.FetchError("httpStatus", { status: 404 }, 404);
        if (res.location) {
          url = new URL(res.location, url).toString();
          continue;
        }
        if (res.status >= 400) throw new actual.FetchError("httpStatus", { status: res.status }, res.status);
        return { status: res.status, url, headers: new Headers(), body: res.body ?? "", movedPermanently: false };
      }
      throw new actual.FetchError("tooManyRedirects");
    }),
  };
});

describe("discoverFeeds", () => {
  beforeEach(() => {
    responses.clear();
    requested.length = 0;
  });

  it("página bloqueada (403): ainda acha /feed/", async () => {
    const { discoverFeeds } = await import("@/lib/feeds/discover");
    responses.set("https://tecnoblog.net/", { status: 403, body: "Just a moment..." });
    responses.set("https://tecnoblog.net/feed", { status: 301, location: "/feed/" });
    responses.set("https://tecnoblog.net/feed/", { status: 200, body: rss("Tecnoblog") });
    const found = await discoverFeeds("tecnoblog.net");
    expect(found.map((f) => [f.url, f.title])).toEqual([["https://tecnoblog.net/feed/", "Tecnoblog"]]);
  });

  it("página bloqueada sem feed: erro amigável em vez de HTTP 403", async () => {
    const { discoverFeeds, DiscoveryError } = await import("@/lib/feeds/discover");
    responses.set("https://bloqueado.com/", { status: 403 });
    const error = await discoverFeeds("https://bloqueado.com/").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DiscoveryError);
    expect((error as InstanceType<typeof DiscoveryError>).key).toBe("siteBlocked");
    expect((error as Error).message).not.toMatch(/HTTP 403/);
  });

  it("host sem resposta: testa só um lote de caminhos comuns", async () => {
    const { discoverFeeds, DiscoveryError } = await import("@/lib/feeds/discover");
    const error = await discoverFeeds("https://fora.com/").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DiscoveryError);
    expect((error as InstanceType<typeof DiscoveryError>).key).toBe("siteUnreachable");
    expect(requested).toHaveLength(1 + 6);
  });

  it("Globo: converte para /rss/g1/ sem depender da página", async () => {
    const { discoverFeeds } = await import("@/lib/feeds/discover");
    responses.set("https://g1.globo.com/rss/g1/", { status: 200, body: rss("g1") });
    const found = await discoverFeeds("g1.globo.com");
    expect(found.map((f) => f.url)).toEqual(["https://g1.globo.com/rss/g1/"]);
    expect(requested).toEqual(["https://g1.globo.com/rss/g1/"]);
  });

  it("segue uma página RSS e coleta os feeds listados", async () => {
    const { discoverFeeds } = await import("@/lib/feeds/discover");
    responses.set("https://jornal.com/", { status: 200, body: `<html><body><a href="/servicos/rss.html">RSS</a></body></html>` });
    responses.set("https://jornal.com/servicos/rss.html", {
      status: 200,
      body: `<html><body><a href="/rss/brasil.xml">Brasil</a><a href="/rss/mundo.xml">Mundo</a></body></html>`,
    });
    responses.set("https://jornal.com/rss/brasil.xml", { status: 200, body: rss("Brasil") });
    responses.set("https://jornal.com/rss/mundo.xml", { status: 200, body: rss("Mundo") });
    const found = await discoverFeeds("jornal.com");
    expect(found.map((f) => f.title)).toEqual(["Brasil", "Mundo"]);
  });

  it("links sem feed não tiram a vez dos caminhos comuns", async () => {
    const { discoverFeeds } = await import("@/lib/feeds/discover");
    const links = Array.from({ length: 40 }, (_, i) => `<a href="/feed/pagina-${i}.html">${i}</a>`).join("");
    responses.set("https://lotado.com/", { status: 200, body: `<html><body>${links}</body></html>` });
    for (let i = 0; i < 40; i++) responses.set(`https://lotado.com/feed/pagina-${i}.html`, { status: 200, body: "<html></html>" });
    responses.set("https://lotado.com/rss.xml", { status: 200, body: rss("Lotado") });
    const found = await discoverFeeds("lotado.com");
    expect(found.map((f) => f.title)).toEqual(["Lotado"]);
    expect(requested.length).toBeLessThanOrEqual(1 + 32);
  });

  it("respeita o teto de candidatos", async () => {
    const { discoverFeeds } = await import("@/lib/feeds/discover");
    const links = Array.from({ length: 60 }, (_, i) => `<a href="/rss/${i}.xml">${i}</a>`).join("");
    responses.set("https://muitos.com/", { status: 200, body: `<html><body>${links}</body></html>` });
    for (let i = 0; i < 60; i++) responses.set(`https://muitos.com/rss/${i}.xml`, { status: 200, body: rss(`F${i}`) });
    const found = await discoverFeeds("muitos.com");
    expect(found).toHaveLength(20);
    expect(requested).toHaveLength(21);
  });

  it("recusa entrada que não é URL", async () => {
    const { discoverFeeds } = await import("@/lib/feeds/discover");
    await expect(discoverFeeds("não é url")).rejects.toMatchObject({ key: "invalidUrl" });
  });
});
