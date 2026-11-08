"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { revealInline, useActiveIndicator } from "@/hooks/use-active-indicator";
import { useNavigation } from "@/components/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("settings.tabs");
  // activePath já é a aba clicada, antes de a página chegar do servidor: a aba responde na hora.
  const { activePath, navigate } = useNavigation();
  const tabs = [
    { href: "/settings", label: t("general") },
    { href: "/settings/feeds", label: t("feeds") },
    { href: "/settings/health", label: t("health") },
    { href: "/settings/ai", label: t("ai") },
    { href: "/settings/rules", label: t("rules") },
    { href: "/settings/apps", label: t("apps") },
    ...(isAdmin ? [{ href: "/settings/cleanup", label: t("cleanup") }] : []),
    ...(isAdmin ? [{ href: "/settings/admin", label: t("admin") }] : []),
  ];

  // Sublinhado único que desliza até a aba ativa (acompanha fonte e idioma).
  const navRef = useRef<HTMLElement>(null);
  const { ref: indicatorRef, box, animate } = useActiveIndicator('[aria-current="page"]', activePath);
  // Em telas estreitas as abas rolam: traz a aba escolhida para a vista (só na horizontal).
  useEffect(() => {
    revealInline(navRef.current, navRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null);
  }, [activePath]);

  return (
    <nav ref={navRef} className="relative flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const active = activePath === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onNavigate={() => navigate(tab.href)}
            // A rolagem fica onde está: trocar de aba não pula a página para o topo.
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-t-md px-3 py-2 text-sm text-muted-foreground transition-colors duration-200 hover:bg-accent/60 hover:text-foreground",
              active && "text-foreground",
            )}
          >
            {/* Peso fixo + sombra de texto no ativo: a largura não muda e o sublinhado não “pula”. */}
            <span className={cn("transition-[text-shadow] duration-200", active && "[text-shadow:0_0_0.6px_currentColor]")}>{tab.label}</span>
          </Link>
        );
      })}
      <span
        ref={indicatorRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary",
          animate && "transition-[translate,width] duration-[400ms] ease-[var(--motion-out)]",
          !box && "opacity-0",
        )}
        style={box ? { width: box.width, translate: `${box.left}px 0` } : undefined}
      />
    </nav>
  );
}

/**
 * Conteúdo da aba: enquanto a próxima aba carrega, o atual esmaece (a troca já começou).
 * Quando ela chega, o contêiner volta ao normal sem transição e a aba nova começa no mesmo
 * nível de esmaecimento (settings-in parte de opacity .45 + blur): a passagem é contínua,
 * sem o instante em branco de um fade a partir do zero.
 */
export function SettingsContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { pending } = useNavigation();
  return (
    <div
      aria-busy={pending || undefined}
      className={cn(pending && "pointer-events-none opacity-45 blur-[1.5px] transition-[opacity,filter] duration-300 ease-[var(--motion-out)]")}
    >
      <div key={pathname} className="flex animate-[settings-in_380ms_var(--motion-out)] flex-col gap-6">
        {children}
      </div>
    </div>
  );
}
