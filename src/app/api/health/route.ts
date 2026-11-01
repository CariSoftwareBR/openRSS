import { isSetupRequired } from "@/lib/env";
import { APP_VERSION } from "@/lib/updates";

export const dynamic = "force-dynamic";

export async function GET() {
  // Durante o assistente de instalação o container é saudável mesmo sem banco.
  if (isSetupRequired()) return Response.json({ status: "setup", version: APP_VERSION });

  try {
    const { db } = await import("@/lib/db");
    await db.$queryRawUnsafe("SELECT 1");
    return Response.json({ status: "ok", version: APP_VERSION });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
