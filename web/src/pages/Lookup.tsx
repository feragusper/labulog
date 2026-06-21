import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError, type Lookup } from "../api";
import { Badge } from "../components/ui";
import { useI18n } from "../i18n";

export default function LookupPage() {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<Lookup | null>(null);
  const [error, setError] = useState("");

  const check = useMutation({
    mutationFn: () => api.lookup(url),
    onSuccess: (data) => { setResult(data); setError(""); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Error"),
  });

  return (
    <div>
      <h1 className="page-title">{t("lookup.title")}</h1>
      <div className="panel">
        <p className="muted" style={{ marginTop: 0 }}>{t("lookup.desc")}</p>
        <div className="row">
          <input placeholder={t("lookup.placeholder")}
            value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="shrink" disabled={!url || check.isPending} onClick={() => check.mutate()}>
            {t("lookup.check")}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {result && (
          <div className="lookup-result">
            {!result.posting ? (
              <span className="muted">{t("lookup.unknown")}</span>
            ) : result.already_applied ? (
              <span className="ok">
                {t("lookup.statusLabel")} <Badge status={result.status!} />
              </span>
            ) : (
              <span><b>{result.posting.title}</b></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
