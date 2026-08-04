import { useState, type ComponentType } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { auth } from "./api";
import { useI18n } from "./i18n";
import {
  BriefcaseIcon, ChartIcon, ChevronLeftIcon, ChevronRightIcon,
  HomeIcon, LogOutIcon, SettingsIcon,
} from "./components/icons";

const COLLAPSE_KEY = "labulog_sidebar_collapsed";

const NAV: { to: string; key: string; end?: boolean; Icon: ComponentType<{ size?: number }> }[] = [
  { to: "/", key: "nav.overview", end: true, Icon: HomeIcon },
  { to: "/applications", key: "nav.applications", Icon: BriefcaseIcon },
  { to: "/analytics", key: "nav.analytics", Icon: ChartIcon },
  { to: "/settings", key: "nav.settings", Icon: SettingsIcon },
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
            {collapsed ? <ChevronRightIcon size={16} /> : <ChevronLeftIcon size={16} />}
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
              <span className="nav-icon"><n.Icon size={19} /></span>
              <span>{t(n.key)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="sidebar-user" title={email}>{email}</div>
          <button className="ghost logout-btn" onClick={() => { auth.clear(); location.reload(); }} title={t("nav.logout")}>
            <span className="logout-label">{t("nav.logout")}</span>
            <span className="logout-icon"><LogOutIcon size={17} /></span>
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
