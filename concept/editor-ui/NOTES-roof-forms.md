# Roof forms: pyramid, gable (and what was left out)

Branch `feature/roof-forms`. Request (the editor wish list): a one-cell
**pyramid** roof (a 1x1 pyramid, so towers can be capped), a roof for a **long
narrow house** (one cell wide, any length), and more roof items in general.

## 1. What the roof system covered before this work

Read first (NOTES-roof-props.md, NOTES-roof-autotile.md, the code):

- **Pieces** (`src/game/roofPieces.ts`, `ROOF_SHAPES`, prop kind `roof` in
  `props.ts`): seven props, each a heightfield over one cell, 45 degree pitch,
  described by a `profile` (slope / flat segments measured from the eave) and an
  optional `corner`: `roof_slope`, `roof_slope_flat`, `roof_flat`, `roof_corner`
  / `roof_corner_flat` (outer, hip: min of two profiles), `roof_inner` /
  `roof_inner_flat` (valley: max). Mesh: `render/roofMesh.ts` (`buildRoofGeometry`,
  planar triangles, 0.06 thick slab), texture per placement (`PropSpec.texture`).
- **Autotile** (`src/game/roofAutotile.ts`, pure): `planRoof(cells, form)` works
  out, for every painted cell, the piece, its turn and its elevation from the
  Chebyshev distance of each cell corner to the outline of the area (one area per
  floor height). Three **forms**, differing only in the cap and the pieces:
  `slope` (no cap), `flat` (cap 1) and `bent` (cap 0.5, the half-slope pieces).
  A form is the word in the roof's group id (`slope-3`), parsed by
  `parseRoofGroup` (also the validation in `mapFormat.ts`).
- **Map edits** (`src/editor/roofEdits.ts`): `paintRoof`, `eraseRoof`,
  `eraseRoofGroup`, `reevaluateRoofs` (run after every edit by
  `mapStore.applyEdit`: it regroups the props by `auto` id and calls
  `planRoof(cells, parsed.form)`), `roofGroupFor` (a stroke joins a roof of the
  same form, Ctrl starts a new one), Shift+click = the raised block, Shift +
  right button = the whole roof, one undo step per stroke (merge key). All of it
  is generic in the form: it only reads `parseRoofGroup(...).form`.
- **UI**: the asset tree group *Roof (autotile)* has one entry per form
  (`ROOF_FORMS.map` in `AssetTree.tsx`); `RoofFields.tsx` (the panel when the
  tool is in hand) has the form chooser (`roofForm`, `ROOF_FORMS`) and the
  texture picker (applies to every form: the texture is per prop, one choice for
  the whole roof). Strings `roofauto.*` in `i18n/{en,hu}/editorShell.ts`.
- **What a narrow roof did** (tests in `roofAutotile.test.ts`): a roof **one
  cell wide** has an outline on both sides of every cell and comes out as
  **flat pieces at the eave's level** (no roof at all, just a floor slab). **Two
  wide** is a real roof (a ridge between two slopes, `\vvvL` / `/^^^7`), but
  with **hipped ends**, and no gable form. An odd width (3, 5...) gets a flat
  row on the ridge, at the height the slopes reach: the true peak is "shaved".
- **A 1x1 cell** came out as one `roof_flat`. There was **no pyramid**: a square
  roof of odd size had a flat in the middle (the 3x3 = four corners, four slopes
  and a flat), an even one four hips meeting in a point (a true pyramid, but
  only from 2x2 up).
- **Not in the system**: gable ends, a ridge piece, a one-cell pyramid, a shed
  (single slope) roof, a parapet / flat roof with a rim, closed (walled) gable
  ends. (`NOTES-roof-autotile.md`: "No gable ... only what the seven pieces can
  make".)

