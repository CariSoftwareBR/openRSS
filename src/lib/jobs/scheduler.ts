import "server-only";
import { Cron } from "croner";
import { tuneDatabase } from "@/lib/db";
import { applyRetention, refreshDueFeeds } from "@/lib/feeds/refresh";
import { indexPendingEmbeddings, processNewArticles } from "@/lib/feeds/pipeline";
import { groupRecentStories } from "@/lib/feeds/stories";
import { fillPendingPreviewImages } from "@/lib/feeds/preview-image";
import { runScheduledDigests } from "@/lib/ai/digest";
import { acquireLock, withLock } from "./lock";
import { backupSqlite, maintainSqlite, pruneAudioCache } from "./maintenance";

const globalForJobs = globalThis as unknown as { openrssJobs?: Cron[] };

export async function startScheduler() {
  if (globalForJobs.openrssJobs) return;
  await tuneDatabase().catch((err) => console.error("[jobs] tuneDatabase", err));
  // Agrupa os artigos recentes que chegaram antes do agrupamento existir (ou de uma falha).
  // No máximo uma vez por dia: o lock não é liberado e vence em 24 h, então reinícios seguidos
  // (deploys, crash loop) não repetem o reprocessamento de milhares de títulos.
  void acquireLock("group-stories-boot", 24 * 3600_000)
    .then((acquired) => (acquired ? groupRecentStories() : 0))
    .catch((err) => console.error("[jobs] groupRecentStories", err));

  const log = (name: string) => (err: unknown) => console.error(`[jobs:${name}]`, err);

  globalForJobs.openrssJobs = [
    new Cron("* * * * *", { protect: true }, async () => {
      await withLock("refresh", 10 * 60_000, async () => {
        const created = await refreshDueFeeds();
        if (created.length) {
          console.log(`[jobs:refresh] ${created.length} artigos novos`);
          await processNewArticles(created).catch(log("process"));
        }
        await indexPendingEmbeddings();
      }).catch(log("refresh"));
    }),
    // Capas (og:image) dos artigos recentes cujo feed não traz imagem: a listagem já abre com elas.
    new Cron("30 */2 * * * *", { protect: true }, async () => {
      await withLock("preview-images", 5 * 60_000, () => fillPendingPreviewImages()).catch(log("preview-images"));
    }),
    new Cron("5 * * * *", { protect: true }, async () => {
      await withLock("digest", 30 * 60_000, () => runScheduledDigests()).catch(log("digest"));
    }),
    new Cron("30 3 * * *", { protect: true }, async () => {
      await withLock("retention", 30 * 60_000, async () => {
        const removed = await applyRetention();
        if (removed) console.log(`[jobs:retention] ${removed} artigos removidos`);
        const audios = await pruneAudioCache();
        if (audios) console.log(`[jobs:retention] ${audios} áudios antigos removidos do cache`);
        await maintainSqlite();
      }).catch(log("retention"));
    }),
    // Domingo de madrugada: cópia do SQLite (só com OPENRSS_SQLITE_BACKUP=true).
    new Cron("15 4 * * 0", { protect: true }, async () => {
      await withLock("backup", 60 * 60_000, async () => {
        const file = await backupSqlite();
        if (file) console.log(`[jobs:backup] ${file}`);
      }).catch(log("backup"));
    }),
  ];
  console.log("[jobs] agendador iniciado");
}
