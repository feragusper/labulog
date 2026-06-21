import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type AppStatus, type Application } from "../api";
import { Badge, HOURS_PER_INTERVIEW, pct } from "../components/ui";
import { useI18n } from "../i18n";

const CLOSED: AppStatus[] = ["rejected", "ghosted", "withdrawn"];

function processDays(a: Application): number | null {
  const ts = a.events.map((e) => +new Date(e.at));
  const start = a.applied_at ? +new Date(a.applied_at) : (ts.length ? Math.min(...ts) : null);
  const last = ts.length ? Math.max(...ts) : start;
  if (start == null || last == null) return null;
  return Math.max(0, Math.round((last - start) / 86_400_000));
}

export default function Overview() {
  const { t } = useI18n();
  const funnel = useQuery({ queryKey: ["funnel"], queryFn: api.funnel });
  const apps = useQuery({ queryKey: ["applications"], queryFn: api.listApplications });
  const f = funnel.data;

  const list = apps.data ?? [];
  const interviewRounds = list.reduce(
    (n, a) => n + a.events.filter((e) => e.status === "interview").length, 0);
  const interviewHours = interviewRounds * HOURS_PER_INTERVIEW;
  const durations = list.map(processDays).filter((d): d is number => d !== null);
  const avgProcess = durations.length
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;

  const now = new Date();
  const due = list
    .filter((a) => a.follow_up_date && !CLOSED.includes(a.status) && new Date(a.follow_up_date) <= now)
    .sort((a, b) => +new Date(a.follow_up_date!) - +new Date(b.follow_up_date!));

  return (
    <div>
      <h1 className="page-title">{t("overview.title")}</h1>

      <div className="grid cards">
        <Card label={t("overview.applications")} value={f?.total ?? "—"} />
        <Card label={t("overview.responseRate")} value={f ? pct(f.response_rate) : "—"} />
        <Card label={t("overview.interviewRate")} value={f ? pct(f.interview_rate) : "—"} />
        <Card label={t("overview.offers")} value={f?.by_status.offer ?? "—"} />
        <Card label={t("overview.ghosted")} value={f?.ghost_count ?? "—"} />
      </div>

      <div className="grid cards" style={{ marginTop: 16 }}>
        <Card label={t("overview.interviewRounds")} value={apps.isLoading ? "—" : interviewRounds} />
        <Card label={t("overview.interviewHours")} value={apps.isLoading ? "—" : `~${interviewHours} h`} />
        <Card label={t("overview.avgProcess")} value={avgProcess !== null ? `${avgProcess} d` : "—"} />
        <Card label={t("overview.dueFollowups")} value={apps.isLoading ? "—" : due.length} />
      </div>

      {due.length > 0 && (
        <div className="panel">
          <h2>{t("overview.dueFollowups")}</h2>
          <ul className="due-list">
            {due.map((a) => (
              <li key={a.id}>
                <Link to={`/applications/${a.id}`}>{a.posting.company_name ?? a.posting.title}</Link>
                <span className="due">{new Date(a.follow_up_date!).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}</span>
                <Badge status={a.status} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel">
        <h2>{t("overview.byStatus")}</h2>
        {!f || f.total === 0 ? (
          <p className="muted">{t("overview.emptyFunnel")}</p>
        ) : (
          <div className="status-bars">
            {(Object.keys(f.by_status) as AppStatus[])
              .filter((s) => f.by_status[s] > 0)
              .map((s) => (
                <div key={s} className="status-bar-row">
                  <div className="status-bar-label"><Badge status={s} /></div>
                  <div className="status-bar-track">
                    <div
                      className={`status-bar-fill ${s}`}
                      style={{ width: `${(f.by_status[s] / f.total) * 100}%` }}
                    />
                  </div>
                  <div className="status-bar-count muted">{f.by_status[s]}</div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
