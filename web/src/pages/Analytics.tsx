import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type AppStatus, type Application } from "../api";
import {
  Badge, furthestStage, HOURS_PER_INTERVIEW, INTERVIEW_STATUSES, NEGATIVE_TERMINAL,
  pct, PIPELINE, rankOf, statusLabel,
} from "../components/ui";
import { useI18n } from "../i18n";

const CLOSED: AppStatus[] = ["accepted", "rejected", "cancelled", "ghosted", "withdrawn"];
const OUTCOME_CLASS: Record<AppStatus, string> = {
  rejected: "out-rejected", ghosted: "out-ghosted", cancelled: "out-cancelled", withdrawn: "out-withdrawn",
} as Record<AppStatus, string>;

// Real pipeline stages beyond "applied" (excludes terminal outcomes).
const PROGRESS_STAGES: AppStatus[] = [
  "first_contact", "screening", "technical_interview",
  "manager_interview", "interview", "proposal", "offer",
];
function progressed(a: Application): boolean {
  return a.events.some((e) => PROGRESS_STAGES.includes(e.status));
}
function processDays(a: Application): number | null {
  const ts = a.events.map((e) => +new Date(e.at));
  const start = a.applied_at ? +new Date(a.applied_at) : (ts.length ? Math.min(...ts) : null);
  const last = ts.length ? Math.max(...ts) : start;
  if (start == null || last == null) return null;
  return Math.max(0, Math.round((last - start) / 86_400_000));
}

export default function Analytics() {
  const { t } = useI18n();
  const funnel = useQuery({ queryKey: ["funnel"], queryFn: api.funnel });
  const apps = useQuery({ queryKey: ["applications"], queryFn: api.listApplications });
  const f = funnel.data;

  const list = apps.data ?? [];
  const interviewRounds = list.reduce(
    (n, a) => n + a.events.filter((e) => INTERVIEW_STATUSES.includes(e.status)).length, 0);
  const interviewHours = interviewRounds * HOURS_PER_INTERVIEW;
  const durations = list.filter(progressed).map(processDays).filter((d): d is number => d !== null);
  const avgProcess = durations.length
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;

  const now = new Date();
  const due = list
    .filter((a) => a.follow_up_date && !CLOSED.includes(a.status) && new Date(a.follow_up_date) <= now)
    .sort((a, b) => +new Date(a.follow_up_date!) - +new Date(b.follow_up_date!));

  // Furthest stage each application ever reached, regardless of outcome.
  const stageOf = new Map<number, AppStatus>(list.map((a) => [a.id, furthestStage(a)]));

  // Funnel: how many apps reached AT LEAST each pipeline stage.
  const stageFunnel = PIPELINE.map((stage) => ({
    stage,
    count: list.filter((a) => rankOf(stageOf.get(a.id)!) >= rankOf(stage)).length,
  }));

  // Of the apps that didn't make it, where (which stage) and how (which outcome) did they close.
  const outcomeByStage = PIPELINE
    .map((stage) => {
      const atStage = list.filter((a) => stageOf.get(a.id) === stage && NEGATIVE_TERMINAL.includes(a.status));
      return {
        stage,
        total: atStage.length,
        byOutcome: NEGATIVE_TERMINAL.map((o) => ({ outcome: o, count: atStage.filter((a) => a.status === o).length })),
      };
    })
    .filter((row) => row.total > 0);

  return (
    <div>
      <h1 className="page-title">{t("analytics.title")}</h1>

      <div className="grid cards">
        <Card label={t("overview.applications")} value={f?.total ?? "—"} />
        <Card label={t("overview.responseRate")} value={f ? pct(f.response_rate) : "—"} />
        <Card label={t("overview.interviewRate")} value={f ? pct(f.interview_rate) : "—"} />
        <Card label={t("overview.offers")} value={f ? f.by_status.offer + f.by_status.accepted : "—"} />
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

      <div className="panel">
        <h2>{t("overview.stageFunnel")}</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>{t("overview.stageFunnelHint")}</p>
        {!list.length ? (
          <p className="muted">{t("overview.emptyFunnel")}</p>
        ) : (
          <div className="status-bars">
            {stageFunnel.map(({ stage, count }) => (
              <div key={stage} className="status-bar-row">
                <div className="status-bar-label"><Badge status={stage} /></div>
                <div className="status-bar-track">
                  <div
                    className={`status-bar-fill ${stage}`}
                    style={{ width: `${(count / list.length) * 100}%` }}
                  />
                </div>
                <div className="status-bar-count muted">{count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {outcomeByStage.length > 0 && (
        <div className="panel">
          <h2>{t("overview.outcomeByStage")}</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>{t("overview.outcomeByStageHint")}</p>
          <div className="status-bars">
            {outcomeByStage.map(({ stage, total, byOutcome }) => (
              <div key={stage} className="status-bar-row">
                <div className="status-bar-label"><Badge status={stage} /></div>
                <div className="status-bar-track" style={{ display: "flex" }}>
                  {byOutcome.filter((o) => o.count > 0).map(({ outcome, count }) => (
                    <div
                      key={outcome}
                      className={`status-bar-fill ${OUTCOME_CLASS[outcome]}`}
                      style={{ width: `${(count / total) * 100}%` }}
                      title={`${statusLabel(t, outcome)}: ${count}`}
                    />
                  ))}
                </div>
                <div className="status-bar-count muted">{total}</div>
              </div>
            ))}
          </div>
          <div className="legend" style={{ marginTop: 12 }}>
            {NEGATIVE_TERMINAL.map((o) => (
              <span key={o} className="legend-item">
                <span className={`legend-dot ${OUTCOME_CLASS[o]}`} />
                {statusLabel(t, o)}
              </span>
            ))}
          </div>
        </div>
      )}
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
