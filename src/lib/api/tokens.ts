import "server-only";
import { createHash, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { db } from "@/lib/db";
import { readAppSecret } from "@/lib/env";

const scryptAsync = promisify(scrypt) as (value: string, salt: string, keylen: number) => Promise<Buffer>;

/**
 * Hash guardado no banco para senhas de aplicativo e api_keys da Fever: scrypt (KDF lenta) com
 * sal fixo derivado do segredo da instância. O sal é determinístico para permitir a busca pelo
 * hash (índice único); as senhas são aleatórias, então não há senhas repetidas a proteger.
 */
async function storageHash(value: string) {
  return (await scryptAsync(value, `openrss:api-token:${readAppSecret()}`, 32)).toString("hex");
}

/** Hashes de credenciais válidas: os apps sincronizam a cada poucos minutos sem pagar o scrypt. */
const validCache = new Map<string, string>();
/** Credenciais recusadas há pouco (por sha256): um app mal configurado repetindo não custa scrypt. */
const rejected = new Map<string, number>();
const REJECTED_TTL_MS = 10 * 60_000;

/**
 * Scrypt de valores desconhecidos com concorrência limitada e fila curta. O scrypt usa o
 * threadpool da libuv (o mesmo do DNS): no máximo 2 rodam juntos, e os demais esperam a vez em
 * vez de serem recusados. Só uma enxurrada que enche a fila é recusada. Diferente de um limite por
 * minuto, não deixa ninguém trancar os apps legítimos por um minuto inteiro, e não depende de IP
 * (que sem proxy não existe aqui e, com proxy, pode ser forjado no X-Forwarded-For).
 */
const MAX_CONCURRENT_UNKNOWN = 2;
const MAX_QUEUED_UNKNOWN = 50;
let runningUnknown = 0;
const waitingUnknown: (() => void)[] = [];

async function withScryptSlot<T>(fn: () => Promise<T>): Promise<T | null> {
  if (runningUnknown >= MAX_CONCURRENT_UNKNOWN) {
    if (waitingUnknown.length >= MAX_QUEUED_UNKNOWN) return null;
    await new Promise<void>((resolve) => waitingUnknown.push(resolve));
  } else {
    runningUnknown++;
  }
  try {
    return await fn();
  } finally {
    // Passa a vaga direto para o próximo da fila (sem liberar e disputar de novo).
    const next = waitingUnknown.shift();
    if (next) next();
    else runningUnknown--;
  }
}

const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

type Field = "secretHash" | "feverKeyHash";
const whereFor = (field: Field, hash: string) => (field === "secretHash" ? { secretHash: hash } : { feverKeyHash: hash });

async function lookup(value: string, field: Field): Promise<ApiUser | null> {
  // Chave por tipo: a mesma string enviada como senha GReader e como api_key Fever são coisas distintas.
  const cacheKey = `${field}:${value}`;
  const known = validCache.get(cacheKey);
  if (known) {
    const user = await resolve(whereFor(field, known));
    if (!user) validCache.delete(cacheKey); // token revogado
    return user;
  }
  const now = Date.now();
  const key = fingerprint(cacheKey);
  if ((rejected.get(key) ?? 0) > now) return null;

  const hash = await withScryptSlot(() => storageHash(value));
  if (hash === null) return null;
  const user = await resolve(whereFor(field, hash));
  if (user) {
    if (validCache.size >= 1000) validCache.delete(validCache.keys().next().value!);
    validCache.set(cacheKey, hash);
  } else {
    if (rejected.size >= 5000) {
      for (const [k, until] of rejected) if (until <= now) rejected.delete(k);
      if (rejected.size >= 5000) rejected.delete(rejected.keys().next().value!);
    }
    rejected.set(key, now + REJECTED_TTL_MS);
  }
  return user;
}

/**
 * A api_key da Fever é md5("email:senha"), calculada pelo próprio app cliente: o protocolo
 * (https://feedafever.com/api) exige MD5 e não há como trocar sem quebrar os clientes. O MD5 só
 * reproduz o que o cliente envia; o que fica no banco é o scrypt dessa chave.
 */
export const feverApiKey = (email: string, password: string) => createHash("md5").update(`${email.trim().toLowerCase()}:${password}`).digest("hex");

/** Cria uma senha de aplicativo. O texto só existe nesta resposta: o banco guarda apenas hashes. */
export async function createAppPassword(user: { id: string; email: string }, name: string) {
  const password = `ors_${randomBytes(24).toString("base64url")}`;
  const token = await db.apiToken.create({
    data: {
      userId: user.id,
      name,
      secretHash: await storageHash(password),
      feverKeyHash: await storageHash(feverApiKey(user.email, password)),
    },
    select: { id: true, name: true, createdAt: true },
  });
  return { ...token, password };
}

export type ApiUser = { id: string; email: string; name: string; tokenId: string };

async function resolve(where: { secretHash: string } | { feverKeyHash: string }): Promise<ApiUser | null> {
  const token = await db.apiToken.findUnique({ where, include: { user: { select: { id: true, email: true, name: true } } } });
  if (!token) return null;
  // Registra o uso com folga de 5 min, para não escrever a cada requisição.
  if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 5 * 60_000) {
    await db.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { ...token.user, tokenId: token.id };
}

/** Senha de aplicativo (Google Reader: ClientLogin e cabeçalho GoogleLogin auth=). */
export async function userFromAppPassword(password: string | null | undefined) {
  return password ? lookup(password, "secretHash") : null;
}

/** api_key da Fever. */
export async function userFromFeverKey(apiKey: string | null | undefined) {
  return apiKey && /^[0-9a-f]{32}$/i.test(apiKey) ? lookup(apiKey.toLowerCase(), "feverKeyHash") : null;
}
