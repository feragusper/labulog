import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type SimRun, type SimSection, type SimSectionResult } from "../api";
import { fmtMMSS, stageLabel } from "../components/SimPanel";
import { PanelSkeleton } from "../components/ui";
import { useI18n } from "../i18n";

type Phase = "ready" | "running" | "report" | "summary";

function blankResult(sec: SimSection): SimSectionResult {
  return { elapsed_seconds: 0, rating: null, notes: "", checked: sec.questions.map(() => false) };
}

export default function SimRunner() {
  const { t } = useI18n();
  const { runId } = useParams();
  const id = Number(runId);
  const q = useQuery({ queryKey: ["sim-run", id], queryFn: () => api.getSimRun(id), enabled: Number.isFinite(id) });

  if (q.isLoading) return <div className="container"><PanelSkeleton rows={6} /></div>;
  if (q.isError || !q.data) return <div className="container error">{t("detail.notFound")}</div>;
  return <Runner run={q.data} />;
}

function Runner({ run }: { run: SimRun }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sections = run.sections;

  const savedResults: SimSectionResult[] = run.results?.sections ?? [];
  const startIdx = run.status === "done" ? sections.length : savedResults.length;

  const [results, setResults] = useState<SimSectionResult[]>(() =>
    sections.map((s, i) => savedResults[i] ?? blankResult(s)),
  );
  const [idx, setIdx] = useState(startIdx);
  const [phase, setPhase] = useState<Phase>(
    run.status === "done" ? "summary" : startIdx >= sections.length ? "summary" : "ready",
  );
  const [overallRating, setOverallRating] = useState<number | null>(run.results?.overall_rating ?? null);
  const [overallNotes, setOverallNotes] = useState(run.results?.overall_notes ?? "");

  // per-section live timer
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== "running" || paused) return;
    tickRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [phase, paused]);

  const persist = useMutation({
    mutationFn: (payload: Parameters<typeof api.updateSimRun>[1]) => api.updateSimRun(run.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sim-runs", run.application_id] });
    },
  });

  const cur = sections[idx];
  const curResult = results[idx];

  const beginSection = () => {
    setElapsed(results[idx]?.elapsed_seconds ?? 0);
    setPaused(false);
    setPhase("running");
  };

  const toReport = () => { setPaused(true); setPhase("report"); };

  const saveSection = () => {
    const next = results.map((r, i) => (i === idx ? { ...r, elapsed_seconds: elapsed } : r));
    setResults(next);
    const lastSection = idx >= sections.length - 1;
    persist.mutate({
      status: "in_progress",
      started_at: run.started_at ?? new Date().toISOString(),
      results: { sections: next, overall_rating: overallRating, overall_notes: overallNotes },
    });
    if (lastSection) {
      setIdx(sections.length);
      setPhase("summary");
    } else {
      setIdx(idx + 1);
      setElapsed(0);
      setPhase("ready");
    }
  };

  const finish = useMutation({
    mutationFn: () => api.updateSimRun(run.id, {
      status: "done",
      completed_at: new Date().toISOString(),
      results: { sections: results, overall_rating: overallRating, overall_notes: overallNotes },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sim-runs", run.application_id] });
      qc.invalidateQueries({ queryKey: ["sim-run", run.id] });
      navigate(`/applications/${run.application_id}`);
    },
  });

  const totalElapsed = useMemo(() => results.reduce((a, r) => a + (r.elapsed_seconds || 0), 0), [results]);

  const back = () => navigate(`/applications/${run.application_id}`);

  return (
    <div className="container sim-runner">
      <button className="link-btn" onClick={back} style={{ fontSize: 13 }}>{t("sim.run.back")}</button>
      <div className="sim-runner-head">
        <h1 className="page-title" style={{ margin: "6px 0" }}>{run.title}</h1>
        <span className={`sim-badge stage-${run.stage}`}>{stageLabel(t, run.stage)}</span>
      </div>

      {/* progress dots */}
      <div className="sim-progress">
        {sections.map((s, i) => (
          <div key={i} className={`sim-progress-step${i < idx ? " done" : ""}${i === idx && phase !== "summary" ? " current" : ""}`}>
            <span className="dot" />
            <span className="lbl">{s.title || `${t("sim.section")} ${i + 1}`}</span>
          </div>
        ))}
      </div>

      {phase === "summary"
        ? <Summary
            run={run} sections={sections} results={results}
            overallRating={overallRating} setOverallRating={setOverallRating}
            overallNotes={overallNotes} setOverallNotes={setOverallNotes}
            totalElapsed={totalElapsed} done={run.status === "done"}
            onFinish={() => finish.mutate()} finishing={finish.isPending} onExit={back}
          />
        : (
          <div className="panel sim-stage-panel">
            <div className="sim-stage-topbar">
              <div className="sim-stage-meta">
                <span className="sim-kind-tag">{t(`sim.kind.${cur.kind}`)}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {t("sim.run.sectionOf").replace("{n}", String(idx + 1)).replace("{total}", String(sections.length))}
                </span>
              </div>
              <Timer duration={cur.duration_seconds} elapsed={elapsed} running={phase === "running"} />
            </div>

            <h2 className="sim-stage-title">{cur.title || `${t("sim.section")} ${idx + 1}`}</h2>

            {phase === "ready" && (
              <div className="sim-ready">
                <p className="muted">
                  {cur.questions.length > 0 && `${cur.questions.length} ${t("sim.questions").toLowerCase()} · `}
                  {Math.round(cur.duration_seconds / 60)} {t("sim.min")}
                </p>
                <button onClick={beginSection}>▶ {t("sim.run.beginSection")}</button>
              </div>
            )}

            {(phase === "running" || phase === "report") && (
              <SectionBody
                section={cur}
                result={curResult}
                onToggleChecked={(qi) => setResults((prev) => prev.map((r, i) =>
                  i === idx ? { ...r, checked: r.checked.map((c, j) => (j === qi ? !c : c)) } : r))}
                reporting={phase === "report"}
              />
            )}

            {phase === "running" && (
              <div className="row" style={{ marginTop: 16 }}>
                <button className="shrink ghost" onClick={() => setPaused((p) => !p)}>
                  {paused ? "▶ " + t("sim.run.resume") : "⏸ " + t("sim.run.pause")}
                </button>
                <div style={{ flex: 1 }} />
                <button className="shrink" onClick={toReport}>{t("sim.run.finishSection")}</button>
              </div>
            )}

            {phase === "report" && (
              <div className="sim-report">
                <h3>{t("sim.run.selfReport")}</h3>
                <label>{t("sim.run.rating")}</label>
                <RatingPicker value={curResult.rating} onChange={(v) =>
                  setResults((prev) => prev.map((r, i) => (i === idx ? { ...r, rating: v } : r)))} />
                <textarea rows={3} placeholder={t("sim.run.notesPh")} value={curResult.notes}
                  onChange={(e) => setResults((prev) => prev.map((r, i) => (i === idx ? { ...r, notes: e.target.value } : r)))}
                  style={{ marginTop: 10 }} />
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="shrink" onClick={saveSection}>
                    {idx >= sections.length - 1 ? t("sim.run.finishSection") : t("sim.run.saveSection")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

function Timer({ duration, elapsed, running }: { duration: number; elapsed: number; running: boolean }) {
  const remaining = duration - elapsed;
  const over = remaining < 0;
  const { t } = useI18n();
  const warn = remaining <= 30;
  return (
    <div className={`sim-timer${over ? " over" : warn ? " warn" : ""}${running ? " live" : ""}`}>
      <span className="sim-timer-label">{over ? t("sim.run.overtime") : t("sim.run.timeLeft")}</span>
      <span className="sim-timer-clock">{fmtMMSS(Math.abs(remaining))}</span>
    </div>
  );
}

function SectionBody({ section, result, onToggleChecked, reporting }: {
  section: SimSection; result: SimSectionResult;
  onToggleChecked: (qi: number) => void; reporting: boolean;
}) {
  const { t } = useI18n();
  if (section.kind === "live_coding" || (section.kind === "open" && section.prompt)) {
    return (
      <div className="sim-prompt">
        {section.prompt && <p className="sim-prompt-text">{section.prompt}</p>}
        {section.kind === "live_coding" && (
          <p className="muted sim-live-hint">💡 {t("sim.run.liveHint")}</p>
        )}
        {section.questions.length > 0 && (
          <ul className="sim-q-list">
            {section.questions.map((q, i) => <li key={i}>{q.q}</li>)}
          </ul>
        )}
      </div>
    );
  }
  // theory / open with questions: checklist
  return (
    <ul className="sim-q-list checklist">
      {section.questions.map((q, i) => (
        <li key={i} className={result.checked[i] ? "checked" : ""}>
          <label className="sim-q-check">
            {reporting && (
              <input type="checkbox" checked={result.checked[i] ?? false} onChange={() => onToggleChecked(i)} />
            )}
            <span>{q.q}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function RatingPicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const { t } = useI18n();
  return (
    <div className="sim-rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={`sim-rating-btn${value && n <= value ? " on" : ""}`}
          title={t(`sim.run.ratingLabels.${n}`)} onClick={() => onChange(n)}>★</button>
      ))}
      {value && <span className="muted sim-rating-lbl">{t(`sim.run.ratingLabels.${value}`)}</span>}
    </div>
  );
}

function Summary({
  sections, results, overallRating, setOverallRating, overallNotes, setOverallNotes,
  totalElapsed, done, onFinish, finishing, onExit,
}: {
  run: SimRun; sections: SimSection[]; results: SimSectionResult[];
  overallRating: number | null; setOverallRating: (v: number) => void;
  overallNotes: string; setOverallNotes: (v: string) => void;
  totalElapsed: number; done: boolean; onFinish: () => void; finishing: boolean; onExit: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="panel">
      <h2>{t("sim.run.summaryTitle")}</h2>
      <div className="detail-meta" style={{ marginBottom: 8 }}>
        <div>
          <div className="label">{t("sim.run.totalTime")}</div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 600 }}>{fmtMMSS(totalElapsed)}</div>
        </div>
      </div>

      <ul className="sim-summary-list">
        {sections.map((s, i) => {
          const r = results[i];
          const nailed = s.questions.length
            ? `${r?.checked?.filter(Boolean).length ?? 0}/${s.questions.length}`
            : null;
          return (
            <li key={i}>
              <span className="sim-summary-title">{s.title || `${t("sim.section")} ${i + 1}`}</span>
              <span className="muted" style={{ fontSize: 13 }}>{fmtMMSS(r?.elapsed_seconds ?? 0)}</span>
              {nailed && <span className="muted" style={{ fontSize: 13 }}>· {nailed}</span>}
              <span style={{ flex: 1 }} />
              <span className="sim-stars">{r?.rating ? "★".repeat(r.rating) : "—"}</span>
            </li>
          );
        })}
      </ul>

      <div style={{ marginTop: 16 }}>
        <label>{t("sim.run.overall")}</label>
        {done
          ? <div className="sim-stars" style={{ fontSize: 20 }}>{overallRating ? "★".repeat(overallRating) : "—"}</div>
          : <RatingPicker value={overallRating} onChange={setOverallRating} />}
      </div>
      <div style={{ marginTop: 12 }}>
        <label>{t("sim.run.overallNotes")}</label>
        {done
          ? <div className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{overallNotes || "—"}</div>
          : <textarea rows={3} value={overallNotes} onChange={(e) => setOverallNotes(e.target.value)} placeholder={t("sim.run.notesPh")} />}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        {done
          ? <button className="shrink" onClick={onExit}>{t("sim.run.exit")}</button>
          : <button className="shrink" disabled={finishing} onClick={onFinish}>✓ {t("sim.run.finish")}</button>}
      </div>
    </div>
  );
}
