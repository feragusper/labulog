import { useState } from "react";
import type { ProfileData } from "../api";
import { useI18n } from "../i18n";

const MONTHS = {
  es: "ene feb mar abr may jun jul ago sep oct nov dic".split(" "),
  en: "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" "),
};

function useFmt() {
  const { t, lang } = useI18n();
  const date = (raw: string) => {
    const m = raw.match(/^(\d{4})-(\d{2})$/);
    return m ? `${MONTHS[lang][parseInt(m[2], 10) - 1] ?? m[2]} ${m[1]}` : raw;
  };
  const range = (start: string, end: string, current = false) =>
    [start && date(start), current ? t("profile.present") : end && date(end)].filter(Boolean).join(" – ");
  return { date, range };
}

function href(u: string): string {
  return /^https?:\/\//.test(u) ? u : `https://${u}`;
}
function pretty(u: string): string {
  return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

// Long LinkedIn descriptions are clamped to a few lines with a toggle.
function Clamp({ text }: { text: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const long = text.length > 320;
  return (
    <div>
      <div className={`pv-text${long && !open ? " clamped" : ""}`}>{text}</div>
      {long && (
        <button className="link-btn" onClick={() => setOpen(!open)}>
          {open ? t("profile.showLess") : t("profile.showMore")}
        </button>
      )}
    </div>
  );
}

export default function ProfileView({ p }: { p: ProfileData }) {
  const { t } = useI18n();
  const { date, range } = useFmt();
  const b = p.basics;
  const links: [string, string][] = (
    [["email", b.email], ["phone", b.phone], ["linkedin", b.linkedin], ["github", b.github], ["website", b.website]] as [string, string][]
  ).filter(([, v]) => v);

  return (
    <div className="pv">
      <div className="panel pv-hero">
        <div className="pv-avatar">{(b.full_name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div className="pv-name">{b.full_name || t("profile.noName")}</div>
          {b.headline && <div className="pv-headline">{b.headline}</div>}
          {b.location && <div className="muted pv-loc">{b.location}</div>}
          {links.length > 0 && (
            <div className="pv-links">
              {links.map(([k, v]) =>
                k === "email" ? <a key={k} href={`mailto:${v}`}>{v}</a>
                  : k === "phone" ? <span key={k}>{v}</span>
                    : <a key={k} href={href(v)} target="_blank" rel="noreferrer">{pretty(v)}</a>,
              )}
            </div>
          )}
        </div>
      </div>

      {b.summary && (
        <div className="panel">
          <h2>{t("profile.f.summary")}</h2>
          <Clamp text={b.summary} />
        </div>
      )}

      {p.experience.length > 0 && (
        <div className="panel">
          <h2>{t("profile.s.experience")} <span className="pv-count">{p.experience.length}</span></h2>
          <div className="pv-timeline">
            {p.experience.map((e, i) => (
              <div className="pv-entry" key={i}>
                <div className="pv-entry-head">
                  <div>
                    <strong>{e.title}</strong>
                    {e.company && <span className="muted"> · {e.company}</span>}
                  </div>
                  <span className="muted pv-when">{range(e.start, e.end, e.current)}</span>
                </div>
                {e.location && <div className="muted pv-sub">{e.location}</div>}
                {e.description && <Clamp text={e.description} />}
                {e.highlights.length > 0 && <ul className="pv-list">{e.highlights.map((h, j) => <li key={j}>{h}</li>)}</ul>}
              </div>
            ))}
          </div>
        </div>
      )}

      {p.skills.length > 0 && (
        <div className="panel">
          <h2>{t("profile.s.skills")} <span className="pv-count">{p.skills.length}</span></h2>
          <div className="pv-chips">
            {p.skills.map((s, i) => (
              <span className="pv-chip" key={i} title={[s.category, s.level].filter(Boolean).join(" · ")}>
                {s.name}{s.level && <span className="muted"> · {s.level}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="pv-cols">
        {p.education.length > 0 && (
          <div className="panel">
            <h2>{t("profile.s.education")}</h2>
            {p.education.map((e, i) => (
              <div className="pv-entry" key={i}>
                <strong>{e.school}</strong>
                <div className="muted pv-sub">
                  {[[e.degree, e.field].filter(Boolean).join(", "), range(e.start, e.end)].filter(Boolean).join(" · ")}
                </div>
                {e.description && <div className="pv-text">{e.description}</div>}
              </div>
            ))}
          </div>
        )}
        {(p.languages.length > 0 || p.certifications.length > 0) && (
          <div className="panel">
            {p.languages.length > 0 && (
              <>
                <h2>{t("profile.s.languages")}</h2>
                <ul className="pv-list plain">
                  {p.languages.map((l, i) => <li key={i}><strong>{l.name}</strong>{l.proficiency && <span className="muted"> · {l.proficiency}</span>}</li>)}
                </ul>
              </>
            )}
            {p.certifications.length > 0 && (
              <>
                <h2 style={{ marginTop: p.languages.length ? 18 : 0 }}>{t("profile.s.certifications")}</h2>
                <ul className="pv-list plain">
                  {p.certifications.map((c, i) => (
                    <li key={i}>
                      {c.url ? <a href={href(c.url)} target="_blank" rel="noreferrer">{c.name}</a> : <strong>{c.name}</strong>}
                      {(c.issuer || c.date) && <span className="muted"> · {[c.issuer, c.date && date(c.date)].filter(Boolean).join(" · ")}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      {p.projects.length > 0 && (
        <div className="panel">
          <h2>{t("profile.s.projects")}</h2>
          {p.projects.map((x, i) => (
            <div className="pv-entry" key={i}>
              <div className="pv-entry-head">
                <div>
                  <strong>{x.name}</strong>
                  {x.url && <> · <a href={href(x.url)} target="_blank" rel="noreferrer">{pretty(x.url)}</a></>}
                </div>
                <span className="muted pv-when">{range(x.start, x.end)}</span>
              </div>
              {x.description && <Clamp text={x.description} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
