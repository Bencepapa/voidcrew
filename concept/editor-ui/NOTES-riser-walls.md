# Riser walls: step faces that behave like walls

Branch `feature/riser-walls`. Goal: the side face of a raised floor (a
"riser", where a neighbour's floor is higher) can be textured on its own, take
decals and carry wall props, like an ordinary wall face. The same holds for a
"header" (the strip under a lower neighbouring ceiling).

## Cause (what was missing)

The engine already built risers as wall panels (GameViewport "The walls around
the cell": `spans`, `wallPanels`, face key `surfaceKey(lowerCell, side)`,
stacked full panels for 2-storey risers, backing panels, corner joins), and the
data model already allowed decals and wall props on them (`validate.ts`
`surfaceExists` accepts a higher neighbour floor; a decal is `x,y,surface`,
a wall prop is `x,y,at`). What was missing:

1. Texture: a face only knew its open cell's `wallTexture` (one set for ALL
   faces around the cell, walls and risers alike). No per-face override.
2. Picking: `editTargetAt` only recognised a sideways hit as a face when the
   cell behind it was a WALL. A hit on a riser fell through to "floor of the
   cell round(p)", so the Texture tool painted a floor, the Decal tool got a
   floor/ceiling `surfacePoint`, and the Prop tool put the torch on the floor.

## Address of a riser face

The open cell the face is seen from (the LOWER floor's cell; for a header the
cell with the HIGHER ceiling) plus the side toward the other cell:
`(x, y, side)`. This is exactly the existing face key / decal surface / prop
anchor, so decals and props on risers needed no new data and old maps load
unchanged.

## Data model: `faceTextures`

Map file (optional, default none):

```json
"faceTextures": [ { "x": 7, "y": 4, "face": "E", "texture": "fantasywall1" } ]
```

* `x, y, face`: as above. `texture`: any texture set id (`"sky"` opens the face
  onto the sky, like for walls).
* Parsed to `GameMap.faceTextureAt(x, y, side)`. Stale entries (cell turned
  to wall, bad side) are ignored, never an error.
* Precedence for a face: `faceTextureAt` (only when the neighbour is NOT a
  wall - it applies to step faces and headers, not to wall faces), then the
  cell's `wallTexture`, then the deck's wall/accent mix. A face with no entry
  looks exactly as before. Riser and header of the same `(x,y,side)` share one
  entry.
* Editor bookkeeping (`mapEdits.ts`): `paintFace` (null removes the entry),
  entries move with N/W resizes (`shiftAll`), are counted by `allPositions`,
  and are dropped when their cell is filled (`fill`, `clearCells`).
* `structureKey` includes the list (it is part of the file), the quick edit
  preview (`editPreview.changedCells` + the `wall` material callback in
  `applyStructure`) honours it, and `mapUses` (texture in use) counts it.

## Rendering

`GameViewport` wall loop: `faceSet` takes `map.faceTextureAt` before the cell's
`wallTexture`. Panels, stacking (a one-storey texture is shown once per storey,
two panels for a 2-storey riser), backing, relief and corner joins are
untouched, since only the kit a slot goes into changes.

## Editor

`EditTarget.face = { cell, side, part: "riser" | "header" }` is set when the
pointer is on the plane between two open cells whose floors (ceilings) differ
(plane distance check, so relief step sides do not count). `kind` stays
`"floor"`: a riser is not a wall to dig, so Dig / Fill keep their meaning;
`cell` is now the open cell the face belongs to (before: whichever cell
`round(p)` gave). `surfacePoint` is the face as a decal surface.

* Texture tool: paints a `faceTextures` entry with the wall palette (the
  palette follows the hover as "wall"); right button clears it back to the
  cell's own set. Log line `app.faceTextureAt` (en + hu).
* Decal tool: places/drags/picks decals on the face (surfacePoint is now the
  riser; saved decals on risers reload correctly, shown in the browser).
* Prop tool: a `wall: true` prop clicked or dragged onto a face goes into the
  lower cell, anchored to the side, at the height pointed at
  (`faceElevation`: pointer height minus half the prop, minus the prop type's
  own mount height, clamped to the face, rounded to 0.05). The torch's flame
  uses the same elevation.
* Highlight: a slab on the face plane, as tall as the step, for Texture (paint
  colour), Decal and Prop (add colour).

## Verified in the browser (fantasy world, own test map, deleted afterwards)

Two 3x3 blocks, floor +1 and +2 (ground ceiling 3.5):
* hover/pick of a 2-storey riser from first person gives the face; clicking
  with the Texture tool wrote the face's own set; reloading restored it from
  the draft; the face next to it kept the deck's set; two panels per 2-storey
  riser each show the full texture.
* faceTextures from the file: one face of the 1-storey block set to `sky`
  (opening), three faces of the 2-storey block to another set.
* Decal tool placed decals on the lower and upper storey of the 2-storey
  riser; a file decal on a riser draws correctly.
* Prop tool hung a torch on the upper storey (lit the face with its flame
  light); a torch from the file at the default height too.
* Tilted top-down view (Ctrl+wheel): hover picks risers (north face of block B
  and a west face) with the right cell and side.

## Not done / not verified

* Header (lowered ceiling strip): same code path (`part: "header"`, same
  override), but not exercised in the browser.
* Window texture sets on risers: the facade texture's own holes work like on
  any wall (the backing panel is built for risers); the `windows` list
  (frames with glass and star glow) still only applies to wall cells, so a
  riser cannot get a glass window - only a texture with a hole/window painted
  in.
* A riser is only as tall as `min(ceiling of the lower cell, floor of the
  higher one)`. Raising a block by 2 over ground whose ceiling is still
  floor+1 gives a one-panel riser; raise the ground's ceiling too (the Height
  tool on the ceiling). Not changed here.
* The Texture tool on an ordinary wall face still paints the whole open cell
  (all its faces); per-face textures are only for step faces. `faceTextureAt`
  is ignored for wall faces on purpose.
* Dragging a wall prop from a riser to an ordinary wall keeps its elevation;
  moving it onto a riser sets the elevation from the pointer.
* Elevation of a prop uses the Decal-style 256-row surface space of the first
  panel; very high props on a face taller than 3 storeys not tried.
* `npx tsc --noEmit` is clean; no automated tests exist for the editor.
* `shiftAll`/`allPositions` do not list `chanceWalls` (existing, unrelated):
  growing the map at the N/W edge does not move chance walls.
