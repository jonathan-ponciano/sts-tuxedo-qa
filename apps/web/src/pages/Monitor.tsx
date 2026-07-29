import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectDTO } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

export function Monitor() {
  const [projects, setProjects] = useState<ProjectDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    try {
      const { projects } = await api.listProjects();
      setProjects(projects);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createProject({ slug, name });
      setSlug("");
      setName("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h1>Monitor</h1>

      <div className="card">
        <h2>Novo projeto</h2>
        <form className="form-row" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="slug (ex: acme)"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
          <input type="text" placeholder="nome" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="primary" type="submit" disabled={creating}>
            Registrar
          </button>
        </form>
        {error && <p style={{ color: "var(--stop)" }}>{error}</p>}
      </div>

      {!projects ? (
        <p className="muted">Carregando…</p>
      ) : projects.length === 0 ? (
        <p className="muted">
          Nenhum projeto registrado ainda. Peça ao assistente de IA para conectar em <code>/mcp/&lt;slug&gt;</code> ou
          registre um acima.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Projeto</th>
              <th>Testes</th>
              <th>Passando</th>
              <th>Falhando</th>
              <th>Última execução</th>
              <th>Em andamento</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/projects/${p.slug}/tests`}>{p.name}</Link> <span className="muted">({p.slug})</span>
                </td>
                <td>{p.testCount}</td>
                <td>{p.passingCount}</td>
                <td>{p.failingCount}</td>
                <td className="muted">{p.lastRunAt ? new Date(p.lastRunAt).toLocaleString("pt-BR") : "—"}</td>
                <td>{p.activeRunCount > 0 ? <span className="pill warn">{p.activeRunCount} rodando</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
