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

## Decals

Bullet holes, stains, stencils and signs are projected onto the walls, floors and ceilings (three.js `DecalGeometry`), so they follow the relief steps; a decal wider than its wall panel continues onto the next panels of a straight wall. They're placed per map in `src/game/map.ts` (`decals`), in surface pixels (256 per cell, row 0 at the top), and live in `public/decals/<name>/` (`diffuse.png` with alpha, optional `normal.png`), listed in `public/decals/index.json`.

- `npm run decals:text -- --text "ENGINE ROOM" --name text_engine_room` - stenciled text from a built-in 5x7 pixel font (spelled right, unlike AI lettering), in the walls' dark red by default
- `npm run decals:import -- --sheet sheet.png [--depth sheet_depth.png] [--flat a,b] --grid 3x3 --names a,b,... --sizes 16,48,...` - cuts a grid sheet drawn on flat magenta into decals; sizes are the in-game widths in surface pixels, `-` skips a cell; `--flat` decals (paint, stains) get no normal map from the depth sheet
- `npm run decals:test` - regenerates the map's stenciled number and text decals

Painted decals read best on walls and the flat diamond plate: seen at the low angle of a floor, the grate floor's slots cut them to pieces.

The current set came from one 3x3 sheet:

```
npm run decals:import -- --sheet decals.png --depth decals_depth.png --grid 3x3 --names bullet_hole,bullet_holes,scorch,oil,claw_marks,arrow,warning,hazard_stripes,patch_plate --sizes 40,72,110,90,90,96,96,128,72 --flat oil,arrow,warning,hazard_stripes
```

Gemini prompt for a sheet (then, in a fresh chat with the sheet attached, the depth prompt - only needed for damage like holes and gouges):

> Create a sprite sheet of 9 pixel-art decals for a sci-fi spaceship dungeon crawler, arranged in a 3x3 grid of equal square cells. Each decal is centered in its own cell with a generous empty margin and does not touch the cell borders. Background: perfectly flat, uniform pure magenta (#FF00FF) everywhere outside the decals - no gradient, texture, shadow, glow, border or grid lines. Do not use magenta, pink or purple anywhere inside the decals. Orthographic front view, as if painted on or damaged into a flat metal wall; even flat lighting with no directional shading and no drop shadows. Gritty, worn pixel art with chunky pixels and a limited palette, matching dark gunmetal walls with faded dark red (#9C1B1A) and yellow-black hazard paint. Decals, left to right, top to bottom: 1. ..., 2. ..., ...

> Convert this image into a grayscale height map with exactly the same layout and shapes. Paint, stains, stencils and dirt are flat: exactly 50% gray (#808080), the same as the background, with all color, texture and lighting removed. Only physical damage has height: holes, gouges and scratches are darker the deeper they go (a hole's center near black); raised, torn metal rims are slightly lighter than 50% gray. No shadows, no lighting.

## Controls

Grid movement (default):

- Keyboard: `W`/`↑` forward, `S`/`↓` step back, `A`/`←` turn left, `D`/`→` turn right
- Mouse: moving it glances left/right (up to 60°); the view drifts back to center when the mouse rests
- Mouse drag, or touch on the right half: drag sideways to glance around; let go while looking well to one side to turn that way (the turn carries on from where you let go), or back near the middle to not turn. Up/down drags step
- Touch, left half of the view: drag up = forward, down = step back; drag left/right turns as if grabbing the view (drag left = turn right)

Free movement (untick "Grid movement" in the debug panel):

- Keyboard: hold `W`/`S` (or `↑`/`↓`) to move, `A`/`D` to strafe, `Q`/`E` (or `←`/`→`) to turn
- Mouse: click the view for mouselook (`Esc` releases)
- Touch: a virtual joystick appears where you press - left half of the view moves (and strafes), right half turns
- Walking into a closed door opens it

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
