"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

/** Indicador neutro de carregamento de página (as listagens usam ArticleListSkeleton). */
export function PageLoading() {
  const t = useTranslations("ui");
  return (
    <div role="status" aria-live="polite" className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {t("loading")}
    </div>
  );
}
