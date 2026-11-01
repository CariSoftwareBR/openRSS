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
 * Papel atual, lido do banco (e não da sessão): com o cache de sessão em cookie, um admin
 * rebaixado continuaria "admin" até o cookie vencer. Use em toda checagem que dá poder de admin.
 */
export const isAdminNow = cache(async (userId: string) => {
  const current = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return current?.role === "admin";
});

export async function requireAdmin() {
  const user = await requireUser();
  if (!(await isAdminNow(user.id))) redirect("/");
  return { ...user, role: "admin" };
}

/** Para route handlers: retorna null em vez de redirecionar. */
export async function getApiUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}
