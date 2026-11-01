import "server-only";
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

/** fetch com timeout, limite de tamanho, redirects checados e proteção SSRF. */
export async function safeFetch(
  input: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number; accept?: string } = {},
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
            ...opts.headers,
          },
        },
        process.env.ALLOW_PRIVATE_FEEDS === "true",
      );
    } catch (error) {
      if (error instanceof LocalizedError) throw error;
      throw new FetchError("connectFailed", { reason: (error instanceof Error ? error.message : String(error)).slice(0, 300) });
    }
    try {
      const res = connection.response;
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        redirects++;
        allPermanent &&= res.status === 301 || res.status === 308;
        continue;
      }
      const movedPermanently = redirects > 0 && allPermanent;
      if (res.status === 304) return { status: 304, url: url.toString(), headers: res.headers, body: "", movedPermanently };
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

function decode(buffer: Buffer, headers: { get(name: string): string | null }): string {
  const fromHeader = /charset=([^;]+)/i.exec(headers.get("content-type") ?? "")?.[1];
  const head = buffer.subarray(0, 1024).toString("latin1");
  const fromBody = /encoding=["']([^"']+)["']/i.exec(head)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const charset = (fromHeader ?? fromBody ?? "utf-8").trim().toLowerCase();
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}
