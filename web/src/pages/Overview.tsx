import { useQuery } from "@tanstack/react-query";
import { api, type AppStatus, type Application } from "../api";
import { Badge, HOURS_PER_INTERVIEW, pct } from "../components/ui";

function processDays(a: Application): number | null {
  const ts = a.events.map((e) => +new Date(e.at));
  const start = a.applied_at ? +new Date(a.applied_at) : (ts.length ? Math.min(...ts) : null);
  const last = ts.length ? Math.max(...ts) : start;
  if (start == null || last == null) return null;
  return Math.max(0, Math.round((last - start) / 86_400_000));
}

export default function Overview() {
  const funnel = useQuery({ queryKey: ["funnel"], queryFn: api.funnel });
  const apps = useQuery({ queryKey: ["applications"], queryFn: api.listApplications });
  const f = funnel.data;

  const list = apps.data ?? [];
  const interviewRounds = list.reduce(
    (n, a) => n + a.events.filter((e) => e.status === "interview").length, 0);
  const interviewHours = interviewRounds * HOURS_PER_INTERVIEW;
  const durations = list.map(processDays).filter((d): d is number => d !== null);
  const avgProcess = durations.length
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;

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

      <div className="grid cards" style={{ marginTop: 16 }}>
        <Card label="Rondas de entrevista" value={apps.isLoading ? "—" : interviewRounds} />
        <Card label="En entrevistas (est.)" value={apps.isLoading ? "—" : `~${interviewHours} h`} />
        <Card label="Duración media proceso" value={avgProcess !== null ? `${avgProcess} d` : "—"} />
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
