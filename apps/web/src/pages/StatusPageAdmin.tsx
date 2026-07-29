import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { StatusPageConfigDTO } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

export function StatusPageAdmin() {
  const { slug } = useParams<{ slug: string }>();
  const [config, setConfig] = useState<StatusPageConfigDTO | null>(null);

  useEffect(() => {
    if (!slug) return;
    void api.getStatusPageConfig(slug).then((r) => setConfig(r.statusPageConfig));
  }, [slug]);

  if (!slug) return null;

  return (
    <div>
      <h2>Status Page</h2>
      <p className="muted">Página pública opcional expondo um subconjunto de testes selecionados.</p>
      {!config ? (
        <p className="muted">Carregando…</p>
      ) : config.enabled && config.slug ? (
        <div className="card">
          <p>
            Habilitada em <a href={`/status/${config.slug}`}>/status/{config.slug}</a>
          </p>
          <p className="muted">{config.testIds.length} teste(s) selecionado(s)</p>
        </div>
      ) : (
        <p className="muted">Desabilitada.</p>
      )}
      <p className="muted" style={{ marginTop: "1rem" }}>
        Editor completo (título, descrição, seleção de testes) chega numa próxima etapa.
      </p>
    </div>
  );
}
