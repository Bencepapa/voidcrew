#!/bin/sh
# Starts the game on macOS / Linux: serves the "game" folder and opens the browser.
cd "$(dirname "$0")/game" || exit 1
PORT=8765
URL="http://localhost:$PORT/"
echo "Open $URL  (Ctrl+C to stop)"
( sleep 1; (command -v xdg-open >/dev/null && xdg-open "$URL") || (command -v open >/dev/null && open "$URL") ) >/dev/null 2>&1 &
# (the bundled textures are .webp, the AI depth model is .wasm: older Pythons don't know those types)
SERVE="import http.server, mimetypes; mimetypes.add_type('image/webp', '.webp'); mimetypes.add_type('application/wasm', '.wasm'); http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler, port=$PORT)"
if command -v python3 >/dev/null 2>&1; then
  exec python3 -c "$SERVE"
elif command -v python >/dev/null 2>&1; then
  exec python -c "$SERVE"
else
  echo "Needs python3 (or any static web server pointed at the game folder)."
  exit 1
fi
