import { AppShell } from "@/components/app-shell";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { getUserSettings } from "@/lib/app-settings";
import { normalizeListView } from "@/lib/list-view";
import { getSidebarData } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { getCachedUpdate } from "@/lib/updates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [sidebar, settings] = await Promise.all([getSidebarData(user.id), getUserSettings(user.id)]);
  // Só do cache (nunca espera o GitHub); a checagem roda em segundo plano a cada 12 h.
  const update = user.role === "admin" ? getCachedUpdate() : null;
  return (
    <AppShell
      sidebar={sidebar}
      user={{ name: user.name, email: user.email, role: user.role }}
      update={update}
      listView={normalizeListView(settings.listView)}
    >
      <ServiceWorkerRegistrar />
      {children}
    </AppShell>
  );
}
