import { useQuery } from "@tanstack/react-query";
import { api, auth } from "./api";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    enabled: !!auth.token,
  });

  const loggedIn = !!auth.token && meQuery.isSuccess;

  if (auth.token && meQuery.isLoading) {
    return <div className="container muted">Cargando…</div>;
  }

  return (
    <>
      <div className="topbar">
        <h1 className="brand">Labu<span>Log</span></h1>
        {loggedIn && (
          <button className="ghost" onClick={() => { auth.clear(); location.reload(); }}>
            Salir ({meQuery.data?.email})
          </button>
        )}
      </div>
      {loggedIn ? <Dashboard /> : <AuthPage />}
    </>
  );
}
