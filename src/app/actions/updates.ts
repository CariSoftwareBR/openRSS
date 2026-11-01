"use server";

import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/session";
import { checkForUpdate, triggerSelfUpdate, type UpdateInfo } from "@/lib/updates";

/** "Verificar agora": consulta o GitHub na hora (o aviso normal usa o cache de 12 h). */
export async function checkForUpdateAction(): Promise<{ ok: true; update: UpdateInfo | null } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    return { ok: true, update: await checkForUpdate() };
  } catch {
    return { ok: false, error: (await getTranslations("updates"))("checkFailed") };
  }
}

/** Botão "Atualizar": chama o webhook configurado (ex.: Watchtower), que baixa a imagem e reinicia. */
export async function triggerUpdateAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    await triggerSelfUpdate();
    return { ok: true };
  } catch (err) {
    console.error("[updates] webhook", err instanceof Error ? err.message : err);
    return { ok: false, error: (await getTranslations("updates"))("triggerFailed") };
  }
}
