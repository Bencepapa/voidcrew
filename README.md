# Void Crew

A first-person, grid-based crew dungeon crawler set aboard a derelict spaceship — built with React, Three.js and Vite.

**Play it here: https://bencepapa.github.io/voidcrew/**

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
- `src/render/reliefMesh.ts` — builds stepped wall geometry from a height map (the "Relief mesh" wall type)
- `src/components/DebugPanel.tsx` — in-game panel for switching wall texture sets and tuning rendering settings live
- `public/textures/` — wall texture sets (diffuse + normal maps) used by the renderer
- `concept/` — early concept art and AI-generated texture experiments
- `scripts/` — Gemini-based texture generation and pixel-art downscaling helpers

## Relief walls

The "Relief mesh" wall type turns a texture set's `depth.png` into real stepped geometry. Works best with a height map that:

- is pixel-aligned with `diffuse.png` (same resolution, or an exact multiple)
- uses a few flat gray levels (white = sticks out toward the player), rather than smooth gradients
- has the main wall surface as its most common gray - that level sits flush with the grid, lower levels recess, higher ones protrude

While `npm run dev` is running, saving any file under `public/textures/` rebuilds the walls in place, so a height map can be painted in GIMP/Aseprite with a live preview.
