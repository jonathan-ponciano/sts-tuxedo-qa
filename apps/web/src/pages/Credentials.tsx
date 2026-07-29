import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { CredentialMaskedDTO } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

export function Credentials() {
  const { slug } = useParams<{ slug: string }>();
  const [credentials, setCredentials] = useState<CredentialMaskedDTO[] | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});

  async function refresh() {
    if (!slug) return;
    const { credentials } = await api.listCredentials(slug);
    setCredentials(credentials);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function fulfill(id: number) {
    if (!slug || !values[id]) return;
    await api.fulfillCredential(slug, id, values[id]);
    setValues((v) => ({ ...v, [id]: "" }));
    await refresh();
  }

  if (!slug) return null;

  return (
    <div>
      <h2>Credenciais</h2>
      <p className="muted">
        Valores pedidos pela IA via <code>request_credential</code> aparecem aqui como <em>pending</em>. Preencha o
        valor — ele fica só entre você e este cofre local, nunca passa pela conversa com a IA.
      </p>
      {!credentials ? (
        <p className="muted">Carregando…</p>
      ) : credentials.length === 0 ? (
        <p className="muted">Nenhuma credencial pedida ainda.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th>Status</th>
              <th>Preencher</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((cred) => (
              <tr key={cred.id}>
                <td>{cred.name}</td>
                <td className="muted">{cred.description ?? "—"}</td>
                <td>
                  {cred.status === "fulfilled" ? <span className="pill ok">preenchida</span> : <span className="pill warn">pendente</span>}
                </td>
                <td>
                  <div className="form-row" style={{ margin: 0 }}>
                    <input
                      type="password"
                      placeholder="valor"
                      value={values[cred.id] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [cred.id]: e.target.value }))}
                    />
                    <button onClick={() => void fulfill(cred.id)} disabled={!values[cred.id]}>
                      Salvar
                    </button>
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
