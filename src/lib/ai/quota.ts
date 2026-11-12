/** Cota por usuário quando a chamada usa a chave da instância, não a chave dele. */
const WINDOW_MS = 10 * 60_000;
const MAX_CALLS = 30;

const calls = new Map<string, number[]>();

export function allowSharedAiCall(userId: string, usesSharedKey: boolean): boolean {
  if (!usesSharedKey) return true;
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_CALLS) {
    calls.set(userId, recent);
    return false;
  }
  recent.push(now);
  calls.set(userId, recent);
  if (calls.size > 5000) {
    for (const [key, stamps] of calls) {
      if (stamps.every((at) => now - at >= WINDOW_MS)) calls.delete(key);
    }
  }
  return true;
}

export function aiQuotaResponse() {
  return new Response("Too many requests", { status: 429, headers: { "retry-after": "60" } });
}
