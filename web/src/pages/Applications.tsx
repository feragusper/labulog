import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type AppStatus, type Application } from "../api";
import { STATUSES } from "../components/ui";

const CLOSED: AppStatus[] = ["rejected", "ghosted", "withdrawn"];

type SortKey = "company" | "status" | "salary" | "applied" | "activity";
type SortDir = "asc" | "desc";

function lastActivity(a: Application): number {
  const dates = a.events.map((e) => +new Date(e.at));
  return dates.length ? Math.max(...dates) : +new Date(a.updated_at);
}

export default function Applications() {
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ["applications"], queryFn: api.listApplications });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AppStatus>("all");
  const [hideClosed, setHideClosed] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("applied");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["funnel"] });
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "company" ? "asc" : "desc"); }
  };

  const rows = useMemo(() => {
    let list = apps.data ?? [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) => a.posting.title.toLowerCase().includes(q));
    if (statusFilter !== "all") list = list.filter((a) => a.status === statusFilter);
    if (hideClosed) list = list.filter((a) => !CLOSED.includes(a.status));

    const dir = sortDir === "asc" ? 1 : -1;
    const val = (a: Application): number | string => {
      switch (sortKey) {
        case "company": return a.posting.title.toLowerCase();
        case "status": return STATUSES.indexOf(a.status);
        case "salary": return a.posting.salary_min ?? -1;
        case "applied": return a.applied_at ? +new Date(a.applied_at) : 0;
        case "activity": return lastActivity(a);
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  }, [apps.data, search, statusFilter, hideClosed, sortKey, sortDir]);

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div>
      <h1 className="page-title">Postulaciones</h1>
      <AddApplication onAdded={invalidate} />

      <div className="panel">
        <div className="filters">
          <input placeholder="Buscar empresa / rol…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | AppStatus)}>
            <option value="all">Todos los estados</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="check">
            <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
            Ocultar cerradas
          </label>
          <span className="muted" style={{ fontSize: 13 }}>{rows.length} resultados</span>
        </div>

        {apps.isLoading && <p className="muted">Cargando…</p>}
        {apps.data && apps.data.length === 0 && <p className="muted">Sin postulaciones todavía.</p>}
        {apps.data && apps.data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("company")}>Empresa / Rol{arrow("company")}</th>
                <th className="sortable" onClick={() => toggleSort("status")}>Estado{arrow("status")}</th>
                <th className="sortable" onClick={() => toggleSort("salary")}>Salario{arrow("salary")}</th>
                <th className="sortable" onClick={() => toggleSort("applied")}>Aplicada{arrow("applied")}</th>
                <th className="sortable" onClick={() => toggleSort("activity")}>Últ. actividad{arrow("activity")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <AppRow key={a.id} app={a} onChange={invalidate} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function fmt(ts: number | string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(+d) ? "—" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" });
}

function AppRow({ app, onChange }: { app: Application; onChange: () => void }) {
  const update = useMutation({
    mutationFn: (status: AppStatus) => api.updateApplication(app.id, { status }),
    onSuccess: onChange,
  });
  const p = app.posting;

  return (
    <tr>
      <td>
        <div><Link to={`/applications/${app.id}`}>{p.title}</Link></div>
        {p.seniority && <div className="muted" style={{ fontSize: 12 }}>{p.seniority}</div>}
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
      <td className="muted">{p.salary_min ? `${p.currency ?? ""} ${p.salary_min.toLocaleString()}` : "—"}</td>
      <td className="muted">{fmt(app.applied_at)}</td>
      <td className="muted">{fmt(lastActivity(app))}</td>
    </tr>
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
