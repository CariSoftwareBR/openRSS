import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { getUserSettings } from "@/lib/app-settings";
import { getArticle, listArticles, scopeHeader, type ArticleScope } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { ArticleWorkspace } from "./article-workspace";
import { normalizeListView } from "@/lib/list-view";
import { localizeError } from "@/lib/localized-error";
import { listTags } from "@/lib/tags";

type Search = { unread?: string; q?: string; a?: string };

/** Página de listagem genérica (Hoje, Todos, Salvos, Feed, Pasta). */
export async function ArticleView({ scope, searchParams }: { scope: ArticleScope; searchParams: Promise<Search> }) {
  const [user, params, t] = await Promise.all([requireUser(), searchParams, getTranslations("articles.scopes")]);
  const unreadOnly = scope.kind === "saved" ? params.unread === "1" : params.unread !== "0";
  const query = params.q?.trim() || undefined;

  // Tudo em paralelo: a listagem de um escopo que não é do usuário já vem vazia (filtra por assinatura).
  const [header, initial, settings, selected, providers, ttsProviders, tags, locale] = await Promise.all([
    scopeHeader(user.id, scope, { today: t("today"), all: t("all"), saved: t("saved") }),
    listArticles(user.id, scope, { unreadOnly, query }),
    getUserSettings(user.id),
    params.a ? getArticle(user.id, params.a) : null,
    db.aiProvider.count({ where: { enabled: true, OR: [{ userId: user.id }, { userId: null }] } }),
    db.ttsProvider.count({ where: { enabled: true, OR: [{ userId: user.id }, { userId: null }] } }),
    scope.kind === "saved" ? listTags(user.id) : null,
    getLocale(),
  ]);
  if (!header) notFound();

  return (
    <ArticleWorkspace
      key={`${JSON.stringify(scope)}|${unreadOnly}|${query ?? ""}`}
      scope={scope}
      title={header.title}
      initial={initial}
      unreadOnly={unreadOnly}
      query={query}
      initialArticle={selected}
      listView={normalizeListView(settings.listView)}
      timezone={settings.timezone}
      aiEnabled={providers > 0}
      ttsEnabled={ttsProviders > 0}
      tagFilter={tags ? { tags, active: scope.kind === "saved" ? scope.tag : undefined } : null}
      feedError={header.lastError ? localizeError(header.lastError, locale) : null}
      markReadOnScroll={settings.markReadOnScroll}
    />
  );
}
