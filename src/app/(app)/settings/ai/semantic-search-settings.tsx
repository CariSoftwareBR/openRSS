"use client";

import { Loader2, TriangleAlert, Zap } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { listModelsAction } from "@/app/actions/ai";
import { setEmbeddingConfigAction, testEmbeddingAction } from "@/app/actions/embeddings";
import { ModelCombobox } from "@/components/model-combobox";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Card, Field } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Provider = { id: string; name: string; type: string };

const MODEL_HINT: Record<string, string> = {
  openai: "text-embedding-3-small",
  openai_compatible: "nomic-embed-text",
  openrouter: "openai/text-embedding-3-small",
};

/** Modelos de embedding primeiro; o restante continua disponível para nome personalizado. */
function embeddingModelsFirst<T extends { id: string }>(models: T[]): T[] {
  const rank = (id: string) => (/embed/i.test(id) ? 0 : 1);
  return [...models].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

/** Admin: provedor e modelo de embeddings da busca semântica. */
export function SemanticSearchSettings({
  providers,
  current,
  status,
}: {
  providers: Provider[];
  current: { providerId: string | null; model: string };
  status: { indexed: number; total: number } | null;
}) {
  const t = useTranslations("semantic");
  const [providerId, setProviderId] = useState(current.providerId ?? "");
  const [model, setModel] = useState(current.model);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const selected = providers.find((p) => p.id === providerId);
  const busy = pending || testing;

  function save(enable: boolean) {
    start(async () => {
      const res = await setEmbeddingConfigAction(enable ? { providerId, model } : { providerId: null, model: "" });
      if (!res.ok) return void toast.error(res.error);
      toast.success(enable ? t("enabled") : t("disabled"));
      if (!enable) {
        setProviderId("");
        setModel("");
      }
    });
  }

  function test() {
    startTest(async () => {
      const res = await testEmbeddingAction({ providerId, model });
      if (!res.ok) return void toast.error(res.error);
      toast.success(t("tested", { dimensions: res.dimensions }));
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow">{t("title")}</h2>
      <Card className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{t("description")}</p>
        {providers.length === 0 ? (
          <p className="flex items-start gap-2 rounded-input border border-border px-3 py-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
            {t("noProviders")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("provider")}>
              <Combobox
                aria-label={t("provider")}
                value={providerId}
                onValueChange={setProviderId}
                placeholder={t("choose")}
                options={providers.map((p) => ({ value: p.id, label: p.name, description: p.type }))}
              />
            </Field>
            <Field label={t("model")} hint={selected ? t("modelHint", { example: MODEL_HINT[selected.type] ?? "" }) : undefined}>
              <ModelCombobox
                value={model}
                onValueChange={setModel}
                placeholder={selected ? MODEL_HINT[selected.type] : undefined}
                cacheKey={providerId || null}
                unavailableReason={t("choose")}
                load={async () => {
                  const res = await listModelsAction(providerId);
                  return res.ok ? { ok: true, models: embeddingModelsFirst(res.models) } : res;
                }}
              />
            </Field>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={busy || !providerId || !model.trim()} onClick={() => save(true)}>
            {pending && <Loader2 className="animate-spin" />} {current.providerId ? t("update") : t("enable")}
          </Button>
          <Button variant="ghost" disabled={busy || !providerId || !model.trim()} onClick={test}>
            {testing ? <Loader2 className="animate-spin" /> : <Zap />} {t("test")}
          </Button>
          {current.providerId && (
            <Button variant="ghost" disabled={busy} onClick={() => save(false)}>
              {t("disable")}
            </Button>
          )}
          {status && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", status.indexed >= status.total ? "bg-success" : "animate-pulse bg-ai")}
              />
              {t("status", { indexed: status.indexed, total: status.total })}
            </span>
          )}
        </div>
      </Card>
    </section>
  );
}
