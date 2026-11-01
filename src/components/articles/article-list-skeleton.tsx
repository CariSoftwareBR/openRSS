"use client";

import { useTranslations } from "next-intl";

/**
 * Esqueleto da listagem (Hoje, Todos, Feed, Pasta, Salvos), mostrado na hora do clique pelo
 * loading.tsx enquanto o servidor monta a página: sem ele a tela anterior fica congelada.
 */
export function ArticleListSkeleton() {
  const t = useTranslations("ui");
  return (
    <div role="status" aria-busy="true" className="flex h-full min-h-0 w-full flex-col">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
          <div className="ml-auto flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="size-7 animate-pulse rounded-control bg-muted" />
            ))}
          </div>
        </div>
        <div className="h-8 w-full animate-pulse rounded-input bg-muted" />
      </div>
      <ul aria-hidden className="mx-auto flex w-full max-w-5xl flex-col gap-3 overflow-hidden p-4 sm:p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="flex flex-col overflow-hidden rounded-card border border-border bg-surface sm:flex-row">
            <div className="aspect-[16/9] w-full shrink-0 animate-pulse bg-muted sm:aspect-auto sm:min-h-40 sm:w-60" />
            <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
