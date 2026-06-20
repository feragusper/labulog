import { NavLink, Outlet } from "react-router-dom";
import { auth } from "./api";

const NAV = [
  { to: "/", label: "Resumen", end: true, icon: "▦" },
  { to: "/applications", label: "Postulaciones", icon: "▤" },
  { to: "/lookup", label: "¿Ya apliqué?", icon: "⌕" },
];

export default function Layout({ email }: { email?: string }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">Labu<span>Log</span></div>
        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user" title={email}>{email}</div>
          <button className="ghost" onClick={() => { auth.clear(); location.reload(); }}>
            Salir
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
