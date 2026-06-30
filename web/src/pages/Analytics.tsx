import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, type AppStatus, type Application } from "../api";
import { FunnelChart, PieChart } from "../components/Charts";
import {
  Badge, CardsSkeleton, furthestStage, HOURS_PER_INTERVIEW, INTERVIEW_STATUSES, NEGATIVE_TERMINAL,
  PanelSkeleton, pct, PIPELINE, rankOf, statusLabel, TERMINAL,
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
  const navigate = useNavigate();
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

  // Funnel stages shown (skip "saved": pre-application, not a pipeline step).
  const funnelStages = PIPELINE.filter((s) => s !== "saved");
  const baseline = list.filter((a) => rankOf(stageOf.get(a.id)!) >= rankOf(funnelStages[0])).length;

  const stageFunnel = funnelStages.map((stage, i) => {
    const count = list.filter((a) => rankOf(stageOf.get(a.id)!) >= rankOf(stage)).length;
    const prevCount = i === 0 ? count : list.filter((a) => rankOf(stageOf.get(a.id)!) >= rankOf(funnelStages[i - 1])).length;
    const atStage = list.filter((a) => stageOf.get(a.id) === stage && NEGATIVE_TERMINAL.includes(a.status));
    const accepted = stage === "offer" ? list.filter((a) => a.status === "accepted").length : 0;
    return {
      stage,
      count,
      pctOfBaseline: baseline ? count / baseline : 0,
      pctOfPrev: i > 0 && prevCount ? count / prevCount : null,
      lost: atStage.length,
      lostByOutcome: NEGATIVE_TERMINAL.map((o) => ({ outcome: o, count: atStage.filter((a) => a.status === o).length }))
        .filter((o) => o.count > 0),
      accepted,
    };
  });

  const outcomeData = TERMINAL
    .map((status) => ({ status, count: list.filter((a) => a.status === status).length }))
    .filter((d) => d.count > 0);

  const goToStage = (stage: AppStatus) => navigate(`/applications?minStage=${stage}`);
  const goToOutcomeAtStage = (status: AppStatus, stage: AppStatus) =>
    navigate(`/applications?status=${status}&stage=${stage}`);
  const goToStatus = (status: AppStatus) => navigate(`/applications?status=${status}`);

  return (
    <div>
      <h1 className="page-title">{t("analytics.title")}</h1>

      {!f ? <CardsSkeleton /> : (
        <div className="grid cards">
          <Card label={t("overview.applications")} value={f.total} />
          <Card label={t("overview.responseRate")} value={pct(f.response_rate)} />
          <Card label={t("overview.interviewRate")} value={pct(f.interview_rate)} />
          <Card label={t("overview.offers")} value={f.by_status.offer + f.by_status.accepted} />
          <Card label={t("overview.ghosted")} value={f.ghost_count} />
        </div>
      )}

      {apps.isLoading ? <CardsSkeleton /> : (
        <div className="grid cards" style={{ marginTop: 16 }}>
          <Card label={t("overview.interviewRounds")} value={interviewRounds} />
          <Card label={t("overview.interviewHours")} value={`~${interviewHours} h`} />
          <Card label={t("overview.avgProcess")} value={avgProcess !== null ? `${avgProcess} d` : "—"} />
          <Card label={t("overview.dueFollowups")} value={due.length} />
        </div>
      )}

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
        <h2>{t("overview.funnelTitle")}</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>{t("overview.funnelHint")}</p>
        {apps.isLoading ? <PanelSkeleton rows={5} /> : !baseline ? (
          <p className="muted">{t("overview.emptyFunnel")}</p>
        ) : (
          <>
            <FunnelChart stages={stageFunnel} onClickStage={goToStage} />

            <div className="funnel-details">
              {stageFunnel.map(({ stage, pctOfBaseline, pctOfPrev, lost, lostByOutcome, accepted }) => (
                <div key={stage} className="funnel-detail-row">
                  <button className="tag-btn funnel-detail-stage" onClick={() => goToStage(stage)}>
                    <Badge status={stage} />
                    <span className="muted" style={{ fontSize: 12 }}>
                      {pct(pctOfBaseline)} {t("overview.ofTotal")}
                      {pctOfPrev !== null && ` · ${pct(pctOfPrev)} ${t("overview.vsPrevStage")}`}
                    </span>
                  </button>

                  {accepted > 0 && (
                    <button className="tag-btn funnel-drop-positive" onClick={() => goToOutcomeAtStage("accepted", "offer")}>
                      <span className="legend-dot out-accepted" /> {accepted} {t("overview.acceptedHere")}
                    </button>
                  )}
                  {lost > 0 && (
                    <div className="funnel-drop">
                      <span className="muted">−{lost} {t("overview.closedHere")}:</span>
                      {lostByOutcome.map(({ outcome, count: c }) => (
                        <button key={outcome} className="tag-btn legend-item" onClick={() => goToOutcomeAtStage(outcome, stage)}>
                          <span className={`legend-dot ${OUTCOME_CLASS[outcome]}`} />
                          {statusLabel(t, outcome)} ({c})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>{t("overview.byStatus")}</h2>
        {apps.isLoading ? <PanelSkeleton rows={3} /> : outcomeData.length === 0 ? (
          <p className="muted">{t("overview.emptyFunnel")}</p>
        ) : (
          <PieChart data={outcomeData} onClickSlice={goToStatus} />
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
