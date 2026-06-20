import { useQuery } from "@tanstack/react-query";
import { api, type AppStatus } from "../api";
import { Badge, pct } from "../components/ui";

export default function Overview() {
  const funnel = useQuery({ queryKey: ["funnel"], queryFn: api.funnel });
  const f = funnel.data;

  return (
    <div>
      <h1 className="page-title">Resumen</h1>

      <div className="grid cards">
        <Card label="Postulaciones" value={f?.total ?? "—"} />
        <Card label="Tasa respuesta" value={f ? pct(f.response_rate) : "—"} />
        <Card label="Tasa entrevista" value={f ? pct(f.interview_rate) : "—"} />
        <Card label="Ofertas" value={f?.by_status.offer ?? "—"} />
        <Card label="Ghosteadas" value={f?.ghost_count ?? "—"} />
      </div>

      <div className="panel">
        <h2>Por estado</h2>
        {!f || f.total === 0 ? (
          <p className="muted">Cargá postulaciones para ver el embudo.</p>
        ) : (
          <div className="status-bars">
            {(Object.keys(f.by_status) as AppStatus[])
              .filter((s) => f.by_status[s] > 0)
              .map((s) => (
                <div key={s} className="status-bar-row">
                  <div className="status-bar-label"><Badge status={s} /></div>
                  <div className="status-bar-track">
                    <div
                      className={`status-bar-fill ${s}`}
                      style={{ width: `${(f.by_status[s] / f.total) * 100}%` }}
                    />
                  </div>
                  <div className="status-bar-count muted">{f.by_status[s]}</div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
