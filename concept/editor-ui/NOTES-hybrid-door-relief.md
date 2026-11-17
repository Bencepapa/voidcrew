# Hybrid smooth relief for doors and door frames (experiment)

Branch `feature/hybrid-door-relief`. Default OFF; the stepped build is untouched.

## What it is

Debug panel, Graphics: "Doors and frames: smooth hybrid relief" (`ViewportSettings.hybridDoors`,
en + hu strings, not saved between page loads, a change rebuilds the scene).

When ON, door panels and door frames are built by `createReliefWallGeometry` with
`smooth: true, smoothHoles: true` (new option) instead of the stepped mode, whatever the map's
`reliefMode`:

- **Mesh** (`reliefMesh.ts`, `createSmoothReliefGeometry`): the usual smooth vertex grid
  (`wallDetail` cells on the long side: 64 / 32 / 16), but
  - heights are averaged over the *solid* pixels of each cell only, and the base level / stretch
    are worked out over solid cells only (a transparent pixel's colour is junk);
  - a grid quad is **omitted only when it covers no solid pixel at all** (summed-area table over
    the original mask). The "majority holes" rule was rejected: with the alpha cutout doing the
    edge, dropping a quad that still holds a thin bar would delete the bar. Quads that are partly
    solid stay, and the cutout trims them;
  - vertices where omitted and kept quads meet (the rim) are pulled back to `holeBackZ` (frames:
    `-DOOR_FRAME_HALF_DEPTH`, so the two back-to-back halves meet at the centre plane; panels:
    the lowest level). Vertices only holes used are dropped from the buffer;
  - **jambs are not built**: the rim slopes back over one cell instead, a continuous surface with
    no cracks (no T-junctions, no non-manifold edges; checked offline), so the opening gets its
    thickness as a chamfer rather than as square jamb faces. Single group (front material only);
    the side material is simply unused for these meshes;
  - `holeBounds` comes from the original mask at the height map's own resolution through the
    same function the stepped build now uses (`findHoleBounds`, extracted, no behaviour change).
    Result: identical to the stepped numbers at High (64) for every frame set; at Medium/Low the
    stepped build's bounds wobble with its coarser grid (up to about 0.006 world units), the
    hybrid's do not;
  - the far version is the same builder with `smoothLod` (up to 4, never below 8 cells), no
    separate coarse grid.
- **Pixel edge** (`GameViewport.tsx`): the door kits' front material (`wallMat`, and the labeled
  lift panel material) gets `alphaTest = 0.5`; the diffuse's alpha cuts the exact outline. The
  door kits are the doors' own (`createWallKit` per kit), no wall shares them. Nothing else was
  needed for: light grid (it patches the standard shader around `diffuseColor`, alpha untouched),
  accent/livery, AO, normal maps. The game has no shadow casting (`castShadow` is never set); if
  it ever gets one, three.js builds the depth material with the diffuse alpha for alphaTest
  materials on its own.

## Which texture sets have transparency

No set uses magenta; all transparency is real PNG alpha, and diffuse alpha equals depth alpha
(same pixel counts) in every set:

| set | kind | transparent |
|---|---|---|
| `doorframe1`, `crewdoorframe1`, `meddoorframe1` (256x229) | frame | 62% (the opening) |
| `fantasydoorframe1` (256x341, loaded at 128x170) | frame | 55% (the opening) |
| `fantasygate1` (256x341) | portcullis panel | 40% (gaps between bars) |
| `door1`, `crewdoor1`, `meddoor1`, `liftdoor1`, `crewliftdoor1`, `medliftdoor1` | panels | 0% |
| `shower1_door` | (not used by the door builder) | 59% |

The opaque panels just become plain smooth reliefs with the cutout material (no effect).

## Numbers (High, wallDetail 64; per half, i.e. a door has two frame halves and two panel halves)

Triangles (vertices) measured in the browser on the real meshes:

| part | stepped | hybrid |
|---|---|---|
| fantasy arch frame | 7632 (15264) | 2248 (1274) |
| fantasy arch, far | 768 | 158 |
| portcullis | 3976 (7952) | 3360 (2000) |
| portcullis, far | 1170 | 308 |
| sci-fi `doorframe1` | 3848 (7696) | 2940 (1644) |
| sci-fi frame, far | 1048 | 236 |
| `door1` panel (opaque) | 3956 (7912) | **8192** (4225) |
| `liftdoor1` panel (opaque) | 5866 (11732) | **8192** (4225) |
| opaque panel, far | ~1040 / 868 | 512 |

Per door, near: fantasy gate 23.2k -> 11.2k triangles (-52%); sci-fi door1 15.6k -> 22.3k (+43%).
Vertex counts are 2 to 8 times lower everywhere, triangle counts are higher for opaque panels
because a smooth grid is a fixed 64 x 64 quads however flat the panel is.
At Low (16 cells) a frame is 170 to 236 triangles (stepped with its coarse grid: about 1030 for
the sci-fi frame, offline estimate).

Geometry build time (node, includes AO, 128x170 / 256x229 maps): frame 45 -> 12 ms (arch),
60 -> 8 ms (sci-fi); gate 29 -> 8 ms; door1 71 -> 11 ms. That is 4 to 7 times faster, relevant
because doors were the most expensive part of a deck's load.

## How it looks (screenshots in `concept/gen/captures/hyb_*_on|off.jpg`, git-ignored)

Better:
- The arch's inner edge and the jamb are a clean chamfer instead of stair-stepped ledges; the
  portcullis and frame silhouettes are pixel-exact (cutout), spikes at the bar ends are crisp.
- In maps with `reliefMode: "smooth"` (the fantasy map) the frame now matches the smooth walls
  around it; stepped doors in smooth walls was a visible style break.
- Low and Medium graphics: the opening stays crisp at 170 / 690 triangles, where the stepped
  build had to coarsen the grid (and its hole outline).
- The distant version (3 cells away) looks the same as the near one; the LOD switch itself was
  not stepped through frame by frame.
- No holes or cracks seen (front, 45 degree oblique, close up at the pier, far, Low 16 cells).
  Open/close works (slider positions and `panelHeight` / `openPos` are identical to the stepped
  build in both worlds, collision does not depend on the mesh).

Worse / different:
- Different style: the stepped frame is a crisp voxel look (hard ledges, dark crevices), the
  hybrid is rounder and "puffier" at close range (stone blocks bulge, texture stretches on the
  chamfer). It is the smooth walls' look; against stepped walls it would be the odd one out.
- Thickness is a bevel, not a square reveal: the opening's depth looks softer, and at Low it is
  a wide 45 degree bevel (one 16th of the width).
- Opaque door panels cost more triangles (8192 vs 4000 to 5900) at High.
- Alpha test on mipmapped textures: far away the bars can thin a little and transparent-pixel
  colour can bleed a dark fringe (not noticeable in the captures).
- Quads that are partly solid keep their full chamfer slope under the cutout, so a bar right at
  a rim shows a slightly slanted face.

## Recommendation: keep as an option (leaning adopt for frames and holey panels)

- Adopt, as the default for frames and the portcullis in smooth-relief maps: fewer triangles and
  vertices, 4 to 7 times faster build, edges identical to the stepped ones, consistent with
  smooth walls.
- Before making it the default everywhere: build panels *without holes* coarser (32 cells, or
  from their own level count) so `door1` / `liftdoor1` stop costing 8192 triangles each half;
  decide whether the stepped voxel look matters for the sci-fi world (stepped walls there);
  persist the flag (per map `render` look, like `reliefMode`, would be the natural place) and
  maybe offer per-map choice.
- Not adopt: only if the voxel look is wanted for doors in every world.

Files: `src/render/reliefMesh.ts` (`smoothHoles`, `findHoleBounds`, hybrid branch of
`createSmoothReliefGeometry`), `src/components/GameViewport.tsx` (`hybridDoors`, `doorShape`,
`cutout`, `buildRelief` `hybrid` shape), `src/components/DebugPanel.tsx`, `src/i18n/*/debug.ts`.
