# Void Crew – tools and asset pipeline

How an AI-generated image gets into the game, which scripts and dev tools
there are, and which files to edit when adding something new.

## At a glance

| I want to add | Command / tool | Also edit |
| --- | --- | --- |
| Wall, floor, ceiling or door texture | `npm run texture:process` | `TEXTURE_SETS` in `src/render/textureSets.ts`, the map's `textures` block |
| Window (one panel) | `npm run texture:process -- --key ff00ff` | as above; `textures.window` in the map |
| Wide window (three-part strip) | `npm run texture:window-strip` | `<name>_left/_mid/_right` in `TEXTURE_SETS` |
| Door frame (cut-out opening) | `npm run texture:process -- --key ff00ff --trim` | `TEXTURE_SETS`, `textures.doorFrame` in the map |
| Decal (bullet hole, sign…) | `npm run decals:import` / `decals:text` | added to `public/decals/index.json` automatically |
| Prop (crate, bed…) | `npm run props:views` (furniture) / `npm run texture:process -- --key ff00ff` (cutouts) | `PROP_TYPES` in `src/game/props.ts`, `props` in the map |
| Actor (robot, NPC) | `npm run actors:sheet` + `?editor=actors` | `ACTOR_TYPES` in `src/game/actors.ts`, fixes in `src/actors/<name>.json`, `actors` in the map |
| New map / deck | – | a new `src/maps/<id>.json` (picked up automatically) |

## Dev server and URLs

```bash
npm run dev
```

- Game: `http://localhost:3000/voidcrew/`
- Start on a given deck: `http://localhost:3000/voidcrew/?map=deck0-crew` (a file name in `src/maps/`, without the extension)
- Actor editor: `http://localhost:3000/voidcrew/?editor=actors`
- Type check: `npm run lint`

Saving a file under `public/textures/` makes the running game reload its
textures (e.g. a height map edited in GIMP shows up right away).

### Debug panel (right of the game view; behind the ☰ menu on narrow screens)

- Grid movement: grid or free movement
- Decals: on / off
- Texture sets, wall type (flat / convex / concave / relief), relief and material sliders
- **Geometry view**: `textured` / `faces only` (faces colored by direction) / `wireframe`
- Stats: rendered triangles, draw calls and cells in sight

### Console helpers (dev mode only, in the browser console)

| Command | What it does |
| --- | --- |
| `__voidcrewTeleport(x, y, "N")` | moves the party to a cell (optional 4th argument: a height, e.g. a bridge's) |
| `__voidcrewPos()` | the party's cell and the map id |
| `__voidcrewActors()` | the actors' state (cell, facing, patrol target) |
| `__voidcrewTouch("lift")` | touches an interactive decal (e.g. a lift button) |
| `voidcrew.set({ ambientIntensity: 0.2 })` | changes a debug setting |
| `await voidcrew.capture("name")` | saves a screenshot to `concept/gen/captures/` |
| `__voidcrewPose` / `__voidcrewInput` | the free movement pose and input |
| `__voidcrewRenderInfo()` | renders a frame and returns its draw calls, triangles and cells in sight (works while the window is hidden) |
| `__voidcrewNoCull = true` | draws everything (no sight culling), to compare |
| `__voidcrewScene` | the scene's object group, for inspecting what gets drawn |

## The common image pipeline (ChatGPT)

Every asset goes through the same two or three steps. Always attach a
finished texture from the same deck as a style reference (e.g.
`public/textures/medwall1/diffuse.png`) and, if there is one, the deck's
concept sheet (`concept/`).

1. **Albedo** – a clean color image, no light or shadow:
   > STEP 1 - CLEAN ALBEDO. … Front orthographic view, no perspective. Albedo only: no lighting, no shadows, no ambient occlusion, no highlights. Square image.

   Anything to be cut out (a window opening, a door opening, an actor's
   background) must be **pure magenta `#FF00FF`**.
2. **Geometry (optional)** – the same image without paint, wear or decals, in plain grey. Often skippable.
3. **Depth map** – the same image, pixel-aligned, in a few flat grey levels:
   > STEP 3 - DEPTH / HEIGHT MAP … Preserve its EXACT geometry, layout, size and framing, pixel-aligned with it. Ignore all paint … Only a few flat grey levels: main surface mid grey, raised parts lighter, recessed seams darker. Hard edges, no lighting, no shading, no gradients, no outlines.

   Magenta areas stay magenta.

Raw images live in `concept/gen/<topic>/` (e.g. `concept/gen/medical/`,
`concept/gen/crew/`, `concept/gen/props/`, `concept/gen/actors/`). These are
the sources; the game uses the processed versions under `public/`.

## Textures (walls, floors, ceilings, doors)

```bash
npm run texture:process -- --diffuse concept/gen/crew/crew_wall_1_albedo.png --depth concept/gen/crew/crew_wall_3_depth.png --out public/textures/crewwall1
```

Output: `public/textures/<name>/diffuse.png`, `depth.png`, `normal.png`
(256 px wide, quantized to a pixel-art palette, the depth baked into a few
levels). Useful options (full list: `npm run texture:process`):

- `--key ff00ff` – the magenta background becomes transparent (windows, door frames, decals)
- `--trim` – crop to the opaque area (door frames)
- `--emissive-panel` – a mask of the glowing panel (ceiling lights)
- `--flatten-paint` – keep painted stripes out of the relief (when the depth map isn't clean enough)
- `--size`, `--colors`, `--levels` – size, palette size, depth levels

If the depth map is shifted against the albedo, align it first (rescale it
by the two images' bounding boxes), or the relief won't match the picture.

**Wiring it up:**

1. `src/render/textureSets.ts`: add an entry to `TEXTURE_SETS` - the id is
   the key; `diffuse`, `normal`, `depth`, `pixelArt: true`, plus `emissive`
   for a glowing ceiling, and a `kind` (wall/floor/ceiling/door/window/propFace)
   and `label` for the editor palette.
2. The map's `textures` block (`src/maps/<id>.json`):
   ```json
   "textures": {
     "wall": "crewwall1", "floor": "medfloor1", "ceiling": "medceil1",
     "door": "meddoor1", "liftDoor": "medliftdoor1",
     "doorFrame": "meddoorframe1", "window": "medwindow1"
   }
   ```
   Per-cell exceptions: `layers.wallTexture` / `floorTexture` / `ceilingTexture` (a character grid plus a legend).

**Wide window:** a 3:1 strip with three openings, its two mullions at 1/3 and 2/3:

```bash
npm run texture:window-strip -- --diffuse strip.png --depth strip_depth.png --name medwindow1
```

This makes `medwindow1_left`, `_mid` and `_right` (add all three to
`TEXTURE_SETS`, next to the one-panel `medwindow1`).

## Decals

- From an AI sheet (a grid on magenta): `npm run decals:import -- --sheet sheet.png --grid 3x3 --names a,b,-,c --sizes 16,64,-,48` (optionally `--depth`)
- Text from the pixel font: `npm run decals:text -- --text "ENGINE ROOM" --name text_engine_room`
- Lift buttons: `npm run decals:lift-buttons` (the combinations are at the end of `scripts/make-lift-buttons.ts`)

The scripts write `public/decals/index.json` themselves. Placing one in a map:

```json
{ "decal": "text_medical", "x": 5, "y": 1, "surface": "S", "px": 60, "py": 40 }
```

`surface`: a wall's direction (`N`/`E`/`S`/`W`), `floor` or `ceiling`; `px`/`py` on the surface's 256 px grid.
`"action": "lift"` makes it a lift button.

## Props (crates, beds…)

Four kinds, all in `PROP_TYPES` in `src/game/props.ts`. Their texture sets
don't need a `TEXTURE_SETS` entry: any folder under `public/textures/` works.

**Box** (`kind: "box"`) – one side texture and one top texture:

```ts
crate1: { kind: "box", size: [0.5, 0.4, 0.5], side: "crate1", top: "crate1_top" },
```

**From views** (`kind: "views"`) – three orthographic views (front, from the
+x end, from above), each on magenta with its own depth map. Ask ChatGPT for
one "view sheet": front view top left, side view (from the right, the front
on the left and a wall on the right) top right, top view (the front at the
bottom) below the front one; plus a depth sheet with the same layout. Then:

```bash
npm run props:views -- --sheet concept/gen/crew-props/table1.png --depth concept/gen/crew-props/table1_depth.png --name table1
```

It cuts the views apart along the magenta gaps between them, processes them
into `public/textures/<name>_front`, `_side` and `_top`, and prints their
proportions. Then the size and the boxes in `PROP_TYPES`,
measured off the front view (x length, y height, z depth, relative to the
center of its footprint on the floor):

```ts
medbed1: {
  kind: "views", views: "medbed1", size: [0.9, 0.37, 0.4], blocks: true,
  parts: [{ min: [-0.45, 0, -0.2], max: [-0.387, 0.37, 0.2] }, …],
},
```

`px` – the views' pixel sizes as `props:views` prints them (`{ front: [w, h], side: [w, h], top: [w, h] }`):
each view then covers its own extent at the front view's scale, since an AI view sheet rarely
draws the side and top exactly as tall or deep as the front. Measure parts off the flat, straight-on
parts of a view (an AI often draws a table or counter top slightly from above: leave that band out).
`blocks: true` – grid movement can't enter its cell. `wall: true` – pushed
against a side of its cell (`at`), it turns to face away from that wall.
`elevation` – mounted this high above the floor (a shelf, a fold-out table).
A part's top hidden under another part gets no face.

**Cabin** (`kind: "cabin"`) – a walk-in box seen into through its front (a
shower): a cutout `door` whose glass areas are magenta (a pane of tinted glass
goes behind it), the `inside` of its back wall as seen through the door, and
`<views>_side` / `_top` outside.

**Cutout** (`kind: "panel"`) – one relief cutout, seen from both sides: a
curtain in front of a window. **Crossed cutouts** (`kind: "cross"`) – two at
right angles: a potted plant. One image on magenta plus a depth map:

```bash
npm run texture:process -- --diffuse plant1.png --depth plant1_depth.png --out public/textures/plant1 --key ff00ff --size 128
```

```ts
curtain_open: { kind: "panel", texture: "curtain_open", size: [0.85, 0.75, 0.04], wall: true, elevation: 0.12 },
plant1: { kind: "cross", texture: "plant1", size: [0.3, 0.58, 0.3] },
```
Its texture sets also go into `TEXTURE_SETS`. In a map:

```json
"props": [{ "prop": "medbed1", "x": 2, "y": 5, "at": "S", "rotation": 90 }]
```

`at`: a direction, a corner (`NE`…) or `center`; `rotation`: degrees, clockwise seen from above.

## Actors (robots, NPCs)

1. **Generate a sprite sheet**: 5 columns (viewing angle) × rows (pose),
   equal cells, magenta background, feet on the same line everywhere.
   - Columns: front, 45° (turned toward the image's left), left profile, 135° from behind to the left, back. The game mirrors these for the right side.
   - Rows (for `robot1`): standing, left leg forward, right leg forward;
     firing; hit, collapsing; the wreck (from three sheets - see below).
   - Plus a **depth sheet** with the same layout.
   - To fix a frame, replace just that cell, in the same place.
2. **Process it** (images in `concept/gen/actors/`):
   ```bash
   npm run actors:sheet -- --diffuse concept/gen/actors/robot1_sheet_2.png,concept/gen/actors/robot1_combat.png,concept/gen/actors/robot1_wreck.png --depth concept/gen/actors/robot1_sheet_2_depth.png,concept/gen/actors/robot1_combat_depth.png,concept/gen/actors/robot1_wreck_depth.png --rows 3,3,1 --source-scale 1,1,1.16 --name robot1 --width 256 --height 256
   ```
   Several sheets go in comma-separated, their rows one after another,
   each with its row count and how much bigger than the first sheet it's
   drawn (`--source-scale`; the AI rarely keeps the scale). The AI never
   keeps to its grid, so each figure is found as its blobs (sparks and
   smoke going with the nearest figure) and cut out with only its own
   pixels - a foot or a muzzle flash reaching past its cell stays with it.
   A figure lying down (wider than tall) is centered on its middle, not its
   feet.
   Finds the figure in each cell (skipping grid lines), scales all of them
   alike, stands them on their feet, removes the magenta rim and makes the
   normal map. Output: `public/actors/<name>/diffuse.png`, `normal.png`.
3. **Align it in the editor** – `?editor=actors`:
   - left: the sheet (click, or W/A/S/D between frames),
   - middle: the frame, zoomed, with baseline and center line over a faint "ghost" (the standing pose, or the previous / next walk frame); arrow keys: 1 px, Shift + arrow: 5 px,
   - right: a preview – walking, turning round, both, or a fight (firing, falling, the wreck),
   - **Save** → `src/actors/<name>.json` (the running game picks it up), **Download JSON** → a download, **Reload sheet** → reload after reprocessing.
4. **The type**, in `ACTOR_TYPES` in `src/game/actors.ts`:
   ```ts
   robot1: {
     name: "A combat robot", sheet: "robot1", cols: 5, rows: 7,
     cellAspect: 1, height: 0.93, moveMs: 900, waitMs: 1800,
     idleRow: 0, walkRows: [1, 0, 2, 0], shootRow: 3, dieRows: [4, 5], wreckRow: 6,
   },
   ```
   `height`: in wall heights; `walkRows`: the poses played during one step;
   `shootRow`: held a moment after each shot; `dieRows`: played when it
   dies, then `wreckRow` stays (without them a dead actor fades out). The
   aiming zones (`parts`, `crits`) are fractions of a cell - widening the
   cell moves them.
   Fighting and senses are set there too (see `ActorType`): `hp`, `damage`,
   `attackRange`, `attackCooldownMs`, `accuracy`, `falloff`; `sight` and
   `fieldOfView` (unaware), `huntSight` (alert), `hearing`, `alertMs` (how
   long it stays alert without sensing the party); and `tactics`:
   ```ts
   tactics: { shotPauseMs: 250, retreat: [1, 2], seeksCover: true, advance: true, minRange: 2 },
   ```
   – holds still `shotPauseMs` after a shot, falls back `retreat` cells
   (toward cover if `seeksCover`), and steps forward into a line of fire
   before the next shot (`advance`), no closer than `minRange`. A dumb or
   heavily armored robot, or a zombie, stands its ground:
   `retreat: [0, 0], advance: false`.
   `glow: { crits: ["OPTICS", "REACTOR VENT"], intensity: 1.4 }` makes the
   sheet's bright red pixels inside those weak spots glow in their own
   color, whatever the light (flickering while stunned, out once dead).
5. **In a map**:
   ```json
   "actors": [{ "actor": "robot1", "x": 9, "y": 1, "facing": "W", "patrol": [[9, 1], [5, 1]] }]
   ```
   It walks back and forth between its patrol points.

The fix file (`src/actors/<name>.json`) stores a `[dx, dy]` shift per cell,
in sheet pixels (`cell` = the cell size). When re-cutting at another cell
size, scale the shifts to match; reset the shifts of replaced cells.

## Maps (`src/maps/<id>.json`)

Picked up automatically; `id` = the file name. The format is described at
the top of `src/game/mapFormat.ts` and in the README's "Maps" section. The
main fields:

| Field | Meaning |
| --- | --- |
| `deck` | deck number (lower = higher up the ship) |
| `layout` | `W` wall, `.` floor, `D` door |
| `layers.floor` / `ceiling` | per-cell heights (steps of 0.25) |
| `textures`, `labelColor` | the deck's texture sets, label paint |
| `lightColor`, `autoLights` | lamp color (`"#ffcf87"`); `false`: no generated mood lights |
| `lightGridDensity`, `lightGridAmbient`, `reliefDepth` | baked light samples per cell (and for its ambient part, from a coarser grid), wall relief depth (unset: the viewer's defaults) |
| `chanceWalls` | walls left to chance: `{ x, y, chance }` (their cells walls in the layout) |
| `chance`, `id`, `with`, `without` | on props, decals, lights, actors, doors, chance walls: the chance it's there, its name, the item it's only there with / without |
| `effect` (lights) | `flicker`, `spark` or `pulse`: not baked, a real light serves it |
| `texture` (props) | another texture set for a box, pillar, chamfer, panel or plant |
| `items` | loot lying about: `{ "item": "medkit", "x", "y", "count"?, "offset"?: [across, along] }` (plus `chance`, `id`, `with`, `without`) - picked up by stepping in (or Use from the cell before) |
| `exits` | ways off the ship: `{ "x", "y", "name"?: "Hangar bay" }` - standing there, Use ends the run |
| `loot` (containers) | a crate's (or shelf's) contents by hand: `[{ "item": "powercell", "count": 2 }]` (`[]`: empty); unset: rolled from its loot table (src/game/items.ts) |
| `lights` | ceiling light cells |
| `doors` | lift / standard doors, facing, label (`label`, `labelVertical`) |
| `lifts` | lift cabin, its button's wall, target map (`to`) |
| `windows`, `ladders`, `bridges` | windows, ladders, bridges |
| `props`, `actors`, `decals` | see above |

Linking two decks with a lift: both maps need a `lifts` entry pointing at
the other (`"to": "deck1-medical"`), a `kind: "lift"` door in front of the
cabin, and a `lift_btn_<deck>_<up|down>` decal with `"action": "lift"` in
the cabin.

## Loot item art

`npx tsx scripts/make-item-sprites.ts` makes the items' texture sets
(public/textures/item_<id>). It cuts `concept/gen/items/items.png` and
`items_depth.png` if they're there - an AI sheet of the ten items in a 5 x 2
grid in `ITEM_ORDER`, on magenta, and its depth sheet in the same layout
(white nearest, black behind; prompts in scripts/gen-items.ts) - else it
draws simple placeholders.
