# Fantasy branch: next steps

Branch: `experiment/fantasy-textures`. Done so far: mossy wall, flagstone
floor, earth floor, stone arch, portcullis gate, torch prop, pillar props,
ogre actor, grass decals (`grass_*`).

## 1. Engine changes

| # | Task | State / notes |
| --- | --- | --- |
| 1 | **Per-map render settings**: metalness, roughness, AO (`aoIntensity`, `aoDirect`, `aoRadius`), wall height, ambient light, normal strength, relief depth/levels | Today they're the viewer's `ViewportSettings` (DebugPanel, not saved). Only `lightGridDensity`, `lightGridAmbient`, `reliefDepth` are in the map file. Add a `render` block to `MapFile` (`mapFormat.ts`), apply it over the defaults when the deck loads, and a "Save to map" button in the DebugPanel. |
| 2 | **Default wall / floor / ceiling per map** | Already there: `textures.wall/floor/ceiling` in the map file. Needs editor fields for them (and the new sets show in the palettes by `kind`). |
| 3 | **Door type per map and per door** | `textures.door` / `textures.liftDoor` / `textures.doorFrame` already override the deck's default (the portcullis: `door: "fantasygate1"`, `doorFrame: "fantasydoorframe1"`). `DoorSpec.kind` is only `standard` / `lift`. Add `DoorSpec.texture` (+ `frame`) for a different door per cell, plus an editor dropdown. |
| 4 | **Separate floor normal strength and floor relief height** | Normal strength and `reliefDepth` are one slider for everything. Split into wall / floor values (`render.floorNormal`, `render.floorRelief`). |
| 5 | **Smooth height transitions (slopes)** | The relief builder works on baked distinct levels (`quantizeHeights`). Add a per-set (or per-map) `smooth: true`: skip the quantizing and displace the mesh from the depth map directly (higher mesh resolution, normals from the smooth depth). Needed for trees, rocks, earth. `texture:process --levels 0` could write the unquantized depth. |
| 6 | **Minimap shows the map bounds while editing** | `Minimap.tsx`: in edit mode draw the whole grid (width x height) and fill the cells outside the walkable area with a faint tint, instead of only the explored cells. |
| 7 | **Open-air maps**: starry sky instead of a ceiling | `textures.ceiling: "sky"` / `map.sky = { kind: "stars" }`: no ceiling mesh, a star-field dome (points + a gradient, slowly rotating), light from the moon. Later: skybox image (cube/equirect), and side walls that open onto the skybox (`wall: "open"` cells that show the sky, a distance fog). |
| 8 | **Fire for torches** | **We already have flames**: `SmokeSpec.fire` (`smoke.ts`, `fire.ts`) = additive flame puffs, dark smoke, flickering light, burns whoever stands in the cell. For a torch, add a `fire` smoke emitter on the torch prop's top with `burns: false` (decorative) so it doesn't hurt anyone, a small `size`, and a warm `pulse`/`flicker` light. Needs: a `decorative` flag on `SmokeSpec`, and a prop option `flame: { pos, size }` so placing a torch brings its fire. |
| 9 | **Petal particles** | Reuse `smoke.ts`'s emitter with a new mode: small coloured quads, slow fall, sideways drift, a spin; blown by the `blow` wind. |

## 2. Assets to generate (Codex does albedo + depth)

`codex exec` can call its image tool from the command line (tried: works,
saves a PNG). Recipe: the albedo first, then the depth map with the albedo
attached as `-i` (prompt on stdin: `... | codex exec -i albedo.png -`) so the
two stay pixel-aligned. Then `texture:process` / `decals:import` /
`props:views` / `actors:sheet`.

**Textures (seamless, albedo + depth)**
- forest floor: leaf litter + roots (the earth one is done: `fantasyearth1`)
- cliff / rock side wall (for the open-air edges)
- thatch / timber-frame house wall, plank wall, plaster
- wooden fence, house door, wooden gate

**Decals** (on magenta, `decals:import`)
- done: grass (6 variants, `grass_*`)
- cobblestone road (a strip, straight/corner/end), carriage-wheel ruts
- puddle, mud; flower petals on the ground (pink / white)

**Props** (view sheets or cutouts, see TOOLS.md)
- trees: oak, pine, dead tree, **blossom tree**; bushes (green, berry, flowering)
- fence (straight, corner, gate), house wall segment, door, window
- treasure chest (closed / open), woodpile (stack + chopping block)
- rocks, stump, barrel, haystack, well, signpost, campfire

**Actors**
- ogre done. Next: goblin, wolf, skeleton, bandit, forest sprite (5 columns x 7 rows)

## 3. Done in this branch (for reference)

- `fantasywall1`, `fantasyfloor1`, `fantasyearth1`, `fantasygate1`,
  `fantasydoorframe1`, `fantasytorch1` texture sets; `fantasypillar1/2`,
  `fantasytorch1` props; `ogre1` actor; `grass_*` decals.
- Editor fix: new maps survive hot reloads (`mapStore.ts`).
