import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { StatusPageConfigDTO, TestDTO } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

export function StatusPageAdmin() {
  const { slug } = useParams<{ slug: string }>();
  const [config, setConfig] = useState<StatusPageConfigDTO | null>(null);
  const [tests, setTests] = useState<TestDTO[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!slug) return;
    void api.getStatusPageConfig(slug).then((r) => setConfig(r.statusPageConfig));
    void api.listTests(slug).then((r) => setTests(r.tests));
  }, [slug]);

  if (!slug || !config) {
    return (
      <div>
        <h2>Status Page</h2>
        <p className="muted">Carregando…</p>
      </div>
    );
  }
  const projectSlug = slug;

  function toggleTest(id: number) {
    setConfig((prev) =>
      prev ? { ...prev, testIds: prev.testIds.includes(id) ? prev.testIds.filter((t) => t !== id) : [...prev.testIds, id] } : prev,
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.saveStatusPageConfig(projectSlug, config);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Status Page</h2>
      <p className="muted">Página pública opcional expondo um subconjunto de testes selecionados, num slug próprio.</p>

      <form className="card" onSubmit={handleSave}>
        <div className="form-row">
          <label style={{ display: "flex", alignItems: "center", gap: "0.4em" }}>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            />
            Habilitada
          </label>
        </div>
        <div className="form-row">
          <input
            type="text"
            placeholder="slug público (ex: acme-status)"
            value={config.slug ?? ""}
            onChange={(e) => setConfig({ ...config, slug: e.target.value || null })}
            style={{ minWidth: "220px" }}
          />
          <input
            type="text"
            placeholder="título"
            value={config.title ?? ""}
            onChange={(e) => setConfig({ ...config, title: e.target.value || null })}
            style={{ minWidth: "220px" }}
          />
        </div>
        <div className="form-row">
          <input
            type="text"
            placeholder="descrição"
            value={config.description ?? ""}
            onChange={(e) => setConfig({ ...config, description: e.target.value || null })}
            style={{ minWidth: "460px" }}
          />
        </div>

        <p className="muted" style={{ marginBottom: "0.5rem" }}>
          Testes exibidos na página pública:
        </p>
        {tests.length === 0 ? (
          <p className="muted">Nenhum teste neste projeto ainda.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1rem" }}>
            {tests.map((t) => (
              <label key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
                <input type="checkbox" checked={config.testIds.includes(t.id)} onChange={() => toggleTest(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        )}

        <button className="primary" type="submit" disabled={busy}>
          Salvar
        </button>
        {saved && <span className="muted" style={{ marginLeft: "0.75rem" }}>salvo.</span>}
        {error && <p style={{ color: "var(--muted)" }}>{error}</p>}
      </form>

      {config.enabled && config.slug && (
        <p>
          Página pública em <a href={`/status/${config.slug}`} target="_blank" rel="noopener noreferrer">/status/{config.slug}</a>
        </p>
      )}
    </div>
  );
}
