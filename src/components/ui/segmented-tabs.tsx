"use client";

import { useEffect, useRef, useState } from "react";
import { revealInline, useActiveIndicator } from "@/hooks/use-active-indicator";
import { cn } from "@/lib/utils";

export type SegmentedTab<T extends string> = { value: T; label: string; icon?: React.ComponentType<{ className?: string }> };

/**
 * Sub-abas horizontais em controle segmentado: um fundo único desliza até a aba escolhida.
 * Acessível como tablist (setas, Home/End). Os painéis usam `segmentedPanelProps` para ligar
 * aria-controls/aria-labelledby.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  idPrefix,
  label,
  className,
}: {
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (value: T) => void;
  idPrefix: string;
  label: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const { ref: indicatorRef, box, animate } = useActiveIndicator('[aria-selected="true"]', value);
  // Abas que não cabem na largura: traz a escolhida para a vista (só na horizontal).
  useEffect(() => {
    revealInline(listRef.current, listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null);
  }, [value]);

  function onKeyDown(e: React.KeyboardEvent) {
    const index = tabs.findIndex((t) => t.value === value);
    const next =
      e.key === "ArrowRight" ? (index + 1) % tabs.length
      : e.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].value);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("relative flex max-w-full gap-0.5 overflow-x-auto rounded-control bg-muted p-1", className)}
    >
      <span
        ref={indicatorRef}
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-0 rounded-[calc(var(--radius-control)-2px)] bg-surface shadow-control ring-1 ring-border dark:bg-white/10 dark:ring-white/10",
          animate && "transition-[translate,width] duration-[380ms] ease-[var(--motion-out)]",
          !box && "opacity-0",
        )}
        style={box ? { width: box.width, translate: `${box.left}px 0` } : undefined}
      />
      {tabs.map((tab) => {
        const selected = tab.value === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative z-10 flex shrink-0 cursor-pointer items-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-sm whitespace-nowrap outline-none",
              "transition-[color,scale] duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className={cn("size-4 transition-colors duration-200", selected && "text-primary dark:text-ai")} />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Sub-aba atual, guardada em ?section= sem navegar (recarregar ou compartilhar volta para ela).
 * `sections` são as visíveis para este usuário; a primeira é o padrão e não aparece na URL.
 */
export function useSectionParam<T extends string>(sections: readonly T[], initial: T | undefined) {
  const fallback = sections[0];
  const [section, setSection] = useState<T>(initial && sections.includes(initial) ? initial : fallback);
  function change(next: T) {
    setSection(next);
    const url = new URL(window.location.href);
    if (next === fallback) url.searchParams.delete("section");
    else url.searchParams.set("section", next);
    window.history.replaceState(null, "", url);
  }
  return [section, change] as const;
}

/** Props do painel de uma aba (esconde os inativos sem desmontar: rascunhos e formulários abertos continuam). */
export function segmentedPanelProps(idPrefix: string, tab: string, active: string) {
  return {
    role: "tabpanel" as const,
    id: `${idPrefix}-panel-${tab}`,
    "aria-labelledby": `${idPrefix}-tab-${tab}`,
    hidden: tab !== active,
    // Ao reaparecer (sai de display:none), a animação de entrada roda de novo.
    className: "flex animate-[settings-in_340ms_var(--motion-out)] flex-col gap-6",
  };
}
