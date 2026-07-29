#!/bin/sh
set -e

# Xvfb backs the headed browser start_pair_debug launches; x11vnc exposes that
# display over VNC; websockify bridges VNC to a WebSocket so the dashboard can
# embed it in an iframe. All three are backgrounded — the container's
# lifecycle is tied to the Bun server (the final `exec`), not to these.
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &

for i in $(seq 1 50); do
  [ -e /tmp/.X11-unix/X99 ] && break
  sleep 0.2
done

x11vnc -display :99 -forever -shared -nopw -quiet -rfbport 5900 &
websockify --web=/usr/share/novnc 6080 localhost:5900 &

export DISPLAY=:99
exec bun run src/main.ts
