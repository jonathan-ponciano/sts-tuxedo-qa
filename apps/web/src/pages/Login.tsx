import { useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";

export function Login() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "signup") await api.signup({ email, name, password });
      else await api.login({ email, password });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "10vh auto" }}>
      <h1>tuxedo-qa</h1>
      <div className="card">
        <h2>{mode === "login" ? "Entrar" : "Criar conta"}</h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mode === "signup" && (
            <input type="text" placeholder="nome" value={name} onChange={(e) => setName(e.target.value)} required />
          )}
          <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <button className="primary" type="submit" disabled={submitting}>
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        {error && <p style={{ color: "var(--stop)" }}>{error}</p>}
        <p className="muted">
          {mode === "login" ? (
            <>
              Sem conta?{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setMode("signup");
                  setError(null);
                }}
              >
                Criar uma
              </a>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setMode("login");
                  setError(null);
                }}
              >
                Entrar
              </a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
