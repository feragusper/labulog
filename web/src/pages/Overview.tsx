import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type AppStatus, type Application } from "../api";
import { Badge, CardsSkeleton, TableSkeleton } from "../components/ui";
import { flag } from "../countries";
import { useI18n } from "../i18n";

// Active = actually in flight: applied through offer (excludes saved + terminals).
const INACTIVE: AppStatus[] = ["saved", "accepted", "rejected", "cancelled", "ghosted", "withdrawn"];

function lastActivity(a: Application): number {
  const ts = a.events.map((e) => +new Date(e.at));
  return ts.length ? Math.max(...ts) : +new Date(a.updated_at);
}
function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

export default function Overview() {
  const { t } = useI18n();
  const apps = useQuery({ queryKey: ["applications"], queryFn: api.listApplications });
  const list = apps.data ?? [];

  const active = list
    .filter((a) => !INACTIVE.includes(a.status))
    .sort((a, b) => lastActivity(b) - lastActivity(a));
  const offers = list.filter((a) => a.status === "offer" || a.status === "accepted").length;
  const now = Date.now();
  const due = list.filter((a) =>
    a.follow_up_date && !INACTIVE.includes(a.status) && +new Date(a.follow_up_date) <= now).length;

  return (
    <div>
      <div className="row" style={{ alignItems: "center" }}>
        <h1 className="page-title" style={{ flex: 1, margin: 0 }}>{t("home.title")}</h1>
        <Link to="/analytics" className="muted" style={{ fontSize: 13 }}>{t("home.seeAnalytics")} →</Link>
      </div>

      {apps.isLoading ? <CardsSkeleton n={3} /> : (
        <div className="grid cards" style={{ marginTop: 16 }}>
          <Card label={t("home.inProgress")} value={active.length} />
          <Card label={t("overview.offers")} value={offers} />
          <Card label={t("overview.dueFollowups")} value={due} />
        </div>
      )}

      <div className="panel">
        <h2>{t("home.inProgress")}</h2>
        {apps.isLoading && <TableSkeleton rows={5} cols={3} />}
        {!apps.isLoading && active.length === 0 && <p className="muted">{t("home.noActive")}</p>}
        {active.length > 0 && (
          <table>
            <tbody>
              {active.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.posting.country && <span style={{ marginRight: 6 }}>{flag(a.posting.country)}</span>}
                    <Link to={`/applications/${a.id}`}>{a.posting.company_name ?? a.posting.title}</Link>
                    {a.posting.company_name && (
                      <div className="muted" style={{ fontSize: 12 }}>{a.posting.title}</div>
                    )}
                  </td>
                  <td><Badge status={a.status} /></td>
                  <td className="muted" style={{ fontSize: 13, textAlign: "right" }}>{fmt(lastActivity(a))}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
