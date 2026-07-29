import { useEffect, useState } from "react";
import type { RunProgressEvent } from "@tuxedo-qa/shared";

export function useRunStream(slug: string, runId: number | null): RunProgressEvent[] {
  const [events, setEvents] = useState<RunProgressEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    if (runId == null) return;

    const source = new EventSource(`/api/projects/${slug}/runs/${runId}/stream`);
    source.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as RunProgressEvent;
        setEvents((prev) => [...prev, event]);
        // The server ends the response after a terminal status — but SSE
        // auto-reconnects by default on any closed connection, which would
        // replay the whole buffered history again in a loop. Closing here
        // is what actually stops that.
        if (event.kind === "status") source.close();
      } catch {
        // ignore malformed frames (e.g. heartbeat comments)
      }
    };
    return () => source.close();
  }, [slug, runId]);

  return events;
}
