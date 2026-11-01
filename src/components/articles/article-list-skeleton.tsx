"use client";

import { useTranslations } from "next-intl";
import { usePreferredListView } from "@/components/list-view-context";
import type { ListView } from "@/lib/list-view";

const bar = "animate-pulse rounded bg-muted";

/**
 * Esqueleto da listagem (Hoje, Todos, Feed, Pasta, Salvos), mostrado na hora do clique pelo
 * loading.tsx enquanto o servidor monta a página. Segue a visualização escolhida (cartões, grade
 * ou só texto) para a lista não trocar de formato quando chega.
 */
export function ArticleListSkeleton() {
  const t = useTranslations("ui");
  const { view } = usePreferredListView();
  return (
    <div role="status" aria-busy="true" data-view={view} className="flex h-full min-h-0 w-full flex-col">
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
      <div aria-hidden className="min-h-0 flex-1 overflow-hidden">
        <SkeletonBody view={view} />
      </div>
    </div>
  );
}

function SkeletonBody({ view }: { view: ListView }) {
  if (view === "grid") {
    return (
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 p-4 sm:p-5">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex flex-col overflow-hidden rounded-card border border-border bg-surface">
            <div className="aspect-[16/10] w-full animate-pulse bg-muted" />
            <div className="flex flex-col gap-2 p-3">
              <div className={`h-2.5 w-24 ${bar}`} />
              <div className={`h-3.5 w-full ${bar}`} />
              <div className={`h-3.5 w-3/4 ${bar}`} />
              <div className={`h-2.5 w-full ${bar}`} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (view === "titles") {
    return (
      <div className="mx-auto w-full max-w-4xl px-2 pb-6 sm:px-4">
        <div className="px-3 pt-4 pb-2">
          <div className={`h-3 w-20 ${bar}`} />
        </div>
        <ul className="flex flex-col">
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i} className="flex items-start gap-3 px-3 py-3">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" />
              <div className="hidden w-40 shrink-0 md:block">
                <div className={`h-3 w-28 ${bar}`} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className={`h-3.5 w-4/5 ${bar}`} />
                <div className={`h-2.5 w-full ${bar}`} />
              </div>
              <div className={`h-3 w-14 shrink-0 ${bar}`} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ul className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-4 sm:p-5">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="flex flex-col overflow-hidden rounded-card border border-border bg-surface sm:flex-row">
          <div className="aspect-[16/9] w-full shrink-0 animate-pulse bg-muted sm:aspect-auto sm:min-h-40 sm:w-60" />
          <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
            <div className={`h-3 w-32 ${bar}`} />
            <div className={`h-4 w-4/5 ${bar}`} />
            <div className={`h-3 w-full ${bar}`} />
            <div className={`h-3 w-2/3 ${bar}`} />
          </div>
        </li>
      ))}
    </ul>
  );
}
