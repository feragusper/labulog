import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, ApiError, type ImportResult } from "../api";

export default function Settings() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const upload = useMutation({
    mutationFn: () => api.importCsv(file!),
    onSuccess: (res) => {
      setResult(res);
      setError("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["funnel"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Falló el import"),
  });

  return (
    <div>
      <h1 className="page-title">Ajustes</h1>

      <div className="panel">
        <h2>Importar postulaciones (CSV)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Subí un CSV de scouting (formato con columnas <code>Company</code>, <code>Apply</code>,
          etapas con fechas, <code>Money</code>, <code>Result</code>). Reconstruyo el timeline de
          estados, parseo salarios y infiero el resultado. Re-importar no duplica.
        </p>

        <div className="row">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
          />
          <button
            className="shrink"
            disabled={!file || upload.isPending}
            onClick={() => upload.mutate()}
          >
            {upload.isPending ? "Importando…" : "Importar"}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {result && (
          <div className="lookup-result">
            <span className="ok">{result.imported} importadas</span>
            {result.skipped > 0 && <span className="muted"> · {result.skipped} omitidas (ya existían)</span>}
            {result.errors.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="muted">{result.errors.length} errores</summary>
                <ul style={{ margin: "6px 0 0", fontSize: 13 }}>
                  {result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>¿Otro formato?</h2>
        <p className="muted" style={{ margin: 0 }}>
          Hoy soporta el CSV de scouting. Si tenés Excel (.xlsx) u otra estructura,
          exportalo a CSV o avisá y agrego el parser.
        </p>
      </div>
    </div>
  );
}
