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
        setEvents((prev) => [...prev, JSON.parse(msg.data) as RunProgressEvent]);
      } catch {
        // ignore malformed frames (e.g. heartbeat comments)
      }
    };
    return () => source.close();
  }, [slug, runId]);

  return events;
}
