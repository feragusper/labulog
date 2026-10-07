import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type ProfileData, type ProfileSkill } from "../api";
import { useI18n, type Lang } from "../i18n";
import { PanelSkeleton } from "../components/ui";

type Variant = "full" | "short" | "ats";

// CV headings follow the CV's language, not the UI's — you may want an English CV
// while using the app in Spanish.
const L: Record<Lang, Record<string, string>> = {
  es: {
    summary: "Perfil", experience: "Experiencia", education: "Educación", skills: "Habilidades",
    languages: "Idiomas", certifications: "Certificaciones", projects: "Proyectos", present: "Actualidad",
    months: "ene feb mar abr may jun jul ago sep oct nov dic",
  },
  en: {
    summary: "Summary", experience: "Experience", education: "Education", skills: "Skills",
    languages: "Languages", certifications: "Certifications", projects: "Projects", present: "Present",
    months: "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec",
  },
};

// Short CV caps, to keep it to roughly one page.
const SHORT = { experience: 4, highlights: 3, skills: 15, certifications: 3, descChars: 280 };

function fmtDate(raw: string, lang: Lang, variant: Variant): string {
  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) return raw;
  if (variant === "ats") return `${m[2]}/${m[1]}`; // parsers read MM/YYYY reliably
  const mon = L[lang].months.split(" ")[parseInt(m[2], 10) - 1];
  return mon ? `${mon} ${m[1]}` : raw;
}

function range(start: string, end: string, current: boolean, lang: Lang, v: Variant): string {
  const s = start ? fmtDate(start, lang, v) : "";
  const e = current ? L[lang].present : end ? fmtDate(end, lang, v) : "";
  return [s, e].filter(Boolean).join(" – ");
}

// Split free text into paragraphs and bullet lines ("- ", "• ", "* ").
function splitText(text: string): { paras: string[]; bullets: string[] } {
  const paras: string[] = [];
  const bullets: string[] = [];
  for (const raw of text.split("\n")) {
    const ln = raw.trim();
    if (!ln) continue;
    const b = ln.match(/^[-•*·▪]\s*(.+)$/);
    if (b) bullets.push(b[1]);
    else paras.push(ln);
  }
  return { paras, bullets };
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

function groupSkills(skills: ProfileSkill[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const s of skills) {
    const k = s.category.trim();
    groups.set(k, [...(groups.get(k) ?? []), s.name]);
  }
  return [...groups.entries()];
}

function stripUrl(u: string): string {
  return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

// Variant shaping lives in one place so the HTML and the plain-text export agree.
function shape(p: ProfileData, v: Variant) {
  const short = v === "short";
  const experience = (short ? p.experience.slice(0, SHORT.experience) : p.experience).map((e) => {
    const { paras, bullets } = splitText(e.description);
    let points = [...e.highlights.filter(Boolean), ...bullets];
    let text = paras.join(" ");
    if (short) {
      points = points.slice(0, SHORT.highlights);
      text = points.length ? "" : clip(text, SHORT.descChars);
    }
    return { ...e, points, text };
  });
  return {
    basics: p.basics,
    experience,
    education: p.education.map((e) => ({ ...e, description: short ? "" : e.description })),
    skills: short ? p.skills.slice(0, SHORT.skills) : p.skills,
    languages: p.languages,
    certifications: short ? p.certifications.slice(0, SHORT.certifications) : p.certifications,
    projects: short ? [] : p.projects,
  };
}

function contactParts(b: ProfileData["basics"]): string[] {
  return [b.location, b.email, b.phone, b.linkedin && stripUrl(b.linkedin), b.github && stripUrl(b.github), b.website && stripUrl(b.website)]
    .filter(Boolean) as string[];
}

function toPlainText(p: ProfileData, v: Variant, lang: Lang): string {
  const c = shape(p, v);
  const l = L[lang];
  const out: string[] = [];
  const h = (s: string) => { out.push("", s.toUpperCase()); };
  out.push(c.basics.full_name);
  if (c.basics.headline) out.push(c.basics.headline);
  out.push(contactParts(c.basics).join(" | "));
  if (c.basics.summary) { h(l.summary); out.push(c.basics.summary); }
  if (c.experience.length) {
    h(l.experience);
    for (const e of c.experience) {
      out.push("", [e.title, e.company].filter(Boolean).join(", "));
      out.push([range(e.start, e.end, e.current, lang, v), e.location].filter(Boolean).join(" | "));
      if (e.text) out.push(e.text);
      for (const pt of e.points) out.push(`- ${pt}`);
    }
  }
  if (c.education.length) {
    h(l.education);
    for (const e of c.education) {
      out.push([[e.degree, e.field].filter(Boolean).join(", "), e.school].filter(Boolean).join(" - ")
        + (range(e.start, e.end, false, lang, v) ? ` (${range(e.start, e.end, false, lang, v)})` : ""));
    }
  }
  if (c.skills.length) {
    h(l.skills);
    for (const [cat, names] of groupSkills(c.skills)) out.push((cat ? `${cat}: ` : "") + names.join(", "));
  }
  if (c.languages.length) {
    h(l.languages);
    out.push(c.languages.map((x) => (x.proficiency ? `${x.name} (${x.proficiency})` : x.name)).join(", "));
  }
  if (c.certifications.length) {
    h(l.certifications);
    for (const x of c.certifications) out.push(`- ${[x.name, x.issuer, x.date && fmtDate(x.date, lang, v)].filter(Boolean).join(", ")}`);
  }
  if (c.projects.length) {
    h(l.projects);
    for (const x of c.projects) {
      out.push(`- ${x.name}${x.url ? ` (${x.url})` : ""}${x.description ? `: ${x.description.replace(/\n+/g, " ")}` : ""}`);
    }
  }
  return out.join("\n").trim() + "\n";
}

function CvSheet({ p, v, lang }: { p: ProfileData; v: Variant; lang: Lang }) {
  const c = shape(p, v);
  const l = L[lang];
  return (
    <article className={`cv-sheet cv-${v}`}>
      <header className="cv-header">
        <h1>{c.basics.full_name || "—"}</h1>
        {c.basics.headline && <div className="cv-headline">{c.basics.headline}</div>}
        <div className="cv-contact">{contactParts(c.basics).join(v === "ats" ? " | " : "  ·  ")}</div>
      </header>

      {c.basics.summary && (
        <section>
          <h2>{l.summary}</h2>
          {splitText(c.basics.summary).paras.map((x, i) => <p key={i}>{x}</p>)}
        </section>
      )}

      {c.experience.length > 0 && (
        <section>
          <h2>{l.experience}</h2>
          {c.experience.map((e, i) => (
            <div className="cv-entry" key={i}>
              <div className="cv-entry-head">
                <div>
                  <strong>{e.title}</strong>
                  {e.company && <>{v === "ats" ? ", " : " · "}<span className="cv-org">{e.company}</span></>}
                </div>
                <div className="cv-when">{range(e.start, e.end, e.current, lang, v)}</div>
              </div>
              {e.location && <div className="cv-sub">{e.location}</div>}
              {e.text && <p>{e.text}</p>}
              {e.points.length > 0 && <ul>{e.points.map((pt, j) => <li key={j}>{pt}</li>)}</ul>}
            </div>
          ))}
        </section>
      )}

      {c.skills.length > 0 && (
        <section>
          <h2>{l.skills}</h2>
          {v === "full" ? (
            groupSkills(c.skills).map(([cat, names]) => (
              <div className="cv-skill-row" key={cat}>
                {cat && <strong>{cat}: </strong>}
                {names.map((n) => <span className="cv-chip" key={n}>{n}</span>)}
              </div>
            ))
          ) : (
            groupSkills(c.skills).map(([cat, names]) => (
              <p key={cat}>{cat && <strong>{cat}: </strong>}{names.join(", ")}</p>
            ))
          )}
        </section>
      )}

      {c.education.length > 0 && (
        <section>
          <h2>{l.education}</h2>
          {c.education.map((e, i) => (
            <div className="cv-entry" key={i}>
              <div className="cv-entry-head">
                <div>
                  <strong>{[e.degree, e.field].filter(Boolean).join(", ") || e.school}</strong>
                  {(e.degree || e.field) && e.school && <>{v === "ats" ? ", " : " · "}<span className="cv-org">{e.school}</span></>}
                </div>
                <div className="cv-when">{range(e.start, e.end, false, lang, v)}</div>
              </div>
              {e.description && <p>{e.description}</p>}
            </div>
          ))}
        </section>
      )}

      {c.languages.length > 0 && (
        <section>
          <h2>{l.languages}</h2>
          <p>{c.languages.map((x) => (x.proficiency ? `${x.name} (${x.proficiency})` : x.name)).join(", ")}</p>
        </section>
      )}

      {c.certifications.length > 0 && (
        <section>
          <h2>{l.certifications}</h2>
          <ul>
            {c.certifications.map((x, i) => (
              <li key={i}>
                <strong>{x.name}</strong>
                {[x.issuer, x.date && fmtDate(x.date, lang, v)].filter(Boolean).map((s) => ` — ${s}`).join("")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.projects.length > 0 && (
        <section>
          <h2>{l.projects}</h2>
          {c.projects.map((x, i) => (
            <div className="cv-entry" key={i}>
              <div className="cv-entry-head">
                <div><strong>{x.name}</strong>{x.url && <span className="cv-sub"> · {stripUrl(x.url)}</span>}</div>
                <div className="cv-when">{range(x.start, x.end, false, lang, v)}</div>
              </div>
              {x.description && <p>{x.description}</p>}
            </div>
          ))}
        </section>
      )}
    </article>
  );
}

export default function CvBuilder() {
  const { t, lang: uiLang } = useI18n();
  const q = useQuery({ queryKey: ["profile"], queryFn: api.getProfile });
  const [variant, setVariant] = useState<Variant>("full");
  const [lang, setLang] = useState<Lang>(uiLang);

  if (q.isLoading || !q.data) return <div><h1 className="page-title">{t("cv.title")}</h1><PanelSkeleton rows={8} /></div>;
  const p = q.data;
  const empty = !p.basics.full_name && p.experience.length === 0;

  const filename = `${(p.basics.full_name || "cv").replace(/\s+/g, "_")}_CV_${variant}_${lang}`;

  const print = () => {
    // The browser uses document.title as the default PDF filename.
    const prev = document.title;
    document.title = filename;
    window.print();
    document.title = prev;
  };
  const downloadTxt = () => {
    const blob = new Blob([toPlainText(p, variant, lang)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyTxt = () => navigator.clipboard.writeText(toPlainText(p, variant, lang));

  const variants: Variant[] = ["full", "short", "ats"];

  return (
    <div>
      <div className="no-print">
        <div className="page-head">
          <h1 className="page-title" style={{ margin: 0 }}>{t("cv.title")}</h1>
          <Link to="/profile">← {t("cv.editProfile")}</Link>
        </div>
        <div className="panel cv-toolbar">
          <div className="seg">
            {variants.map((x) => (
              <button key={x} className={variant === x ? "active" : ""} onClick={() => setVariant(x)}>{t(`cv.v.${x}`)}</button>
            ))}
          </div>
          <div className="seg">
            {(["es", "en"] as Lang[]).map((x) => (
              <button key={x} className={lang === x ? "active" : ""} onClick={() => setLang(x)}>{x.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button className="ghost" onClick={copyTxt}>{t("cv.copy")}</button>
          <button className="ghost" onClick={downloadTxt}>{t("cv.txt")}</button>
          <button onClick={print}>{t("cv.pdf")}</button>
        </div>
        <p className="muted cv-hint">{t(`cv.hint.${variant}`)}</p>
        {empty && <p className="muted">{t("cv.empty")} <Link to="/profile">{t("cv.editProfile")}</Link></p>}
      </div>
      <div className="cv-stage">
        <CvSheet p={p} v={variant} lang={lang} />
      </div>
    </div>
  );
}
