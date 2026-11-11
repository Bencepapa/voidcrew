# Fantasy branch: next steps

Branch: `experiment/fantasy-textures`. Done so far: mossy wall, flagstone
floor, earth floor, stone arch, portcullis gate, torch prop, pillar props,
ogre actor, grass decals (`grass_*`).

## 1. Engine changes

| # | Task | State / notes |
| --- | --- | --- |
| 1 | ~~Per-map render settings~~ | DONE: `MapFile.render` (`src/game/renderLook.ts`): metalness, roughness, AO, wall height, ambient, normal strength, relief levels, wall type, relief shape. Applied when a map opens; the debug panel's "Save to map" writes them. |
| 2 | **Default wall / floor / ceiling per map** | Already there: `textures.wall/floor/ceiling` in the map file. Needs editor fields for them (and the new sets show in the palettes by `kind`). |
| 3 | **Door type per map and per door** | `textures.door` / `textures.liftDoor` / `textures.doorFrame` already override the deck's default (the portcullis: `door: "fantasygate1"`, `doorFrame: "fantasydoorframe1"`). `DoorSpec.kind` is only `standard` / `lift`. Add `DoorSpec.texture` (+ `frame`) for a different door per cell, plus an editor dropdown. |
| 4 | ~~Separate floor normal strength and floor relief height~~ | DONE: `floorReliefDepth`, `floorNormalStrength` (0 = as the walls). |
| 5 | ~~Smooth height transitions (slopes)~~ | DONE: `reliefMode: "smooth"` (a height field, 64 cells on the long side; maps with holes stay stepped), `texture:process --smooth`. `fantasyearth1` is smooth. Props follow the wall type (flat walls: flat props). Still to try on real stone/hedges. |
| 6 | **Minimap shows the map bounds while editing** | `Minimap.tsx`: in edit mode draw the whole grid (width x height) and fill the cells outside the walkable area with a faint tint, instead of only the explored cells. |
| 7 | ~~Open-air maps: starry sky~~ | DONE (first version): the **Sky (open)** texture set (`sky`): as a ceiling or a wall (default or painted per cell) it isn't drawn and the starry sky shows through; while editing a faint pane marks it. To do: a skybox image / cube map (`map.sky`), moonlight, fog colour for the sky. |
| 8 | ~~Fire for torches~~ | DONE: `SmokeSpec.decorative` (Smoke tool: Fire > Decoration): flames and light, but no burning and the actors walk in. Next: a prop option so placing a torch brings its fire. |
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
