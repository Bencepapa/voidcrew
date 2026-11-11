#!/bin/sh
# Starts the game on macOS / Linux: serves the "game" folder and opens the browser.
cd "$(dirname "$0")/game" || exit 1
PORT=8765
URL="http://localhost:$PORT/"
echo "Open $URL  (Ctrl+C to stop)"
( sleep 1; (command -v xdg-open >/dev/null && xdg-open "$URL") || (command -v open >/dev/null && open "$URL") ) >/dev/null 2>&1 &
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT"
else
  echo "Needs python3 (or any static web server pointed at the game folder)."
  exit 1
fi
