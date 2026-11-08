"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { checkForUpdateAction } from "@/app/actions/updates";
import type { UpdateInfo } from "@/lib/updates";
import { UpdateNotice } from "@/components/update-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/input";

/** Versão instalada e verificação manual de atualização (Configurações → Admin → Versão). */
export function VersionSection({ version, checkEnabled, initial }: { version: string; checkEnabled: boolean; initial: UpdateInfo | null }) {
  const t = useTranslations("updates");
  const [update, setUpdate] = useState(initial);
  const [checked, setChecked] = useState(false);
  const [pending, start] = useTransition();

  return (
    <section className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t("currentVersion", { version })}</p>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await checkForUpdateAction();
                if (!res.ok) return void toast.error(res.error);
                setUpdate(res.update);
                setChecked(true);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {t("checkNow")}
          </Button>
        </div>
        {!checkEnabled && <p className="text-xs text-muted-foreground">{t("checkDisabled")}</p>}
        {update ? <div className="-mx-3 -mb-2"><UpdateNotice key={update.latest} update={update} ignoreDismissed /></div> : checked && <p className="text-xs text-muted-foreground">{t("upToDate")}</p>}
      </Card>
    </section>
  );
}
