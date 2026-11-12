import "server-only";
import { isIP } from "node:net";
import { pinnedFetch } from "@/lib/network";
import { LocalizedError, type ServerErrorKey } from "@/lib/localized-error";

export const USER_AGENT = "openRSS/0.1 (+https://github.com/CariSoftwareBR/openRSS; feed reader)";

export class FetchError extends LocalizedError {
  constructor(
    key: ServerErrorKey,
    params: Record<string, string | number> = {},
    readonly status?: number,
    /** Retry-After (429/503), em segundos. */
    readonly retryAfterSec?: number,
  ) {
    super(key, params);
  }
}

export type SafeFetchResult = {
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  body: string;
  /** true quando houve redirect e todos foram permanentes (301/308): `url` é o novo endereço. */
  movedPermanently: boolean;
};

/** Retry-After em segundos (aceita segundos ou data HTTP). */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.round((date - now) / 1000));
}

/** Feeds na rede local (RSS-Bridge). Não vale para capa nem extração de artigo. */
export const privateFeedsAllowed = () => process.env.ALLOW_PRIVATE_FEEDS === "true";

const MULTI_PART_SUFFIX = new Set([
  "com.br", "net.br", "org.br", "gov.br",
  "co.uk", "org.uk", "com.au", "co.jp", "co.nz", "com.mx", "com.ar", "com.tr", "co.za",
  "com.cn", "com.tw", "co.kr", "com.sg", "com.pt", "com.co",
]);

function registrableDomain(hostname: string): string {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  if (isIP(host)) return host;
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return host;
  const tail = parts.slice(-2).join(".");
  if (MULTI_PART_SUFFIX.has(tail) && parts.length >= 3) return parts.slice(-3).join(".");
  return tail;
}

/** Mesmo site (domínio registrável), para aceitar uma URL nova de feed depois de um 301/308. */
export function sameSite(a: string, b: string): boolean {
  try {
    return registrableDomain(new URL(a).hostname) === registrableDomain(new URL(b).hostname);
  } catch {
    return false;
  }
}

/** fetch com timeout, limite de tamanho, redirects checados e proteção SSRF. */
export async function safeFetch(
  input: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number; accept?: string; allowPrivateNetwork?: boolean } = {},
): Promise<SafeFetchResult> {
  const { timeoutMs = 15000, maxBytes = 5 * 1024 * 1024 } = opts;
  let url = new URL(input);
  let redirects = 0;
  let allPermanent = true;

  for (let hop = 0; hop < 5; hop++) {
    let connection: Awaited<ReturnType<typeof pinnedFetch>>;
    try {
      connection = await pinnedFetch(
        url,
        {
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            "user-agent": USER_AGENT,
            accept: opts.accept ?? "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5",
            // Cache condicional só no primeiro hop: um 304 do destino do redirect não é "o feed não mudou".
            ...(hop === 0 ? opts.headers : {}),
          },
        },
        opts.allowPrivateNetwork ?? false,
      );
    } catch (error) {
      if (error instanceof LocalizedError) throw error;
      throw new FetchError("connectFailed", { reason: (error instanceof Error ? error.message : String(error)).slice(0, 300) });
    }
    try {
      const res = connection.response;
      const movedPermanently = redirects > 0 && allPermanent;
      // 304 não é redirect, mesmo com Location.
      if (res.status === 304) return { status: 304, url: url.toString(), headers: res.headers, body: "", movedPermanently };
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        const next = new URL(res.headers.get("location")!, url);
        if (url.protocol === "https:" && next.protocol !== "https:") throw new FetchError("insecureRedirect");
        url = next;
        redirects++;
        allPermanent &&= res.status === 301 || res.status === 308;
        continue;
      }
      if (!res.ok) throw new FetchError("httpStatus", { status: res.status }, res.status, parseRetryAfter(res.headers.get("retry-after")));

      const reader = res.body?.getReader();
      if (!reader) return { status: res.status, url: url.toString(), headers: res.headers, body: "", movedPermanently };
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new FetchError("responseTooLarge");
        }
        chunks.push(value);
      }
      const buffer = Buffer.concat(chunks);
      return { status: res.status, url: url.toString(), headers: res.headers, body: decode(buffer, res.headers), movedPermanently };
    } finally {
      await connection.close();
    }
  }
  throw new FetchError("tooManyRedirects");
}

function unquoteCharset(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/^["']+|["']+$/g, "").trim().toLowerCase();
  return cleaned || undefined;
}

/** Decodifica o corpo usando o charset do header (sem aspas) ou da declaração do XML. */
export function decodeFeedBody(buffer: Buffer, contentType: string | null): string {
  const fromHeader = unquoteCharset(/charset=\s*("[^"]*"|'[^']*'|[^;\s]+)/i.exec(contentType ?? "")?.[1]);
  const head = buffer.subarray(0, 1024).toString("latin1");
  const fromBody = unquoteCharset(/encoding=["']([^"']+)["']/i.exec(head)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]);
  const charset = fromHeader ?? fromBody ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function decode(buffer: Buffer, headers: { get(name: string): string | null }): string {
  return decodeFeedBody(buffer, headers.get("content-type"));
}
