"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ListView } from "@/lib/list-view";

type Ctx = { view: ListView; setView: (view: ListView) => void };

const ListViewContext = createContext<Ctx>({ view: "cards", setView: () => {} });

/**
 * Visualização da lista escolhida pelo usuário, disponível fora da página: o esqueleto de
 * carregamento (loading.tsx) usa o mesmo formato que a lista vai ter, sem trocar de layout.
 */
export function ListViewProvider({ initial, children }: { initial: ListView; children: React.ReactNode }) {
  // Vale a escolha local até o servidor mandar outra (ex.: alterada em Configurações).
  const [state, setState] = useState({ base: initial, view: initial });
  const view = state.base === initial ? state.view : initial;
  const setView = useCallback((next: ListView) => setState({ base: initial, view: next }), [initial]);
  const value = useMemo(() => ({ view, setView }), [view, setView]);
  return <ListViewContext.Provider value={value}>{children}</ListViewContext.Provider>;
}

export const usePreferredListView = () => useContext(ListViewContext);
