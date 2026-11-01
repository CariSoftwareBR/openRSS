import "server-only";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { db, getDbProvider } from "@/lib/db";
import { readDataDir } from "@/lib/env";

/** Áudio de TTS guardado no banco (blobs): depois disto é gerado de novo se alguém pedir. */
const AUDIO_CACHE_DAYS = 30;
const BACKUPS_KEPT = 3;

/** Remove áudios antigos do cache de TTS, a maior fonte de crescimento do banco. */
export async function pruneAudioCache(now = Date.now()) {
  const { count } = await db.articleAudio.deleteMany({ where: { createdAt: { lt: new Date(now - AUDIO_CACHE_DAYS * 86400_000) } } });
  return count;
}

/**
 * Manutenção leve e diária do SQLite: estatísticas do planejador (PRAGMA optimize) e o WAL
 * devolvido ao disco. Sem VACUUM completo, que reescreve o banco inteiro.
 */
export async function maintainSqlite() {
  if (getDbProvider() !== "sqlite") return;
  await db.$queryRawUnsafe("PRAGMA optimize;");
  await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
}

/**
 * Cópia compacta e consistente do SQLite (VACUUM INTO) em <dados>/backups, mantendo as 3 mais
 * recentes. Opcional (OPENRSS_SQLITE_BACKUP=true): custa disco e I/O uma vez por semana.
 */
export async function backupSqlite(now = new Date()) {
  if (getDbProvider() !== "sqlite" || process.env.OPENRSS_SQLITE_BACKUP !== "true") return null;
  const dir = path.resolve(readDataDir(), "backups");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `openrss-${now.toISOString().slice(0, 10)}.db`);
  await rm(file, { force: true });
  // Caminho gerado aqui (data + pasta configurada pelo admin); aspas simples escapadas por segurança.
  await db.$executeRawUnsafe(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const backups = (await readdir(dir)).filter((f) => /^openrss-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - BACKUPS_KEPT))) await rm(path.join(dir, old), { force: true });
  return file;
}
