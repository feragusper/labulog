import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type NewsItem, type NewsScope } from "../api";
import { useI18n } from "../i18n";
import { Skeleton } from "../components/ui";
import { NewsIcon } from "../components/icons";

export function ago(t: (k: string) => string, ts: string | null): string {
  if (!ts) return "";
  const d = Math.floor((Date.now() - +new Date(ts)) / 86_400_000);
  if (d <= 0) return t("ago.today");
  if (d === 1) return t("ago.yesterday");
  if (d < 30) return t("ago.days").replace("{n}", String(d));
  return new Date(ts).toLocaleDateString();
}

const SCOPES: NewsScope[] = ["role", "related", "market"];

// Stable hue per outlet, for the no-image placeholder.
function hue(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function initials(s: string): string {
  return s.replace(/^the\s+/i, "").split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function domainOf(u: string): string | null {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "");
    return h === "news.google.com" ? null : h;
  } catch {
    return null;
  }
}

function NewsCard({ n, featured = false }: { n: NewsItem; featured?: boolean }) {
  const { t } = useI18n();
  // Thumbnail, snippet and real publisher URL are resolved lazily per card.
  const meta = useQuery({
    queryKey: ["news-meta", n.url],
    queryFn: () => api.newsMeta(n.url),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
  const [imgOk, setImgOk] = useState(true);
  const href = meta.data?.url ?? n.url;
  const domain = meta.data ? domainOf(meta.data.url) : null;
  const img = imgOk ? meta.data?.image : null;
  const h = hue(n.source || n.title);

  return (
    <a className={`news-card${featured ? " featured" : ""}`} href={href} target="_blank" rel="noreferrer">
      <div className="news-media">
        {meta.isLoading ? (
          <div className="skeleton news-media-fill" />
        ) : img ? (
          <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
        ) : (
          <div
            className="news-placeholder"
            style={{ background: `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 60% 28%))` }}
          >
            <span>{initials(n.source || "?")}</span>
            <NewsIcon size={featured ? 28 : 20} />
          </div>
        )}
        <span className={`news-scope s-${n.scope}`}>{t(`news.tag.${n.scope}`)}</span>
      </div>
      <div className="news-body">
        <div className="news-src">
          {domain && <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={16} height={16} />}
          <span className="news-src-name">{n.source}</span>
          {n.published_at && <span className="muted">· {ago(t, n.published_at)}</span>}
        </div>
        <h3 className="news-title">{n.title}</h3>
        {meta.data?.description && <p className="news-snippet">{meta.data.description}</p>}
      </div>
    </a>
  );
}

function GridSkeleton() {
  return (
    <div className="news-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="news-card" key={i}>
          <div className="news-media"><div className="skeleton news-media-fill" /></div>
          <div className="news-body">
            <Skeleton w={110} h={11} style={{ marginBottom: 10 }} />
            <Skeleton h={15} style={{ marginBottom: 6 }} />
            <Skeleton w="70%" h={15} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function News() {
  const { t, lang } = useI18n();
  const suggest = useQuery({ queryKey: ["feed-suggest"], queryFn: api.feedSuggest });
  const [input, setInput] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const [scope, setScope] = useState<NewsScope | "all">("all");

  useEffect(() => {
    if (suggest.data && query === null) { setInput(suggest.data.role); setQuery(suggest.data.role); }
  }, [suggest.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const news = useQuery({
    queryKey: ["news", query, lang],
    queryFn: () => api.news(query ?? "", lang),
    enabled: query !== null,
    staleTime: 10 * 60_000,
  });

  const all = news.data?.items ?? [];
  const counts = Object.fromEntries(SCOPES.map((s) => [s, all.filter((i) => i.scope === s).length]));
  const items = scope === "all" ? all : all.filter((i) => i.scope === scope);
  const [first, ...rest] = items;

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title" style={{ margin: 0 }}>{t("news.title")}</h1>
        <form className="news-search" onSubmit={(e) => { e.preventDefault(); setQuery(input.trim()); }}>
          <input value={input} placeholder="Android Engineer" onChange={(e) => setInput(e.target.value)} />
          <button type="submit">{t("news.search")}</button>
        </form>
      </div>
      <p className="muted news-desc">{t("news.desc")}</p>

      {news.data && all.length > 0 && (
        <div className="seg news-tabs">
          <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>
            {t("news.all")} <span className="muted">{all.length}</span>
          </button>
          {SCOPES.filter((s) => counts[s]).map((s) => (
            <button key={s} className={scope === s ? "active" : ""} onClick={() => setScope(s)}>
              {s === "role" ? news.data.query : t(`news.tag.${s}`)} <span className="muted">{counts[s]}</span>
            </button>
          ))}
        </div>
      )}

      {(news.isLoading || suggest.isLoading) && <GridSkeleton />}
      {news.isError && <p className="error">{t("news.error")}</p>}
      {news.data && all.length === 0 && <p className="muted">{t("news.empty")}</p>}

      {first && (
        <>
          <NewsCard n={first} featured />
          <div className="news-grid">
            {rest.map((n) => <NewsCard key={n.url} n={n} />)}
          </div>
        </>
      )}
      {all.length > 0 && <p className="muted feed-credit">{t("news.credit")}</p>}
    </div>
  );
}
