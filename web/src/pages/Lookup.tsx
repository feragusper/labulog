import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError, type Lookup } from "../api";
import { Badge } from "../components/ui";

export default function LookupPage() {
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
      <h1 className="page-title">¿Ya apliqué a este posting?</h1>
      <div className="panel">
        <p className="muted" style={{ marginTop: 0 }}>
          Pegá la URL de un job posting y cruzo contra tus postulaciones — anti ghost-job.
        </p>
        <div className="row">
          <input placeholder="https://linkedin.com/jobs/view/…"
            value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="shrink" disabled={!url || check.isPending} onClick={() => check.mutate()}>
            Chequear
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        {result && (
          <div className="lookup-result">
            {!result.posting ? (
              <span className="muted">Posting desconocido — nadie lo registró todavía.</span>
            ) : result.already_applied ? (
              <span className="ok">
                Ya aplicaste · estado: <Badge status={result.status!} />
              </span>
            ) : (
              <span>Conozco el posting (<b>{result.posting.title}</b>) pero <b>vos no aplicaste</b>.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
