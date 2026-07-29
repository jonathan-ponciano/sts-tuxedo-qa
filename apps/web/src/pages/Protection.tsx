import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { ProtectionHeaderDTO } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

export function Protection() {
  const { slug } = useParams<{ slug: string }>();
  const [headers, setHeaders] = useState<ProtectionHeaderDTO[] | null>(null);

  useEffect(() => {
    if (!slug) return;
    void api.listProtectionHeaders(slug).then((r) => setHeaders(r.headers));
  }, [slug]);

  if (!slug) return null;

  return (
    <div>
      <h2>Proteção</h2>
      <p className="muted">
        Headers HTTP extras (ex: Basic Auth de staging) enviados em toda execução deste projeto.
      </p>
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
            </tr>
          </thead>
          <tbody>
            {headers.map((h) => (
              <tr key={h.id}>
                <td>{h.headerName}</td>
                <td>{h.enabled ? <span className="pill ok">sim</span> : <span className="pill muted">não</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted" style={{ marginTop: "1rem" }}>
        Gerenciamento completo (adicionar/remover) chega numa próxima etapa.
      </p>
    </div>
  );
}
