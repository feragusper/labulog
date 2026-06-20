import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type AppStatus } from "../api";
import { Badge, HOURS_PER_INTERVIEW, STATUSES } from "../components/ui";

// Ordered hiring pipeline. Terminal outcomes are shown apart from the stepper.
const PIPELINE: AppStatus[] = ["saved", "applied", "screening", "interview", "offer"];
const TERMINAL: AppStatus[] = ["rejected", "ghosted", "withdrawn"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

function daysBetween(a: number, b: number) {
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export default function ApplicationDetail() {
  const { id } = useParams();
  const appId = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["application", appId],
    queryFn: () => api.getApplication(appId),
    enabled: Number.isFinite(appId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["application", appId] });
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["funnel"] });
  };

  const update = useMutation({
    mutationFn: (status: AppStatus) => api.updateApplication(appId, { status }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: () => api.deleteApplication(appId),
    onSuccess: () => { invalidate(); navigate("/applications"); },
  });

  if (q.isLoading) return <div className="muted">Cargando…</div>;
  if (q.isError || !q.data) return <div className="error">No se encontró la postulación.</div>;

  const app = q.data;
  const reachedSet = new Set<AppStatus>([app.status, ...app.events.map((e) => e.status)]);
  const reachedIdx = Math.max(
    ...PIPELINE.map((s, i) => (reachedSet.has(s) ? i : -1)),
    PIPELINE.indexOf(app.status),
  );
  const terminal = TERMINAL.includes(app.status) ? app.status : null;
  const p = app.posting;

  // ---- tiempos ----
  const eventTimes = app.events.map((e) => +new Date(e.at));
  const startTs = app.applied_at ? +new Date(app.applied_at) : (eventTimes.length ? Math.min(...eventTimes) : null);
  const lastTs = eventTimes.length ? Math.max(...eventTimes) : startTs;
  const processDays = startTs && lastTs ? daysBetween(startTs, lastTs) : null;
  const interviewRounds = app.events.filter((e) => e.status === "interview").length;
  const interviewHours = interviewRounds * HOURS_PER_INTERVIEW;

  return (
    <div>
      <Link to="/applications" className="muted" style={{ fontSize: 13 }}>← Postulaciones</Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>{p.title}</h1>

      {/* ---- meta ---- */}
      <div className="panel">
        <div className="detail-meta">
          <Meta label="Estado">
            <Badge status={app.status} />
          </Meta>
          <Meta label="Aplicada">{app.applied_at ? fmtDate(app.applied_at) : "—"}</Meta>
          <Meta label="Canal">{app.channel ?? "—"}</Meta>
          <Meta label="Seniority">{p.seniority ?? "—"}</Meta>
          <Meta label="Fuente">{p.source ?? "—"}</Meta>
          <Meta label="Salario">
            {p.salary_min ? `${p.currency ?? ""} ${p.salary_min.toLocaleString()}` : "—"}
          </Meta>
        </div>
        {p.url && !p.url.startsWith("imported://") && (
          <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Ver posting ↗</a>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <div className="shrink">
            <label>Cambiar estado</label>
            <select value={app.status} onChange={(e) => update.mutate(e.target.value as AppStatus)} style={{ width: "auto" }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <button className="shrink danger" onClick={() => del.mutate()}>Borrar</button>
        </div>
      </div>

      {/* ---- stepper: etapas alcanzadas ---- */}
      <div className="panel">
        <h2>Etapas alcanzadas</h2>
        <div className="stepper">
          {PIPELINE.map((s, i) => {
            const done = i <= reachedIdx;
            return (
              <div key={s} className={`step${done ? " done" : ""}`}>
                <div className="step-dot">{done ? "✓" : ""}</div>
                <div className="step-label">{s}</div>
              </div>
            );
          })}
        </div>
        {terminal && (
          <div style={{ marginTop: 12 }}>
            Resultado final: <Badge status={terminal} />
          </div>
        )}
      </div>

      {/* ---- tiempos ---- */}
      <div className="panel">
        <h2>Tiempos</h2>
        <div className="detail-meta">
          <Meta label="Duración del proceso">
            {processDays !== null ? `${processDays} día${processDays === 1 ? "" : "s"}` : "—"}
          </Meta>
          <Meta label="Rondas de entrevista">{interviewRounds}</Meta>
          <Meta label="En entrevistas (est.)">
            {interviewRounds ? `~${interviewHours} h` : "—"}
          </Meta>
        </div>
      </div>

      {/* ---- timeline ---- */}
      <div className="panel">
        <h2>Timeline</h2>
        {app.events.length === 0 ? (
          <p className="muted">Sin eventos.</p>
        ) : (
          <ul className="timeline">
            {app.events.map((e, i) => (
              <li key={i} className="timeline-item">
                <span className={`timeline-dot ${e.status}`} />
                <div>
                  <div><Badge status={e.status} /> <span className="muted" style={{ fontSize: 12 }}>{fmtDate(e.at)}</span></div>
                  {e.note && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{e.note}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {app.notes && (
          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 4 }}>Notas</div>
            <div className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{app.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}
