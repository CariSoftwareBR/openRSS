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
 * Scrypts para valores desconhecidos (o scrypt usa o threadpool da libuv, o mesmo do DNS): até 20
 * por minuto por cliente e um teto global alto. O limite por cliente impede que alguém esgote o
 * global e trave os apps legítimos; o global segura quem forja o cabeçalho de IP.
 */
const MAX_UNKNOWN_PER_CLIENT = 20;
const MAX_UNKNOWN_GLOBAL = 600;
const unknownWindows = new Map<string, { start: number; count: number }>();

function overLimit(clientKey: string, now: number) {
  const hit = (key: string, max: number) => {
    let window = unknownWindows.get(key);
    if (!window || now - window.start > 60_000) {
      window = { start: now, count: 0 };
      unknownWindows.set(key, window);
    }
    return ++window.count > max;
  };
  if (unknownWindows.size > 10_000) unknownWindows.clear();
  return hit(`client:${clientKey}`, MAX_UNKNOWN_PER_CLIENT) || hit("global", MAX_UNKNOWN_GLOBAL);
}

/** Identifica o cliente para o limite: IP do proxy reverso, se houver. */
export function clientKeyOf(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "direct").trim() || "direct";
}

const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

async function lookup(value: string, field: "secretHash" | "feverKeyHash", clientKey: string): Promise<ApiUser | null> {
  const known = validCache.get(value);
  if (known) {
    const user = await resolve(field === "secretHash" ? { secretHash: known } : { feverKeyHash: known });
    if (!user) validCache.delete(value); // token revogado
    return user;
  }
  const now = Date.now();
  const key = fingerprint(value);
  if ((rejected.get(key) ?? 0) > now) return null;
  if (overLimit(clientKey, now)) return null;

  const hash = await storageHash(value);
  const user = await resolve(field === "secretHash" ? { secretHash: hash } : { feverKeyHash: hash });
  if (user) {
    if (validCache.size >= 1000) validCache.delete(validCache.keys().next().value!);
    validCache.set(value, hash);
  } else {
    if (rejected.size >= 5000) rejected.clear();
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
export async function userFromAppPassword(password: string | null | undefined, clientKey = "direct") {
  return password ? lookup(password, "secretHash", clientKey) : null;
}

/** api_key da Fever. */
export async function userFromFeverKey(apiKey: string | null | undefined, clientKey = "direct") {
  return apiKey && /^[0-9a-f]{32}$/i.test(apiKey) ? lookup(apiKey.toLowerCase(), "feverKeyHash", clientKey) : null;
}
