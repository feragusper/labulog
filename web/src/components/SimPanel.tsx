import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api, type Application, type SectionKind, type SimRun, type SimSection, type SimStage,
} from "../api";
import { useI18n } from "../i18n";

export const SIM_STAGES: SimStage[] = ["screening", "management", "technical", "mixed"];
export const SECTION_KINDS: SectionKind[] = ["theory", "live_coding", "open"];

export function stageLabel(t: (k: string) => string, s: SimStage) {
  return t(`sim.stage.${s}`);
}
export function fmtMMSS(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function sectionMinutes(sections: SimSection[]) {
  return Math.round(sections.reduce((a, s) => a + s.duration_seconds, 0) / 60);
}

function StageBadge({ stage }: { stage: SimStage }) {
  const { t } = useI18n();
  return <span className={`sim-badge stage-${stage}`}>{stageLabel(t, stage)}</span>;
}

function Stars({ value }: { value: number | null | undefined }) {
  if (!value) return <span className="muted">—</span>;
  return <span className="sim-stars" title={`${value}/5`}>{"★".repeat(value)}<span className="sim-stars-off">{"★".repeat(5 - value)}</span></span>;
}

export default function SimPanel({ app }: { app: Application }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [building, setBuilding] = useState(false);

  const runsQ = useQuery({
    queryKey: ["sim-runs", app.id],
    queryFn: () => api.listSimRuns(app.id),
  });

  const del = useMutation({
    mutationFn: (id: number) => api.deleteSimRun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sim-runs", app.id] }),
  });

  const runs = runsQ.data ?? [];

  return (
    <div className="panel">
      <div className="row" style={{ alignItems: "center" }}>
        <h2 style={{ margin: 0, flex: 1 }}>{t("sim.title")}</h2>
        {!building && <button className="shrink" onClick={() => setBuilding(true)}>{t("sim.new")}</button>}
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{t("sim.hint")}</p>

      {building && (
        <Builder
          app={app}
          onClose={() => setBuilding(false)}
          onStarted={(run) => { setBuilding(false); navigate(`/sim/${run.id}`); }}
        />
      )}

      {runs.length === 0 && !building ? (
        <p className="muted" style={{ marginTop: 10 }}>{t("sim.none")}</p>
      ) : (
        <ul className="sim-run-list">
          {runs.map((r) => (
            <li key={r.id} className="sim-run-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sim-run-title">{r.title}</div>
                <div className="sim-run-sub">
                  <StageBadge stage={r.stage} />
                  <span className={`sim-status s-${r.status}`}>{t(`sim.status.${r.status}`)}</span>
                  <span className="muted">· {sectionMinutes(r.sections)} {t("sim.min")}</span>
                </div>
              </div>
              {r.status === "done" && (
                <div className="sim-run-result">
                  <span className="label">{t("sim.result")}</span>
                  <Stars value={r.results?.overall_rating ?? null} />
                </div>
              )}
              <button className="shrink ghost" onClick={() => navigate(`/sim/${r.id}`)}>
                {r.status === "done" ? t("sim.review") : t("sim.resume")}
              </button>
              <button className="link-btn danger-txt" onClick={() => { if (confirm(t("sim.confirmDelete"))) del.mutate(r.id); }}>
                {t("detail.deleteLink")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- builder ----
function emptySection(kind: SectionKind = "theory"): SimSection {
  return {
    title: "",
    kind,
    topic: null,
    duration_seconds: 600,
    prompt: kind === "theory" ? null : "",
    questions: kind === "live_coding" ? [] : [{ q: "", a: null }],
  };
}

function Builder({ app, onClose, onStarted }: {
  app: Application; onClose: () => void; onStarted: (run: SimRun) => void;
}) {
  const { t, lang } = useI18n();
  const [stage, setStage] = useState<SimStage>("screening");
  const [title, setTitle] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [sections, setSections] = useState<SimSection[]>([]);
  const [error, setError] = useState("");

  const metaQ = useQuery({ queryKey: ["sim-meta", lang], queryFn: () => api.simMeta(lang) });
  const tplQ = useQuery({ queryKey: ["sim-templates"], queryFn: () => api.listSimTemplates() });
  const allTopics = metaQ.data?.topics ?? [];

  const generate = useMutation({
    mutationFn: () => api.simGenerate({ stage, topics, application_id: app.id, lang }),
    onSuccess: (res) => { setSections(res.sections); if (!title) setTitle(res.title); setError(""); },
  });

  const start = useMutation({
    mutationFn: () => api.createSimRun({
      application_id: app.id,
      title: title.trim() || stageLabel(t, stage),
      stage,
      sections,
    }),
    onSuccess: onStarted,
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Error"),
  });

  const saveTpl = useMutation({
    mutationFn: (name: string) => api.createSimTemplate({ title: name, stage, sections }),
  });

  const showTopics = stage === "technical" || stage === "mixed";

  const patchSection = (i: number, patch: Partial<SimSection>) =>
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) =>
    setSections((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const totalMin = sectionMinutes(sections);

  const doSaveTpl = () => {
    if (!sections.length) { setError(t("sim.needSection")); return; }
    const name = prompt(t("sim.templateName"), title || stageLabel(t, stage));
    if (name && name.trim()) saveTpl.mutate(name.trim());
  };

  const loadTpl = (id: number) => {
    const tpl = tplQ.data?.find((x) => x.id === id);
    if (!tpl) return;
    setStage(tpl.stage);
    setSections(tpl.sections);
    if (!title) setTitle(tpl.title);
  };

  return (
    <div className="sim-builder">
      {/* stage selector */}
      <div className="label" style={{ marginTop: 4 }}>{t("sim.chooseStage")}</div>
      <div className="seg" style={{ marginBottom: 12 }}>
        {SIM_STAGES.map((s) => (
          <button key={s} className={stage === s ? "active" : ""} onClick={() => setStage(s)} type="button">
            {stageLabel(t, s)}
          </button>
        ))}
      </div>

      {showTopics && (
        <div style={{ marginBottom: 12 }}>
          <label>{t("sim.topics")}</label>
          <div className="sim-topics">
            {allTopics
              .filter((tp) => !["screening_general", "motivation", "behavioral"].includes(tp.key))
              .map((tp) => {
                const on = topics.includes(tp.key);
                return (
                  <button
                    key={tp.key}
                    type="button"
                    className={`sim-chip${on ? " on" : ""}`}
                    onClick={() => setTopics((prev) => on ? prev.filter((x) => x !== tp.key) : [...prev, tp.key])}
                  >
                    {tp.label}
                  </button>
                );
              })}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{t("sim.topicsHint")}</p>
        </div>
      )}

      <div className="row" style={{ marginBottom: 4 }}>
        <button type="button" className="shrink" disabled={generate.isPending} onClick={() => generate.mutate()}>
          {generate.isPending ? t("sim.generating") : "✨ " + t("sim.standard")}
        </button>
        {(tplQ.data?.length ?? 0) > 0 && (
          <select className="shrink" style={{ width: "auto" }} defaultValue=""
            onChange={(e) => { if (e.target.value) loadTpl(Number(e.target.value)); }}>
            <option value="">{t("sim.loadTemplate")}</option>
            {tplQ.data!.map((tp) => <option key={tp.id} value={tp.id}>{tp.title}</option>)}
          </select>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" className="shrink ghost" onClick={() => setSections((p) => [...p, emptySection()])}>
          {t("sim.addSection")}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "2px 0 12px" }}>{t("sim.standardHint")}</p>

      {/* sections editor */}
      {sections.length === 0 ? (
        <p className="muted">{t("sim.emptySections")}</p>
      ) : (
        <div className="sim-section-list">
          {sections.map((s, i) => (
            <SectionEditor
              key={i}
              index={i}
              total={sections.length}
              section={s}
              topics={allTopics}
              onPatch={(patch) => patchSection(i, patch)}
              onRemove={() => setSections((prev) => prev.filter((_, idx) => idx !== i))}
              onMove={(dir) => move(i, dir)}
            />
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="row" style={{ marginTop: 14, alignItems: "center" }}>
        <input placeholder={t("sim.runTitle")} value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
        <span className="muted shrink" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
          {t("sim.total")}: {totalMin} {t("sim.min")}
        </span>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="shrink" disabled={!sections.length || start.isPending} onClick={() => start.mutate()}>
          ▶ {t("sim.start")}
        </button>
        <button className="shrink ghost" disabled={!sections.length} onClick={doSaveTpl}>
          {saveTpl.isSuccess ? "✓ " + t("sim.templateSaved") : t("sim.saveTemplate")}
        </button>
        <div style={{ flex: 1 }} />
        <button className="shrink ghost" onClick={onClose}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}

function SectionEditor({ index, total, section, topics, onPatch, onRemove, onMove }: {
  index: number; total: number; section: SimSection;
  topics: { key: string; label: string }[];
  onPatch: (p: Partial<SimSection>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const minutes = Math.round(section.duration_seconds / 60);

  const setQ = (qi: number, q: string) =>
    onPatch({ questions: section.questions.map((x, idx) => (idx === qi ? { ...x, q } : x)) });

  return (
    <div className="sim-section-card">
      <div className="sim-section-head">
        <span className="sim-section-n">{index + 1}</span>
        <input
          className="sim-section-title"
          placeholder={t("sim.sectionTitle")}
          value={section.title}
          onChange={(e) => onPatch({ title: e.target.value })}
        />
        <div className="sim-section-actions">
          <button type="button" className="link-btn" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" className="link-btn" disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
          <button type="button" className="link-btn danger-txt" onClick={onRemove}>{t("sim.remove")}</button>
        </div>
      </div>

      <div className="sim-section-fields">
        <div>
          <label>{t("sim.kind")}</label>
          <select value={section.kind} onChange={(e) => {
            const kind = e.target.value as SectionKind;
            onPatch({
              kind,
              prompt: kind === "theory" ? null : (section.prompt ?? ""),
              questions: kind === "live_coding" ? [] : (section.questions.length ? section.questions : [{ q: "", a: null }]),
            });
          }}>
            {SECTION_KINDS.map((k) => <option key={k} value={k}>{t(`sim.kind.${k}`)}</option>)}
          </select>
        </div>
        <div>
          <label>{t("sim.topic")}</label>
          <select value={section.topic ?? ""} onChange={(e) => onPatch({ topic: e.target.value || null })}>
            <option value="">—</option>
            {topics.map((tp) => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
          </select>
        </div>
        <div className="sim-min-field">
          <label>{t("sim.duration")}</label>
          <input type="number" min={1} value={minutes}
            onChange={(e) => onPatch({ duration_seconds: Math.max(1, Number(e.target.value) || 1) * 60 })} />
        </div>
      </div>

      {section.kind === "theory" || section.kind === "open" ? (
        <div className="sim-questions">
          <label>{t("sim.questions")}</label>
          {section.questions.map((qq, qi) => (
            <div key={qi} className="sim-q-row">
              <input placeholder={t("sim.questionPh")} value={qq.q} onChange={(e) => setQ(qi, e.target.value)} />
              <button type="button" className="link-btn danger-txt"
                onClick={() => onPatch({ questions: section.questions.filter((_, idx) => idx !== qi) })}>×</button>
            </div>
          ))}
          <button type="button" className="link-btn"
            onClick={() => onPatch({ questions: [...section.questions, { q: "", a: null }] })}>
            {t("sim.addQuestion")}
          </button>
        </div>
      ) : (
        <div>
          <label>{t("sim.prompt")}</label>
          <textarea rows={3} placeholder={t("sim.promptPh")} value={section.prompt ?? ""}
            onChange={(e) => onPatch({ prompt: e.target.value })} />
        </div>
      )}
    </div>
  );
}
