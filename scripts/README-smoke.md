# Viewport smoke test

Run from the worktree root with the project dependencies and Microsoft Edge or Google Chrome installed. Playwright Core uses the installed browser. It tries headless Edge, then headless Chrome, then the headed channels if neither headless browser can initialize WebGL2. The selected browser and mode appear in the log.

```powershell
npm run smoke
npm run smoke -- --only engineering --shots
npm run smoke -- --url http://localhost:3000
```

By default the script starts Vite on a free loopback port and closes it when the run ends. Use `--url` to reuse a server that serves the app under `/voidcrew/`. The script leaves that server running. Maps run sequentially in one browser. First loads can take tens of seconds. The script prints a timing table and exits with status 1 if a check fails.

The checks cover the existing scene-ready report, a visible WebGL canvas at least 128×128, a canvas screenshot with color variation, and browser errors. The script opens the Hungarian **Hibakeresés** panel through the compact menu and checks its download button for the requested map ID. It presses **W** on the first selected map and watches for errors for another second. It saves a page screenshot on failure, and `--shots` saves one for every map under `scripts/.smoke-out/`.

The pixel check detects blank or uniform output. It does not compare reference images or verify exact lighting, effects, movement, or audio playback. The browser uses fallback fonts so the checks can run offline.

To extend coverage, add a world and map ID to the map list at the top of `smoke.mjs`. Use the world folder and filename stem from `src/maps`. The current list covers the fantasy story map, medical deck lighting, and engineering deck smoke emitters. The checked-in maps have no placed sounds. Add a sound map to the list when one is available.
