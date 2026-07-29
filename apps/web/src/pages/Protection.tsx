import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ProtectionHeaderDTO } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

export function Protection() {
  const { slug } = useParams<{ slug: string }>();
  const [headers, setHeaders] = useState<ProtectionHeaderDTO[] | null>(null);
  const [headerName, setHeaderName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(projectSlug: string) {
    const { headers } = await api.listProtectionHeaders(projectSlug);
    setHeaders(headers);
  }

  useEffect(() => {
    if (!slug) return;
    void refresh(slug);
  }, [slug]);

  if (!slug) return null;
  const projectSlug = slug;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createProtectionHeader(projectSlug, headerName, value);
      setHeaderName("");
      setValue("");
      await refresh(projectSlug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(h: ProtectionHeaderDTO) {
    await api.setProtectionHeaderEnabled(projectSlug, h.id, !h.enabled);
    await refresh(projectSlug);
  }

  async function remove(h: ProtectionHeaderDTO) {
    await api.deleteProtectionHeader(projectSlug, h.id);
    await refresh(projectSlug);
  }

  return (
    <div>
      <h2>Proteção</h2>
      <p className="muted">Headers HTTP extras (ex: Basic Auth de staging) enviados em toda execução deste projeto.</p>

      <div className="card">
        <h2 style={{ marginBottom: "0.9rem" }}>Novo header</h2>
        <form onSubmit={handleCreate} className="form-row">
          <input type="text" placeholder="nome do header (ex: Authorization)" value={headerName} onChange={(e) => setHeaderName(e.target.value)} required style={{ minWidth: "220px" }} />
          <input type="password" placeholder="valor" value={value} onChange={(e) => setValue(e.target.value)} required style={{ minWidth: "220px" }} />
          <button className="primary" type="submit" disabled={busy}>
            Adicionar
          </button>
        </form>
        {error && <p style={{ color: "var(--muted)", margin: 0 }}>{error}</p>}
      </div>

      {!headers ? (
        <p className="muted">Carregando…</p>
      ) : headers.length === 0 ? (
        <p className="muted">Nenhum header configurado.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Header</th>
              <th>Ativo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {headers.map((h) => (
              <tr key={h.id}>
                <td>{h.headerName}</td>
                <td>{h.enabled ? <span className="pill ok">sim</span> : <span className="pill muted">não</span>}</td>
                <td>
                  <div className="form-row" style={{ margin: 0 }}>
                    <button onClick={() => void toggle(h)}>{h.enabled ? "Desativar" : "Ativar"}</button>
                    <button onClick={() => void remove(h)}>Remover</button>
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
