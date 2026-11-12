// Montagem da capa a partir dos artigos recentes. Sem banco nem "server-only": é testável.

export type FrontRow = {
  id: string;
  title: string;
  url: string | null;
  snippet: string | null;
  /** "" no banco = já verificado e sem imagem; null = ainda não verificado. */
  imageUrl: string | null;
  publishedAt: Date;
  storyId: string | null;
  feed: { id: string; title: string; iconUrl: string | null };
  folderId: string | null;
  isRead: boolean;
  isSaved: boolean;
  isHighlighted: boolean;
  priorityScore: number | null;
};

export type FrontArticle = Omit<FrontRow, "imageUrl" | "storyId" | "folderId" | "isHighlighted"> & {
  imageUrl: string | null;
  /** Já procuramos a capa (og:image) deste artigo; não vale buscar de novo. */
  imageChecked: boolean;
};

export type FrontStory = {
  lead: FrontArticle;
  /** Outras fontes do mesmo fato (um artigo por feed). */
  related: { id: string; title: string; feedTitle: string; feedIconUrl: string | null }[];
  /** Quantos feeds diferentes deram a notícia. */
  sourceCount: number;
  /** Publicação mais recente do grupo. */
  updatedAt: Date;
  folderId: string | null;
  score: number;
};

export type FrontSection = { id: string | null; name: string | null; stories: FrontStory[] };

export type FrontPage = {
  headline: FrontStory | null;
  highlights: FrontStory[];
  strip: FrontStory[];
  sections: FrontSection[];
  articleCount: number;
  sourceCount: number;
};

const HOUR = 3600_000;
const HIGHLIGHTS = 5;
const STRIP = 3;
const SECTION_SIZE = 5;
const MORE_SIZE = 6;

const hasImage = (row: { imageUrl: string | null }) => Boolean(row.imageUrl);

/**
 * Relevância de um fato para a capa. O que pesa mais é quantos veículos deram a notícia (sinal de
 * importância que não depende de IA); a nota da IA, a recência e a foto ajudam a desempatar.
 */
export function storyScore(group: FrontRow[], now: Date) {
  const feeds = new Set(group.map((r) => r.feed.id)).size;
  const newest = Math.max(...group.map((r) => Math.min(r.publishedAt.getTime(), now.getTime())));
  const ageHours = (now.getTime() - newest) / HOUR;
  const priority = Math.max(...group.map((r) => r.priorityScore ?? -1));

  let score = Math.min(feeds - 1, 5) * 16;
  if (priority >= 0) score += priority * 0.5;
  score += 30 * Math.max(0, 1 - ageHours / 48);
  if (group.some(hasImage)) score += 6;
  if (group.some((r) => r.isHighlighted)) score += 15;
  // Já lido inteiro: continua na capa (é um jornal), mas cede o lugar às novidades.
  if (group.every((r) => r.isRead)) score -= 25;
  return score;
}

/** Artigo que representa o fato: com foto, com nota maior da IA, mais completo e mais recente. */
function pickLead(group: FrontRow[]) {
  return [...group].sort(
    (a, b) =>
      Number(hasImage(b)) - Number(hasImage(a)) ||
      (b.priorityScore ?? -1) - (a.priorityScore ?? -1) ||
      (b.snippet?.length ?? 0) - (a.snippet?.length ?? 0) ||
      +b.publishedAt - +a.publishedAt,
  )[0];
}

function toArticle(row: FrontRow): FrontArticle {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    snippet: row.snippet,
    imageUrl: row.imageUrl || null,
    imageChecked: row.imageUrl !== null,
    publishedAt: row.publishedAt,
    feed: row.feed,
    isRead: row.isRead,
    isSaved: row.isSaved,
    priorityScore: row.priorityScore,
  };
}

/** Agrupa por fato (storyId) e ordena do mais importante para o menos. */
export function buildStories(rows: FrontRow[], now: Date): FrontStory[] {
  const groups = new Map<string, FrontRow[]>();
  for (const row of rows) {
    const key = row.storyId ?? row.id;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const stories: FrontStory[] = [];
  for (const group of groups.values()) {
    const lead = pickLead(group);
    const seenFeeds = new Set([lead.feed.id]);
    const related: FrontStory["related"] = [];
    for (const row of group) {
      if (seenFeeds.has(row.feed.id)) continue;
      seenFeeds.add(row.feed.id);
      related.push({ id: row.id, title: row.title, feedTitle: row.feed.title, feedIconUrl: row.feed.iconUrl });
    }
    stories.push({
      lead: toArticle(lead),
      related,
      sourceCount: seenFeeds.size,
      updatedAt: new Date(Math.max(...group.map((r) => r.publishedAt.getTime()))),
      folderId: sectionFolder(group),
      score: storyScore(group, now),
    });
  }
  return stories.sort((a, b) => b.score - a.score || +b.updatedAt - +a.updatedAt || (a.lead.id < b.lead.id ? -1 : 1));
}

/** Pasta da história: a da maioria das cópias. Empate fica com a nota da IA e a data, não com a foto. */
function sectionFolder(group: FrontRow[]): string | null {
  const buckets = new Map<string | null, { n: number; score: number; at: number }>();
  for (const row of group) {
    const cur = buckets.get(row.folderId) ?? { n: 0, score: -1, at: 0 };
    cur.n += 1;
    const score = row.priorityScore ?? -1;
    const at = row.publishedAt.getTime();
    if (score > cur.score || (score === cur.score && at > cur.at)) {
      cur.score = score;
      cur.at = at;
    }
    buckets.set(row.folderId, cur);
  }
  let best: string | null = null;
  let bestN = -1;
  let bestScore = -1;
  let bestAt = -1;
  for (const [folderId, cur] of buckets) {
    if (cur.n > bestN || (cur.n === bestN && (cur.score > bestScore || (cur.score === bestScore && cur.at > bestAt)))) {
      best = folderId;
      bestN = cur.n;
      bestScore = cur.score;
      bestAt = cur.at;
    }
  }
  return best;
}

/** Tira do array (in place) o primeiro item que satisfaz `test`, ou o primeiro de todos. */
function takePreferring<T>(list: T[], test: (item: T) => boolean, within = list.length) {
  const index = list.slice(0, within).findIndex(test);
  return list.splice(index >= 0 ? index : 0, 1)[0];
}

export function rankStories(rows: FrontRow[], folders: { id: string; name: string }[], now: Date): FrontPage {
  const pool = buildStories(rows, now);
  const storyCount = pool.length;
  const withPhoto = (s: FrontStory) => hasImage(s.lead) || !s.lead.imageChecked;

  // Manchete: a mais importante, preferindo uma com foto entre as três primeiras.
  const headline = pool.length ? takePreferring(pool, (s) => hasImage(s.lead), 3) : null;
  const highlights = pool.splice(0, HIGHLIGHTS);
  // Faixa de fotos: as próximas que têm (ou podem ter) imagem, entre as 15 seguintes.
  const strip: FrontStory[] = [];
  while (strip.length < STRIP && pool.length) strip.push(takePreferring(pool, withPhoto, 15));

  const sections: FrontSection[] = [];
  for (const folder of folders) {
    const stories = pool.filter((s) => s.folderId === folder.id).slice(0, SECTION_SIZE);
    if (stories.length) sections.push({ id: folder.id, name: folder.name, stories });
  }
  const used = new Set(sections.flatMap((s) => s.stories));
  const knownFolders = new Set(folders.map((f) => f.id));
  const more = pool.filter((s) => !used.has(s) && (!s.folderId || !knownFolders.has(s.folderId) || !sections.length)).slice(0, MORE_SIZE);
  if (more.length) sections.push({ id: null, name: null, stories: more });

  return {
    headline,
    highlights,
    strip,
    sections,
    articleCount: storyCount,
    sourceCount: new Set(rows.map((r) => r.feed.id)).size,
  };
}
