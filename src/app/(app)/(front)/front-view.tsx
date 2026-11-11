"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Newspaper } from "lucide-react";
import { FeedIcon } from "@/components/feed-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FrontArticle, FrontPage, FrontSection, FrontStory } from "@/lib/front-page-rank";

type Images = Record<string, string | null>;
type Ctx = { now: Date; locale: string; images: Images };

const PREVIEW_BATCH = 12;
const subscribeNothing = () => () => {};

/** Capa estilo portal: manchete, destaques, faixa de fotos e uma editoria por pasta. */
export function FrontView({ page, now, locale, timezone }: { page: FrontPage; now: Date; locale: string; timezone: string }) {
  const t = useTranslations("front");
  const images = usePreviewImages(page);
  const ctx: Ctx = { now, locale, images };
  const day = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(now);

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-10 px-4 pt-5 pb-16 sm:px-6 lg:pt-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-border pb-4 lg:pr-10">
          <h1 className="text-[1.875rem] leading-none font-semibold tracking-tight dark:font-normal">{t("title")}</h1>
          <p className="flex flex-col text-sm sm:items-end">
            <span className="font-medium text-foreground first-letter:uppercase">{day}</span>
            {page.articleCount > 0 && (
              <span className="text-muted-foreground">{t("summary", { articles: page.articleCount, sources: page.sourceCount })}</span>
            )}
          </p>
        </header>

        {page.headline ? (
          <>
            <section className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
              <Headline story={page.headline} ctx={ctx} />
              {page.highlights.length > 0 && <Highlights stories={page.highlights} ctx={ctx} />}
            </section>

            {page.strip.length > 0 && (
              <section className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {page.strip.map((story, i) => (
                  <PhotoStory key={story.lead.id} story={story} ctx={ctx} className={cn(i === 2 && "sm:max-lg:hidden")} />
                ))}
              </section>
            )}

            {page.sections.map((section) => (
              <Section key={section.id ?? "more"} section={section} ctx={ctx} />
            ))}
          </>
        ) : (
          <EmptyFront />
        )}
      </div>
    </div>
  );
}

// ─── Blocos ──────────────────────────────────────────────────

function Headline({ story, ctx }: { story: FrontStory; ctx: Ctx }) {
  const t = useTranslations("front");
  const a = story.lead;
  const image = imageOf(a, ctx.images);
  return (
    <article className="flex min-w-0 flex-col gap-3">
      {image !== null ? (
        <Link
          href={articleHref(a.id)}
          className="group relative isolate flex flex-col overflow-hidden rounded-card bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:flex-1"
        >
          {/* No desktop, a manchete cresce até a altura da coluna de destaques (sem vão embaixo). */}
          <div className="relative aspect-[4/5] sm:aspect-[16/10] lg:aspect-auto lg:min-h-[26rem] lg:flex-1">
            {image ? (
              <Photo src={image} alt="" priority className="absolute inset-0 size-full object-cover" />
            ) : (
              <div aria-hidden className="absolute inset-0 animate-pulse bg-muted" />
            )}
            <div aria-hidden className="absolute inset-0 bg-linear-to-t from-black/90 via-black/45 via-45% to-black/0 to-75%" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 text-white sm:p-7 lg:p-8">
              <Byline story={story} ctx={ctx} tone="inverse" />
              <h2
                className={cn(
                  "max-w-[24ch] text-[1.75rem] leading-[1.08] font-semibold tracking-[-0.022em] text-balance decoration-2 underline-offset-[0.18em] group-hover:underline sm:text-[2.25rem] xl:text-[2.75rem]",
                  a.isRead && "text-white/75",
                )}
              >
                {a.title}
              </h2>
              {a.snippet && <p className="line-clamp-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-white/80 max-sm:hidden">{a.snippet}</p>}
            </div>
          </div>
        </Link>
      ) : (
        <Link
          href={articleHref(a.id)}
          className="group flex flex-col justify-end gap-4 rounded-card border border-border bg-surface p-6 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-8 lg:flex-1"
        >
          <Byline story={story} ctx={ctx} />
          <h2
            className={cn(
              "max-w-[26ch] text-[1.75rem] leading-[1.08] font-semibold tracking-[-0.022em] text-balance decoration-2 underline-offset-[0.18em] group-hover:underline sm:text-[2.5rem]",
              a.isRead && "text-muted-foreground",
            )}
          >
            {a.title}
          </h2>
          {a.snippet && <p className="line-clamp-3 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted-foreground">{a.snippet}</p>}
        </Link>
      )}

      {story.related.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-0.5 text-muted-foreground">{t("alsoIn")}</span>
          {story.related.slice(0, 6).map((r) => (
            <Link
              key={r.id}
              href={articleHref(r.id)}
              title={r.title}
              className="inline-flex max-w-48 items-center gap-1.5 rounded-full border border-border bg-surface py-1 pr-2.5 pl-1.5 font-medium text-foreground/85 transition-colors duration-200 outline-none hover:border-ring/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <FeedIcon src={r.feedIconUrl} className="size-3.5" />
              <span className="truncate">{r.feedTitle}</span>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

function Highlights({ stories, ctx }: { stories: FrontStory[]; ctx: Ctx }) {
  const t = useTranslations("front");
  return (
    <aside aria-labelledby="front-highlights" className="flex min-w-0 flex-col">
      <h2 id="front-highlights" className="border-b-2 border-foreground pb-2 text-sm font-semibold tracking-tight">
        {t("highlights")}
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {stories.map((story) => (
          <li key={story.lead.id}>
            <Link href={articleHref(story.lead.id)} className="group flex flex-col gap-1.5 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Byline story={story} ctx={ctx} compact />
              <h3 className={cn("text-[0.975rem] leading-snug font-semibold tracking-[-0.01em] text-pretty group-hover:underline", story.lead.isRead && "text-muted-foreground")}>
                {story.lead.title}
              </h3>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Foto em cima, título embaixo: a faixa logo abaixo da manchete e a principal de cada editoria. */
function PhotoStory({
  story,
  ctx,
  size = "md",
  wide,
  className,
}: {
  story: FrontStory;
  ctx: Ctx;
  size?: "md" | "lg";
  /** Foto e texto lado a lado (editoria com uma notícia só). */
  wide?: boolean;
  className?: string;
}) {
  const a = story.lead;
  const image = imageOf(a, ctx.images);
  return (
    <article className={cn("min-w-0", className)}>
      <Link
        href={articleHref(a.id)}
        className={cn(
          "group flex flex-col gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
          wide && "md:grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:items-center md:gap-8",
        )}
      >
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
          {image === undefined ? (
            <div aria-hidden className="absolute inset-0 animate-pulse bg-muted" />
          ) : image ? (
            <Photo src={image} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <NoPhoto article={a} />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Byline story={story} ctx={ctx} compact />
          <h3
            className={cn(
              "leading-snug font-semibold tracking-[-0.012em] text-balance group-hover:underline",
              size === "lg" ? "text-xl sm:text-[1.375rem] sm:leading-[1.2]" : "text-[1.0625rem]",
              a.isRead && "text-muted-foreground",
            )}
          >
            {a.title}
          </h3>
          {size === "lg" && a.snippet && <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{a.snippet}</p>}
        </div>
      </Link>
    </article>
  );
}

/** Linha de lista: título à esquerda e, se houver foto, uma miniatura à direita. */
function ListStory({ story, ctx }: { story: FrontStory; ctx: Ctx }) {
  const a = story.lead;
  const image = imageOf(a, ctx.images);
  return (
    <Link href={articleHref(a.id)} className="group flex items-start gap-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Byline story={story} ctx={ctx} compact />
        <h3 className={cn("text-[0.975rem] leading-snug font-semibold tracking-[-0.01em] text-pretty group-hover:underline", a.isRead && "text-muted-foreground")}>
          {a.title}
        </h3>
      </div>
      {image && (
        <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-muted sm:size-20">
          <Photo src={image} alt="" className="absolute inset-0 size-full object-cover" />
        </div>
      )}
    </Link>
  );
}

function Section({ section, ctx }: { section: FrontSection; ctx: Ctx }) {
  const t = useTranslations("front");
  const [lead, ...rest] = section.stories;
  const name = section.name ?? t("more");
  const href = section.id ? `/folder/${section.id}` : "/all";
  const headingId = `front-section-${section.id ?? "more"}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-2.5">
        <h2 id={headingId} className="flex items-center gap-2.5 text-xl font-semibold tracking-tight dark:font-normal">
          <span aria-hidden className="h-[1.1em] w-1 rounded-full" style={{ background: sectionColor(section.id ?? name) }} />
          {name}
        </h2>
        <Link href={href} className="shrink-0 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground">
          {section.id ? t("seeFolder") : t("seeAll")}
        </Link>
      </header>

      {section.id && rest.length === 0 ? (
        <PhotoStory story={lead} ctx={ctx} size="lg" wide />
      ) : section.id ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <PhotoStory story={lead} ctx={ctx} size="lg" />
          {rest.length > 0 && (
            <ul className="flex flex-col divide-y divide-border max-md:mt-4 max-md:border-t max-md:border-border md:-mt-3.5">
              {rest.map((story) => (
                <li key={story.lead.id}>
                  <ListStory story={story} ctx={ctx} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3 [&>li]:border-b [&>li]:border-border">
          {section.stories.map((story) => (
            <li key={story.lead.id}>
              <ListStory story={story} ctx={ctx} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyFront() {
  const t = useTranslations("front");
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Newspaper className="size-5" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">{t("emptyTitle")}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("emptyBody")}</p>
      <Button asChild variant="primary" className="mt-2">
        <Link href="/settings/feeds">{t("emptyAction")}</Link>
      </Button>
    </div>
  );
}

// ─── Peças ───────────────────────────────────────────────────

/**
 * Veículo, hora e cobertura. A pilha de ícones mostra quantos feeds deram o mesmo fato: é o
 * que põe a notícia no alto da capa.
 */
function Byline({ story, ctx, tone = "default", compact }: { story: FrontStory; ctx: Ctx; tone?: "default" | "inverse"; compact?: boolean }) {
  const t = useTranslations("front");
  const a = story.lead;
  const inverse = tone === "inverse";
  const names = [a.feed.title, ...story.related.map((r) => r.feedTitle)];
  return (
    <p className={cn("flex min-w-0 items-center gap-2 text-xs", inverse ? "text-white/75" : "text-muted-foreground")}>
      <span className="flex min-w-0 items-center gap-1.5">
        <FeedIcon src={a.feed.iconUrl} className={cn("size-3.5", inverse && "rounded-[3px] bg-white/90 p-px")} />
        <span className={cn("truncate font-medium", inverse ? "text-white" : "text-foreground/85")}>{a.feed.title}</span>
      </span>
      <time dateTime={new Date(a.publishedAt).toISOString()} className="shrink-0">
        {ago(a.publishedAt, ctx.now, ctx.locale)}
      </time>
      {story.sourceCount > 1 && (
        <span title={t("coveredBy", { names: names.join(", ") })} className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          {!compact && (
            <span aria-hidden className="flex -space-x-1">
              {story.related.slice(0, 3).map((r) => (
                <span key={r.id} className={cn("flex size-[1.125rem] items-center justify-center rounded-full ring-2", inverse ? "bg-white ring-black/30" : "bg-surface ring-surface")}>
                  <FeedIcon src={r.feedIconUrl} className="size-3 rounded-full" />
                </span>
              ))}
            </span>
          )}
          <span className={cn("font-medium", inverse ? "text-white" : "text-foreground/80")}>{t("sources", { count: story.sourceCount })}</span>
        </span>
      )}
    </p>
  );
}

function Photo({ src, alt, className, priority }: { src: string; alt: string; className: string; priority?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  // O fade só vale depois da hidratação: no HTML do servidor a imagem aparece assim que baixa.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (failed === src) return <div aria-hidden className="absolute inset-0 bg-muted" />;
  return (
    // oxlint-disable-next-line nextjs/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
      onLoad={() => setLoaded(src)}
      ref={(img) => {
        if (!img?.complete) return;
        if (img.naturalWidth === 0) setFailed(src);
        else setLoaded(src);
      }}
      data-loaded={loaded === src || undefined}
      className={cn(
        hydrated && "img-fade",
        "transition-[scale] duration-700 ease-[var(--motion-out)] group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100",
        className,
      )}
    />
  );
}

/** Sem foto: a marca do veículo no lugar, para a grade não ficar com buracos. */
function NoPhoto({ article }: { article: FrontArticle }) {
  return (
    <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[color-mix(in_oklab,var(--muted)_70%,var(--surface))]">
      <FeedIcon src={article.feed.iconUrl} className="size-8 rounded-md opacity-80" />
      <span className="max-w-[80%] truncate text-xs font-medium text-muted-foreground">{article.feed.title}</span>
    </div>
  );
}

// ─── Utilitários ─────────────────────────────────────────────

const articleHref = (id: string) => `/article/${id}`;

/** URL da foto; null = sem foto; undefined = ainda procurando a capa (og:image) do artigo. */
function imageOf(a: FrontArticle, images: Images): string | null | undefined {
  if (a.imageUrl) return a.imageUrl;
  if (a.id in images) return images[a.id];
  if (a.imageChecked || !a.url) return null;
  return undefined;
}

/** Busca, em lotes, a capa dos artigos cujo feed não trouxe imagem. */
function usePreviewImages(page: FrontPage) {
  const [images, setImages] = useState<Images>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    const requestedIds = requested.current;
    const stories = [page.headline, ...page.strip, ...page.sections.flatMap((s) => s.stories)].filter((s): s is FrontStory => s !== null);
    const pending = stories
      .map((s) => s.lead)
      .filter((a) => !a.imageUrl && !a.imageChecked && a.url && !requestedIds.has(a.id))
      .map((a) => a.id);
    if (pending.length === 0) return;
    pending.forEach((id) => requestedIds.add(id));

    let cancelled = false;
    for (let i = 0; i < pending.length; i += PREVIEW_BATCH) {
      const batch = pending.slice(i, i + PREVIEW_BATCH);
      void fetch(`/api/articles/preview-images?ids=${batch.map(encodeURIComponent).join(",")}`)
        .then((res): Promise<Images> | Images => (res.ok ? res.json() : {}))
        .catch((): Images => ({}))
        .then((found) => {
          if (cancelled) return;
          setImages((prev) => ({ ...prev, ...Object.fromEntries(batch.map((id) => [id, found[id] ?? null])) }));
        });
    }
    return () => {
      cancelled = true;
      // Desmontou antes de responder: libera para tentar de novo numa próxima montagem.
      pending.forEach((id) => requestedIds.delete(id));
    };
  }, [page]);

  return images;
}

/** "há 2 horas", relativo ao instante em que o servidor montou a página (igual no servidor e no cliente). */
function ago(date: Date, now: Date, locale: string) {
  const diff = (new Date(date).getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(0, "minute");
}

/** Cor fixa por editoria (derivada do id da pasta), como as cores de seção de um portal. */
function sectionColor(key: string) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `oklch(0.62 0.14 ${Math.abs(hash) % 360})`;
}
