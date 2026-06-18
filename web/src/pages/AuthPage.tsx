import { useState } from "react";
import { api, ApiError } from "../api";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(email, password);
      }
      await api.login(email, password);
      location.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Algo falló");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="panel">
        <h2>{mode === "login" ? "Entrar" : "Crear cuenta"}</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} required
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input type="password" value={password} required minLength={6}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "…" : mode === "login" ? "Entrar" : "Registrarme"}
          </button>
          {error && <div className="error">{error}</div>}
        </form>
        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          {mode === "login" ? "¿No tenés cuenta? " : "¿Ya tenés cuenta? "}
          <a href="#" onClick={(e) => { e.preventDefault(); setError(""); setMode(mode === "login" ? "register" : "login"); }}>
            {mode === "login" ? "Registrate" : "Entrá"}
          </a>
        </p>
      </div>
    </div>
  );
}
