import { useEffect, useState } from "react";
import type { CredentialMaskedDTO } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

interface CredentialInlineFormProps {
  slug: string;
  credentialId: number;
  onFulfilled: () => void;
}

/**
 * Renders right inside the chat when the agent's turn is parked on a
 * `request_credential` call — submits straight to the same PATCH
 * .../fulfill route Credentials.tsx uses, so the value never touches the
 * chat message endpoint or the model's context. Fulfilling it resumes the
 * conversation automatically server-side (see agent/credential-events.ts).
 */
export function CredentialInlineForm({ slug, credentialId, onFulfilled }: CredentialInlineFormProps) {
  const [credential, setCredential] = useState<CredentialMaskedDTO | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.listCredentials(slug).then(({ credentials }) => {
      setCredential(credentials.find((c) => c.id === credentialId) ?? null);
    });
  }, [slug, credentialId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.fulfillCredential(slug, credentialId, value);
      onFulfilled();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <p style={{ marginTop: 0 }}>
        O agente está esperando a credencial <strong>{credential?.name ?? `#${credentialId}`}</strong>
        {credential?.description ? ` — ${credential.description}` : ""}. O valor não passa pela conversa.
      </p>
      <form className="form-row" onSubmit={(e) => void handleSubmit(e)}>
        <input
          type="password"
          placeholder="Valor da credencial"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ flex: 1 }}
          autoFocus
        />
        <button className="primary" type="submit" disabled={busy || !value.trim()}>
          Enviar
        </button>
      </form>
      {error && <p style={{ color: "var(--stop)" }}>{error}</p>}
    </div>
  );
}
