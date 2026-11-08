"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { updateProfileAction, updateSettingsAction } from "@/app/actions/settings";
import { isLocale, localeLabels, locales, type Locale } from "@/i18n/config";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Card, Field, Input, Label, Switch } from "@/components/ui/input";
import { BookOpen, Keyboard, KeyRound, Languages, LayoutGrid, List, Rows3, UserRound } from "lucide-react";
import { SegmentedTabs, segmentedPanelProps, useSectionParam, type SegmentedTab } from "@/components/ui/segmented-tabs";
import type { GeneralSection } from "./sections";
import { authClient } from "@/lib/auth-client";
import { OIDC_PROVIDER_ID } from "@/lib/oidc";

const SHORTCUTS = [
  ["j / k", "nextPrev"],
  ["o", "openOriginal"],
  ["m", "toggleRead"],
  ["s", "save"],
  ["Shift + A", "markAllRead"],
  ["/", "search"],
  ["Esc", "closeReader"],
] as const;

export function GeneralForm(props: {
  name: string;
  email: string;
  language: string;
  uiLanguage: string;
  timezone: string;
  listView: string;
  groupStories: boolean;
  markReadOnScroll: boolean;
  sso: { name: string; linked: boolean } | null;
  timezones: string[];
  initialSection?: GeneralSection;
}) {
  const t = useTranslations("settings.general");
  const tArticles = useTranslations("articles");
  const tLocale = useTranslations("locale");
  const router = useRouter();
  const [name, setName] = useState(props.name);
  const [language, setLanguage] = useState(props.language);
  const [uiLanguage, setUiLanguage] = useState<Locale>(isLocale(props.uiLanguage) ? props.uiLanguage : "pt-BR");
  const [timezone, setTimezone] = useState(props.timezone);
  const [listView, setListView] = useState(props.listView);
  const [groupStories, setGroupStories] = useState(props.groupStories);
  const [markReadOnScroll, setMarkReadOnScroll] = useState(props.markReadOnScroll);
  const [pending, start] = useTransition();

  const sections: SegmentedTab<GeneralSection>[] = [
    { value: "account", label: t("sections.account"), icon: UserRound },
    { value: "language", label: t("sections.language"), icon: Languages },
    { value: "reading", label: t("sections.reading"), icon: BookOpen },
    { value: "shortcuts", label: t("shortcuts"), icon: Keyboard },
  ];
  const [section, changeSection] = useSectionParam(
    sections.map((s) => s.value),
    props.initialSection,
  );

  // Um campo obrigatório pode estar numa sub-aba escondida (display:none): o navegador recusaria o
  // envio sem mostrar nada. Abre a sub-aba do primeiro campo inválido e mostra o aviso nele.
  const revealing = useRef(false);
  function revealInvalid(e: React.FormEvent<HTMLFormElement>) {
    const field = e.target as HTMLInputElement;
    const panel = field.closest<HTMLElement>('[role="tabpanel"]');
    if (!panel?.hidden || revealing.current) return;
    const tab = sections.find((s) => panel.id === `general-panel-${s.value}`)?.value;
    if (!tab) return;
    revealing.current = true;
    changeSection(tab);
    requestAnimationFrame(() => {
      revealing.current = false;
      field.reportValidity();
    });
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const [a, b] = await Promise.all([
        updateProfileAction(name),
        updateSettingsAction({ language, uiLanguage, timezone, listView: listView as "cards" | "grid" | "titles", groupStories, markReadOnScroll }),
      ]);
      const err = (!a.ok && a.error) || (!b.ok && b.error);
      if (err) {
        toast.error(err);
        return;
      }
      toast.success(t("saved"));
      // Re-renderiza o shell no idioma novo.
      if (uiLanguage !== props.uiLanguage) router.refresh();
    });
  }

  return (
    // Um formulário só: cada sub-aba edita uma parte e o "Salvar" grava tudo de uma vez.
    <form onSubmit={save} onInvalidCapture={revealInvalid} className="flex flex-col gap-6">
      <SegmentedTabs tabs={sections} value={section} onChange={changeSection} idPrefix="general" label={t("sections.label")} className="self-start" />

      <div {...segmentedPanelProps("general", "account", section)}>
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label={t("name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label={t("email")}>
            <Input value={props.email} disabled />
          </Field>
        </Card>
        {props.sso && (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow mb-1">{t("sso")}</p>
              <p className="text-xs text-muted-foreground">
                {props.sso.linked ? t("ssoLinked", { name: props.sso.name }) : t("ssoNotLinked", { name: props.sso.name })}
              </p>
            </div>
            {!props.sso.linked && (
              <Button
                type="button"
                onClick={async () => {
                  const { error } = await authClient.linkSocial({ provider: OIDC_PROVIDER_ID, callbackURL: "/settings", errorCallbackURL: "/settings" });
                  if (error) toast.error(error.message ?? t("ssoConnect", { name: props.sso!.name }));
                }}
              >
                <KeyRound /> {t("ssoConnect", { name: props.sso.name })}
              </Button>
            )}
          </Card>
        )}
      </div>

      <div {...segmentedPanelProps("general", "language", section)}>
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label={tLocale("label")} hint={tLocale("hint")}>
            <Combobox
              aria-label={tLocale("label")}
              value={uiLanguage}
              onValueChange={(v) => isLocale(v) && setUiLanguage(v)}
              options={locales.map((value) => ({ value, label: localeLabels[value] }))}
            />
          </Field>
          <Field label={t("aiLanguage")} hint={t("aiLanguageHint")}>
            <Combobox
              aria-label={t("aiLanguage")}
              value={language}
              onValueChange={setLanguage}
              options={locales.map((value) => ({ value, label: localeLabels[value] }))}
            />
          </Field>
          <Field label={t("timezone")}>
            <Combobox
              aria-label={t("timezone")}
              value={timezone}
              onValueChange={setTimezone}
              searchPlaceholder={t("timezoneSearch")}
              options={props.timezones.map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }))}
            />
          </Field>
        </Card>
      </div>

      <div {...segmentedPanelProps("general", "reading", section)}>
        <Card className="grid gap-4 sm:grid-cols-2">
          <Field label={t("listView")}>
            <Combobox
              aria-label={t("listView")}
              value={listView}
              onValueChange={setListView}
              options={[
                { value: "cards", label: tArticles("views.cards"), description: tArticles("viewDescriptions.cards"), icon: <Rows3 /> },
                { value: "grid", label: tArticles("views.grid"), description: tArticles("viewDescriptions.grid"), icon: <LayoutGrid /> },
                { value: "titles", label: tArticles("views.titles"), description: tArticles("viewDescriptions.titles"), icon: <List /> },
              ]}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">{t("theme")}</span>
            <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
              <ThemeToggle /> {t("themeOptions")}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <Label htmlFor="group-stories" className="flex flex-col gap-0.5">
              {t("groupStories")}
              <span className="font-normal text-muted-foreground">{t("groupStoriesHint")}</span>
            </Label>
            <Switch id="group-stories" checked={groupStories} onCheckedChange={setGroupStories} />
          </div>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <Label htmlFor="mark-read-on-scroll" className="flex flex-col gap-0.5">
              {t("markReadOnScroll")}
              <span className="font-normal text-muted-foreground">{t("markReadOnScrollHint")}</span>
            </Label>
            <Switch id="mark-read-on-scroll" checked={markReadOnScroll} onCheckedChange={setMarkReadOnScroll} />
          </div>
        </Card>
      </div>

      <div {...segmentedPanelProps("general", "shortcuts", section)}>
        <Card className="text-xs text-muted-foreground">
          <ul className="grid gap-2 sm:grid-cols-2">
            {SHORTCUTS.map(([k, key]) => (
              <li key={k}>
                <kbd className="rounded border border-border px-1 font-mono">{k}</kbd> {t(`shortcutList.${key}`)}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Atalhos é só leitura: ali não há o que salvar. */}
      {section !== "shortcuts" && (
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
