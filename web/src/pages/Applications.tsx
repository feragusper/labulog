import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, type AppStatus, type Application, type PendingRow, type Priority } from "../api";
import {
  Badge, furthestStage, PriorityBadge, PRIORITIES, rankOf, STATUSES,
  statusColorClass, statusLabel, TableSkeleton,
} from "../components/ui";
import CountrySelect from "../components/CountrySelect";
import { flag, toCountryCode } from "../countries";
import {
  clearPendingImports, getPendingImports, onPendingImportsChange, removePendingImport,
} from "../pendingImports";
import { useI18n } from "../i18n";

const CLOSED: AppStatus[] = ["rejected", "cancelled", "ghosted", "withdrawn"];
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

  const [searchParams, setSearchParams] = useSearchParams();
  const stageParam = searchParams.get("stage") as AppStatus | null;
  const minStageParam = searchParams.get("minStage") as AppStatus | null;

  const [view, setView] = useState<"list" | "board">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AppStatus>(
    (searchParams.get("status") as AppStatus) || "all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");
  const [hideClosed, setHideClosed] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("applied");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const toggleSelect = (id: number) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const clearSelection = () => setSelected(new Set());

  // Sync the status dropdown when navigated here again with a different ?status= (no remount).
  useEffect(() => {
    const sp = searchParams.get("status") as AppStatus | null;
    if (sp) { setStatusFilter(sp); setView("list"); }
  }, [searchParams]);

  const clearStageFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("stage"); next.delete("minStage"); next.delete("status");
    setSearchParams(next);
    setStatusFilter("all");
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["funnel"] });
  };
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: AppStatus }) =>
      api.updateApplication(id, { status }),
    onSuccess: invalidate,
  });

  const bulkDelete = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => api.deleteApplication(id))),
    onSuccess: () => { invalidate(); clearSelection(); },
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
    if (stageParam) list = list.filter((a) => furthestStage(a) === stageParam);
    if (minStageParam) list = list.filter((a) => rankOf(furthestStage(a)) >= rankOf(minStageParam));
    return list;
  }, [apps.data, search, priorityFilter, hideClosed, stageParam, minStageParam]);

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

  // Keep the selection limited to what's currently visible: filtering (or a
  // delete elsewhere) drops any selected row that's no longer in the list.
  useEffect(() => {
    const visible = new Set(rows.map((a) => a.id));
    setSelected((s) => {
      const next = new Set([...s].filter((id) => visible.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [rows]);

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

      <PendingImports onResolved={invalidate} />

      <AddApplication onAdded={invalidate} />

      {(stageParam || minStageParam) && (
        <div className="active-filter-chip">
          {t("apps.filteredFrom")}
          {stageParam && <Badge status={stageParam} />}
          {minStageParam && <span>{t("apps.atLeast")} <Badge status={minStageParam} /></span>}
          <button className="link-btn" onClick={clearStageFilters}>{t("apps.clearFilter")}</button>
        </div>
      )}

      <div className="panel">
        <div className="filters">
          <input placeholder={t("apps.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
          {view === "list" && (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | AppStatus)}>
              <option value="all">{t("apps.allStatuses")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
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

        {selected.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-count">
              {t("bulk.selectedCount").replace("{count}", String(selected.size))}
            </span>
            <span style={{ flex: 1 }} />
            <button className="shrink" onClick={() => setBulkOpen(true)}>{t("bulk.edit")}</button>
            <button
              className="shrink danger"
              disabled={bulkDelete.isPending}
              onClick={() => {
                if (window.confirm(t("bulk.deleteConfirm").replace("{count}", String(selected.size)))) {
                  bulkDelete.mutate([...selected]);
                }
              }}
            >
              {bulkDelete.isPending ? t("bulk.deleting") : t("bulk.delete")}
            </button>
          </div>
        )}

        {apps.isLoading && <TableSkeleton />}
        {apps.data && apps.data.length === 0 && <p className="muted">{t("apps.empty")}</p>}

        {apps.data && apps.data.length > 0 && view === "list" && (
          <table>
            <thead>
              <tr>
                <th className="check-cell">
                  <input
                    type="checkbox"
                    aria-label={t("bulk.selectAll")}
                    checked={rows.length > 0 && rows.every((a) => selected.has(a.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((a) => a.id)) : new Set())}
                  />
                </th>
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
                <AppRow
                  key={a.id}
                  app={a}
                  selected={selected.has(a.id)}
                  onToggleSelect={() => toggleSelect(a.id)}
                  onStatus={(s) => setStatus.mutate({ id: a.id, status: s })}
                />
              ))}
            </tbody>
          </table>
        )}

        {apps.data && apps.data.length > 0 && view === "board" && (
          <Board apps={filtered} hideClosed={hideClosed} onDrop={(id, status) => setStatus.mutate({ id, status })} />
        )}
      </div>

      {bulkOpen && (
        <BulkEditModal
          ids={[...selected]}
          onClose={() => setBulkOpen(false)}
          onDone={() => { setBulkOpen(false); invalidate(); clearSelection(); }}
        />
      )}
    </div>
  );
}

function PendingImports({ onResolved }: { onResolved: () => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<PendingRow[]>(getPendingImports);
  useEffect(() => onPendingImportsChange(() => setRows(getPendingImports())), []);

  if (rows.length === 0) return null;

  return (
    <div className="panel pending-imports">
      <div className="row" style={{ alignItems: "center", marginBottom: 4 }}>
        <h2 style={{ flex: 1, margin: 0 }}>{t("pending.title")} ({rows.length})</h2>
        <button className="shrink ghost" onClick={() => clearPendingImports()}>{t("pending.discardAll")}</button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>{t("pending.desc")}</p>
      <table>
        <tbody>
          {rows.map((r, i) => <PendingRowView key={i} row={r} onResolved={onResolved} />)}
        </tbody>
      </table>
    </div>
  );
}

function PendingRowView({ row, onResolved }: { row: PendingRow; onResolved: () => void }) {
  const { t } = useI18n();
  const p = row.posting;
  const add = useMutation({
    mutationFn: () => api.createApplication({
      posting: p,
      status: row.status,
      priority: row.priority,
      applied_at: row.applied_at,
      follow_up_date: row.follow_up_date,
      notes: row.notes,
      force: true,
    }),
    onSuccess: () => { removePendingImport(row); onResolved(); },
  });
  return (
    <tr>
      <td>
        <div>
          {p.country && <span style={{ marginRight: 6 }}>{flag(p.country)}</span>}
          {p.company_name}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>{p.title}</div>
      </td>
      <td><Badge status={row.status} /></td>
      <td className="muted">{fmt(row.applied_at)}</td>
      <td className="muted" style={{ fontSize: 12 }}>{t(`pending.reason.${row.reason}`)}</td>
      <td>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="shrink" disabled={add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? t("pending.adding") : t("pending.add")}
          </button>
          <button className="shrink ghost" onClick={() => removePendingImport(row)}>{t("pending.discard")}</button>
        </div>
      </td>
    </tr>
  );
}

function AppRow({ app, selected, onToggleSelect, onStatus }: {
  app: Application;
  selected: boolean;
  onToggleSelect: () => void;
  onStatus: (s: AppStatus) => void;
}) {
  const { t } = useI18n();
  const p = app.posting;
  return (
    <tr className={`statusrow ${statusColorClass(app.status)}${selected ? " selected" : ""}`}>
      <td className="check-cell">
        <input type="checkbox" aria-label={t("bulk.selectRow")} checked={selected} onChange={onToggleSelect} />
      </td>
      <td>
        <div>
          {p.country && <span style={{ marginRight: 6 }}>{flag(p.country)}</span>}
          <Link to={`/applications/${app.id}`}>{p.company_name ?? p.title}</Link>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>{p.company_name ? p.title : (p.seniority ?? "")}</div>
      </td>
      <td>
        <select value={app.status} onChange={(e) => onStatus(e.target.value as AppStatus)} style={{ width: "auto" }}>
          {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
        </select>
      </td>
      <td>{app.priority ? <PriorityBadge priority={app.priority} /> : <span className="muted">—</span>}</td>
      <td className="muted">{p.salary_min ? `${p.currency ?? ""} ${p.salary_min.toLocaleString()}` : "—"}</td>
      <td className="muted">{fmt(app.applied_at)}</td>
      <td className={isDue(app) ? "due" : "muted"}>{app.follow_up_date ? fmt(app.follow_up_date) : "—"}</td>
    </tr>
  );
}

type BulkField = "status" | "priority" | "follow_up_date" | "applied_at" | "notes";

function BulkEditModal({ ids, onClose, onDone }: {
  ids: number[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState<Record<BulkField, boolean>>({
    status: false, priority: false, follow_up_date: false, applied_at: false, notes: false,
  });
  const [status, setStatus] = useState<AppStatus>("applied");
  const [priority, setPriority] = useState<"" | Priority>("");
  const [followUp, setFollowUp] = useState("");
  const [appliedAt, setAppliedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  const labels: Record<BulkField, string> = {
    status: t("apps.colStatus"),
    priority: t("apps.colPriority"),
    follow_up_date: t("apps.colFollowup"),
    applied_at: t("apps.colApplied"),
    notes: t("form.notes"),
  };
  const activeFields = (Object.keys(enabled) as BulkField[]).filter((k) => enabled[k]);

  const buildPayload = () => {
    const p: Record<string, unknown> = {};
    if (enabled.status) p.status = status;
    if (enabled.priority) p.priority = priority || null;
    if (enabled.follow_up_date) p.follow_up_date = followUp ? `${followUp}T00:00:00` : null;
    if (enabled.applied_at) p.applied_at = appliedAt ? `${appliedAt}T00:00:00` : null;
    if (enabled.notes) p.notes = notes.trim() || null;
    return p;
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = buildPayload();
      return Promise.all(ids.map((id) => api.updateApplication(id, payload)));
    },
    onSuccess: onDone,
  });

  const toggle = (k: BulkField) => setEnabled((e) => ({ ...e, [k]: !e[k] }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{t("bulk.modalTitle").replace("{count}", String(ids.length))}</h2>

        {!confirming ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {t("bulk.modalDesc").replace("{count}", String(ids.length))}
            </p>

            <div className="bulk-fields">
              <label className="bulk-field-check">
                <input type="checkbox" checked={enabled.status} onChange={() => toggle("status")} />
                <span>{labels.status}</span>
              </label>
              <select value={status} disabled={!enabled.status} onChange={(e) => setStatus(e.target.value as AppStatus)}>
                {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
              </select>

              <label className="bulk-field-check">
                <input type="checkbox" checked={enabled.priority} onChange={() => toggle("priority")} />
                <span>{labels.priority}</span>
              </label>
              <select value={priority} disabled={!enabled.priority} onChange={(e) => setPriority(e.target.value as "" | Priority)}>
                <option value="">—</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              <label className="bulk-field-check">
                <input type="checkbox" checked={enabled.applied_at} onChange={() => toggle("applied_at")} />
                <span>{labels.applied_at}</span>
              </label>
              <input type="date" value={appliedAt} disabled={!enabled.applied_at} onChange={(e) => setAppliedAt(e.target.value)} />

              <label className="bulk-field-check">
                <input type="checkbox" checked={enabled.follow_up_date} onChange={() => toggle("follow_up_date")} />
                <span>{labels.follow_up_date}</span>
              </label>
              <input type="date" value={followUp} disabled={!enabled.follow_up_date} onChange={(e) => setFollowUp(e.target.value)} />

              <label className="bulk-field-check">
                <input type="checkbox" checked={enabled.notes} onChange={() => toggle("notes")} />
                <span>{labels.notes}</span>
              </label>
              <input value={notes} disabled={!enabled.notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("bulk.notesPlaceholder")} />
            </div>

            {activeFields.length === 0 && <p className="muted" style={{ fontSize: 13 }}>{t("bulk.noFields")}</p>}

            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              <button className="shrink ghost" onClick={onClose}>{t("common.cancel")}</button>
              <button className="shrink" disabled={activeFields.length === 0} onClick={() => setConfirming(true)}>
                {t("bulk.save")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              {t("bulk.confirmDesc")
                .replace("{fields}", String(activeFields.length))
                .replace("{count}", String(ids.length))}
            </p>
            <ul className="muted" style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 13 }}>
              {activeFields.map((k) => <li key={k}>{labels[k]}</li>)}
            </ul>
            <p className="due" style={{ fontSize: 13 }}>{t("bulk.confirmWarn")}</p>
            <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              <button className="shrink ghost" disabled={save.isPending} onClick={() => setConfirming(false)}>{t("bulk.back")}</button>
              <button className="shrink" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? t("bulk.saving") : t("bulk.confirm")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Board({ apps, hideClosed, onDrop }: {
  apps: Application[];
  hideClosed: boolean;
  onDrop: (id: number, status: AppStatus) => void;
}) {
  const { t } = useI18n();
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
              <span className={`badge ${col}`}>{statusLabel(t, col)}</span>
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
    url: "", title: "", company_name: "", country: "", industry: "", source: "linkedin",
    salary_min: "", salary_max: "", currency: "USD", notes: "",
    status: "applied" as AppStatus, priority: "" as "" | Priority, follow_up_date: "",
    applied_at: new Date().toISOString().slice(0, 10),
  });
  const [contacts, setContacts] = useState<{ name: string; role: string; stage: string }[]>([]);
  const [error, setError] = useState("");

  // Inline "did I already apply to this URL?" check.
  const lookup = useMutation({ mutationFn: (url: string) => api.lookup(url) });
  const checkUrl = () => { if (f.url.trim()) lookup.mutate(f.url.trim()); };

  const autofill = useMutation({
    mutationFn: () => api.scrape(f.url),
    onSuccess: (r) => {
      setF((prev) => ({
        ...prev,
        title: prev.title || r.title || "",
        company_name: prev.company_name || r.company_name || "",
        country: prev.country || toCountryCode(r.country),
        salary_min: prev.salary_min || (r.salary_min != null ? String(r.salary_min) : ""),
        salary_max: prev.salary_max || (r.salary_max != null ? String(r.salary_max) : ""),
        currency: r.currency || prev.currency,
        source: r.source || prev.source,
      }));
      setError("");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : t("form.scrapeFail")),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createApplication({
        posting: {
          url: f.url || null, title: f.title, company_name: f.company_name,
          country: f.country || null, industry: f.industry || null, source: f.source || null,
          salary_min: f.salary_min ? Number(f.salary_min) : null,
          salary_max: f.salary_max ? Number(f.salary_max) : null,
          currency: f.currency || null,
        },
        status: f.status, notes: f.notes || null,
        priority: f.priority || null,
        applied_at: f.applied_at ? `${f.applied_at}T00:00:00` : null,
        follow_up_date: f.follow_up_date ? `${f.follow_up_date}T00:00:00` : null,
        contacts: contacts
          .filter((ct) => ct.name.trim())
          .map((ct) => ({ name: ct.name.trim(), role: ct.role || null, stage: ct.stage || null })),
      }),
    onSuccess: () => {
      setOpen(false); setError("");
      setF({ ...f, url: "", title: "", company_name: "", industry: "", notes: "", follow_up_date: "" });
      setContacts([]);
      lookup.reset();
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
      <div style={{ marginBottom: 12 }}>
        <label>{t("form.url")}</label>
        <div className="row">
          <input value={f.url} onChange={set("url")} onBlur={checkUrl} placeholder="https://…" />
          <button className="shrink ghost" disabled={!f.url || autofill.isPending}
            onClick={() => autofill.mutate()}>
            {autofill.isPending ? t("form.autofilling") : `✨ ${t("form.autofill")}`}
          </button>
        </div>
        {lookup.data?.already_applied && (
          <div className="lookup-result" style={{ marginTop: 8 }}>
            <span className="due">⚠ {t("lookup.alreadyInline")} <Badge status={lookup.data.status!} /></span>
            {lookup.data.application_id && (
              <Link to={`/applications/${lookup.data.application_id}`} style={{ marginLeft: 8, fontSize: 13 }}>→</Link>
            )}
          </div>
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label>{t("form.company")}</label><input value={f.company_name} onChange={set("company_name")} /></div>
        <div><label>{t("form.role")}</label><input value={f.title} onChange={set("title")} /></div>
        <div><label>{t("form.country")}</label><CountrySelect value={f.country} onChange={(c) => setF((p) => ({ ...p, country: c }))} /></div>
        <div><label>{t("form.industry")}</label><input value={f.industry} onChange={set("industry")} /></div>
        <div><label>{t("form.salaryMin")}</label><input value={f.salary_min} onChange={set("salary_min")} inputMode="numeric" /></div>
        <div><label>{t("form.salaryMax")}</label><input value={f.salary_max} onChange={set("salary_max")} inputMode="numeric" /></div>
        <div><label>{t("form.source")}</label><input value={f.source} onChange={set("source")} /></div>
        <div><label>{t("form.currency")}</label><input value={f.currency} onChange={set("currency")} /></div>
        <div>
          <label>{t("form.initialStatus")}</label>
          <select value={f.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
          </select>
        </div>
        <div>
          <label>{t("form.priority")}</label>
          <select value={f.priority} onChange={set("priority")}>
            <option value="">—</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><label>{t("form.applied")}</label><input type="date" value={f.applied_at} onChange={set("applied_at")} /></div>
        <div><label>{t("form.followup")}</label><input type="date" value={f.follow_up_date} onChange={set("follow_up_date")} /></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="row" style={{ alignItems: "center", marginBottom: 6 }}>
          <label style={{ margin: 0, flex: 1 }}>{t("contacts.title")}</label>
          <button className="shrink ghost" onClick={() => setContacts((cs) => [...cs, { name: "", role: "", stage: "" }])}>
            {t("contacts.add")}
          </button>
        </div>
        {contacts.map((ct, i) => (
          <div className="row" key={i} style={{ marginBottom: 6 }}>
            <input placeholder={t("contacts.name")} value={ct.name}
              onChange={(e) => setContacts((cs) => cs.map((c, j) => j === i ? { ...c, name: e.target.value } : c))} />
            <input placeholder={t("contacts.rolePh")} value={ct.role}
              onChange={(e) => setContacts((cs) => cs.map((c, j) => j === i ? { ...c, role: e.target.value } : c))} />
            <select value={ct.stage} style={{ width: "auto" }}
              onChange={(e) => setContacts((cs) => cs.map((c, j) => j === i ? { ...c, stage: e.target.value } : c))}>
              <option value="">{t("contacts.stage")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
            </select>
            <button className="shrink danger" onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <label>{t("form.notes")}</label>
        <input value={f.notes} onChange={set("notes")} />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="shrink" disabled={!f.title || !f.company_name || create.isPending}
          onClick={() => create.mutate()}>{t("common.save")}</button>
        <button className="shrink ghost" onClick={() => { setOpen(false); setError(""); }}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}
