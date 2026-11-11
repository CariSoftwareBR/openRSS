import "server-only";
import pkg from "../../package.json";

/** Versão em execução (package.json, atualizado a cada release). */
export const APP_VERSION: string = pkg.version;

const REPOSITORY = "CariSoftwareBR/openRSS";
/** Imagem publicada pelo workflow Docker (ghcr.io), com uma tag por versão ("0.1.6"). */
const IMAGE = "carisoftwarebr/openrss";
const CHECK_INTERVAL_MS = 12 * 3600_000;
const RETRY_AFTER_FAILURE_MS = 3600_000;
/** Release publicada no GitHub, mas a imagem ainda está sendo construída: checa de novo logo. */
const RETRY_WHILE_BUILDING_MS = 15 * 60_000;

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
  openrssRelease?: { checkedAt: number; release: Release | null; pending?: Promise<boolean> };
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

/**
 * A imagem da versão já está no ghcr.io? A release é criada no GitHub antes do workflow Docker
 * terminar (~20 min, multi-arquitetura); até lá o Watchtower não acha nada novo para baixar.
 * A tag da versão só aparece no registro depois que todas as plataformas foram enviadas.
 */
export async function imagePublished(tag: string): Promise<boolean> {
  const version = tag.replace(/^v/i, "");
  const tokenRes = await fetch(`https://ghcr.io/token?scope=repository:${IMAGE}:pull`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!tokenRes.ok) throw new Error(`GHCR token ${tokenRes.status}`);
  const { token } = (await tokenRes.json()) as { token?: string };
  const res = await fetch(`https://ghcr.io/v2/${IMAGE}/manifests/${encodeURIComponent(version)}`, {
    method: "HEAD",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      accept: [
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
      ].join(", "),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`GHCR ${res.status}`);
  return true;
}

/** `building`: a release existe, mas a imagem dela ainda não foi publicada. */
async function fetchLatestRelease(): Promise<{ release: Release | null; building: boolean }> {
  const res = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
    headers: { accept: "application/vnd.github+json", "user-agent": `openRSS/${APP_VERSION}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = (await res.json()) as { tag_name?: string; body?: string; html_url?: string; published_at?: string; draft?: boolean; prerelease?: boolean };
  if (!data.tag_name || data.draft || data.prerelease) return { release: null, building: false };
  const release = {
    tag: data.tag_name,
    notes: (data.body ?? "").slice(0, 20_000),
    url: data.html_url ?? `https://github.com/${REPOSITORY}/releases`,
    publishedAt: data.published_at ?? null,
  };
  // Instalação a partir do código não depende da imagem; nas demais, só avisa quando dá para atualizar.
  if (installMethod() !== "source" && isNewerVersion(release.tag, APP_VERSION) && !(await imagePublished(release.tag))) {
    return { release: null, building: true };
  }
  return { release, building: false };
}

/**
 * Atualiza o cache em segundo plano (uma busca por vez; no máximo a cada 12 h, 1 h após falha,
 * 15 min enquanto a imagem da nova versão ainda está sendo publicada).
 * Resolve com `false` quando o GitHub não respondeu (o cache anterior continua valendo).
 */
function refreshRelease(force = false): Promise<boolean> {
  const state = globalForUpdates.openrssRelease;
  if (state?.pending) return state.pending;
  if (!force && state && Date.now() - state.checkedAt < CHECK_INTERVAL_MS) return Promise.resolve(true);
  const pending = fetchLatestRelease()
    .then(({ release, building }) => {
      globalForUpdates.openrssRelease = building
        ? // Mantém o aviso anterior (se houver) e volta a olhar em 15 min, não em 12 h.
          { checkedAt: Date.now() - CHECK_INTERVAL_MS + RETRY_WHILE_BUILDING_MS, release: state?.release ?? null }
        : { checkedAt: Date.now(), release };
      return true;
    })
    .catch((err) => {
      console.error("[updates]", err instanceof Error ? err.message : err);
      globalForUpdates.openrssRelease = {
        checkedAt: Date.now() - CHECK_INTERVAL_MS + RETRY_AFTER_FAILURE_MS,
        release: state?.release ?? null,
      };
      return false;
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

/** Checagem manual (botão "Verificar agora"): espera a resposta do GitHub e falha se ela não vier. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!(await refreshRelease(true))) throw new Error("update check failed");
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
