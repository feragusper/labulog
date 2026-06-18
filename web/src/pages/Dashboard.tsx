import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError, type AppStatus, type Application, type Lookup } from "../api";

const STATUSES: AppStatus[] = [
  "saved", "applied", "screening", "interview", "offer", "rejected", "ghosted", "withdrawn",
];

function Badge({ status }: { status: AppStatus }) {
  return <span className={`badge ${status}`}>{status}</span>;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function Dashboard() {
  const qc = useQueryClient();
  const funnel = useQuery({ queryKey: ["funnel"], queryFn: api.funnel });
  const apps = useQuery({ queryKey: ["applications"], queryFn: api.listApplications });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["funnel"] });
  };

  return (
    <div className="container">
      {/* ---- funnel cards ---- */}
      <div className="grid cards">
        <Card label="Postulaciones" value={funnel.data?.total ?? "—"} />
        <Card label="Tasa respuesta" value={funnel.data ? pct(funnel.data.response_rate) : "—"} />
        <Card label="Tasa entrevista" value={funnel.data ? pct(funnel.data.interview_rate) : "—"} />
        <Card label="Ofertas" value={funnel.data?.by_status.offer ?? "—"} />
        <Card label="Ghosteadas" value={funnel.data?.ghost_count ?? "—"} />
      </div>

      <LookupTool />
      <AddApplication onAdded={invalidate} />

      {/* ---- applications table ---- */}
      <div className="panel">
        <h2>Mis postulaciones</h2>
        {apps.isLoading && <p className="muted">Cargando…</p>}
        {apps.data && apps.data.length === 0 && <p className="muted">Sin postulaciones todavía.</p>}
        {apps.data && apps.data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Empresa / Rol</th>
                <th>Estado</th>
                <th>Canal</th>
                <th>Aplicada</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps.data.map((a) => (
                <AppRow key={a.id} app={a} onChange={invalidate} />
              ))}
            </tbody>
          </table>
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

function AppRow({ app, onChange }: { app: Application; onChange: () => void }) {
  const update = useMutation({
    mutationFn: (status: AppStatus) => api.updateApplication(app.id, { status }),
    onSuccess: onChange,
  });
  const del = useMutation({
    mutationFn: () => api.deleteApplication(app.id),
    onSuccess: onChange,
  });

  return (
    <tr>
      <td>
        <div><a href={app.posting.url} target="_blank" rel="noreferrer">{app.posting.title}</a></div>
        <div className="muted" style={{ fontSize: 12 }}>
          {app.posting.seniority ?? ""} {app.posting.source ? `· ${app.posting.source}` : ""}
        </div>
      </td>
      <td>
        <select
          value={app.status}
          onChange={(e) => update.mutate(e.target.value as AppStatus)}
          style={{ width: "auto" }}
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="muted">{app.channel ?? "—"}</td>
      <td className="muted">{app.applied_at ? app.applied_at.slice(0, 10) : "—"}</td>
      <td><button className="danger" onClick={() => del.mutate()}>borrar</button></td>
    </tr>
  );
}

function LookupTool() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<Lookup | null>(null);
  const [error, setError] = useState("");

  const check = useMutation({
    mutationFn: () => api.lookup(url),
    onSuccess: (data) => { setResult(data); setError(""); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Error"),
  });

  return (
    <div className="panel">
      <h2>¿Ya apliqué a este posting?</h2>
      <div className="row">
        <input placeholder="Pegá la URL del job posting"
          value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="shrink" disabled={!url || check.isPending} onClick={() => check.mutate()}>
          Chequear
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {result && (
        <div className="lookup-result">
          {!result.posting ? (
            <span className="muted">Posting desconocido — nadie lo registró todavía.</span>
          ) : result.already_applied ? (
            <span className="ok">
              Ya aplicaste · estado: <Badge status={result.status!} />
            </span>
          ) : (
            <span>Conozco el posting (<b>{result.posting.title}</b>) pero <b>vos no aplicaste</b>.</span>
          )}
        </div>
      )}
    </div>
  );
}

function AddApplication({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    url: "", title: "", company_name: "", seniority: "", source: "linkedin",
    salary_min: "", salary_max: "", currency: "USD", channel: "", notes: "",
    status: "applied" as AppStatus,
  });
  const [error, setError] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createApplication({
        posting: {
          url: f.url, title: f.title, company_name: f.company_name,
          seniority: f.seniority || null, source: f.source || null,
          salary_min: f.salary_min ? Number(f.salary_min) : null,
          salary_max: f.salary_max ? Number(f.salary_max) : null,
          currency: f.currency || null,
        },
        status: f.status, channel: f.channel || null, notes: f.notes || null,
      }),
    onSuccess: () => {
      setOpen(false); setError("");
      setF({ ...f, url: "", title: "", company_name: "", notes: "", channel: "" });
      onAdded();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Error"),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  if (!open) {
    return (
      <div className="panel">
        <button onClick={() => setOpen(true)}>+ Nueva postulación</button>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>Nueva postulación</h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label>URL del posting *</label><input value={f.url} onChange={set("url")} /></div>
        <div><label>Empresa *</label><input value={f.company_name} onChange={set("company_name")} /></div>
        <div><label>Rol / título *</label><input value={f.title} onChange={set("title")} /></div>
        <div><label>Seniority</label><input value={f.seniority} onChange={set("seniority")} placeholder="junior / senior…" /></div>
        <div><label>Salario min</label><input value={f.salary_min} onChange={set("salary_min")} inputMode="numeric" /></div>
        <div><label>Salario max</label><input value={f.salary_max} onChange={set("salary_max")} inputMode="numeric" /></div>
        <div><label>Fuente</label><input value={f.source} onChange={set("source")} /></div>
        <div><label>Canal</label><input value={f.channel} onChange={set("channel")} placeholder="easy-apply / email / referido" /></div>
        <div>
          <label>Estado inicial</label>
          <select value={f.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><label>Moneda</label><input value={f.currency} onChange={set("currency")} /></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>Notas</label>
        <input value={f.notes} onChange={set("notes")} />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="shrink" disabled={!f.url || !f.title || !f.company_name || create.isPending}
          onClick={() => create.mutate()}>Guardar</button>
        <button className="shrink ghost" onClick={() => { setOpen(false); setError(""); }}>Cancelar</button>
      </div>
    </div>
  );
}
