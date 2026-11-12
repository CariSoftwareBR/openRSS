"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCheck, Eye, EyeOff, Loader2, RefreshCw, Search, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { ArticleDetail, ArticleListItem, ArticleScope, ListCursor } from "@/lib/queries";
import { loadMoreArticles, markAllRead, markReadMany, openArticleAction, setRead, setSaved } from "@/app/actions/articles";
import { refreshFeedAction } from "@/app/actions/feeds";
import { SaveLinkDialog } from "@/components/save-link";
import { TagFilter, type TagCount } from "./tag-filter";
import { updateSettingsAction } from "@/app/actions/settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { useResizableWidth } from "@/hooks/use-resizable-width";
import { useSidebarCounts } from "@/components/sidebar-counts";
import { usePreferredListView } from "@/components/list-view-context";
import { ArticleList } from "./article-list";
import { Reader } from "./reader";

import { ViewSwitcher, type ListView } from "./view-switcher";

export function ArticleWorkspace({
  scope,
  title,
  initial,
  unreadOnly,
  query,
  initialArticle,
  listView: initialView,
  timezone,
  aiEnabled,
  ttsEnabled,
  feedError,
  tagFilter,
  markReadOnScroll = false,
}: {
  scope: ArticleScope;
  title: string;
  initial: { items: ArticleListItem[]; hasMore: boolean; nextCursor: ListCursor | null };
  unreadOnly: boolean;
  query?: string;
  initialArticle: ArticleDetail | null;
  listView: ListView;
  timezone: string;
  aiEnabled: boolean;
  ttsEnabled: boolean;
  feedError: string | null;
  tagFilter: { tags: TagCount[]; active: string | undefined } | null;
  /** Marca como lido o artigo que sai pelo topo da lista ao rolar (Configurações → Geral). */
  markReadOnScroll?: boolean;
}) {
  const t = useTranslations("articles");
  const router = useRouter();
  const pathname = usePathname();
  const { refreshCounts } = useSidebarCounts();
  const { setView: setPreferredView } = usePreferredListView();
  const [items, setItems] = useState(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [cursor, setCursor] = useState<ListCursor | null>(initial.nextCursor);
  const [selected, setSelected] = useState<ArticleDetail | null>(initialArticle);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [view, setView] = useState<ListView>(initialView);
  const [search, setSearch] = useState(query ?? "");
  const [operationError, setOperationError] = useState<string | null>(null);
  const [loadingMore, startLoadMore] = useTransition();
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const listSize = useResizableWidth("openrss:list-width", { defaultWidth: 416, min: 280, max: 900, minContent: 420 });
  const openRequest = useRef(0);
  const mutationRequest = useRef(new Map<string, number>());
  const mutationQueue = useRef(new Map<string, Promise<unknown>>());
  const filteredItems = useRef(new Map<string, { item: ArticleListItem; index: number }>());
  const loadingMoreRef = useRef(false);
  /** Marcados como não lidos pelo usuário: a rolagem (lido ao rolar) não os marca de novo. */
  const keptUnread = useRef(new Set<string>());

  const selectedIndex = selected ? items.findIndex((i) => i.id === selected.id) : -1;

  // Busca a imagem de capa (og:image) dos artigos cujo feed não traz imagem, em lotes. Usa uma
  // rota (fetch) e não server action: actions rodam uma por vez e travariam os cliques.
  const requestedImages = useRef(new Set<string>());
  const previewQueue = useRef<string[][]>([]);
  const activePreviewRequests = useRef(0);
  // Ao sair da página, a fila para; os lotes em andamento terminam (e gravam a capa no servidor).
  // Sem AbortController: no StrictMode o desmonte simulado cancelaria os lotes recém-iniciados.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const missing = items.filter((i) => !i.imageChecked && i.url && !requestedImages.current.has(i.id)).map((i) => i.id);
    if (missing.length === 0) return;
    for (const id of missing) requestedImages.current.add(id);
    for (let i = 0; i < missing.length; i += 6) {
      previewQueue.current.push(missing.slice(i, i + 6));
    }
    function processPreviewQueue() {
      while (activePreviewRequests.current < 3 && mounted.current) {
        const batch = previewQueue.current.shift();
        if (!batch) return;
        activePreviewRequests.current++;
        void fetch(`/api/articles/preview-images?ids=${batch.map(encodeURIComponent).join(",")}`)
          .then((res): Promise<Record<string, string | null>> | Record<string, string | null> => (res.ok ? res.json() : {}))
          .catch((): Record<string, string | null> => ({}))
          .then((found) => {
            if (!mounted.current) return;
            // O lote todo sai do estado "carregando"; falhas transitórias são tentadas de novo em outra visita.
            const checked = new Set(batch);
            setItems((list) =>
              list.map((item) => (checked.has(item.id) ? { ...item, imageUrl: found[item.id] ?? item.imageUrl, imageChecked: true } : item)),
            );
          })
          .finally(() => {
            activePreviewRequests.current--;
            processPreviewQueue();
          });
      }
    }

    processPreviewQueue();
  }, [items]);

  const buildUrl = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname],
  );

  const patchItem = useCallback((id: string, patch: Partial<ArticleListItem>) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const markSiblingsRead = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const drop = new Set(ids);
    setItems((list) => {
      const next = list.map((item) => ({
        ...item,
        isRead: drop.has(item.id) ? true : item.isRead,
        related: item.related.map((source) => (drop.has(source.id) ? { ...source, isRead: true } : source)),
      }));
      return unreadOnly ? next.filter((item) => !drop.has(item.id)) : next;
    });
  }, [unreadOnly]);

  const persistInOrder = useCallback(async <T,>(key: string, operation: () => Promise<T>): Promise<T> => {
    const previous = mutationQueue.current.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    mutationQueue.current.set(key, current);
    try {
      return await current;
    } finally {
      if (mutationQueue.current.get(key) === current) mutationQueue.current.delete(key);
    }
  }, []);

  const open = useCallback(
    async (id: string) => {
      const request = ++openRequest.current;
      setLoadingId(id);
      setOperationError(null);
      try {
        const opened = await openArticleAction(id);
        if (opened) {
          const { article, siblingIds } = opened;
          window.history.replaceState(null, "", buildUrl({ a: id }));
          patchItem(id, { isRead: true });
          markSiblingsRead(siblingIds);
          if (!article.state?.isRead) refreshCounts();
        }
        if (request !== openRequest.current) return;
        setLoadingId(null);
        if (!opened) {
          setOperationError(t("errors.notFound"));
          toast.error(t("errors.notFound"));
          return;
        }
        const { article } = opened;
        const state = { ...(article.state ?? emptyState(article)), isRead: true, readAt: article.state?.readAt ?? new Date() };
        setSelected({ ...article, state });
      } catch {
        if (request !== openRequest.current) return;
        setLoadingId(null);
        setOperationError(t("errors.openFailed"));
        toast.error(t("errors.openFailed"));
      }
    },
    [buildUrl, markSiblingsRead, patchItem, refreshCounts, t],
  );

  const close = useCallback(() => {
    openRequest.current++;
    setLoadingId(null);
    setSelected(null);
    window.history.replaceState(null, "", buildUrl({ a: null }));
  }, [buildUrl]);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (items.length === 0) return;
      const next = selectedIndex === -1 ? 0 : Math.min(items.length - 1, Math.max(0, selectedIndex + delta));
      if (items[next] && items[next].id !== selected?.id) void open(items[next].id);
    },
    [items, open, selected?.id, selectedIndex],
  );

  const toggleRead = useCallback(
    async (id: string, isRead: boolean) => {
      const previousIndex = items.findIndex((item) => item.id === id);
      const previousItem = items[previousIndex];
      const previousSelected = selected?.id === id ? selected : null;
      const key = `read:${id}`;
      const request = (mutationRequest.current.get(key) ?? 0) + 1;
      mutationRequest.current.set(key, request);
      setOperationError(null);
      if (isRead) keptUnread.current.delete(id);
      else keptUnread.current.add(id);
      if (unreadOnly && isRead) {
        if (previousItem) filteredItems.current.set(key, { item: previousItem, index: previousIndex });
        setItems((list) => list.filter((item) => item.id !== id));
      } else if (unreadOnly && !isRead && !previousItem) {
        const removed = filteredItems.current.get(key);
        if (removed) {
          setItems((list) => {
            const next = [...list];
            next.splice(Math.min(removed.index, next.length), 0, { ...removed.item, isRead: false });
            return next;
          });
        }
      } else patchItem(id, { isRead });
      if (selected?.id === id) setSelected((s) => (s ? { ...s, state: { ...(s.state ?? emptyState(s)), isRead } } : s));
      try {
        const { siblingIds } = await persistInOrder(key, () => setRead(id, isRead));
        if (isRead) markSiblingsRead(siblingIds);
        if (unreadOnly && !isRead) filteredItems.current.delete(key);
        refreshCounts();
      } catch {
        if (mutationRequest.current.get(key) !== request) return;
        if (unreadOnly && !isRead && !previousItem) {
          setItems((list) => list.filter((item) => item.id !== id));
        } else if (previousItem && unreadOnly && isRead) {
          setItems((list) => {
            const without = list.filter((item) => item.id !== id);
            without.splice(Math.min(previousIndex, without.length), 0, previousItem);
            return without;
          });
        } else if (previousItem) patchItem(id, { isRead: previousItem.isRead });
        if (previousSelected) {
          setSelected((current) => current ? { ...current, state: { ...(current.state ?? emptyState(current)), isRead: previousSelected.state?.isRead ?? false } } : current);
        }
        setOperationError(t("errors.readStateFailed"));
        toast.error(t("errors.readStateFailed"));
      }
    },
    [items, markSiblingsRead, patchItem, persistInOrder, refreshCounts, selected, t, unreadOnly],
  );

  const toggleSaved = useCallback(
    async (id: string, isSaved: boolean) => {
      const previousIndex = items.findIndex((item) => item.id === id);
      const previousItem = items[previousIndex];
      const previousSelected = selected?.id === id ? selected : null;
      const key = `saved:${id}`;
      const request = (mutationRequest.current.get(key) ?? 0) + 1;
      mutationRequest.current.set(key, request);
      setOperationError(null);
      if (scope.kind === "saved" && !isSaved) {
        if (previousItem) filteredItems.current.set(key, { item: previousItem, index: previousIndex });
        setItems((list) => list.filter((item) => item.id !== id));
      } else if (scope.kind === "saved" && isSaved && !previousItem) {
        const removed = filteredItems.current.get(key);
        if (removed) {
          setItems((list) => {
            const next = [...list];
            next.splice(Math.min(removed.index, next.length), 0, { ...removed.item, isSaved: true });
            return next;
          });
        }
      } else patchItem(id, { isSaved });
      if (selected?.id === id) setSelected((s) => (s ? { ...s, state: { ...(s.state ?? emptyState(s)), isSaved } } : s));
      try {
        await persistInOrder(key, () => setSaved(id, isSaved));
        if (scope.kind === "saved" && isSaved) filteredItems.current.delete(key);
        refreshCounts();
        toast.success(isSaved ? t("saved") : t("unsaved"));
      } catch {
        if (mutationRequest.current.get(key) !== request) return;
        if (scope.kind === "saved" && isSaved && !previousItem) {
          setItems((list) => list.filter((item) => item.id !== id));
        } else if (previousItem && scope.kind === "saved" && !isSaved) {
          setItems((list) => {
            const without = list.filter((item) => item.id !== id);
            without.splice(Math.min(previousIndex, without.length), 0, previousItem);
            return without;
          });
        } else if (previousItem) patchItem(id, { isSaved: previousItem.isSaved });
        if (previousSelected) {
          setSelected((current) => current ? { ...current, state: { ...(current.state ?? emptyState(current)), isSaved: previousSelected.state?.isSaved ?? false } } : current);
        }
        setOperationError(t("errors.savedStateFailed"));
        toast.error(t("errors.savedStateFailed"));
      }
    },
    [items, patchItem, persistInOrder, refreshCounts, scope.kind, selected, t],
  );

  const doMarkAll = useCallback(() => {
    startTransition(async () => {
      const previousItems = items;
      const previousHasMore = hasMore;
      const previousSelected = selected;
      setOperationError(null);
      setItems((list) => (unreadOnly ? [] : list.map((i) => ({ ...i, isRead: true }))));
      if (unreadOnly) setHasMore(false);
      setSelected((article) =>
        article ? { ...article, state: { ...(article.state ?? emptyState(article)), isRead: true } } : article,
      );
      try {
        const { count, nextFeedId } = await markAllRead(scope);
        toast.success(count ? t("markedRead", { count }) : t("nothingToMark"));
        if (count) refreshCounts();
        if (nextFeedId) {
          const params = new URLSearchParams(window.location.search);
          params.delete("a");
          params.delete("q");
          const qs = params.toString();
          router.push(qs ? `/feed/${nextFeedId}?${qs}` : `/feed/${nextFeedId}`);
        }
      } catch {
        setItems(previousItems);
        setHasMore(previousHasMore);
        setSelected(previousSelected);
        setOperationError(t("errors.markAllFailed"));
        toast.error(t("errors.markAllFailed"));
      }
    });
  }, [hasMore, items, refreshCounts, router, scope, selected, t, unreadOnly]);

  const refreshFeed = useCallback(() => {
    if (scope.kind !== "feed") return;
    startTransition(async () => {
      setOperationError(null);
      try {
        const res = await refreshFeedAction(scope.feedId);
        if (!res.ok) {
          setOperationError(res.error);
          toast.error(res.error);
          return;
        }
        const fresh = await loadMoreArticles(scope, null, unreadOnly, query);
        setItems(fresh.items);
        setHasMore(fresh.hasMore);
        setCursor(fresh.nextCursor);
        toast.success(res.added ? t("newArticles", { count: res.added }) : t("noNewArticles"));
        router.refresh();
      } catch {
        setOperationError(t("errors.refreshFailed"));
        toast.error(t("errors.refreshFailed"));
      }
    });
  }, [query, router, scope, t, unreadOnly]);

  function loadMore() {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    startLoadMore(async () => {
      try {
        const next = await loadMoreArticles(scope, cursor, unreadOnly, query);
        setItems((list) => [...list, ...next.items.filter((n) => !list.some((i) => i.id === n.id))]);
        setHasMore(next.hasMore);
        setCursor(next.nextCursor);
      } catch {
        // Rede/sessão: avisa e mantém o botão "carregar mais" (sem derrubar a página no error boundary).
        toast.error(t("errors.loadMoreFailed"));
      } finally {
        loadingMoreRef.current = false;
      }
    });
  }

  // Rolagem infinita: carrega a próxima página antes de chegar ao fim (o botão continua de reserva).
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!hasMore || !sentinel) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadMoreRef.current(), {
      root: listRef.current,
      rootMargin: "0px 0px 800px 0px",
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
    // Pelo cursor (muda a cada página), não pelo tamanho da lista: uma página toda agrupada ou
    // repetida não muda o tamanho, e o observer precisa ser refeito para disparar de novo.
  }, [hasMore, cursor]);

  // Marcar como lido ao rolar: o artigo que sai inteiro pelo topo da lista vira lido (em lote).
  const listLayout = selected ? "list" : "cards";
  const pendingScrollReads = useRef(new Set<string>());
  const scrollReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushScrollReads = useCallback(() => {
    const ids = [...pendingScrollReads.current];
    pendingScrollReads.current.clear();
    if (ids.length === 0) return;
    void markReadMany(ids)
      .then(({ siblingIds }) => {
        markSiblingsRead(siblingIds);
        refreshCounts();
      })
      .catch(() => {
        // Falhou: volta a mostrar como não lidos.
        const failed = new Set(ids);
        setItems((list) => list.map((i) => (failed.has(i.id) ? { ...i, isRead: false } : i)));
      });
  }, [markSiblingsRead, refreshCounts]);
  useEffect(() => () => {
    if (scrollReadTimer.current) clearTimeout(scrollReadTimer.current);
    flushScrollReads();
  }, [flushScrollReads]);
  // Um único observer por modo de lista; os itens novos são só acrescentados a ele. O estado
  // atual (lido, desmarcado pelo usuário) vem de refs, sem recriar o observer a cada mudança.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });
  const scrollObserver = useRef<IntersectionObserver | null>(null);
  const observedRows = useRef(new WeakSet<Element>());
  useEffect(() => {
    const root = listRef.current;
    if (!markReadOnScroll || !root) return;
    observedRows.current = new WeakSet();
    const observer = new IntersectionObserver(
      (entries) => {
        const passed: string[] = [];
        for (const entry of entries) {
          // Lista escondida (leitor aberto em telas menores que xl): retângulos zerados não são rolagem.
          if (!entry.rootBounds || entry.rootBounds.height === 0 || entry.boundingClientRect.height === 0) continue;
          // Só o que saiu por cima (não por baixo, ao rolar de volta).
          if (entry.isIntersecting || entry.boundingClientRect.bottom > entry.rootBounds.top) continue;
          const id = (entry.target as HTMLElement).dataset.articleId;
          const item = id ? itemsRef.current.find((i) => i.id === id) : undefined;
          if (!item || item.isRead || keptUnread.current.has(item.id)) continue;
          passed.push(item.id);
        }
        if (passed.length === 0) return;
        for (const id of passed) pendingScrollReads.current.add(id);
        const done = new Set(passed);
        setItems((list) => list.map((i) => (done.has(i.id) ? { ...i, isRead: true } : i)));
        if (scrollReadTimer.current) clearTimeout(scrollReadTimer.current);
        scrollReadTimer.current = setTimeout(flushScrollReads, 800);
      },
      { root, threshold: 0 },
    );
    scrollObserver.current = observer;
    return () => {
      observer.disconnect();
      scrollObserver.current = null;
    };
  }, [flushScrollReads, markReadOnScroll, view, listLayout]);
  useEffect(() => {
    const observer = scrollObserver.current;
    const root = listRef.current;
    if (!observer || !root) return;
    for (const el of root.querySelectorAll("[data-article-id]")) {
      if (observedRows.current.has(el)) continue;
      observedRows.current.add(el);
      observer.observe(el);
    }
  }, [items, markReadOnScroll, view, listLayout]);

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "j":
          move(1);
          break;
        case "k":
          move(-1);
          break;
        case "Escape":
          close();
          break;
        case "o":
        case "v":
          if (selected?.url) window.open(selected.url, "_blank", "noopener");
          break;
        case "m":
          if (selected) void toggleRead(selected.id, !(selected.state?.isRead ?? false));
          break;
        case "s":
          if (selected) void toggleSaved(selected.id, !selected.state?.isSaved);
          break;
        case "A":
          if (e.shiftKey) doMarkAll();
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        default:
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, doMarkAll, move, selected, toggleRead, toggleSaved]);

  const changeView = (next: ListView) => {
    if (next === view) return;
    setView(next);
    // O esqueleto das próximas navegações usa este formato na hora, sem esperar o servidor.
    setPreferredView(next);
    void updateSettingsAction({ listView: next });
  };

  const empty = scope.kind === "saved" ? t("empty.saved") : unreadOnly ? t("empty.allRead") : t("empty.none");

  return (
    <div className="flex h-full min-h-0">
      <section
        style={{ "--list-w": `${listSize.width}px` } as React.CSSProperties}
        className={cn(
          "relative flex min-h-0 w-full flex-col border-r border-border xl:shrink-0",
          selected ? "hidden xl:flex xl:w-(--list-w)" : "flex border-r-0",
          // Sem artigo aberto: cards ocupam a largura toda; "Só títulos" fica numa coluna de leitura.
          !selected && "xl:w-full",
        )}
      >
        <header className="flex flex-col gap-2 border-b border-border px-4 pt-2.5 pb-3">
          {/* Sem artigo aberto, esta linha chega ao canto: reserva espaço para o ThemeToggle do AppShell. */}
          <div className={cn("flex items-center gap-2", !selected && "lg:pr-10")}>
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{title}</h1>
            {scope.kind === "feed" && (
              <Button
                variant="ghost"
                size="icon-sm"
                title={t("refreshFeed")}
                aria-label={t("refreshFeed")}
                disabled={pending}
                onClick={refreshFeed}
              >
                <RefreshCw className={cn(pending && "animate-spin")} />
              </Button>
            )}
            {scope.kind === "saved" && <SaveLinkDialog />}
            <ViewSwitcher value={view} onChange={changeView} />
            {scope.kind !== "saved" && (
              <Button
                variant="ghost"
                size="icon-sm"
                title={unreadOnly ? t("showAll") : t("unreadOnly")}
                aria-label={unreadOnly ? t("showAll") : t("unreadOnly")}
                onClick={() => router.replace(buildUrl({ unread: unreadOnly ? "0" : null, a: null }))}
              >
                {unreadOnly ? <EyeOff /> : <Eye />}
              </Button>
            )}
            {scope.kind !== "saved" && (
              <Button variant="ghost" size="icon-sm" title={t("markAllReadShortcut")} aria-label={t("markAllRead")} disabled={pending} onClick={doMarkAll}>
                <CheckCheck />
              </Button>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              router.replace(buildUrl({ q: search.trim() || null, a: null }));
            }}
            className="relative"
          >
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t("search")} className="h-8 pl-8" />
          </form>
          {scope.kind === "today" && aiEnabled && (
            <p className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
              <Sparkles className="size-3 text-ai" /> {t("aiOrdered")}
            </p>
          )}
          {tagFilter && <TagFilter tags={tagFilter.tags} active={tagFilter.active} />}
          {feedError && (
            <p role="status" className="flex items-center gap-1.5 text-[0.6875rem] text-warning">
              <TriangleAlert className="size-3" /> {t("lastError", { error: feedError })}
            </p>
          )}
          {operationError && (
            <p role="alert" aria-live="assertive" className="flex items-center gap-1.5 text-[0.6875rem] text-destructive">
              <TriangleAlert className="size-3" /> {operationError}
            </p>
          )}
        </header>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-muted-foreground">{empty}</p>
          ) : (
            <>
              <ArticleList
                items={items}
                view={view}
                layout={selected ? "list" : "cards"}
                selectedId={selected?.id ?? null}
                loadingId={loadingId}
                showFeed={scope.kind !== "feed"}
                timezone={timezone}
                onOpen={open}
                onToggleRead={toggleRead}
                onToggleSaved={toggleSaved}
              />
              {hasMore && (
                <div ref={sentinelRef} className="p-4">
                  <Button className="w-full" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? <Loader2 className="animate-spin" /> : t("loadMore")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        {selected && (
          <ResizeHandle
            className="hidden xl:block"
            label={t("resizeList")}
            dragging={listSize.dragging}
            {...listSize.handleProps}
          />
        )}
      </section>

      {selected && (
        // Sem key: este painel só monta (e entra pela direita) ao abrir o primeiro artigo; trocar de
        // artigo remonta só o Reader, que tem a própria entrada mais curta.
        <div className="flex min-h-0 min-w-0 flex-1 animate-[panel-in_480ms_var(--motion-out)]">
          <Reader
            key={selected.id}
            article={selected}
            aiEnabled={aiEnabled}
            ttsEnabled={ttsEnabled}
            onClose={close}
            onPrev={selectedIndex > 0 ? () => move(-1) : undefined}
            onNext={selectedIndex !== -1 && selectedIndex < items.length - 1 ? () => move(1) : undefined}
            onToggleRead={() => toggleRead(selected.id, !(selected.state?.isRead ?? false))}
            onToggleSaved={() => toggleSaved(selected.id, !selected.state?.isSaved)}
          />
        </div>
      )}
    </div>
  );
}

function emptyState(a: ArticleDetail): NonNullable<ArticleDetail["state"]> {
  return {
    userId: "",
    articleId: a.id,
    isRead: false,
    isSaved: false,
    readAt: null,
    savedAt: null,
    priorityScore: null,
    priorityReason: null,
    classifiedAt: null,
    isHighlighted: false,
  };
}
