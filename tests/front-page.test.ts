import { describe, expect, it } from "vitest";
import { buildStories, rankStories, type FrontRow } from "@/lib/front-page-rank";

const now = new Date("2026-11-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

let seq = 0;
function row(overrides: Partial<Omit<FrontRow, "feed">> & { feed?: string } = {}): FrontRow {
  const { feed = "f1", ...rest } = overrides;
  const id = `a${++seq}`;
  return {
    id,
    title: `Artigo ${id}`,
    url: `https://example.com/${id}`,
    snippet: null,
    imageUrl: "",
    publishedAt: hoursAgo(1),
    storyId: null,
    feed: { id: feed, title: feed.toUpperCase(), iconUrl: null },
    folderId: null,
    isRead: false,
    isSaved: false,
    isHighlighted: false,
    priorityScore: null,
    ...rest,
  };
}

describe("buildStories", () => {
  it("junta artigos do mesmo fato e conta os feeds diferentes", () => {
    const stories = buildStories(
      [row({ storyId: "s", feed: "a" }), row({ storyId: "s", feed: "b" }), row({ storyId: "s", feed: "b" }), row({ feed: "c" })],
      now,
    );
    expect(stories).toHaveLength(2);
    expect(stories[0].sourceCount).toBe(2);
    expect(stories[0].related).toHaveLength(1);
  });

  it("põe na frente o fato coberto por mais veículos, mesmo um pouco mais antigo", () => {
    const solo = row({ feed: "x", publishedAt: hoursAgo(0.5) });
    const covered = ["a", "b", "c", "d"].map((feed) => row({ storyId: "big", feed, publishedAt: hoursAgo(6) }));
    const [first] = buildStories([solo, ...covered], now);
    expect(first.sourceCount).toBe(4);
  });

  it("prefere um artigo com foto como representante do fato", () => {
    const plain = row({ storyId: "s", feed: "a", snippet: "texto longo" });
    const photo = row({ storyId: "s", feed: "b", imageUrl: "https://img/x.jpg" });
    expect(buildStories([plain, photo], now)[0].lead.id).toBe(photo.id);
  });

  it("rebaixa o que já foi lido", () => {
    const read = row({ isRead: true, publishedAt: hoursAgo(0) });
    const unread = row({ publishedAt: hoursAgo(3) });
    expect(buildStories([read, unread], now)[0].lead.id).toBe(unread.id);
  });
});

describe("rankStories", () => {
  it("monta manchete, destaques e uma seção por pasta sem repetir notícias", () => {
    const folders = [
      { id: "tec", name: "Tecnologia" },
      { id: "esp", name: "Esportes" },
    ];
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => row({ folderId: "tec", publishedAt: hoursAgo(i) })),
      ...Array.from({ length: 6 }, (_, i) => row({ folderId: "esp", publishedAt: hoursAgo(i + 0.5) })),
      row({ publishedAt: hoursAgo(20) }),
    ];
    const page = rankStories(rows, folders, now);
    expect(page.headline).not.toBeNull();
    expect(page.highlights).toHaveLength(5);
    expect(page.strip).toHaveLength(3);

    const shown = [page.headline!, ...page.highlights, ...page.strip, ...page.sections.flatMap((s) => s.stories)].map((s) => s.lead.id);
    expect(new Set(shown).size).toBe(shown.length);
    expect(page.sections.map((s) => s.name)).toEqual(["Tecnologia", "Esportes", null]);
  });

  it("sem notícias, não há manchete", () => {
    const page = rankStories([], [], now);
    expect(page.headline).toBeNull();
    expect(page.sections).toEqual([]);
  });
});

describe("decodeTextEntities", () => {
  it("decodifica acentos, numéricas e nomes comuns numa passada só", async () => {
    const { decodeTextEntities } = await import("@/lib/utils");
    expect(decodeTextEntities("avan&ccedil;os pr&oacute;ximos &#8220;ok&#x201D; &amp;lt;")).toBe("avanços próximos “ok” &lt;");
    expect(decodeTextEntities("&naoexiste; &#0;")).toBe("&naoexiste; &#0;");
  });
});
