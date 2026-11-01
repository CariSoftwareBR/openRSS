"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SidebarCounts, SidebarData } from "@/lib/queries";

type Ctx = {
  /** Pede ao servidor os contadores atuais (com debounce: vários cliques viram uma busca). */
  refreshCounts: () => void;
  /** Contadores buscados depois da última renderização da barra lateral, ou null. */
  counts: SidebarCounts | null;
};

const SidebarCountsContext = createContext<Ctx>({ refreshCounts: () => {}, counts: null });

export function SidebarCountsProvider({ sidebar, children }: { sidebar: SidebarData; children: React.ReactNode }) {
  // Os contadores valem só para a barra lateral para a qual foram buscados: quando o servidor
  // manda uma nova (navegação, router.refresh), ela já vem atualizada e eles são descartados.
  const [state, setState] = useState<{ base: SidebarData; counts: SidebarCounts } | null>(null);
  const sidebarRef = useRef(sidebar);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  useEffect(() => {
    sidebarRef.current = sidebar;
  }, [sidebar]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const refreshCounts = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const id = ++request.current;
      const base = sidebarRef.current;
      try {
        const res = await fetch("/api/sidebar/counts", { cache: "no-store" });
        if (!res.ok || id !== request.current) return;
        const counts = (await res.json()) as SidebarCounts;
        if (id === request.current) setState({ base, counts });
      } catch {
        // Sem rede: os contadores se corrigem na próxima navegação.
      }
    }, 250);
  }, []);

  const value = useMemo(
    () => ({ refreshCounts, counts: state && state.base === sidebar ? state.counts : null }),
    [refreshCounts, sidebar, state],
  );
  return <SidebarCountsContext.Provider value={value}>{children}</SidebarCountsContext.Provider>;
}

export const useSidebarCounts = () => useContext(SidebarCountsContext);

/** Aplica contadores atualizados à barra lateral (feeds, pastas, totais e salvos). */
export function applySidebarCounts(data: SidebarData, counts: SidebarCounts | null): SidebarData {
  if (!counts) return data;
  const sub = <T extends { feedId: string; unread: number }>(s: T): T => ({ ...s, unread: counts.unread[s.feedId] ?? 0 });
  const folders = data.folders.map((f) => {
    const subscriptions = f.subscriptions.map(sub);
    return { ...f, subscriptions, unread: subscriptions.reduce((n, s) => n + s.unread, 0) };
  });
  const unfiled = data.unfiled.map(sub);
  const totalUnread = [...folders.flatMap((f) => f.subscriptions), ...unfiled].reduce((n, s) => n + s.unread, 0);
  return { ...data, folders, unfiled, totalUnread, savedCount: counts.saved };
}
