import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api.ts";

const RECENT_WINDOW_MS = 2 * 60_000;

export function ConnectAI() {
  const { slug } = useParams<{ slug: string }>();
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    async function poll() {
      try {
        const { lastConnectedAt } = await api.getMcpStatus(slug!);
        if (!cancelled) {
          setLastConnectedAt(lastConnectedAt);
          setLoaded(true);
        }
      } catch {
        // keep showing the last known state; try again next tick
      }
    }
    void poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slug]);

  if (!slug) return null;

  const mcpUrl = `${window.location.origin}/mcp/${slug}`;
  const snippet = JSON.stringify({ mcpServers: { "tuxedo-qa": { url: mcpUrl } } }, null, 2);

  const recentlyConnected = lastConnectedAt != null && Date.now() - new Date(lastConnectedAt).getTime() < RECENT_WINDOW_MS;

  function copySnippet() {
    void navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <h2>Conectar IA</h2>
      <p className="muted">
        Aponte o cliente MCP do seu assistente de IA (Claude Code, Claude Desktop, etc.) pro endpoint deste
        projeto. Depois disso, é só descrever o fluxo que quer monitorar na conversa.
      </p>

      <div className="card">
        <h2 style={{ marginBottom: "0.75rem" }}>1. Endpoint</h2>
        <code className="script" style={{ display: "inline-block" }}>
          {mcpUrl}
        </code>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: "0.75rem" }}>2. Configuração</h2>
        <code className="script">{snippet}</code>
        <div className="form-row" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          <button onClick={copySnippet}>{copied ? "Copiado!" : "Copiar"}</button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: "0.75rem" }}>3. Verificar conexão</h2>
        {!loaded ? (
          <p className="muted" style={{ margin: 0 }}>
            Carregando…
          </p>
        ) : lastConnectedAt == null ? (
          <p style={{ margin: 0 }}>
            <span className="pill muted">nunca conectou</span>
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            {recentlyConnected ? (
              <span className="pill ok">conectado agora</span>
            ) : (
              <span className="pill warn">já conectou antes</span>
            )}{" "}
            <span className="muted">— última vez: {new Date(lastConnectedAt).toLocaleString("pt-BR")}</span>
          </p>
        )}
        <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
          Atualiza a cada 3s. Depois de colar a configuração no seu cliente, chame qualquer ferramenta (ex:{" "}
          <code>list_tests</code>) e o indicador deve virar "conectado agora".
        </p>
      </div>
    </div>
  );
}
