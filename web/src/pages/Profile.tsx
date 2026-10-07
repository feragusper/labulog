import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type ProfileData, type ProfileImportResult } from "../api";
import { useI18n } from "../i18n";
import { PanelSkeleton } from "../components/ui";

type FieldType = "text" | "textarea" | "lines" | "checkbox";
interface FieldDef { key: string; label: string; type?: FieldType; wide?: boolean; ph?: string }

const EMPTY: ProfileData = {
  basics: { full_name: "", headline: "", email: "", phone: "", location: "", website: "", linkedin: "", github: "", summary: "" },
  experience: [], education: [], skills: [], languages: [], certifications: [], projects: [],
};

type ListKey = Exclude<keyof ProfileData, "basics" | "skills">;

const BLANK: Record<ListKey, () => any> = {
  experience: () => ({ company: "", title: "", location: "", start: "", end: "", current: false, description: "", highlights: [] }),
  education: () => ({ school: "", degree: "", field: "", start: "", end: "", description: "" }),
  languages: () => ({ name: "", proficiency: "" }),
  certifications: () => ({ name: "", issuer: "", date: "", url: "" }),
  projects: () => ({ name: "", description: "", url: "", start: "", end: "" }),
};

// One editable card per list item: generic so every section shares the same UX.
function ListEditor({ items, fields, onChange, blank, addLabel, titleOf }: {
  items: any[];
  fields: FieldDef[];
  onChange: (items: any[]) => void;
  blank: () => any;
  addLabel: string;
  titleOf: (it: any) => string;
}) {
  const { t } = useI18n();
  const set = (i: number, key: string, v: unknown) =>
    onChange(items.map((it, j) => (j === i ? { ...it, [key]: v } : it)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="profile-list">
      {items.map((it, i) => (
        <div className="profile-item" key={i}>
          <div className="profile-item-head">
            <strong>{titleOf(it) || <span className="muted">{t("profile.untitled")}</span>}</strong>
            <div className="profile-item-actions">
              <button className="ghost icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title={t("profile.moveUp")}>↑</button>
              <button className="ghost icon-btn" disabled={i === items.length - 1} onClick={() => move(i, 1)} title={t("profile.moveDown")}>↓</button>
              <button className="danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>{t("profile.remove")}</button>
            </div>
          </div>
          <div className="profile-grid">
            {fields.map((f) => {
              const v = it[f.key];
              if (f.type === "checkbox") {
                return (
                  <label key={f.key} className="check profile-check">
                    <input type="checkbox" checked={!!v} onChange={(e) => set(i, f.key, e.target.checked)} />
                    <span>{f.label}</span>
                  </label>
                );
              }
              const wide = f.wide || f.type === "textarea" || f.type === "lines";
              return (
                <div key={f.key} className={wide ? "span-all" : ""}>
                  <label>{f.label}</label>
                  {f.type === "textarea" ? (
                    <textarea rows={4} value={v ?? ""} placeholder={f.ph} onChange={(e) => set(i, f.key, e.target.value)} />
                  ) : f.type === "lines" ? (
                    <textarea
                      rows={3}
                      value={(v ?? []).join("\n")}
                      placeholder={f.ph}
                      onChange={(e) => set(i, f.key, e.target.value.split("\n"))}
                    />
                  ) : (
                    <input value={v ?? ""} placeholder={f.ph} onChange={(e) => set(i, f.key, e.target.value)} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <button className="ghost" onClick={() => onChange([...items, blank()])}>{addLabel}</button>
    </div>
  );
}

export default function Profile() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["profile"], queryFn: api.getProfile });
  const [draft, setDraft] = useState<ProfileData>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importing, setImporting] = useState(false);
  const [importRes, setImportRes] = useState<ProfileImportResult | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && !dirty) {
      const { updated_at: _u, ...data } = q.data;
      setDraft(data);
    }
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<ProfileData>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); setSaveMsg(null); };
  const setBasic = (k: keyof ProfileData["basics"], v: string) => update({ basics: { ...draft.basics, [k]: v } });

  const save = async () => {
    setSaving(true);
    try {
      // Drop empty highlight lines / blank skills before persisting.
      const clean: ProfileData = {
        ...draft,
        experience: draft.experience.map((e) => ({ ...e, highlights: e.highlights.map((h) => h.trim()).filter(Boolean) })),
        skills: draft.skills.filter((s) => s.name.trim()),
      };
      const saved = await api.saveProfile(clean);
      qc.setQueryData(["profile"], saved);
      const { updated_at: _u, ...data } = saved;
      setDraft(data);
      setDirty(false);
      setSaveMsg(t("profile.saved"));
    } catch (e) {
      setSaveMsg(e instanceof ApiError ? e.message : t("profile.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (dirty && !confirm(t("profile.importDiscard"))) return;
    if (importMode === "replace" && !confirm(t("profile.importReplaceConfirm"))) return;
    setImporting(true); setImportErr(null); setImportRes(null);
    try {
      const res = await api.importLinkedIn(file, importMode);
      setImportRes(res);
      qc.setQueryData(["profile"], res.profile);
      const { updated_at: _u, ...data } = res.profile;
      setDraft(data);
      setDirty(false);
    } catch (err) {
      setImportErr(err instanceof ApiError ? err.message : t("profile.importFailed"));
    } finally {
      setImporting(false);
    }
  };

  const addSkills = () => {
    const names = skillInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const have = new Set(draft.skills.map((s) => s.name.toLowerCase()));
    const add = names.filter((n) => !have.has(n.toLowerCase())).map((name) => ({ name, level: "", category: "" }));
    update({ skills: [...draft.skills, ...add] });
    setSkillInput("");
  };
  const setSkill = (i: number, k: "name" | "level" | "category", v: string) =>
    update({ skills: draft.skills.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });

  if (q.isLoading) return <div><h1 className="page-title">{t("profile.title")}</h1><PanelSkeleton rows={6} /></div>;

  const b = draft.basics;
  const basicFields: { k: keyof ProfileData["basics"]; ph?: string }[] = [
    { k: "full_name" }, { k: "headline", ph: "Senior Android Engineer" },
    { k: "email" }, { k: "phone" }, { k: "location", ph: "Buenos Aires, AR" },
    { k: "linkedin", ph: "https://linkedin.com/in/…" }, { k: "github", ph: "https://github.com/…" },
    { k: "website" },
  ];
  const period = (it: any) => [it.start, it.current ? t("profile.present") : it.end].filter(Boolean).join(" – ");
  const dateFields = (startKey = "start"): FieldDef[] => [
    { key: startKey, label: t("profile.f.start"), ph: "2021-03" },
    { key: "end", label: t("profile.f.end"), ph: "2024-06" },
  ];
  const listProps = (key: ListKey) => ({
    items: draft[key] as any[],
    onChange: (items: any[]) => update({ [key]: items } as Partial<ProfileData>),
    blank: BLANK[key],
    addLabel: t(`profile.add.${key}`),
  });

  return (
    <div className="profile-page">
      <div className="page-head">
        <h1 className="page-title" style={{ margin: 0 }}>{t("profile.title")}</h1>
        <div className="page-head-actions">
          <Link to="/profile/cv" className="btn-link ghost">{t("profile.generateCv")}</Link>
          <button onClick={save} disabled={!dirty || saving}>{saving ? t("profile.saving") : t("common.save")}</button>
        </div>
      </div>
      {saveMsg && <p className="muted" style={{ marginTop: -8 }}>{saveMsg}</p>}

      <div className="panel">
        <h2>{t("profile.linkedin")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t("profile.linkedinDesc")}</p>
        <ol className="muted profile-steps">
          <li>{t("profile.linkedinStep1")}</li>
          <li>{t("profile.linkedinStep2")}</li>
          <li>{t("profile.linkedinStep3")}</li>
        </ol>
        <div className="field-row">
          <div className="seg">
            <button className={importMode === "merge" ? "active" : ""} onClick={() => setImportMode("merge")}>{t("profile.modeMerge")}</button>
            <button className={importMode === "replace" ? "active" : ""} onClick={() => setImportMode("replace")}>{t("profile.modeReplace")}</button>
          </div>
          <input ref={fileRef} type="file" accept=".zip,.csv,application/zip,text/csv" style={{ display: "none" }} onChange={onImport} />
          <button disabled={importing} onClick={() => fileRef.current?.click()}>
            {importing ? t("profile.importing") : t("profile.importBtn")}
          </button>
        </div>
        {importRes && (
          <p className="ok" style={{ marginBottom: 0 }}>
            {t("profile.importDone")}{" "}
            {Object.entries(importRes.counts).filter(([, n]) => n > 0).map(([k, n]) => `${t(`profile.s.${k}`)}: +${n}`).join(" · ") || t("profile.importNothingNew")}
          </p>
        )}
        {importErr && <p className="error">{importErr}</p>}
      </div>

      <div className="panel">
        <h2>{t("profile.s.basics")}</h2>
        <div className="profile-grid">
          {basicFields.map(({ k, ph }) => (
            <div key={k}>
              <label>{t(`profile.f.${k}`)}</label>
              <input value={b[k]} placeholder={ph} onChange={(e) => setBasic(k, e.target.value)} />
            </div>
          ))}
          <div className="span-all">
            <label>{t("profile.f.summary")}</label>
            <textarea rows={5} value={b.summary} placeholder={t("profile.summaryPh")} onChange={(e) => setBasic("summary", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>{t("profile.s.experience")}</h2>
        <ListEditor
          {...listProps("experience")}
          titleOf={(it) => [it.title, it.company].filter(Boolean).join(" @ ") + (period(it) ? ` · ${period(it)}` : "")}
          fields={[
            { key: "title", label: t("profile.f.title") },
            { key: "company", label: t("profile.f.company") },
            { key: "location", label: t("profile.f.location") },
            ...dateFields(),
            { key: "current", label: t("profile.f.current"), type: "checkbox" },
            { key: "description", label: t("profile.f.description"), type: "textarea" },
            { key: "highlights", label: t("profile.f.highlights"), type: "lines", ph: t("profile.highlightsPh") },
          ]}
        />
      </div>

      <div className="panel">
        <h2>{t("profile.s.skills")}</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <input
            value={skillInput}
            placeholder={t("profile.skillsPh")}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkills(); } }}
          />
          <button className="shrink" onClick={addSkills}>{t("profile.add.skills")}</button>
        </div>
        {draft.skills.length === 0 ? (
          <p className="muted">{t("profile.noSkills")}</p>
        ) : (
          <table className="skills-table">
            <thead>
              <tr><th>{t("profile.f.skill")}</th><th>{t("profile.f.category")}</th><th>{t("profile.f.level")}</th><th /></tr>
            </thead>
            <tbody>
              {draft.skills.map((s, i) => (
                <tr key={i}>
                  <td><input value={s.name} onChange={(e) => setSkill(i, "name", e.target.value)} /></td>
                  <td><input value={s.category} placeholder="Languages / Frameworks / Tools" onChange={(e) => setSkill(i, "category", e.target.value)} /></td>
                  <td><input value={s.level} placeholder={t("profile.levelPh")} onChange={(e) => setSkill(i, "level", e.target.value)} /></td>
                  <td className="shrink-cell">
                    <button className="ghost icon-btn" disabled={i === 0} onClick={() => {
                      const next = [...draft.skills]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; update({ skills: next });
                    }}>↑</button>
                    <button className="danger" onClick={() => update({ skills: draft.skills.filter((_, j) => j !== i) })}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>{t("profile.s.education")}</h2>
        <ListEditor
          {...listProps("education")}
          titleOf={(it) => [it.degree, it.school].filter(Boolean).join(" · ")}
          fields={[
            { key: "school", label: t("profile.f.school") },
            { key: "degree", label: t("profile.f.degree") },
            { key: "field", label: t("profile.f.field") },
            ...dateFields(),
            { key: "description", label: t("profile.f.description"), type: "textarea" },
          ]}
        />
      </div>

      <div className="panel">
        <h2>{t("profile.s.languages")}</h2>
        <ListEditor
          {...listProps("languages")}
          titleOf={(it) => it.name}
          fields={[
            { key: "name", label: t("profile.f.language") },
            { key: "proficiency", label: t("profile.f.proficiency"), ph: "C1 / Native / Professional working" },
          ]}
        />
      </div>

      <div className="panel">
        <h2>{t("profile.s.certifications")}</h2>
        <ListEditor
          {...listProps("certifications")}
          titleOf={(it) => it.name}
          fields={[
            { key: "name", label: t("profile.f.name") },
            { key: "issuer", label: t("profile.f.issuer") },
            { key: "date", label: t("profile.f.date"), ph: "2023-05" },
            { key: "url", label: "URL" },
          ]}
        />
      </div>

      <div className="panel">
        <h2>{t("profile.s.projects")}</h2>
        <ListEditor
          {...listProps("projects")}
          titleOf={(it) => it.name}
          fields={[
            { key: "name", label: t("profile.f.name") },
            { key: "url", label: "URL" },
            ...dateFields(),
            { key: "description", label: t("profile.f.description"), type: "textarea" },
          ]}
        />
      </div>

      {dirty && (
        <div className="save-bar">
          <span>{t("profile.unsaved")}</span>
          <button onClick={save} disabled={saving}>{saving ? t("profile.saving") : t("common.save")}</button>
        </div>
      )}
    </div>
  );
}
