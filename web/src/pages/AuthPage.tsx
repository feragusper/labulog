import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { useI18n } from "../i18n";

export default function AuthPage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleBtn = useRef<HTMLDivElement>(null);

  // Wire up the Google Identity button once the client id + GIS script are ready.
  useEffect(() => {
    let cancelled = false;

    async function setupGoogle() {
      let clientId = "";
      try {
        clientId = (await api.authConfig()).google_client_id;
      } catch {
        return; // config endpoint unreachable -> skip Google
      }
      if (!clientId || cancelled) return;

      // GIS script loads async; poll briefly until window.google exists.
      const start = Date.now();
      while (!window.google && Date.now() - start < 5000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!window.google || cancelled || !googleBtn.current) return;

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          setError("");
          try {
            await api.googleLogin(resp.credential);
            location.reload();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Google login falló");
          }
        },
      });
      window.google.accounts.id.renderButton(googleBtn.current, {
        theme: "outline",
        size: "large",
        width: 312,
        text: "continue_with",
        shape: "pill",
      });
    }

    setupGoogle();
    return () => { cancelled = true; };
  }, []);

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
      setError(err instanceof ApiError ? err.message : t("auth.fail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="panel">
        <h2>{mode === "login" ? t("auth.login") : t("auth.register")}</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>{t("auth.email")}</label>
            <input type="email" value={email} required
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("auth.password")}</label>
            <input type="password" value={password} required minLength={6}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "…" : mode === "login" ? t("auth.enter") : t("auth.signup")}
          </button>
          {error && <div className="error">{error}</div>}
        </form>

        <div className="divider"><span>{t("auth.or")}</span></div>
        <div ref={googleBtn} style={{ display: "flex", justifyContent: "center" }} />

        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          {mode === "login" ? t("auth.noAccount") : t("auth.haveAccount")}
          <a href="#" onClick={(e) => { e.preventDefault(); setError(""); setMode(mode === "login" ? "register" : "login"); }}>
            {mode === "login" ? t("auth.goRegister") : t("auth.goLogin")}
          </a>
        </p>
      </div>
    </div>
  );
}
