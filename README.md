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

## Controls

- Keyboard: `W`/`↑` forward, `S`/`↓` step back, `A`/`←` turn left, `D`/`→` turn right
- Touch / mouse drag on the game view: drag up = forward, down = step back; drag left/right turns as if grabbing the view (drag left = turn right)

On phones (narrow or short screens) the game fills the screen with translucent overlay panels; the action and debug menu sits behind the ☰ button.

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

To turn a large AI-generated texture + depth map (e.g. 1024px JPEGs) into a clean texture set, run:

```
npm run texture:process -- --diffuse <color image> --depth <depth image> --out public/textures/<name>
```

It denoises and downscales to 256px pixel art (32 colors), bakes the depth into a few flat levels, fills the thin dark outlines AI depth maps draw between raised parts (e.g. pipes and their clamps), and derives `normal.png` from the depth. Run it without arguments to see the tuning options.
