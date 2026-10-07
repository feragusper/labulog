import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type NewsItem, type NewsScope } from "../api";
import { useI18n } from "../i18n";
import { PanelSkeleton } from "../components/ui";

export function ago(t: (k: string) => string, ts: string | null): string {
  if (!ts) return "";
  const d = Math.floor((Date.now() - +new Date(ts)) / 86_400_000);
  if (d <= 0) return t("ago.today");
  if (d === 1) return t("ago.yesterday");
  if (d < 30) return t("ago.days").replace("{n}", String(d));
  return new Date(ts).toLocaleDateString();
}

const SCOPES: NewsScope[] = ["role", "related", "market"];

export default function News() {
  const { t, lang } = useI18n();
  const suggest = useQuery({ queryKey: ["feed-suggest"], queryFn: api.feedSuggest });
  const [input, setInput] = useState("");
  const [query, setQuery] = useState<string | null>(null);

  useEffect(() => {
    if (suggest.data && query === null) { setInput(suggest.data.role); setQuery(suggest.data.role); }
  }, [suggest.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const news = useQuery({
    queryKey: ["news", query, lang],
    queryFn: () => api.news(query ?? "", lang),
    enabled: query !== null,
    staleTime: 10 * 60_000,
  });

  const groups = SCOPES.map((s) => [s, (news.data?.items ?? []).filter((i) => i.scope === s)] as [NewsScope, NewsItem[]]);

  return (
    <div>
      <h1 className="page-title">{t("news.title")}</h1>
      <div className="panel">
        <p className="muted" style={{ marginTop: 0 }}>{t("news.desc")}</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}>
          <input value={input} placeholder="Android Engineer" onChange={(e) => setInput(e.target.value)} />
          <button className="shrink" type="submit">{t("news.search")}</button>
        </form>
      </div>

      {(news.isLoading || suggest.isLoading) && <PanelSkeleton rows={8} />}
      {news.isError && <p className="error">{t("news.error")}</p>}
      {news.data && news.data.items.length === 0 && <p className="muted">{t("news.empty")}</p>}

      {groups.filter(([, items]) => items.length).map(([scope, items]) => (
        <div className="panel" key={scope}>
          <h2>{t(`news.scope.${scope}`).replace("{role}", news.data?.query ?? "")}</h2>
          <ul className="news-list">
            {items.map((n) => (
              <li key={n.url}>
                <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                <div className="muted news-meta">{[n.source, ago(t, n.published_at)].filter(Boolean).join(" · ")}</div>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {news.data && news.data.items.length > 0 && <p className="muted feed-credit">{t("news.credit")}</p>}
    </div>
  );
}
