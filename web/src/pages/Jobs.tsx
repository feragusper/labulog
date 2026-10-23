import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type JobItem, type JobsResult } from "../api";
import { useI18n } from "../i18n";
import { PanelSkeleton, salaryDisplay } from "../components/ui";
import CountrySelect from "../components/CountrySelect";
import { countryName, flag, toCountryCode } from "../countries";
import { ago } from "./News";

// Boards spell tags differently ("Full-Time", "full time", "full_time"): compare a normalized key.
const tagKey = (x: string) => x.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
const TOP_TAGS = 14;

// "Málaga, Spain" → flag of its country part, if any.
const zoneFlag = (z: string) => flag(toCountryCode(z.split(",").pop() ?? "")) || "📍";

function JobCard({ job, onSaved }: { job: JobItem; onSaved: (appId: number) => void }) {
  const { t } = useI18n();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const app = await api.createApplication({
        posting: {
          url: job.url, title: job.title, company_name: job.company || "—",
          location: job.location || null, remote: job.remote ? "remote" : null,
          source: job.source.toLowerCase(), salary_min: job.salary_min, salary_max: job.salary_max,
          currency: job.currency, salary_period: job.salary_period, description: job.excerpt || null,
          posted_at: job.published_at,
        },
        status: "saved",
      });
      onSaved(app.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("jobs.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const salary = job.salary_min != null || job.salary_max != null ? salaryDisplay(job) : null;

  return (
    <div className="job-card">
      <div className="job-main">
        <a className="job-title" href={job.url} target="_blank" rel="noreferrer">{job.title}</a>
        <div className="job-meta">
          {job.company && <strong>{job.company}</strong>}
          {job.location && <span>{job.location}</span>}
          {job.remote && <span className="job-tag">{t("jobs.remote")}</span>}
          {salary && <span className="job-salary">{salary}</span>}
          {job.tags.slice(0, 3).map((x) => <span className="job-tag" key={x}>{x}</span>)}
        </div>
        {job.excerpt && <div className="muted job-excerpt">{job.excerpt}</div>}
        <div className="muted job-foot">
          {t("jobs.via")} <a href={job.source_url} target="_blank" rel="noreferrer">{job.source}</a>
          {job.published_at && <> · {ago(t, job.published_at)}</>}
        </div>
        {err && <div className="error">{err}</div>}
      </div>
      <div className="job-actions">
        {job.application_id ? (
          <Link to={`/applications/${job.application_id}`} className="btn-link">{t("jobs.tracked")}</Link>
        ) : (
          <button onClick={save} disabled={saving}>{saving ? t("jobs.saving") : t("jobs.save")}</button>
        )}
        <a className="btn-link ghost" href={job.url} target="_blank" rel="noreferrer">{t("jobs.open")} ↗</a>
      </div>
    </div>
  );
}

export default function Jobs() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const suggest = useQuery({ queryKey: ["feed-suggest"], queryFn: api.feedSuggest });
  const [role, setRole] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [search, setSearch] = useState<{ q: string; zones: string[] } | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState(false);
  const [source, setSource] = useState<string>("all");
  const [hideTracked, setHideTracked] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (suggest.data && search === null) {
      const z = suggest.data.location ? [suggest.data.location] : [];
      setRole(suggest.data.role); setZones(z);
      setSearch({ q: suggest.data.role, zones: z });
    }
  }, [suggest.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = ["jobs", search?.q, search?.zones.join("|")];
  const jobs = useQuery({
    queryKey: key,
    queryFn: () => api.jobs(search!.q, search!.zones),
    enabled: search !== null,
    staleTime: 10 * 60_000,
  });

  const markSaved = (url: string, appId: number) => {
    qc.setQueryData<JobsResult>(key, (old) => old && ({
      ...old, items: old.items.map((j) => (j.url === url ? { ...j, application_id: appId } : j)),
    }));
    qc.invalidateQueries({ queryKey: ["applications"] });
  };

  // Tags across the results, most common first; label is the first spelling seen.
  const tagStats = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>();
    for (const j of jobs.data?.items ?? []) {
      for (const k of new Set(j.tags.map(tagKey).filter(Boolean))) {
        const e = m.get(k);
        if (e) e.count++;
        else m.set(k, { label: j.tags.find((x) => tagKey(x) === k)!, count: 1 });
      }
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.count - a.count);
  }, [jobs.data]);

  // Drop selected tags that no longer exist after a new search.
  useEffect(() => {
    setTags((sel) => sel.filter((k) => tagStats.some((t) => t.key === k)));
  }, [tagStats]);

  const toggleTag = (k: string) =>
    setTags((sel) => (sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]));

  const items = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (jobs.data?.items ?? []).filter((j) => {
      const keys = j.tags.map(tagKey);
      return (source === "all" || j.source === source)
        && (!hideTracked || !j.application_id)
        && tags.every((k) => keys.includes(k))
        && (!f || `${j.title} ${j.company} ${j.location} ${j.tags.join(" ")}`.toLowerCase().includes(f));
    });
  }, [jobs.data, source, hideTracked, filter, tags]);

  const addZone = (code: string) => {
    const name = countryName(code);
    if (code && !zones.some((z) => z.toLowerCase() === name.toLowerCase())) setZones([...zones, name]);
  };

  // Selected tags stay visible even when they fall outside the top list.
  const shownTags = allTags ? tagStats : tagStats.filter((x, i) => i < TOP_TAGS || tags.includes(x.key));

  const sources = jobs.data?.sources ?? [];

  return (
    <div>
      <h1 className="page-title">{t("jobs.title")}</h1>
      <div className="panel">
        <p className="muted" style={{ marginTop: 0 }}>{t("jobs.desc")}</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); setSearch({ q: role.trim(), zones }); }}>
          <div>
            <label>{t("jobs.role")}</label>
            <input value={role} placeholder="Android Engineer" onChange={(e) => setRole(e.target.value)} />
          </div>
          <div>
            <label>{t("jobs.zones")}</label>
            <div className="zone-picker">
              {zones.map((z) => (
                <span className="zone-chip" key={z}>
                  {zoneFlag(z)} {z}
                  <button type="button" aria-label="×" onClick={() => setZones(zones.filter((x) => x !== z))}>×</button>
                </span>
              ))}
              <CountrySelect value="" onChange={addZone} clearOnPick
                placeholder={zones.length ? t("jobs.addZone") : `${t("jobs.anyZone")} · ${t("jobs.addZone")}`} />
            </div>
          </div>
          <button className="shrink" type="submit">{t("jobs.search")}</button>
        </form>
        {sources.length > 0 && (
          <div className="job-sources">
            {sources.map((s) => (
              <span key={s.name} className={`job-source${s.ok ? "" : " bad"}`} title={s.error ?? ""}>
                <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a> {s.ok ? s.count : "⚠"}
              </span>
            ))}
            {!sources.some((s) => s.name === "Adzuna") && <span className="muted">· {t("jobs.adzunaHint")}</span>}
          </div>
        )}
      </div>

      {(jobs.isLoading || suggest.isLoading) && <PanelSkeleton rows={8} />}
      {jobs.isError && <p className="error">{t("jobs.error")}</p>}

      {jobs.data && (
        <div className="panel">
          <div className="filters">
            <input value={filter} placeholder={t("jobs.filter")} onChange={(e) => setFilter(e.target.value)} />
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="all">{t("jobs.allSources")}</option>
              {sources.filter((s) => s.count).map((s) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
            </select>
            <label className="check">
              <input type="checkbox" checked={hideTracked} onChange={(e) => setHideTracked(e.target.checked)} />
              <span>{t("jobs.hideTracked")}</span>
            </label>
          </div>
          {tagStats.length > 0 && (
            <div className="tag-filters">
              <span className="muted">{t("jobs.tags")}:</span>
              {shownTags.map((x) => (
                <button type="button" key={x.key} className={`tag-chip${tags.includes(x.key) ? " on" : ""}`}
                  onClick={() => toggleTag(x.key)}>
                  {x.label}<span className="muted">{x.count}</span>
                </button>
              ))}
              {tagStats.length > TOP_TAGS && (
                <button type="button" className="tag-chip link" onClick={() => setAllTags(!allTags)}>
                  {allTags ? t("jobs.lessTags") : `+${tagStats.length - TOP_TAGS} ${t("jobs.moreTags")}`}
                </button>
              )}
              {tags.length > 0 && (
                <button type="button" className="tag-chip link" onClick={() => setTags([])}>{t("jobs.clearTags")}</button>
              )}
            </div>
          )}
          <p className="muted" style={{ margin: "4px 0 10px" }}>{items.length} {t("common.results")}</p>
          {items.length === 0 ? <p className="muted">{t("jobs.empty")}</p> : (
            <div className="job-list">
              {items.map((j) => <JobCard key={j.url} job={j} onSaved={(id) => markSaved(j.url, id)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
