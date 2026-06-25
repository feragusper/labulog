import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { auth } from "./api";
import { useI18n } from "./i18n";

const COLLAPSE_KEY = "labulog_sidebar_collapsed";

const NAV = [
  { to: "/", key: "nav.overview", end: true, icon: "▦" },
  { to: "/applications", key: "nav.applications", icon: "▤" },
  { to: "/analytics", key: "nav.analytics", icon: "▣" },
  { to: "/settings", key: "nav.settings", icon: "⚙" },
];

export default function Layout({ email }: { email?: string }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(localStorage.getItem(COLLAPSE_KEY) === "1");

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  };

  return (
    <div className={`app-shell${collapsed ? " collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">Labu<span>Log</span></div>
          <button className="collapse-btn" onClick={toggle} title={collapsed ? t("nav.expand") : t("nav.collapse")}>
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={t(n.key)}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              <span className="nav-icon">{n.icon}</span>
              <span>{t(n.key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user" title={email}>{email}</div>
          <button className="ghost" onClick={() => { auth.clear(); location.reload(); }} title={t("nav.logout")}>
            <span className="logout-label">{t("nav.logout")}</span>
            <span className="logout-icon">⏻</span>
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
