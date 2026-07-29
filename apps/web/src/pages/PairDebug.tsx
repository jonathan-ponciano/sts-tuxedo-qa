import { useState } from "react";
import { useParams } from "react-router-dom";
import type { PairDebugEvent } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

export function PairDebug() {
  const { slug } = useParams<{ slug: string }>();
  const [session, setSession] = useState<{ id: number; vncWsPath: string } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [events, setEvents] = useState<PairDebugEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  if (!slug) return null;
  const projectSlug = slug;

  const vncViewerUrl = session
    ? `/api/projects/${slug}/pair-debug/vnc/vnc.html?autoconnect=true&resize=scale&path=${encodeURIComponent(
        `api/projects/${slug}/pair-debug/vnc/websockify`,
      )}`
    : null;

  async function handleStart() {
    setBusy(true);
    setError(null);
    setDraft(null);
    try {
      const result = await api.startPairDebug(projectSlug, url || undefined);
      setSession({ id: result.sessionId, vncWsPath: result.vncWsPath });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.stopPairDebug(projectSlug, session.id);
      setDraft(result.draftTestSource);
      setEvents(result.events);
      setSession(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Pair Debug</h2>
      <p className="muted">
        Abre um browser de verdade (headed) dentro do container do runner. Você dirige, o tuxedo-qa grava
        navegação/cliques e monta um rascunho de teste Playwright quando você para a sessão.
      </p>

      {!session ? (
        <div className="card">
          <div className="form-row">
            <input
              type="text"
              placeholder="URL inicial (opcional)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{ minWidth: "320px" }}
            />
            <button className="primary" onClick={() => void handleStart()} disabled={busy}>
              Iniciar sessão
            </button>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Só uma sessão ativa por vez (um único display no runner).
          </p>
        </div>
      ) : (
        <div className="card">
          <p>
            Sessão #{session.id} ativa —{" "}
            <a href={vncViewerUrl!} target="_blank" rel="noopener noreferrer">
              abrir viewer noVNC (nova aba)
            </a>
          </p>
          <button onClick={() => void handleStop()} disabled={busy}>
            Parar e gerar rascunho de teste
          </button>
        </div>
      )}

      {error && <p style={{ color: "var(--muted)" }}>{error}</p>}

      {draft && (
        <>
          <h2 style={{ marginTop: "1.5rem" }}>Rascunho de teste</h2>
          <code className="script">{draft}</code>
          <h2 style={{ marginTop: "1.5rem" }}>Timeline ({events.length} eventos)</h2>
          <pre className="log">{events.map((e) => `[${e.type}] ${JSON.stringify(e.payload)}`).join("\n")}</pre>
        </>
      )}
    </div>
  );
}
