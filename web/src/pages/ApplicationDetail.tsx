import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Application, type AppStatus, type Priority } from "../api";
import {
  Badge, HOURS_PER_INTERVIEW, INTERVIEW_STATUSES, PanelSkeleton, PIPELINE, PriorityBadge, PRIORITIES,
  rankOf, Skeleton, STATUSES, statusLabel, TERMINAL,
} from "../components/ui";
import CountrySelect from "../components/CountrySelect";
import { countryDisplay } from "../countries";
import { useI18n } from "../i18n";

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
  const { t } = useI18n();
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

  const decide = useMutation({
    mutationFn: (status: AppStatus) =>
      api.addEvent(appId, { status, at: new Date().toISOString(), set_current: true }),
    onSuccess: invalidate,
  });

  const [editing, setEditing] = useState(false);

  if (q.isLoading) return (
    <div>
      <Skeleton w={220} h={20} style={{ marginBottom: 8 }} />
      <Skeleton w={320} h={28} style={{ marginBottom: 18 }} />
      <PanelSkeleton rows={5} />
      <PanelSkeleton rows={3} />
      <PanelSkeleton rows={4} />
    </div>
  );
  if (q.isError || !q.data) return <div className="error">{t("detail.notFound")}</div>;

  const app = q.data;
  const reachedSet = new Set<AppStatus>([app.status, ...app.events.map((e) => e.status)]);
  const reachedIdx = Math.max(-1, ...[...reachedSet].map(rankOf));
  const terminal = TERMINAL.includes(app.status) ? app.status : null;
  const p = app.posting;

  const eventTimes = app.events.map((e) => +new Date(e.at));
  const startTs = app.applied_at ? +new Date(app.applied_at) : (eventTimes.length ? Math.min(...eventTimes) : null);
  const lastTs = eventTimes.length ? Math.max(...eventTimes) : startTs;
  const processDays = startTs && lastTs ? daysBetween(startTs, lastTs) : null;
  const interviewRounds = app.events.filter((e) => INTERVIEW_STATUSES.includes(e.status)).length;
  const interviewHours = interviewRounds * HOURS_PER_INTERVIEW;

  return (
    <div>
      <Link to="/applications" className="muted" style={{ fontSize: 13 }}>← {t("common.back")}</Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>{p.title}</h1>

      {/* ---- meta / edit ---- */}
      <div className="panel">
        {editing ? (
          <EditForm app={app} onDone={() => { setEditing(false); invalidate(); }} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <div className="detail-meta">
              <Meta label={t("detail.company")}>{p.company_name ?? "—"}</Meta>
              <Meta label={t("detail.status")}><Badge status={app.status} /></Meta>
              <Meta label={t("detail.priority")}>{app.priority ? <PriorityBadge priority={app.priority} /> : "—"}</Meta>
              <Meta label={t("detail.applied")}>{app.applied_at ? fmtDate(app.applied_at) : "—"}</Meta>
              <Meta label={t("detail.followup")}>{app.follow_up_date ? fmtDate(app.follow_up_date) : "—"}</Meta>
              <Meta label={t("form.country")}>{countryDisplay(p.country)}</Meta>
              <Meta label={t("detail.source")}>{p.source ?? "—"}</Meta>
              <Meta label={t("detail.salary")}>
                {p.salary_min ? `${p.currency ?? ""} ${p.salary_min.toLocaleString()}` : "—"}
              </Meta>
            </div>
            {p.url && !p.url.startsWith("imported://") && (
              <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>{t("detail.viewPosting")}</a>
            )}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="shrink" onClick={() => setEditing(true)}>{t("detail.editData")}</button>
              <div style={{ flex: 1 }} />
              <button className="shrink danger" onClick={() => { if (confirm(t("detail.confirmDelete"))) del.mutate(); }}>
                {t("detail.delete")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ---- stepper ---- */}
      <div className="panel">
        <h2>{t("detail.stages")}</h2>
        <div className="stepper">
          {PIPELINE.map((s, i) => {
            const done = i <= reachedIdx;
            return (
              <div key={s} className={`step${done ? " done" : ""}`}>
                <div className="step-dot">{done ? "✓" : ""}</div>
                <div className="step-label">{statusLabel(t, s)}</div>
              </div>
            );
          })}
        </div>
        {terminal && (
          <div style={{ marginTop: 12 }}>{t("detail.finalResult")} <Badge status={terminal} /></div>
        )}
        {!terminal && app.status === "offer" && (
          <div className="row" style={{ marginTop: 12, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 13 }}>{t("detail.offerDecision")}</span>
            <div style={{ flex: 1 }} />
            <button className="shrink" onClick={() => decide.mutate("accepted")}>{t("detail.acceptOffer")}</button>
            <button className="shrink danger" onClick={() => decide.mutate("rejected")}>{t("detail.rejectOffer")}</button>
          </div>
        )}
      </div>

      {/* ---- tiempos ---- */}
      <div className="panel">
        <h2>{t("detail.times")}</h2>
        <div className="detail-meta">
          <Meta label={t("detail.processDuration")}>
            {processDays !== null ? `${processDays} d` : "—"}
          </Meta>
          <Meta label={t("detail.interviewRounds")}>{interviewRounds}</Meta>
          <Meta label={t("detail.interviewEst")}>{interviewRounds ? `~${interviewHours} h` : "—"}</Meta>
        </div>
      </div>

      {/* ---- contacts ABM ---- */}
      <Contacts app={app} onChange={invalidate} />

      {/* ---- timeline ABM ---- */}
      <Timeline app={app} onChange={invalidate} />

      {app.notes && !editing && (
        <div className="panel">
          <h2>{t("detail.notes")}</h2>
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
  const { t } = useI18n();
  const p = app.posting;
  const [f, setF] = useState({
    title: p.title, company_name: p.company_name ?? "",
    country: p.country ?? "", source: p.source ?? "", salary_min: p.salary_min?.toString() ?? "",
    salary_max: p.salary_max?.toString() ?? "", currency: p.currency ?? "",
    status: app.status, applied_at: toDateInput(app.applied_at), notes: app.notes ?? "",
    priority: (app.priority ?? "") as "" | Priority, follow_up_date: toDateInput(app.follow_up_date),
  });
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      await api.updatePosting(p.id, {
        title: f.title, company_name: f.company_name || null,
        country: f.country || null, source: f.source || null, currency: f.currency || null,
        salary_min: f.salary_min ? Number(f.salary_min) : null,
        salary_max: f.salary_max ? Number(f.salary_max) : null,
      });
      await api.updateApplication(app.id, {
        status: f.status, notes: f.notes || null, applied_at: fromDateInput(f.applied_at),
        priority: f.priority || null, follow_up_date: fromDateInput(f.follow_up_date),
      });
    },
    onSuccess: onDone,
    onError: () => setError(t("detail.saveError")),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <>
      <h2>{t("detail.editTitle")}</h2>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label>{t("detail.role")}</label><input value={f.title} onChange={set("title")} /></div>
        <div><label>{t("detail.company")}</label><input value={f.company_name} onChange={set("company_name")} /></div>
        <div><label>{t("form.country")}</label><CountrySelect value={f.country} onChange={(c) => setF((p) => ({ ...p, country: c }))} /></div>
        <div><label>{t("detail.source")}</label><input value={f.source} onChange={set("source")} /></div>
        <div><label>{t("form.salaryMin")}</label><input value={f.salary_min} onChange={set("salary_min")} inputMode="numeric" /></div>
        <div><label>{t("form.salaryMax")}</label><input value={f.salary_max} onChange={set("salary_max")} inputMode="numeric" /></div>
        <div><label>{t("form.currency")}</label><input value={f.currency} onChange={set("currency")} /></div>
        <div><label>{t("detail.applied")}</label><input type="date" value={f.applied_at} onChange={set("applied_at")} /></div>
        <div>
          <label>{t("detail.statusCurrent")}</label>
          <select value={f.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
          </select>
        </div>
        <div>
          <label>{t("detail.priority")}</label>
          <select value={f.priority} onChange={set("priority")}>
            <option value="">—</option>
            {PRIORITIES.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
          </select>
        </div>
        <div><label>{t("detail.followup")}</label><input type="date" value={f.follow_up_date} onChange={set("follow_up_date")} /></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label>{t("detail.notes")}</label>
        <textarea value={f.notes} onChange={set("notes")} rows={4} />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="shrink" disabled={save.isPending} onClick={() => save.mutate()}>{t("common.save")}</button>
        <button className="shrink ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </>
  );
}

function Contacts({ app, onChange }: { app: Application; onChange: () => void }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", role: "", stage: "" });

  const add = useMutation({
    mutationFn: () => api.addContact(app.id, {
      name: draft.name.trim(), role: draft.role || null, stage: draft.stage || null,
    }),
    onSuccess: () => { setDraft({ name: "", role: "", stage: "" }); setAdding(false); onChange(); },
  });
  const del = useMutation({
    mutationFn: (cid: number) => api.deleteContact(app.id, cid),
    onSuccess: onChange,
  });

  return (
    <div className="panel">
      <div className="row" style={{ alignItems: "center" }}>
        <h2 style={{ margin: 0, flex: 1 }}>{t("contacts.title")}</h2>
        {!adding && <button className="shrink" onClick={() => setAdding(true)}>{t("contacts.add")}</button>}
      </div>

      {adding && (
        <div className="event-form">
          <div className="row">
            <input placeholder={t("contacts.name")} value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input placeholder={t("contacts.rolePh")} value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            <select value={draft.stage} style={{ width: "auto" }}
              onChange={(e) => setDraft({ ...draft, stage: e.target.value })}>
              <option value="">{t("contacts.stage")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
            </select>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="shrink" disabled={!draft.name.trim() || add.isPending} onClick={() => add.mutate()}>{t("common.save")}</button>
            <button className="shrink ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</button>
          </div>
        </div>
      )}

      {app.contacts.length === 0 && !adding ? (
        <p className="muted">{t("contacts.none")}</p>
      ) : (
        <ul className="contact-list" style={{ marginTop: 12 }}>
          {app.contacts.map((c) => (
            <li key={c.id}>
              <span className="contact-name">{c.name}</span>
              {c.role && <span className="muted"> · {c.role}</span>}
              {c.stage && <Badge status={c.stage} />}
              <span style={{ flex: 1 }} />
              <button className="link-btn danger-txt" onClick={() => del.mutate(c.id)}>{t("detail.deleteLink")}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Timeline({ app, onChange }: { app: Application; onChange: () => void }) {
  const { t } = useI18n();
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
        <h2 style={{ margin: 0, flex: 1 }}>{t("detail.timeline")}</h2>
        {!adding && <button className="shrink" onClick={() => setAdding(true)}>{t("detail.event")}</button>}
      </div>

      {adding && <EventForm onSave={(p) => add.mutate(p)} onCancel={() => setAdding(false)} allowSetCurrent />}

      {app.events.length === 0 && !adding ? (
        <p className="muted">{t("detail.noEvents")}</p>
      ) : (
        <ul className="timeline" style={{ marginTop: 14 }}>
          {[...app.events].sort((a, b) => +new Date(b.at) - +new Date(a.at)).map((e) => (
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
                    <button className="link-btn" onClick={() => setEditId(e.id)}>{t("detail.editLink")}</button>
                    <button className="link-btn danger-txt" onClick={() => del.mutate(e.id)}>{t("detail.deleteLink")}</button>
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
  const { t } = useI18n();
  const [status, setStatus] = useState<AppStatus>(initial?.status ?? "applied");
  const [date, setDate] = useState(initial?.date ?? new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState(initial?.note ?? "");
  const [setCurrent, setSetCurrent] = useState(true);

  return (
    <div className="event-form">
      <div className="row">
        <div className="shrink">
          <label>{t("detail.eventStatus")}</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as AppStatus)} style={{ width: "auto" }}>
            {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(t, s)}</option>)}
          </select>
        </div>
        <div className="shrink">
          <label>{t("detail.eventDate")}</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label>{t("detail.eventNote")}</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {allowSetCurrent && (
        <label className="check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={setCurrent} onChange={(e) => setSetCurrent(e.target.checked)} />
          {t("detail.setCurrent")}
        </label>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button className="shrink" onClick={() => onSave({
          status, at: `${date}T00:00:00`, note: note || null,
          ...(allowSetCurrent ? { set_current: setCurrent } : {}),
        })}>{t("common.save")}</button>
        <button className="shrink ghost" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}
