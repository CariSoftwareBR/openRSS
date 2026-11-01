import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/**
 * Lê primeiro e só cria a linha se faltar: um upsert em toda leitura é uma escrita, e no SQLite
 * escritas esperam a vez do agendador (até o busy timeout), travando a renderização da página.
 * `cache` deduplica as chamadas de uma mesma renderização; fora dela (actions, jobs) não guarda nada.
 */
export const getAppSettings = cache(async () => {
  return (
    (await db.appSettings.findUnique({ where: { id: "app" } })) ??
    db.appSettings.upsert({ where: { id: "app" }, create: { id: "app" }, update: {} })
  );
});

export const getUserSettings = cache(async (userId: string) => {
  return (
    (await db.userSettings.findUnique({ where: { userId } })) ??
    db.userSettings.upsert({ where: { userId }, create: { userId }, update: {} })
  );
});
