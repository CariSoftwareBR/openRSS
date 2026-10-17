"use server";

import { embed } from "ai";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { errorMessage } from "@/lib/ai/content";
import { createEmbeddingModel, embedPending, EMBEDDING_PROVIDER_TYPES } from "@/lib/ai/embeddings";
import type { ProviderType } from "@/lib/ai/providers";

type ProbeResult =
  | { ok: true; providerId: string; model: string; dimensions: number }
  | { ok: false; error: string };

/** Calcula um embedding de prova, sem gravar a configuração. */
async function probeEmbedding(input: { providerId: string; model: string }): Promise<ProbeResult> {
  await requireAdmin();
  const t = await getTranslations("semantic.errors");
  const model = z.string().trim().min(1).max(200).safeParse(input.model);
  if (!model.success) return { ok: false, error: t("modelRequired") };
  const provider = await db.aiProvider.findFirst({ where: { id: input.providerId, userId: null } });
  if (!provider || !EMBEDDING_PROVIDER_TYPES.includes(provider.type as ProviderType)) return { ok: false, error: t("providerInvalid") };

  try {
    const { embedding } = await embed({ model: createEmbeddingModel(provider, model.data), value: "openRSS", maxRetries: 0 });
    if (!embedding.length) throw new Error(t("emptyVector"));
    return { ok: true, providerId: provider.id, model: model.data, dimensions: embedding.length };
  } catch (err) {
    return { ok: false, error: t("testFailed", { reason: errorMessage(err, await getLocale()) }) };
  }
}

/** Confirma que o provedor responde com o modelo de embeddings, sem ativar a busca. */
export async function testEmbeddingAction(input: { providerId: string; model: string }) {
  const probed = await probeEmbedding(input);
  if (!probed.ok) return probed;
  return { ok: true as const, dimensions: probed.dimensions };
}

/**
 * Liga (provedor global + modelo) ou desliga a busca semântica. Antes de salvar, calcula um
 * embedding de teste para confirmar que o provedor responde; a indexação começa em seguida.
 */
export async function setEmbeddingConfigAction(input: { providerId: string | null; model: string }) {
  await requireAdmin();
  if (!input.providerId) {
    await db.appSettings.upsert({ where: { id: "app" }, create: { id: "app" }, update: { embeddingProviderId: null, embeddingModel: null } });
    revalidatePath("/settings/ai");
    return { ok: true as const };
  }
  const probed = await probeEmbedding({ providerId: input.providerId, model: input.model });
  if (!probed.ok) return probed;

  await db.appSettings.upsert({
    where: { id: "app" },
    create: { id: "app", embeddingProviderId: probed.providerId, embeddingModel: probed.model },
    update: { embeddingProviderId: probed.providerId, embeddingModel: probed.model },
  });
  void embedPending().catch((err) => console.error("[embeddings]", err));
  revalidatePath("/settings/ai");
  return { ok: true as const };
}
