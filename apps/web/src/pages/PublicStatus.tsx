import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { PublicStatusPageDTO, RunStatus } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

function statusPill(status: RunStatus | null) {
  if (!status) return <span className="pill muted">sem execução</span>;
  if (status === "passed") return <span className="pill ok">operacional</span>;
  if (status === "running" || status === "queued") return <span className="pill warn">verificando</span>;
  return <span className="pill stop">com problema</span>;
}

export function PublicStatus() {
  const { pageSlug } = useParams<{ pageSlug: string }>();
  const [data, setData] = useState<PublicStatusPageDTO | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!pageSlug) return;
    api
      .getPublicStatus(pageSlug)
      .then(setData)
      .catch(() => setNotFound(true));
  }, [pageSlug]);

  if (notFound) {
    return (
      <div className="app-main">
        <h1>Página não encontrada</h1>
        <p className="muted">Essa status page não existe ou está desabilitada.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-main">
        <p className="muted">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="app-main">
      <h1>{data.title}</h1>
      {data.description && <p className="muted">{data.description}</p>}
      <table>
        <thead>
          <tr>
            <th>Verificação</th>
            <th>Status</th>
            <th>Última execução</th>
          </tr>
        </thead>
        <tbody>
          {data.tests.map((t) => (
            <tr key={t.name}>
              <td>{t.name}</td>
              <td>{statusPill(t.status)}</td>
              <td className="muted">{t.lastRunAt ? new Date(t.lastRunAt).toLocaleString("pt-BR") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
