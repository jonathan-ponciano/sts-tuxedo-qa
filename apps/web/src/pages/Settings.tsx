import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";

type Provider = "anthropic" | "gemini";

const PROVIDER_LABEL: Record<Provider, string> = {
  anthropic: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
};

function ProviderRow({
  provider,
  configured,
  onSaved,
  note,
}: {
  provider: Provider;
  configured: boolean;
  onSaved: () => void;
  note?: string;
}) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.saveLlmCredential(provider, apiKey);
      setApiKey("");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteLlmCredential(provider);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{PROVIDER_LABEL[provider]}</h2>
      {note && <p className="muted">{note}</p>}
      {configured ? (
        <p>
          <span className="pill">Configurada</span>{" "}
          <button onClick={() => void handleRemove()} disabled={busy}>
            Remover
          </button>
        </p>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Nenhuma chave configurada.
        </p>
      )}
      <form className="form-row" onSubmit={(e) => void handleSave(e)}>
        <input
          type="password"
          placeholder={configured ? "Substituir chave" : "Cole a chave de API"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ flex: 1 }}
        />
        <button className="primary" type="submit" disabled={busy || !apiKey.trim()}>
          Salvar
        </button>
      </form>
      {error && <p style={{ color: "var(--stop)" }}>{error}</p>}
    </div>
  );
}

export function Settings() {
  const [providers, setProviders] = useState<Provider[] | null>(null);

  async function refresh() {
    const { providers } = await api.getLlmCredentials();
    setProviders(providers);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div>
      <h1>Configurações</h1>
      <p className="muted">
        Chave de API usada pelo chat embutido (o agente que navega e testa fluxos direto no dashboard). Fica
        criptografada no servidor e nunca é enviada de volta pro navegador.
      </p>
      {providers === null ? (
        <p className="muted">Carregando…</p>
      ) : (
        <>
          <ProviderRow
            provider="anthropic"
            configured={providers.includes("anthropic")}
            onSaved={() => void refresh()}
            note="Usada se configurada — tem prioridade sobre a chave Gemini quando as duas estão presentes."
          />
          <ProviderRow provider="gemini" configured={providers.includes("gemini")} onSaved={() => void refresh()} />
        </>
      )}
    </div>
  );
}
