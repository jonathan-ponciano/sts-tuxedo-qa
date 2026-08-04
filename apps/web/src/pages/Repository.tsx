import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { RepoLinkDTO, SandboxEnvironmentDTO } from "@tuxedo-qa/shared";
import { api, type LinkRepoBody } from "../lib/api.ts";

function LinkRepoForm({ slug, onLinked }: { slug: string; onLinked: () => void }) {
  const [provider, setProvider] = useState<"local" | "github">("local");
  const [localPath, setLocalPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [pat, setPat] = useState("");
  const [branch, setBranch] = useState("main");
  const [buildMethod, setBuildMethod] = useState<"dockerfile" | "node">("dockerfile");
  const [port, setPort] = useState(3000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: LinkRepoBody =
        provider === "local"
          ? { provider: "local", localPath, branch, buildMethod, port }
          : { provider: "github", remoteUrl, pat: pat || undefined, branch, buildMethod, port };
      await api.linkRepo(slug, body);
      onLinked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Vincular repositório</h2>
      <p className="muted">
        Local: caminho no disco de onde o tuxedo-qa está rodando (bind-mount direto, sem clone). GitHub: URL +
        Personal Access Token (opcional para repos públicos).
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="form-row">
          <label>
            <input type="radio" checked={provider === "local"} onChange={() => setProvider("local")} /> Local
          </label>
          <label>
            <input type="radio" checked={provider === "github"} onChange={() => setProvider("github")} /> GitHub
          </label>
        </div>

        {provider === "local" ? (
          <input
            type="text"
            placeholder="/caminho/no/host/pro/repositorio"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            required
          />
        ) : (
          <>
            <input
              type="text"
              placeholder="https://github.com/usuario/repositorio.git"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Personal Access Token (opcional, pra repos privados)"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
            />
          </>
        )}

        <div className="form-row">
          <input type="text" placeholder="branch" value={branch} onChange={(e) => setBranch(e.target.value)} required />
          <select value={buildMethod} onChange={(e) => setBuildMethod(e.target.value as "dockerfile" | "node")}>
            <option value="dockerfile">Dockerfile na raiz</option>
            <option value="node">Node/Bun (script start)</option>
          </select>
          <input
            type="number"
            placeholder="porta"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            style={{ width: 90 }}
            required
          />
          <button className="primary" type="submit" disabled={busy}>
            Vincular
          </button>
        </div>
      </form>
      {error && <p style={{ color: "var(--stop)" }}>{error}</p>}
    </div>
  );
}

function SandboxPanel({ slug }: { slug: string }) {
  const [sandbox, setSandbox] = useState<SandboxEnvironmentDTO | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const { sandbox } = await api.getSandbox(slug);
    setSandbox(sandbox);
  }

  useEffect(() => {
    void refresh();
  }, [slug]);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const { sandbox } = await api.startSandbox(slug);
      setSandbox(sandbox);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (!sandbox) return;
    setBusy(true);
    setError(null);
    try {
      await api.stopSandbox(slug, sandbox.id);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const running = sandbox?.status === "running";

  return (
    <div className="card">
      <h2>Ambiente</h2>
      {sandbox && (
        <p>
          Status: <span className={`pill ${running ? "ok" : sandbox.status === "error" ? "stop" : "warn"}`}>{sandbox.status}</span>
          {running && sandbox.internalBaseUrl && (
            <>
              {" "}
              — <code>{sandbox.internalBaseUrl}</code> (alcançável só de dentro da rede do runner; cole essa URL no
              chat ou no pair-debug)
            </>
          )}
          {sandbox.errorMessage && <span style={{ color: "var(--stop)" }}> — {sandbox.errorMessage}</span>}
        </p>
      )}
      {running ? (
        <button onClick={() => void handleStop()} disabled={busy}>
          Parar ambiente
        </button>
      ) : (
        <button className="primary" onClick={() => void handleStart()} disabled={busy}>
          {busy ? "Provisionando… (pode levar um tempo)" : "Iniciar ambiente"}
        </button>
      )}
      {error && <p style={{ color: "var(--stop)" }}>{error}</p>}
    </div>
  );
}

export function Repository() {
  const { slug } = useParams<{ slug: string }>();
  const [link, setLink] = useState<RepoLinkDTO | null | undefined>(undefined);
  const [branchInput, setBranchInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh(projectSlug: string) {
    const { link } = await api.getRepoLink(projectSlug);
    setLink(link);
    if (link) setBranchInput(link.branch);
  }

  useEffect(() => {
    if (slug) void refresh(slug);
  }, [slug]);

  if (!slug) return null;
  const projectSlug = slug;

  async function handleUnlink() {
    setError(null);
    try {
      await api.unlinkRepo(projectSlug);
      setLink(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleBranchSave() {
    setError(null);
    try {
      const { link } = await api.updateRepoBranch(projectSlug, branchInput);
      setLink(link);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <h2>Repositório</h2>
      <p className="muted">
        Vincula um repositório (local ou GitHub) a este projeto. Uma vez vinculado, você pode subir um ambiente
        isolado dele e usar o chat/pair-debug pra testar contra ele, não só contra URLs já publicadas.
      </p>

      {link === undefined ? (
        <p className="muted">Carregando…</p>
      ) : link === null ? (
        <LinkRepoForm slug={slug} onLinked={() => void refresh(slug)} />
      ) : (
        <>
          <div className="card">
            <p>
              <strong>{link.repo.provider === "local" ? link.repo.localPath : link.repo.remoteUrl}</strong>{" "}
              {link.repo.hasCredential && <span className="pill muted">token salvo</span>}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              build: {link.repo.buildMethod} · porta: {link.repo.port}
            </p>
            <div className="form-row">
              <input type="text" value={branchInput} onChange={(e) => setBranchInput(e.target.value)} style={{ width: 160 }} />
              <button onClick={() => void handleBranchSave()}>Salvar branch</button>
              <button onClick={() => void handleUnlink()}>Desvincular</button>
            </div>
          </div>
          <SandboxPanel slug={slug} />
        </>
      )}
      {error && <p style={{ color: "var(--stop)" }}>{error}</p>}
    </div>
  );
}
