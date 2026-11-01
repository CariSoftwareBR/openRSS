"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ArticleDetail } from "@/lib/queries";
import { setRead, setSaved } from "@/app/actions/articles";
import { Reader } from "@/components/articles/reader";
import { useSidebarCounts } from "@/components/sidebar-counts";

export function StandaloneReader({ article: initial, aiEnabled, ttsEnabled }: { article: ArticleDetail; aiEnabled: boolean; ttsEnabled: boolean }) {
  const router = useRouter();
  const { refreshCounts } = useSidebarCounts();
  // A página marca o artigo como lido no servidor; a barra lateral (layout) não é remontada.
  useEffect(() => refreshCounts(), [refreshCounts]);
  const [article, setArticle] = useState(initial);
  const state = article.state ?? {
    userId: "",
    articleId: article.id,
    isRead: true,
    isSaved: false,
    readAt: null,
    savedAt: null,
    priorityScore: null,
    priorityReason: null,
    classifiedAt: null,
    isHighlighted: false,
  };

  return (
    <div className="flex h-full">
      <Reader
        standalone
        article={article}
        aiEnabled={aiEnabled}
        ttsEnabled={ttsEnabled}
        onClose={() => router.back()}
        onToggleRead={async () => {
          setArticle({ ...article, state: { ...state, isRead: !state.isRead } });
          await setRead(article.id, !state.isRead);
          refreshCounts();
        }}
        onToggleSaved={async () => {
          setArticle({ ...article, state: { ...state, isSaved: !state.isSaved } });
          await setSaved(article.id, !state.isSaved);
          refreshCounts();
        }}
      />
    </div>
  );
}
