import "server-only";
import pkg from "../../package.json";

/** Versão em execução (package.json, atualizado a cada release). */
export const APP_VERSION: string = pkg.version;

const REPOSITORY = "CariSoftwareBR/openRSS";
const CHECK_INTERVAL_MS = 12 * 3600_000;
const RETRY_AFTER_FAILURE_MS = 3600_000;

export type InstallMethod = "docker" | "umbrel" | "casaos" | "unraid" | "source";

export type UpdateInfo = {
  current: string;
  latest: string;
  /** Notas da release (Markdown do GitHub). */
  notes: string;
  url: string;
  publishedAt: string | null;
  /** Há um webhook (ex.: Watchtower) configurado para o botão "Atualizar". */
  canSelfUpdate: boolean;
  install: InstallMethod;
};

type Release = { tag: string; notes: string; url: string; publishedAt: string | null };

const globalForUpdates = globalThis as unknown as {
  openrssRelease?: { checkedAt: number; release: Release | null; pending?: Promise<void> };
};

export function updateCheckEnabled() {
  return process.env.OPENRSS_UPDATE_CHECK !== "false";
}

export function installMethod(): InstallMethod {
  const value = process.env.OPENRSS_INSTALL_METHOD?.trim().toLowerCase();
  return value === "umbrel" || value === "casaos" || value === "unraid" || value === "source" ? value : "docker";
}

function updateWebhook() {
  const url = process.env.OPENRSS_UPDATE_WEBHOOK_URL?.trim();
  return url ? { url, token: process.env.OPENRSS_UPDATE_WEBHOOK_TOKEN?.trim() || null } : null;
}

/** Compara versões "1.2.3" (ignora o "v" e sufixos de pré-release). */
export function isNewerVersion(candidate: string, current: string) {
  const parse = (v: string) => v.replace(/^v/i, "").split(/[-+]/)[0].split(".").map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

async function fetchLatestRelease(): Promise<Release | null> {
  const res = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
    headers: { accept: "application/vnd.github+json", "user-agent": `openRSS/${APP_VERSION}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = (await res.json()) as { tag_name?: string; body?: string; html_url?: string; published_at?: string; draft?: boolean; prerelease?: boolean };
  if (!data.tag_name || data.draft || data.prerelease) return null;
  return {
    tag: data.tag_name,
    notes: (data.body ?? "").slice(0, 20_000),
    url: data.html_url ?? `https://github.com/${REPOSITORY}/releases`,
    publishedAt: data.published_at ?? null,
  };
}

/** Atualiza o cache em segundo plano (uma busca por vez; no máximo a cada 12 h, 1 h após falha). */
function refreshRelease(force = false) {
  const state = globalForUpdates.openrssRelease;
  if (state?.pending) return state.pending;
  if (!force && state && Date.now() - state.checkedAt < CHECK_INTERVAL_MS) return Promise.resolve();
  const pending = fetchLatestRelease()
    .then((release) => {
      globalForUpdates.openrssRelease = { checkedAt: Date.now(), release };
    })
    .catch((err) => {
      console.error("[updates]", err instanceof Error ? err.message : err);
      globalForUpdates.openrssRelease = {
        checkedAt: Date.now() - CHECK_INTERVAL_MS + RETRY_AFTER_FAILURE_MS,
        release: state?.release ?? null,
      };
    });
  globalForUpdates.openrssRelease = { checkedAt: state?.checkedAt ?? 0, release: state?.release ?? null, pending };
  return pending;
}

function toInfo(release: Release | null): UpdateInfo | null {
  if (!release || !isNewerVersion(release.tag, APP_VERSION)) return null;
  return {
    current: APP_VERSION,
    latest: release.tag.replace(/^v/i, ""),
    notes: release.notes,
    url: release.url,
    publishedAt: release.publishedAt,
    canSelfUpdate: updateWebhook() !== null,
    install: installMethod(),
  };
}

/**
 * Nova versão disponível, a partir do cache. Nunca espera a rede: usado na renderização do layout,
 * dispara a checagem em segundo plano quando o cache venceu.
 */
export function getCachedUpdate(): UpdateInfo | null {
  if (!updateCheckEnabled()) return null;
  void refreshRelease();
  return toInfo(globalForUpdates.openrssRelease?.release ?? null);
}

/** Checagem manual (botão "Verificar agora"): espera a resposta do GitHub. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  await refreshRelease(true);
  return toInfo(globalForUpdates.openrssRelease?.release ?? null);
}

/** Dispara o webhook de atualização (ex.: Watchtower HTTP API), que baixa a imagem nova e reinicia. */
export async function triggerSelfUpdate() {
  const hook = updateWebhook();
  if (!hook) throw new Error("update webhook not configured");
  // URL definida pelo administrador no ambiente (geralmente um container na rede interna):
  // fetch direto, sem a proteção SSRF usada para URLs vindas de usuários.
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: hook.token ? { authorization: `Bearer ${hook.token}` } : {},
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`webhook ${res.status}`);
  } catch (err) {
    // O Watchtower responde só depois de baixar a imagem (e às vezes nunca, porque reinicia este
    // container no meio): demora não é falha, a atualização já começou.
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return;
    throw err;
  }
}
