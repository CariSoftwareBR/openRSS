import { getTranslations } from "next-intl/server";

const bar = "animate-pulse rounded bg-muted";

/** Esqueleto da capa: mesma grade da página real, para nada pular quando ela chega. */
export default async function Loading() {
  const t = await getTranslations("ui");
  return (
    <div role="status" aria-busy="true" className="h-full min-h-0 overflow-hidden">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden className="mx-auto flex w-full max-w-[76rem] flex-col gap-10 px-4 pt-5 sm:px-6 lg:pt-6">
        <div className="flex items-end justify-between border-b border-border pb-4 lg:pr-10">
          <div className={`${bar} h-8 w-28`} />
          <div className="flex flex-col items-end gap-1.5">
            <div className={`${bar} h-3.5 w-40`} />
            <div className={`${bar} h-3.5 w-32`} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="aspect-[4/5] animate-pulse rounded-card bg-muted sm:aspect-[16/10] lg:aspect-auto lg:min-h-[26rem]" />
          <div className="flex flex-col">
            <div className={`${bar} mb-2 h-4 w-24`} />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col gap-2 border-t border-border py-3.5">
                <div className={`${bar} h-3 w-28`} />
                <div className={`${bar} h-4 w-full`} />
                <div className={`${bar} h-4 w-3/4`} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className={i === 2 ? "flex flex-col gap-3 sm:max-lg:hidden" : "flex flex-col gap-3"}>
              <div className="aspect-[16/10] animate-pulse rounded-xl bg-muted" />
              <div className={`${bar} h-3 w-24`} />
              <div className={`${bar} h-4 w-full`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
