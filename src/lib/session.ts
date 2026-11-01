import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user as typeof session.user & { role: string };
}

/**
 * O papel vem do banco, não da sessão: com o cache de sessão em cookie, um admin rebaixado
 * continuaria "admin" até o cookie vencer.
 */
export async function requireAdmin() {
  const user = await requireUser();
  const current = await db.user.findUnique({ where: { id: user.id }, select: { role: true } });
  if (current?.role !== "admin") redirect("/");
  return { ...user, role: current.role };
}

/** Para route handlers: retorna null em vez de redirecionar. */
export async function getApiUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}
