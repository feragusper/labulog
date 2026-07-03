import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type ImportResult } from "../api";
import { addPendingImports } from "../pendingImports";
import { useI18n, type Lang } from "../i18n";
import { getThemePref, setThemePref, type ThemePref } from "../theme";

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const pickTheme = (p: ThemePref) => { setTheme(p); setThemePref(p); };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const result = await api.importApplications(file);
      setImportResult(result);
      if (result.pending.length) addPendingImports(result.pending);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : t("settings.importFailed"));
    } finally {
      setImporting(false);
    }
  };

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

      <div className="panel">
        <h2>{t("settings.import")}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t("settings.importDesc")}</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: "none" }}
          onChange={onImportFile}
        />
        <button disabled={importing} onClick={() => fileRef.current?.click()}>
          {importing ? t("settings.importing") : t("settings.importBtn")}
        </button>

        {importResult && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: 0 }}>
              {t("settings.importDone")
                .replace("{imported}", String(importResult.imported))
                .replace("{skipped}", String(importResult.skipped))}
            </p>
            {importResult.pending.length > 0 && (
              <p className="muted" style={{ margin: "4px 0 0" }}>
                {t("settings.importPending").replace("{count}", String(importResult.pending.length))}
              </p>
            )}
            <p style={{ margin: "8px 0 0" }}>
              <Link to="/applications">{t("settings.importGoToApps")} →</Link>
            </p>
            {importResult.errors.length > 0 && (
              <div className="muted" style={{ marginTop: 6 }}>
                <p style={{ margin: 0 }}>
                  {t("settings.importErrors").replace("{count}", String(importResult.errors.length))}
                </p>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {importResult.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {importError && (
          <p style={{ marginTop: 12, color: "var(--danger, #c0392b)" }}>{importError}</p>
        )}
      </div>
    </div>
  );
}
