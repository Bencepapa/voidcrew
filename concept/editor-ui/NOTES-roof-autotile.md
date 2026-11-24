# Roof autotile

Branch `feature/roof-autotile`. The Roof tool roofs floor cells and picks, for
every cell, the roof piece (slope, outer corner, inner corner, flat), how it
is turned and how high it stands - from the cells roofed and the floor heights
around them - and works them out again at every edit, like a classic autotile.
It builds on the roof props of `NOTES-roof-props.md`; nothing new is drawn.

Code: `src/game/roofPieces.ts` (the pieces' shapes, shared with `props.ts` and
`render/roofMesh.ts`), `src/game/roofAutotile.ts` (the pure rule set),
`src/editor/roofEdits.ts` (map file edits), tests `src/game/roofAutotile.test.ts`
and `src/editor/roofEdits.test.ts`.

## The rule set

A roof is a surface made of the existing pieces: a 45 degree pitch, **one wall
height of rise per cell run** (the pieces' own size: `roof_slope` rises 1,
the bent `*_flat` ones 0.5; heights are `PropSpec.elevation`, in wall heights,
above the floor of the piece's cell - the roof's eave sits on the floor).

1. **Outline.** The cells of one roof (one `auto` group) at one floor height
   make an *area*. Its outline is where it meets a cell that is not in the
   area: a cell without roof, a wall, the map's edge, or a cell of the same
   roof at another floor height. Outline = eaves.
2. **Corner heights.** Every cell corner (a lattice point) gets a height: its
   Chebyshev distance to the outline - 0 on it, otherwise the larger of the
   two axis distances to the nearest outline point, in cells - times the pitch
   (1 per cell), capped by the form:

   | form | id | cap | pieces |
   |---|---|---|---|
   | slope only (ferde) | `slope` | none: it climbs to the ridge | `roof_slope`, `roof_corner`, `roof_inner`, `roof_flat` |
   | slope + flat (ferde es lapos) | `flat` | 1: one cell of slope, a flat top | the same |
   | slope + flat, bent | `bent` | 0.5 | `roof_slope_flat`, `roof_corner_flat`, `roof_inner_flat`, `roof_flat` |

3. **Piece per cell.** The four corner heights (NW, NE, SE, SW) differ by at
   most one step (the cap/pitch), so exactly these cases come up, and each
   piece's rotation follows (0 = unrotated; degrees clockwise seen from above;
   the eave of a slope turns south -> west -> north -> east):

   | corners | piece | rotation |
   |---|---|---|
   | all equal | `roof_flat` | 0, at the corners' height |
   | two side by side up | slope, eave on the low side | N edge up 0, E 90, S 180, W 270 |
   | one up | outer corner (hip), eaves on the two far sides | the high corner NE 0, SE 90, SW 180, NW 270 |
   | one down | inner corner (valley), eaves at the low corner | the low corner SE 0, SW 90, NW 180, NE 270 |
   | two opposite up (a saddle) | `roof_flat`, marked `approx` | - |

   `elevation` = the lowest corner's height. A rotation or elevation of 0 is
   left out of the map file.

Because neighbours share corners and the pieces run straight between them, the
roof is continuous everywhere (the tests check it along every shared edge).

### Where two slopes meet

- **Ridge / valley with a line between cells** (an even width): the slopes simply
  meet; no flat is needed.
- **Ridge in the middle of a cell** (an odd width: the middle of a 3 wide roof
  would peak half a unit above its edges): that cell becomes a **flat at the
  height its edges reach** - the roof closes at the cell's edges, only the
  peak is shaved. This is "one sloped piece replaced by a flat one".
- **Hips and valleys** at the outline's convex and concave corners are the
  existing outer / inner corner pieces. A hole in a roof is a roof outline
  too: slopes away from it, valleys at its corners.
- A saddle (an outline touching itself diagonally in ragged shapes) has no
  piece: a flat at the eave's level, marked `approx` (about 111 of 16000
  pieces in the tests' random ragged roofs).
- A roof one cell thick has an outline on both sides of every cell: it comes
  out flat at the eave's level. Two cells thick it is a ridge between two
  slopes, no flat.

### Floors: the raised block's outline

The roof follows the cells it is on, and **each floor height is a roof of its
own**: a step in the floor is an outline (an eave), and every piece's
`elevation` is relative to its own floor. So a roof laid over a raised block
and the ground beside it gives the block the roof with eaves round it. The
tool has **Shift + click**: roofs the whole raised block under the pointer
(`raisedFootprint`: the floor cells connected to it at the same height - it
must have something lower next to it, so the level ground is refused - and at
most 256 cells). Changing a floor's height re-evaluates the roof (the
re-evaluation runs after every edit: `mapStore.applyEdit` calls
`reevaluateRoofs`).

## Diagrams

Symbols: `^ > v <` slope pointing uphill, `\ L 7 /` outer corner by its high
corner SE SW NW NE, `# ` flat, `J b r q` inner corner with its low corner at
SE SW NW NE. Heights are the elevation (`h` = half).

```
3x3 slope      5x5 slope      5x5 slope+flat   5x5 bent       7x3 slope
\vL            \vvvL          \vvvL            \vvvL          \vvvvvL
>#<            >\vL<          >###<            >###<          >#####<
/^7            >>#<<          >###<            >###<          /^^^^^7
               >/^7<          >###<            >###<
heights        /^^^7          /^^^7            /^^^7          heights
000            heights        heights          heights        0000000
010            00000          00000            00000          0111110
000            01110          01110            0hhh0          0000000
               01210          01110            0hhh0
               01110          01110            0hhh0
               00000          00000            00000

L shape (slope)  hole (slope)   4x4 (slope)
\vvL             \vvvL          \vvL      heights 0000
>J^7             >J^b<          >\L<              0110
><..             ><.><          >/7<              0110
/7..             >qvr<          /^^7              0000
                 /^^^7
```

Every one of these is asserted in `roofAutotile.test.ts`.

## The tool

- **Tree:** a new group *Roof (autotile)* with three entries, one per form.
  Picking one makes the Roof tool the tool in hand with that form. Remembered
  per session (not in the map).
- **Paint:** click or drag with the left button over floor cells (3D view,
  top-down view, or a click on the minimap). Cells that are walls or doors,
  that have a hand-placed roof piece, or that belong to another roof of the
  same form are left alone; an auto piece of another form is taken over (the
  form changes). A stroke joins the roof under or next to its first cell (same
  form), else it starts a new one (ids `<form>-<n>`, n counting up, never
  reused). **Ctrl + click** starts a new roof even next to another: two
  houses side by side keep their eaves between them.
- **Erase:** right button, click or drag. Shift + right button removes the
  whole roof under the pointer. The neighbours are re-worked.
- **Whole block:** Shift + click.
- **One undo step per stroke:** the stroke's edits share a merge key
  (`mapStore.applyEdit`'s `merge`).
- **Hover:** the same cell plate as the other tools (no ghost mesh: the prop
  tools have none either).
- Locking/hiding the *Props* layer applies to the tool too.
- **Select tool:** clicking a roof piece picks it as a normal prop. Its panel
  shows *Autotile roof: <id>*, with **Detach from the autotile** / **Give
  back to the autotile**, and **Remove the whole roof**. Delete removes the
  piece (the roof closes up around it). Changing any shape setting of an auto
  piece (type, turn, height, nudge, scale, moving it) **detaches** it: it
  keeps what it is set to, and still counts as a cell of the roof for its
  neighbours. A texture chosen for one piece is set for the whole roof, and a
  new piece takes its roof's texture.
- **Manual roof props work as before**: no `auto`, never touched by the tool.

## Map format

Optional fields of a `props` entry (also `PropSpec`), backward compatible:

```json
{ "prop": "roof_corner", "x": 4, "y": 2, "at": "center", "rotation": 90, "auto": "slope-1" }
{ "prop": "roof_slope", "x": 5, "y": 2, "at": "center", "auto": "slope-1", "detached": true }
```

- `auto`: the roof's id, `<slope|flat|bent>-<number>`. The pieces with the
  same id are one roof; its form is in the id.
- `detached`: true - the tool leaves this piece's `prop`, `rotation`,
  `elevation` be.
`parseMap` rejects an `auto` that isn't of that form or isn't on a roof prop.
The tool writes `prop`, `rotation` and `elevation` of the unrotated/unraised
pieces by leaving them out, so a roof diffs small.

## Not done / limits

- **Slope only on a wide roof** climbs one wall height per cell of depth: a 10
  wide roof's ridge is 5 high. Use *slope + flat* for those.
- The ridge cell of an odd-width roof is a flat (see above), and a saddle gets a
  flat: no ridge/hip piece with a flat top exists. No new meshes were made.
- (Gable, pyramid and the true ridge/hipped ends were added later: see NOTES-roof-forms.md.)
- A roof is true 45 degrees only while the wall height setting is 1 (as for
  the hand-placed roofs); with another wall height the pieces' rise (world
  units) and `elevation` (wall heights) no longer agree.
- A roof's `elevation` goes beyond the Height slider's range (it stops at the
  cell's room height); the tool is not limited by it, but a roof taller than
  the cell's ceiling is up to the map's ceilings.
- The re-evaluation runs on every edit of a map that has auto roofs. It is
  quick (one pass per roof), but it means undoing an edit that changed a
  floor height restores the roof from the snapshot rather than recomputing it.
- Not checked in the running app (no browser available in this work): the
  pointer handling and the panel. See the hand-test list below.

## Testing by hand

1. Edit mode (Tab), top-down view (O). Raise a 5x4 block of floor with the
   Height tool (a click raises a cell 0.25: four clicks per wall height - or
   select the block on the zoomed minimap and raise the area).
2. Tree, *Roof (autotile)*, *Slope only*. Drag over the block: hips at the
   corners, slopes at the edges, a flat ridge in the middle - all at the block's
   height. Switch to *Slope + flat* and *bent* and paint a second block.
3. Right-drag a cell out of the middle: the neighbours turn into valleys.
   Undo (Z): the whole stroke comes back in one step.
4. Shift + click another raised block: it is roofed in one go. On the level
   ground Shift + click refuses.
5. Select tool, click a roof piece: *Autotile roof* panel. Turn it with R: it
   detaches. *Give back* resets it. Delete removes it and the roof closes.
6. Lower a cell's floor with the Height tool: the roof there re-forms.
7. Save, reload: the roof is intact (`auto` in the JSON).
