"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { useActiveIndicator } from "@/hooks/use-active-indicator";
import { cn } from "@/lib/utils";

type NavigationState = {
  /** Rota que o menu deve mostrar como ativa: a clicada, mesmo antes de o servidor responder. */
  activePath: string;
  pending: boolean;
  /** Chame no onNavigate dos links do menu. */
  navigate: (href: string) => void;
};

const NavigationContext = createContext<NavigationState | null>(null);

/** Navegação otimista: o clique responde na hora, sem esperar a página nova chegar. */
export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null);
  // A página chegou (ou outra navegação mudou a rota): encerra o estado pendente.
  if (pending && pending.from !== pathname) setPending(null);

  // Rede: se a navegação falhar ou for cancelada, não deixa o menu preso no item clicado.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), 15000);
    return () => clearTimeout(timer);
  }, [pending]);

  const value: NavigationState = {
    activePath: pending?.href ?? pathname,
    pending: pending !== null,
    navigate: (href) => {
      // Voltar para a página atual cancela uma navegação ainda pendente (o Next descarta a anterior
      // e a rota não muda, então o estado pendente nunca seria encerrado).
      setPending(href === pathname ? null : { href, from: pathname });
    },
  };
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const value = useContext(NavigationContext);
  if (!value) throw new Error("useNavigation precisa de <NavigationProvider>");
  return value;
}

/**
 * Barra fina no topo enquanto a página carrega: avança rápido, desacelera esperando o servidor
 * e completa com um fade quando a página chega.
 */
export function NavigationProgress({ className }: { className?: string }) {
  const { pending } = useNavigation();
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [wasPending, setWasPending] = useState(pending);
  if (wasPending !== pending) {
    setWasPending(pending);
    setPhase(pending ? "loading" : "done");
  }
  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(() => setPhase("idle"), 450);
    return () => clearTimeout(timer);
  }, [phase]);

  return <div aria-hidden data-phase={phase} className={cn("nav-progress", className)} />;
}

/** Destaque do item ativo do menu: um único fundo que desliza até o item clicado (data-nav-active). */
export function NavIndicator({ activePath }: { activePath: string }) {
  const { ref, box, animate } = useActiveIndicator("[data-nav-active]", activePath);
  return (
    <span
      ref={ref}
      aria-hidden
      className={cn(
        "nav-indicator pointer-events-none absolute top-0 left-0 rounded-md bg-sidebar-active",
        animate && "transition-[translate,width,height,opacity] duration-[380ms] ease-[var(--motion-out)]",
        (!box || box.hidden) && "opacity-0",
      )}
      style={box ? { width: box.width, height: box.height, translate: `${box.left}px ${box.top}px` } : undefined}
    />
  );
}
