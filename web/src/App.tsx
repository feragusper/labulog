import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { api, auth } from "./api";
import Layout from "./Layout";
import AuthPage from "./pages/AuthPage";
import Overview from "./pages/Overview";
import Applications from "./pages/Applications";
import LookupPage from "./pages/Lookup";

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

  if (!loggedIn) return <AuthPage />;

  return (
    <Routes>
      <Route element={<Layout email={meQuery.data?.email} />}>
        <Route index element={<Overview />} />
        <Route path="applications" element={<Applications />} />
        <Route path="lookup" element={<LookupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
