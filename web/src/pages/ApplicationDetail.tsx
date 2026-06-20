import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Application, type AppStatus } from "../api";
import { Badge, HOURS_PER_INTERVIEW, STATUSES } from "../components/ui";

const PIPELINE: AppStatus[] = ["saved", "applied", "screening", "interview", "offer"];
const TERMINAL: AppStatus[] = ["rejected", "ghosted", "withdrawn"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}
function daysBetween(a: number, b: number) {
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toISOString().slice(0, 10);
}
function fromDateInput(v: string): string | null {
  return v ? `${v}T00:00:00` : null;
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

  const del = useMutation({
    mutationFn: () => api.deleteApplication(appId),
    onSuccess: () => { invalidate(); navigate("/applications"); },
  });

  const [editing, setEditing] = useState(false);

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

      {/* ---- meta / edit ---- */}
      <div className="panel">
        {editing ? (
          <EditForm app={app} onDone={() => { setEditing(false); invalidate(); }} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <div className="detail-meta">
              <Meta label="Empresa">{p.company_name ?? "—"}</Meta>
              <Meta label="Estado"><Badge status={app.status} /></Meta>
              <Meta label="Aplicada">{app.applied_at ? fmtDate(app.applied_at) : "—"}</Meta>
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
              <button className="shrink" onClick={() => setEditing(true)}>Editar datos</button>
              <div style={{ flex: 1 }} />
              <button className="shrink danger" onClick={() => { if (confirm("¿Borrar esta postulación?")) del.mutate(); }}>
                Borrar
              </button>
            </div>
          </>
        )}
      </div>

      {/* ---- stepper ---- */}
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
          <div style={{ marginTop: 12 }}>Resultado final: <Badge status={terminal} /></div>
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
          <Meta label="En entrevistas (est.)">{interviewRounds ? `~${interviewHours} h` : "—"}</Meta>
        </div>
      </div>

      {/* ---- timeline ABM ---- */}
      <Timeline app={app} onChange={invalidate} />

      {app.notes && !editing && (
        <div className="panel">
          <h2>Notas</h2>
          <div className="muted" style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{app.notes}</div>
        </div>
      )}
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

function EditForm({ app, onDone, onCancel }: { app: Application; onDone: () => void; onCancel: () => void }) {
  const p = app.posting;
  const [f, setF] = useState({
    title: p.title, company_name: p.company_name ?? "", seniority: p.seniority ?? "",
    source: p.source ?? "", salary_min: p.salary_min?.toString() ?? "",
    salary_max: p.salary_max?.toString() ?? "", currency: p.currency ?? "",
    status: app.status, applied_at: toDateInput(app.applied_at), notes: app.notes ?? "",
  });
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      await api.updatePosting(p.id, {
        title: f.title, company_name: f.company_name || null, seniority: f.seniority || null,
        source: f.source || null, currency: f.currency || null,
        salary_min: f.salary_min ? Number(f.salary_min) : null,
        salary_max: f.salary_max ? Number(f.salary_max) : null,
      });
      await api.updateApplication(app.id, {
        status: f.status, notes: f.notes || null, applied_at: fromDateInput(f.applied_at),
      });
    },
    onSuccess: onDone,
    onError: () => setError("No se pudo guardar"),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <>
      <h2>Editar datos</h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label>Rol / título</label><input value={f.title} onChange={set("title")} /></div>
        <div><label>Empresa</label><input value={f.company_name} onChange={set("company_name")} /></div>
        <div><label>Seniority</label><input value={f.seniority} onChange={set("seniority")} /></div>
        <div><label>Fuente</label><input value={f.source} onChange={set("source")} /></div>
        <div><label>Salario min</label><input value={f.salary_min} onChange={set("salary_min")} inputMode="numeric" /></div>
        <div><label>Salario max</label><input value={f.salary_max} onChange={set("salary_max")} inputMode="numeric" /></div>
        <div><label>Moneda</label><input value={f.currency} onChange={set("currency")} /></div>
        <div><label>Aplicada</label><input type="date" value={f.applied_at} onChange={set("applied_at")} /></div>
        <div>
          <label>Estado actual</label>
          <select value={f.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Notas</label>
        <textarea value={f.notes} onChange={set("notes")} rows={4} />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="shrink" disabled={save.isPending} onClick={() => save.mutate()}>Guardar</button>
        <button className="shrink ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </>
  );
}

function Timeline({ app, onChange }: { app: Application; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const add = useMutation({
    mutationFn: (payload: unknown) => api.addEvent(app.id, payload),
    onSuccess: () => { setAdding(false); onChange(); },
  });
  const upd = useMutation({
    mutationFn: ({ eid, payload }: { eid: number; payload: unknown }) => api.updateEvent(app.id, eid, payload),
    onSuccess: () => { setEditId(null); onChange(); },
  });
  const del = useMutation({
    mutationFn: (eid: number) => api.deleteEvent(app.id, eid),
    onSuccess: onChange,
  });

  return (
    <div className="panel">
      <div className="row" style={{ alignItems: "center" }}>
        <h2 style={{ margin: 0, flex: 1 }}>Timeline</h2>
        {!adding && <button className="shrink" onClick={() => setAdding(true)}>+ Evento</button>}
      </div>

      {adding && <EventForm onSave={(p) => add.mutate(p)} onCancel={() => setAdding(false)} allowSetCurrent />}

      {app.events.length === 0 && !adding ? (
        <p className="muted">Sin eventos.</p>
      ) : (
        <ul className="timeline" style={{ marginTop: 14 }}>
          {app.events.map((e) => (
            <li key={e.id} className="timeline-item">
              <span className={`timeline-dot ${e.status}`} />
              {editId === e.id ? (
                <div style={{ flex: 1 }}>
                  <EventForm
                    initial={{ status: e.status, date: toDateInput(e.at), note: e.note ?? "" }}
                    onSave={(p) => upd.mutate({ eid: e.id, payload: p })}
                    onCancel={() => setEditId(null)}
                  />
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge status={e.status} />
                    <span className="muted" style={{ fontSize: 12 }}>{fmtDate(e.at)}</span>
                    <span style={{ flex: 1 }} />
                    <button className="link-btn" onClick={() => setEditId(e.id)}>editar</button>
                    <button className="link-btn danger-txt" onClick={() => del.mutate(e.id)}>borrar</button>
                  </div>
                  {e.note && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{e.note}</div>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventForm({
  initial, onSave, onCancel, allowSetCurrent,
}: {
  initial?: { status: AppStatus; date: string; note: string };
  onSave: (payload: unknown) => void;
  onCancel: () => void;
  allowSetCurrent?: boolean;
}) {
  const [status, setStatus] = useState<AppStatus>(initial?.status ?? "applied");
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(initial?.note ?? "");
  const [setCurrent, setSetCurrent] = useState(true);

  return (
    <div className="event-form">
      <div className="row">
        <div className="shrink">
          <label>Estado</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as AppStatus)} style={{ width: "auto" }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="shrink">
          <label>Fecha</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label>Nota</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {allowSetCurrent && (
        <label className="check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={setCurrent} onChange={(e) => setSetCurrent(e.target.checked)} />
          Marcar como estado actual
        </label>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="shrink" onClick={() => onSave({
          status, at: `${date}T00:00:00`, note: note || null,
          ...(allowSetCurrent ? { set_current: setCurrent } : {}),
        })}>Guardar</button>
        <button className="shrink ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
