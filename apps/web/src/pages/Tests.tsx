import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { RunStatus, TestDetailDTO, TestDTO } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";
import { useRunStream } from "../lib/useRunStream.ts";

function statusPill(status: RunStatus | null) {
  if (!status) return <span className="pill muted">nunca rodou</span>;
  if (status === "passed") return <span className="pill ok">passou</span>;
  if (status === "running" || status === "queued") return <span className="pill warn">{status}</span>;
  return <span className="pill stop">{status}</span>;
}

export function Tests() {
  const { slug } = useParams<{ slug: string }>();
  const [tests, setTests] = useState<TestDTO[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TestDetailDTO | null>(null);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const events = useRunStream(slug ?? "", activeRunId);

  async function refreshList() {
    if (!slug) return;
    const { tests } = await api.listTests(slug);
    setTests(tests);
  }

  useEffect(() => {
    void refreshList();
    const interval = setInterval(refreshList, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!slug || selectedId == null) {
      setDetail(null);
      return;
    }
    void api.getTest(slug, selectedId).then((r) => setDetail(r.test));
  }, [slug, selectedId]);

  const lastEvent = events[events.length - 1];
  useEffect(() => {
    if (lastEvent?.kind === "status") {
      setRunning(false);
      void refreshList();
      if (selectedId != null && slug) void api.getTest(slug, selectedId).then((r) => setDetail(r.test));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  async function handleRun(testId: number) {
    if (!slug) return;
    setSelectedId(testId);
    setRunning(true);
    const { runId } = await api.runTest(slug, testId);
    setActiveRunId(runId);
  }

  if (!slug) return null;

  return (
    <div className="split">
      <div>
        <h2>Testes</h2>
        {!tests ? (
          <p className="muted">Carregando…</p>
        ) : tests.length === 0 ? (
          <p className="muted">
            Nenhum teste ainda. Peça ao assistente de IA para criar um (ferramenta <code>create_test</code>) — veja{" "}
            <Link to={`/projects/${slug}/connect`}>como conectar a IA</Link> se ainda não configurou.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Validado</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id} onClick={() => setSelectedId(t.id)}>
                  <td>{t.name}</td>
                  <td>{t.validated ? <span className="pill ok">sim</span> : <span className="pill muted">não</span>}</td>
                  <td>{statusPill(t.lastRunStatus)}</td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRun(t.id);
                      }}
                      disabled={running && selectedId === t.id}
                    >
                      Rodar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        {detail && (
          <>
            <h2>{detail.name}</h2>
            <p className="muted">{detail.description ?? "sem descrição"}</p>
            <code className="script">{detail.script}</code>
          </>
        )}

        {activeRunId != null && (
          <>
            <h2 style={{ marginTop: "1.25rem" }}>Execução #{activeRunId}</h2>
            <pre className="log">
              {events.length === 0
                ? "aguardando eventos…"
                : events
                    .map((e) => {
                      if (e.kind === "log") return e.line;
                      if (e.kind === "step") return `[${e.step}] ${e.testName}`;
                      if (e.kind === "status") return `=== status final: ${e.status} ===`;
                      return "";
                    })
                    .filter(Boolean)
                    .join("\n")}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
