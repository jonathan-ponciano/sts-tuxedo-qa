import { useEffect, useRef, useState } from "react";
import type { PairDebugInputEvent } from "@tuxedo-qa/shared";
import { api } from "../lib/api.ts";

interface LivePreviewPanelProps {
  slug: string;
  sessionId: number;
}

/**
 * Renders a live CDP screencast (see pair-debug/session.ts on the runner) as
 * an <img> updated on each SSE frame, with mouse/keyboard forwarded back via
 * CDP Input.dispatch* — the interactivity noVNC gave "for free" over an
 * actual VNC connection, rebuilt on top of screencast+raw input instead.
 */
export function LivePreviewPanel({ slug, sessionId }: LivePreviewPanelProps) {
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const lastMouseMoveAt = useRef(0);

  useEffect(() => {
    const source = new EventSource(api.pairDebugScreencastUrl(slug, sessionId));
    source.onmessage = (ev) => {
      try {
        const { frameBase64 } = JSON.parse(ev.data) as { frameBase64?: string };
        if (frameBase64) setFrameSrc(`data:image/jpeg;base64,${frameBase64}`);
      } catch {
        // malformed frame — skip it, the next one will arrive shortly
      }
    };
    return () => source.close();
  }, [slug, sessionId]);

  function send(event: PairDebugInputEvent) {
    void api.sendPairDebugInput(slug, sessionId, event);
  }

  /** Maps a mouse event's position on the displayed <img> to the screencast's real pixel coordinates. */
  function toFramePoint(e: React.MouseEvent<HTMLImageElement>): { x: number; y: number } | null {
    const img = imgRef.current;
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * img.naturalWidth;
    const y = ((e.clientY - rect.top) / rect.height) * img.naturalHeight;
    return { x, y };
  }

  function mouseButtonOf(e: React.MouseEvent): "left" | "right" | "middle" {
    return e.button === 2 ? "right" : e.button === 1 ? "middle" : "left";
  }

  return (
    <div>
      {!frameSrc ? (
        <p className="muted">Aguardando o primeiro frame…</p>
      ) : (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <img
          ref={imgRef}
          src={frameSrc}
          alt="Preview em tempo real da sessão de pair-debug"
          tabIndex={0}
          style={{ maxWidth: "100%", border: "1px solid var(--ink)", cursor: "default" }}
          onMouseMove={(e) => {
            const now = Date.now();
            if (now - lastMouseMoveAt.current < 40) return; // ~25fps cap, screencast itself won't exceed this anyway
            lastMouseMoveAt.current = now;
            const point = toFramePoint(e);
            if (point) send({ type: "mouseMove", ...point });
          }}
          onMouseDown={(e) => {
            const point = toFramePoint(e);
            if (point) send({ type: "mouseDown", ...point, button: mouseButtonOf(e) });
          }}
          onMouseUp={(e) => {
            const point = toFramePoint(e);
            if (point) send({ type: "mouseUp", ...point, button: mouseButtonOf(e) });
          }}
          onWheel={(e) => {
            const point = toFramePoint(e);
            if (point) send({ type: "wheel", ...point, deltaX: e.deltaX, deltaY: e.deltaY });
          }}
          onKeyDown={(e) => {
            send({ type: "keyDown", key: e.key, code: e.code, text: e.key.length === 1 ? e.key : undefined });
          }}
          onKeyUp={(e) => {
            send({ type: "keyUp", key: e.key, code: e.code });
          }}
        />
      )}
    </div>
  );
}
