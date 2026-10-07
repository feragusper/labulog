import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type JobItem, type JobsResult } from "../api";
import { useI18n } from "../i18n";
import { PanelSkeleton, salaryDisplay } from "../components/ui";
import { ago } from "./News";

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
  const [loc, setLoc] = useState("");
  const [search, setSearch] = useState<{ q: string; location: string } | null>(null);
  const [source, setSource] = useState<string>("all");
  const [hideTracked, setHideTracked] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (suggest.data && search === null) {
      setRole(suggest.data.role); setLoc(suggest.data.location);
      setSearch({ q: suggest.data.role, location: suggest.data.location });
    }
  }, [suggest.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = ["jobs", search?.q, search?.location];
  const jobs = useQuery({
    queryKey: key,
    queryFn: () => api.jobs(search!.q, search!.location),
    enabled: search !== null,
    staleTime: 10 * 60_000,
  });

  const markSaved = (url: string, appId: number) => {
    qc.setQueryData<JobsResult>(key, (old) => old && ({
      ...old, items: old.items.map((j) => (j.url === url ? { ...j, application_id: appId } : j)),
    }));
    qc.invalidateQueries({ queryKey: ["applications"] });
  };

  const items = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (jobs.data?.items ?? []).filter((j) =>
      (source === "all" || j.source === source)
      && (!hideTracked || !j.application_id)
      && (!f || `${j.title} ${j.company} ${j.location} ${j.tags.join(" ")}`.toLowerCase().includes(f)));
  }, [jobs.data, source, hideTracked, filter]);

  const sources = jobs.data?.sources ?? [];

  return (
    <div>
      <h1 className="page-title">{t("jobs.title")}</h1>
      <div className="panel">
        <p className="muted" style={{ marginTop: 0 }}>{t("jobs.desc")}</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); setSearch({ q: role.trim(), location: loc.trim() }); }}>
          <div>
            <label>{t("jobs.role")}</label>
            <input value={role} placeholder="Android Engineer" onChange={(e) => setRole(e.target.value)} />
          </div>
          <div>
            <label>{t("jobs.location")}</label>
            <input value={loc} placeholder="Madrid, Spain" onChange={(e) => setLoc(e.target.value)} />
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
