"use client";

import { Bookmark, Circle, CircleCheck } from "lucide-react";
import { useChangeCount } from "@/hooks/use-change-count";
import { cn } from "@/lib/utils";

const pop = "animate-[pop_420ms_var(--motion-spring)]";

/** Marcador de "salvo": preenche e dá um pequeno salto quando o artigo é salvo (não ao remover). */
export function BookmarkIcon({ saved, className }: { saved: boolean; className?: string }) {
  const pops = useChangeCount(saved, (next) => next);
  return <Bookmark key={pops} className={cn(saved && "fill-current text-foreground", pops > 0 && saved && pop, className)} />;
}

/** Círculo de "lido": o check entra com o mesmo salto quando o artigo é marcado como lido. */
export function ReadIcon({ read }: { read: boolean }) {
  const pops = useChangeCount(read, (next) => next);
  return read ? <CircleCheck key={pops} className={cn(pops > 0 && pop)} /> : <Circle />;
}
