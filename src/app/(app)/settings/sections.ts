/**
 * Sub-abas das telas de Configurações. O valor fica em ?section= para sobreviver a um
 * recarregamento; o primeiro de cada lista é o padrão (e some da URL).
 * Arquivo sem "use client": as páginas, no servidor, também leem estas listas.
 */
export const GENERAL_SECTIONS = ["account", "language", "reading", "shortcuts"] as const;
export const FEEDS_SECTIONS = ["subscriptions", "folders", "transfer"] as const;
export const APPS_SECTIONS = ["clients", "passwords", "bookmarklet"] as const;
export const AI_SECTIONS = ["preferences", "audio", "system", "search"] as const;
export const ADMIN_SECTIONS = ["users", "instance", "mail", "version"] as const;

export type GeneralSection = (typeof GENERAL_SECTIONS)[number];
export type FeedsSection = (typeof FEEDS_SECTIONS)[number];
export type AppsSection = (typeof APPS_SECTIONS)[number];
export type AiSection = (typeof AI_SECTIONS)[number];
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

/** Lê ?section= da URL; valores desconhecidos viram undefined (a tela usa o padrão). */
export function parseSection<T extends string>(sections: readonly T[], value: unknown): T | undefined {
  return sections.find((s) => s === value);
}
