# Void Crew

A first-person, grid-based crew dungeon crawler set aboard a derelict spaceship — built with React, Three.js and Vite.

## Run locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. (Optional) Set `GEMINI_API_KEY` in `.env.local` if you want to run the texture-generation scripts under `scripts/`
3. Run the app:
   `npm run dev`

## Project layout

- `src/game/` — map data, movement, and game state
- `src/components/GameViewport.tsx` — the Three.js first-person renderer
- `src/components/DebugPanel.tsx` — in-game panel for switching wall texture sets and tuning rendering settings live
- `public/textures/` — wall texture sets (diffuse + normal maps) used by the renderer
- `concept/` — early concept art and AI-generated texture experiments
- `scripts/` — Gemini-based texture generation and pixel-art downscaling helpers
