"use client";

import { ArrowUpCircle, ExternalLink, Loader2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { triggerUpdateAction } from "@/app/actions/updates";
import type { UpdateInfo } from "@/lib/updates";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";

const DISMISSED_KEY = "openrss:dismissed-update";
/** Quanto esperar o openRSS voltar com a versão nova antes de desistir de recarregar sozinho. */
const RESTART_TIMEOUT_MS = 10 * 60_000;

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

/** Aviso de nova versão (só para administradores) com as novidades e o botão de atualizar. */
export function UpdateNotice({ update, ignoreDismissed = false }: { update: UpdateInfo; ignoreDismissed?: boolean }) {
  const t = useTranslations("updates");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [dismissedNow, setDismissedNow] = useState(false);
  const dismissed = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(DISMISSED_KEY) === update.latest,
    () => false,
  );
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (poll.current) clearInterval(poll.current);
  }, []);

  if (!ignoreDismissed && (dismissed || dismissedNow) && !open) return null;

  function waitForNewVersion() {
    const started = Date.now();
    poll.current = setInterval(async () => {
      if (Date.now() - started > RESTART_TIMEOUT_MS) {
        if (poll.current) clearInterval(poll.current);
        setTimedOut(true);
        return;
      }
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const health = (await res.json()) as { version?: string };
        if (health.version && health.version !== update.current) window.location.reload();
      } catch {
        // Fora do ar enquanto o container reinicia: tenta de novo.
      }
    }, 3000);
  }

  async function runUpdate() {
    setUpdating(true);
    setTimedOut(false);
    const res = await triggerUpdateAction().catch(() => ({ ok: true as const })); // conexão cortada = reiniciando
    if (!res.ok) {
      setUpdating(false);
      toast.error(res.error);
      return;
    }
    waitForNewVersion();
  }

  const instructions =
    update.install === "docker" ? (
      <>
        <p>{t("howDocker")}</p>
        <pre className="overflow-x-auto rounded-input bg-muted px-3 py-2 font-mono text-xs">docker compose pull && docker compose up -d</pre>
        <p className="text-muted-foreground">{t("howOneClick")}</p>
      </>
    ) : update.install === "source" ? (
      <>
        <p>{t("howSource")}</p>
        <pre className="overflow-x-auto rounded-input bg-muted px-3 py-2 font-mono text-xs">git pull && npm ci && npm run build</pre>
      </>
    ) : (
      <p>{t("howStore", { store: t(`stores.${update.install}`) })}</p>
    );

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !updating && setOpen(v)}>
      <div className="mx-3 mb-2 flex items-center gap-1 rounded-control border border-primary/30 bg-primary/5 pr-1 text-xs">
        <Dialog.Trigger asChild>
          <button type="button" className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left font-medium text-foreground">
            <ArrowUpCircle className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{t("available", { version: update.latest })}</span>
          </button>
        </Dialog.Trigger>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label={t("dismiss")}
          title={t("dismiss")}
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, update.latest);
            setDismissedNow(true);
          }}
        >
          <X />
        </Button>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-[10vh] left-1/2 z-50 flex max-h-[80vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col gap-4 overflow-hidden rounded-card border border-border bg-surface p-5 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold tracking-tight">{t("title", { version: update.latest })}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {update.publishedAt
                  ? t("subtitleDated", { current: update.current, date: format.dateTime(new Date(update.publishedAt), { dateStyle: "medium" }) })
                  : t("subtitle", { current: update.current })}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("close")} disabled={updating}>
                <X />
              </Button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-input border border-border px-4 py-3">
            <p className="eyebrow mb-2">{t("whatsNew")}</p>
            {update.notes.trim() ? <Markdown>{update.notes}</Markdown> : <p className="text-sm text-muted-foreground">{t("noNotes")}</p>}
          </div>

          {updating ? (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {timedOut ? t("restartSlow") : t("updating")}
            </p>
          ) : (
            !update.canSelfUpdate && <div className="flex flex-col gap-2 text-sm">{instructions}</div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button asChild variant="ghost" size="sm">
              <a href={update.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink /> {t("viewRelease")}
              </a>
            </Button>
            {update.canSelfUpdate && (
              <Button variant="primary" onClick={runUpdate} disabled={updating}>
                {updating ? <Loader2 className="animate-spin" /> : <ArrowUpCircle />}
                {t("updateNow")}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
