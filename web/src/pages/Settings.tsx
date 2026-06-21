import { useState } from "react";
import { api } from "../api";
import { useI18n, type Lang } from "../i18n";
import { getThemePref, setThemePref, type ThemePref } from "../theme";

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const [theme, setTheme] = useState<ThemePref>(getThemePref());

  const pickTheme = (p: ThemePref) => { setTheme(p); setThemePref(p); };

  const themeOpts: { v: ThemePref; label: string }[] = [
    { v: "system", label: t("settings.system") },
    { v: "light", label: t("settings.light") },
    { v: "dark", label: t("settings.dark") },
  ];
  const langOpts: { v: Lang; label: string }[] = [
    { v: "es", label: "Español" },
    { v: "en", label: "English" },
  ];

  return (
    <div>
      <h1 className="page-title">{t("settings.title")}</h1>

      <div className="panel">
        <h2>{t("settings.appearance")}</h2>
        <div className="field-row">
          <span className="field-label">{t("settings.theme")}</span>
          <div className="seg">
            {themeOpts.map((o) => (
              <button key={o.v} className={theme === o.v ? "active" : ""} onClick={() => pickTheme(o.v)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field-row">
          <span className="field-label">{t("settings.language")}</span>
          <div className="seg">
            {langOpts.map((o) => (
              <button key={o.v} className={lang === o.v ? "active" : ""} onClick={() => setLang(o.v)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>{t("settings.export")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t("settings.exportDesc")}</p>
        <button onClick={() => api.exportCsv()}>{t("settings.exportBtn")}</button>
      </div>
    </div>
  );
}
