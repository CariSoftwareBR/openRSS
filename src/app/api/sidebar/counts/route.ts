import { getSidebarCounts } from "@/lib/queries";
import { getApiUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Contadores da barra lateral (não lidos por feed e salvos). Depois de abrir, marcar ou salvar
 * um artigo, o cliente busca só isto em vez de revalidar a árvore inteira da página.
 */
export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  return Response.json(await getSidebarCounts(user.id), { headers: { "cache-control": "private, no-store" } });
}
