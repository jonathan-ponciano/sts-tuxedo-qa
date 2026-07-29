import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { WebhookDTO } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

const EVENT_OPTIONS = ["pass", "fail", "error"] as const;

export function Webhooks() {
  const { slug } = useParams<{ slug: string }>();
  const [webhooks, setWebhooks] = useState<WebhookDTO[] | null>(null);
  const [kind, setKind] = useState<"discord" | "slack" | "generic">("generic");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<string>>(new Set(["fail", "error"]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(projectSlug: string) {
    const { webhooks } = await api.listWebhooks(projectSlug);
    setWebhooks(webhooks);
  }

  useEffect(() => {
    if (!slug) return;
    void refresh(slug);
  }, [slug]);

  if (!slug) return null;
  const projectSlug = slug;

  function toggleEvent(name: string) {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createWebhook(projectSlug, { kind, url, events: [...events] });
      setUrl("");
      await refresh(projectSlug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(w: WebhookDTO) {
    await api.setWebhookEnabled(projectSlug, w.id, !w.enabled);
    await refresh(projectSlug);
  }

  async function remove(w: WebhookDTO) {
    await api.deleteWebhook(projectSlug, w.id);
    await refresh(projectSlug);
  }

  return (
    <div>
      <h2>Webhooks</h2>
      <p className="muted">Notificação de resultado — Discord, Slack ou um endpoint JSON genérico, disparada ao fim de cada run.</p>

      <div className="card">
        <h2 style={{ marginBottom: "0.9rem" }}>Novo webhook</h2>
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="generic">Genérico (JSON)</option>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
            </select>
            <input
              type="text"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              style={{ minWidth: "320px" }}
            />
          </div>
          <div className="form-row">
            {EVENT_OPTIONS.map((ev) => (
              <label key={ev} className="muted" style={{ display: "flex", alignItems: "center", gap: "0.35em" }}>
                <input type="checkbox" checked={events.has(ev)} onChange={() => toggleEvent(ev)} />
                {ev}
              </label>
            ))}
            <button className="primary" type="submit" disabled={busy}>
              Adicionar
            </button>
          </div>
        </form>
        {error && <p style={{ color: "var(--muted)", margin: 0 }}>{error}</p>}
      </div>

      {!webhooks ? (
        <p className="muted">Carregando…</p>
      ) : webhooks.length === 0 ? (
        <p className="muted">Nenhum webhook configurado.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>URL</th>
              <th>Eventos</th>
              <th>Ativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {webhooks.map((w) => (
              <tr key={w.id}>
                <td>{w.kind}</td>
                <td className="muted" style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {w.url}
                </td>
                <td className="muted">{w.events.join(", ")}</td>
                <td>{w.enabled ? <span className="pill ok">sim</span> : <span className="pill muted">não</span>}</td>
                <td>
                  <div className="form-row" style={{ margin: 0 }}>
                    <button onClick={() => void toggleEnabled(w)}>{w.enabled ? "Desativar" : "Ativar"}</button>
                    <button onClick={() => void remove(w)}>Remover</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
