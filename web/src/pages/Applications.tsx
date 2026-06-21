import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type AppStatus, type Application, type Priority } from "../api";
import { PriorityBadge, PRIORITIES, STATUSES } from "../components/ui";
import { useI18n } from "../i18n";

const CLOSED: AppStatus[] = ["rejected", "ghosted", "withdrawn"];
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

type SortKey = "company" | "status" | "priority" | "salary" | "applied" | "activity" | "followup";
type SortDir = "asc" | "desc";

function lastActivity(a: Application): number {
  const dates = a.events.map((e) => +new Date(e.at));
  return dates.length ? Math.max(...dates) : +new Date(a.updated_at);
}
function isClosed(a: Application) {
  return CLOSED.includes(a.status);
}
function isDue(a: Application) {
  return !!a.follow_up_date && !isClosed(a) && new Date(a.follow_up_date) <= new Date();
}
function fmt(ts: number | string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(+d) ? "—" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function Applications() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const apps = useQuery({ queryKey: ["applications"], queryFn: api.listApplications });

  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AppStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");
  const [hideClosed, setHideClosed] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("applied");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["funnel"] });
  };
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: AppStatus }) =>
      api.updateApplication(id, { status }),
    onSuccess: invalidate,
  });

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "company" ? "asc" : "desc"); }
  };

  const filtered = useMemo(() => {
    let list = apps.data ?? [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((a) =>
      a.posting.title.toLowerCase().includes(q) ||
      (a.posting.company_name ?? "").toLowerCase().includes(q));
    if (priorityFilter !== "all") list = list.filter((a) => a.priority === priorityFilter);
    if (hideClosed) list = list.filter((a) => !isClosed(a));
    return list;
  }, [apps.data, search, priorityFilter, hideClosed]);

  const rows = useMemo(() => {
    let list = statusFilter !== "all" ? filtered.filter((a) => a.status === statusFilter) : filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (a: Application): number | string => {
      switch (sortKey) {
        case "company": return (a.posting.company_name ?? a.posting.title).toLowerCase();
        case "status": return STATUSES.indexOf(a.status);
        case "priority": return a.priority ? PRIORITY_ORDER[a.priority] : 99;
        case "salary": return a.posting.salary_min ?? -1;
        case "applied": return a.applied_at ? +new Date(a.applied_at) : 0;
        case "activity": return lastActivity(a);
        case "followup": return a.follow_up_date ? +new Date(a.follow_up_date) : Infinity;
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  }, [filtered, statusFilter, sortKey, sortDir]);

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div>
      <div className="row" style={{ alignItems: "center" }}>
        <h1 className="page-title" style={{ flex: 1, margin: 0 }}>{t("apps.title")}</h1>
        <div className="seg">
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>{t("apps.list")}</button>
          <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>{t("apps.board")}</button>
        </div>
      </div>

      <AddApplication onAdded={invalidate} />

      <div className="panel">
        <div className="filters">
          <input placeholder={t("apps.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          {view === "list" && (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | AppStatus)}>
              <option value="all">{t("apps.allStatuses")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as "all" | Priority)}>
            <option value="all">{t("apps.allPriorities")}</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <label className="check">
            <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
            {t("apps.hideClosed")}
          </label>
          <span className="muted" style={{ fontSize: 13 }}>{filtered.length} {t("common.results")}</span>
        </div>

        {apps.isLoading && <p className="muted">{t("common.loading")}</p>}
        {apps.data && apps.data.length === 0 && <p className="muted">{t("apps.empty")}</p>}

        {apps.data && apps.data.length > 0 && view === "list" && (
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("company")}>{t("apps.colCompany")}{arrow("company")}</th>
                <th className="sortable" onClick={() => toggleSort("status")}>{t("apps.colStatus")}{arrow("status")}</th>
                <th className="sortable" onClick={() => toggleSort("priority")}>{t("apps.colPriority")}{arrow("priority")}</th>
                <th className="sortable" onClick={() => toggleSort("salary")}>{t("apps.colSalary")}{arrow("salary")}</th>
                <th className="sortable" onClick={() => toggleSort("applied")}>{t("apps.colApplied")}{arrow("applied")}</th>
                <th className="sortable" onClick={() => toggleSort("followup")}>{t("apps.colFollowup")}{arrow("followup")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <AppRow key={a.id} app={a} onStatus={(s) => setStatus.mutate({ id: a.id, status: s })} />
              ))}
            </tbody>
          </table>
        )}

        {apps.data && apps.data.length > 0 && view === "board" && (
          <Board apps={filtered} hideClosed={hideClosed} onDrop={(id, status) => setStatus.mutate({ id, status })} />
        )}
      </div>
    </div>
  );
}

function AppRow({ app, onStatus }: { app: Application; onStatus: (s: AppStatus) => void }) {
  const p = app.posting;
  return (
    <tr>
      <td>
        <div><Link to={`/applications/${app.id}`}>{p.company_name ?? p.title}</Link></div>
        <div className="muted" style={{ fontSize: 12 }}>{p.company_name ? p.title : (p.seniority ?? "")}</div>
      </td>
      <td>
        <select value={app.status} onChange={(e) => onStatus(e.target.value as AppStatus)} style={{ width: "auto" }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td>{app.priority ? <PriorityBadge priority={app.priority} /> : <span className="muted">—</span>}</td>
      <td className="muted">{p.salary_min ? `${p.currency ?? ""} ${p.salary_min.toLocaleString()}` : "—"}</td>
      <td className="muted">{fmt(app.applied_at)}</td>
      <td className={isDue(app) ? "due" : "muted"}>{app.follow_up_date ? fmt(app.follow_up_date) : "—"}</td>
    </tr>
  );
}

function Board({ apps, hideClosed, onDrop }: {
  apps: Application[];
  hideClosed: boolean;
  onDrop: (id: number, status: AppStatus) => void;
}) {
  const cols = hideClosed ? STATUSES.filter((s) => !CLOSED.includes(s)) : STATUSES;
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<AppStatus | null>(null);

  return (
    <div className="board">
      {cols.map((col) => {
        const items = apps.filter((a) => a.status === col);
        return (
          <div
            key={col}
            className={`board-col${over === col ? " over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(col); }}
            onDragLeave={() => setOver((o) => (o === col ? null : o))}
            onDrop={() => { if (dragId != null) onDrop(dragId, col); setDragId(null); setOver(null); }}
          >
            <div className="board-col-head">
              <span className={`badge ${col}`}>{col}</span>
              <span className="muted" style={{ fontSize: 12 }}>{items.length}</span>
            </div>
            {items.map((a) => (
              <div
                key={a.id}
                className="board-card"
                draggable
                onDragStart={() => setDragId(a.id)}
                onDragEnd={() => { setDragId(null); setOver(null); }}
              >
                <Link to={`/applications/${a.id}`}>{a.posting.company_name ?? a.posting.title}</Link>
                {a.posting.company_name && <div className="muted" style={{ fontSize: 11 }}>{a.posting.title}</div>}
                <div className="board-card-foot">
                  {a.priority && <PriorityBadge priority={a.priority} />}
                  {a.follow_up_date && <span className={isDue(a) ? "due" : "muted"} style={{ fontSize: 11 }}>⏰ {fmt(a.follow_up_date)}</span>}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AddApplication({ onAdded }: { onAdded: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    url: "", title: "", company_name: "", seniority: "", source: "linkedin",
    salary_min: "", salary_max: "", currency: "USD", notes: "",
    status: "applied" as AppStatus, priority: "" as "" | Priority, follow_up_date: "",
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
        status: f.status, notes: f.notes || null,
        priority: f.priority || null,
        follow_up_date: f.follow_up_date ? `${f.follow_up_date}T00:00:00` : null,
      }),
    onSuccess: () => {
      setOpen(false); setError("");
      setF({ ...f, url: "", title: "", company_name: "", notes: "", follow_up_date: "" });
      onAdded();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Error"),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  if (!open) {
    return <div className="panel"><button onClick={() => setOpen(true)}>{t("apps.new")}</button></div>;
  }

  return (
    <div className="panel">
      <h2>{t("form.new")}</h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label>{t("form.url")}</label><input value={f.url} onChange={set("url")} /></div>
        <div><label>{t("form.company")}</label><input value={f.company_name} onChange={set("company_name")} /></div>
        <div><label>{t("form.role")}</label><input value={f.title} onChange={set("title")} /></div>
        <div><label>{t("form.seniority")}</label><input value={f.seniority} onChange={set("seniority")} placeholder="junior / senior…" /></div>
        <div><label>{t("form.salaryMin")}</label><input value={f.salary_min} onChange={set("salary_min")} inputMode="numeric" /></div>
        <div><label>{t("form.salaryMax")}</label><input value={f.salary_max} onChange={set("salary_max")} inputMode="numeric" /></div>
        <div><label>{t("form.source")}</label><input value={f.source} onChange={set("source")} /></div>
        <div><label>{t("form.currency")}</label><input value={f.currency} onChange={set("currency")} /></div>
        <div>
          <label>{t("form.initialStatus")}</label>
          <select value={f.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label>{t("form.priority")}</label>
          <select value={f.priority} onChange={set("priority")}>
            <option value="">—</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><label>{t("form.followup")}</label><input type="date" value={f.follow_up_date} onChange={set("follow_up_date")} /></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>{t("form.notes")}</label>
        <input value={f.notes} onChange={set("notes")} />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="shrink" disabled={!f.url || !f.title || !f.company_name || create.isPending}
          onClick={() => create.mutate()}>{t("common.save")}</button>
        <button className="shrink ghost" onClick={() => { setOpen(false); setError(""); }}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}
