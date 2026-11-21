# Wall seam join: is the blue streak a defect?

Branch `feature/wall-seam-join`. Outcome: **no code change to the game.** The
seam join (`src/render/cornerJoins.ts`) is working; the blue/violet streaks in
the Debug "normals" view are the join strip's own shading, not a crack.

## What the streaks are

- Debug > view mode "normaltermekek" does not light anything: it shows the wall
  material's normal-map *texture* as emissive colour (`applyMaterialViews` in
  `GameViewport.tsx`). Flat texels are lavender/blue, relief texels pink/cyan.
- A join strip (`buildCornerJoins`) is a thin face (up to ~0.027 world units wide,
  the relief depth) between two panels' side edges. Its UVs run `u = edge +- s`
  (s <= 0.027), so it samples a 2-3% sliver of the texture next to the edge, which
  is mostly flat (blue) and shows as a 1-5 px vertical line beside pink relief.
- The same strip in the "faces" view is a face turned along the wall (toward a
  camera looking down the corridor), so it is blue there too.

## Evidence that it is working, not broken

Test map (fantasy world, `fantasywall1` with accent `wall5`, straight corridor,
parsed with `parseMap` and swapped in with `__voidcrewReplaceMap`), view along the
wall in normals mode, with the strip mesh moved off the camera's layers (A/B):

- **With strips:** one thin lavender line at each seam, nothing else.
- **Without strips:** black slivers (the black backing showing through) at the same
  places, i.e. real see-through gaps. So the strip is what closes them.

Join statistics for the committed dungeon (`fantasy.json`): 222 meeting points,
20 634 triangles; 77 are "straight" seams (8 464 triangles, 3 cm steps because
neighbouring panels' relief edges differ: another texture, or a panel anchored a
quarter wall height off its neighbour, so the stone pattern doesn't line up). All
are watertight; no gap was found in textured or wireframe views of the dungeon
(start view, (3,2) S and (2,4) N) or of the test corridor.

## Things I tried and measured, and then dropped

Following the "pull both edges to an intermediate line" idea I built an
experiment (kept as `concept/editor-ui/wall-seam-weld-experiment.patch`, apply
with `git apply`; not applied on this branch):

1. Weld: smooth panels get per-seam geometry copies whose edge vertices sit at the
   average of the two neighbours' heights (mixed smooth/stepped: the smooth one
   conforms to the stepped one). Result on the dungeon: straight-seam triangles
   8 464 -> 210, total 20 634 -> 12 386; on the test corridor 1 864 -> 456. Costs a
   geometry copy (positions + normals, ~100 KB) per distinct profile pair.
2. Strip shading: step faces lit with the panels' edge normal instead of their own
   facing, constant u, two halves when the textures differ (+75% strip triangles in
   that case).
3. Edge normals: a smooth panel's edge vertices take their normal from one side
   only, so two same-texture neighbours differ by 44 degrees on average (max 81)
   across the seam, measured on the vertex normals. That is a real discontinuity of
   the data, but it only spans one 1.5 cm cell and I could not see it in the textured
   screenshots, so it is not a visible defect today.

None of these fixes something that is visibly wrong, so none is on the branch. If a
cheaper dungeon is wanted, the weld alone (1) is the one with a real payoff
(fewer triangles, no steps), at the cost of more build code.

## Could not verify

- The user's exact map/camera (their local, uncommitted changes: shared textures,
  `textureTuning.json`). Their wall was salmon in the screenshot, which matches the
  "faces" view colouring or a different normal map, not my lavender normals view.
- Stepped-relief walls were only tested as the partner of a smooth panel (wall5).
- The embedded browser lost rendering when hidden, so screenshots were taken with
  canvas captures in `concept/gen/captures/` (git-ignored).
