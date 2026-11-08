"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

/**
 * Troca o tema revelando o novo num círculo que nasce no botão (View Transitions API).
 * Sem suporte do navegador, ou com movimento reduzido, a troca é imediata.
 */
function switchTheme(next: Theme, origin: HTMLElement, setTheme: (theme: Theme) => void) {
  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduced) {
    setTheme(next);
    return;
  }

  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  // Raio até o canto mais distante da janela: o círculo cobre a tela toda ao terminar.
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  root.style.setProperty("--theme-x", `${x}px`);
  root.style.setProperty("--theme-y", `${y}px`);
  root.style.setProperty("--theme-r", `${radius}px`);
  // Token por troca: com dois cliques rápidos, o fim da primeira não apaga a marca da segunda.
  const token = String(performance.now());
  root.dataset.themeTransition = token;

  const transition = document.startViewTransition(() => {
    // O next-themes aplica a classe num efeito; aplicamos já para a captura do "depois" sair certa.
    root.classList.toggle("dark", next === "dark");
    root.style.colorScheme = next;
    flushSync(() => setTheme(next));
  });
  transition.finished.finally(() => {
    if (root.dataset.themeTransition === token) delete root.dataset.themeTransition;
  });
}

/** Alterna só entre Light e Dark; na primeira visita o tema segue o sistema até o primeiro clique. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const isDark = mounted && resolvedTheme === "dark";
  const label = mounted ? t(isDark ? "dark" : "light") : undefined;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label ?? t("light")}
      className={className}
      onClick={(e) => switchTheme(isDark ? "light" : "dark", e.currentTarget, setTheme)}
    >
      {/* Ícone pela classe .dark do <html>: aparece certo já no primeiro paint, sem esperar a hidratação. */}
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  );
}
