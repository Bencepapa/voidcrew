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

## 2. What was added

Three **forms** of the Roof tool (tree entries and the form chooser, with a line
of explanation for the chosen one) and three **pieces** (new roof props, the
asset tree lists them with the others and the Select tool places them by hand):

| prop | shape |
|---|---|
| `roof_ridge` | a tent: eaves on two opposite sides, rises 0.5 to a ridge through the middle; unturned the ridge runs east-west (rotation 90: north-south) |
| `roof_hipend` | eaves on three sides, the end of a ridge (half a pyramid); unturned the ridge goes on to the east, 90 south, 180 west, 270 north |
| `roof_pyramid` | eaves all round, a four sided pyramid 0.5 high, the peak in the middle of the cell |

Model: `RoofShape.eaves` (`roofPieces.ts`) lists the sides that have an eave
(front, back, left, right, in the piece's own space); the surface is the lowest of
the profiles run from them (`roofShapeHeight`, `roofShapeRise`). `roofMesh.ts`
cuts the squares on the cell's diagonals along them so every triangle is planar
(`roofMesh.test.ts` checks it for all ten pieces; the original seven meshes are
bit for bit what they were: compared before and after by hash). `GameViewport.tsx`
changed by one argument (`type.eaves`).

| form | id | what it does |
|---|---|---|
| Pyramid (hip, true peak) | `pyramid` | the `slope` form, but where that one shaves a flat on the top the true peak stands: a ridge piece, hipped ends or a pyramid. A lone cell = a one-cell pyramid (a tower cap); an odd square = one pyramid in the middle (the ring of slopes round it, one storey up per ring); an even square = four hips meeting in a point (as before); a rectangle = a true hip roof with a ridge; **one cell wide = a tent with hipped ends** |
| Pyramid per cell | `pyramidcell` | every painted cell is a `roof_pyramid`, elevation 0: tower caps side by side |
| Gable (narrow house) | `gable` | a ridge along the **longer side of the area** (east-west on a square), two slopes, **open straight ends**. One cell wide: a row of `roof_ridge`; two wide: two slopes meeting on the line between the cells; three: slopes and a ridge piece (true peak); and on |

Group ids: `<form>-<n>` as before, the regex now lists the six forms
(`parseRoofGroup`, `mapFormat.ts`'s message). Nothing in `roofEdits.ts` changed:
the re-evaluation reads `parseRoofGroup(...).form` and calls `planRoof`, so
painting, erasing (also Shift: the whole roof), taking a cell over with another
form, Shift+click on a raised block, Ctrl+click, one undo step per stroke, detach
and the re-evaluation after any edit work for the new forms as they did for the
old. Maps with the old forms read as before (the old forms' plans are untouched:
`roofAutotile.test.ts` passes with its numbers unchanged).

How the pyramid form finds its peaks (`peakPiece` in `roofAutotile.ts`): a cell
whose four corners are level at `c` and whose true surface still rises to `c +
0.5` in the middle is a peak; the true distance field at the middle of each side
says which sides the ridge goes on over (open: `c + 0.5`) and which come down to
the eave (closed: `c`): none open = pyramid, one = hipped end, two opposite =
ridge. A peak is kept only if the cell across each open side is a peak open
towards it too (a ragged outline would leave a half unit step otherwise: that
peak stays a flat, as in the old forms).

How the gable form lays itself out: the axis is the longer side of the area's
bounding box. Every line of cells across the ridge is a *run*; a cell's near and
far edge are at `min(distance from either end of the run)`: equal = a ridge piece
at that height, else a slope toward the higher side. A ragged area (an L) makes
runs of different widths, each with a ridge of its own height: a step with an
open face where two runs of different width meet. Different floor heights are
separate areas, as in the other forms.

Texture: unchanged, it is per prop (`PropSpec.texture`), the Roof panel's picker
and the inspector's "whole roof" rule apply to every form.

### Tests

- `src/game/roofForms.test.ts`: symbol grids for 1x1, 2x2, 3x3, 4x4, 5x5, 1x5,
  5x1, 2x6, 6x2, 3x5, 5x3, 7x5 (pyramid), 3x2 and a ragged one (per cell), and
  1x1, 1x5, 5x1, 2x6, 6x2, 3x3, 3x7, 9x3, 4x9, an L, two floor heights (gable);
  **every rectangle up to 9x9**: the pyramid form's surface equals the true
  distance to the outline everywhere (no shaved flat) and the pieces meet along
  every shared edge, the gable's equals the tent across the shorter side exactly;
  300 random ragged areas (pyramid: corners on the heights, the new pieces exact,
  the rest within half a unit, edges meet) and 200 for the gable.
- `src/render/roofMesh.test.ts`: all ten pieces' triangles planar, facing up,
  covering the cell once, peak = the rise.
- `src/editor/roofEdits.test.ts`: painting, growing, erasing, taking over with
  another form, turning of the gable's ridge when the roof grows.

Symbols in the test grids: `^ > v <` slopes (uphill), `\ L 7 /` hips, `J b r q`
valleys, `A` pyramid, `=` / `|` ridge east-west / north-south, `E S W N` the end
of a ridge by the side the ridge goes on to.

## 3. Decisions and what was left out

- **Pyramid over the area vs per cell:** both, as two forms (it cost a line).
  "Over the area" is the hip roof with a true peak: for a square one pyramid,
  for a rectangle the true hip with a ridge.
- **No roof height setting exists** (the pitch is 45 degrees, one wall height per
  cell): the new forms follow the same rule (a pyramid 1x1 is 0.5 high, a 3x3 one
  1.5 high, a 5x5 one 2.5). A taller or flatter pyramid would need pieces with
  another pitch.
- **Gable axis is automatic** (the longer side), not a setting: an area clip that
  is turned (R) keeps its roof right. Cost: a square has its ridge east-west
  always; to get north-south on a square, paint it as a rectangle first or
  place a `roof_ridge` by hand turned 90 (detach).
- **Open ends**, no walled gable triangle: the pieces are slabs 0.06 thick, a
  closed end would be a new piece with a vertical triangle to the floor. Not done.
- **Shed roof (single slope) and flat roof with a parapet: not done.** A shed has
  to know which side is high: it cannot be worked out from the cells, so it would
  be a setting or four forms (and an area clip turned by R would keep the old
  direction). A parapet needs a rim piece (a new box-like mesh on the cell's
  edge) and a decision how the rim meets neighbours: more than the pieces here. A
  plain flat roof is the `flat` form's flat top, or `roof_flat` by hand.
- Ragged areas for the gable make steps between runs of different width: a "T"
  or "L" house is better roofed as two roofs (Ctrl+click starts the second) than
  as one.
- A roof is true 45 degrees only while the wall height setting is 1 (as for all
  roofs).

## 4. Not seen

Nothing here was run in a browser. Checked by pure tests: the geometry (every
triangle planar and upward, the cell covered once), the choice and turn of each
piece, the continuity of the surface along every shared edge, the exactness of
the true peaks. **Not seen:** how the pieces look (the UVs of the new pieces use
the nearest eave's direction, so texture seams on the creases may differ from
what the old corners do), the icons and wording of the tool entries, the panel's
explanation line, orientation in 3D (it is derived from the same turn convention
the old pieces use, and `roofPieceHeightAt` is the shared check of it).

## 5. Kézi teszt (magyarul)

1. Szerkesztő mód (Tab), felülnézet (O). A Magasság eszközzel emelj egy 5x5-ös
   blokkot (vagy a minimapon jelöld ki és emeld a területet).
2. Fa -> *Tető (automata)* -> *Gúla (konty, valódi csúcs)*. Fesd be **egyetlen
   cellát**: egycellás gúla (toronysüveg), a csúcs a cella közepén. Fesd be a
   mellette lévőt is: gerinc, kontyolt végekkel; a közepét kitörölve (jobb gomb)
   két külön süveg marad.
3. Töröld az egészet (Shift + jobb gomb), fesd be az egész 5x5-ös blokkot
   (Shift + kattintás): egyetlen gúla, a csúcs a középső cella közepén; ugyanez
   3x3-on és 4x4-en (páros: a négy sarok egy pontban találkozik).
4. *Gúla cellánként*: fesd be a 3x2 cellát: mindegyik külön kis gúla, a
   szomszédok között völgy.
5. *Nyeregtető (keskeny ház)*: fesd be egy sort, 1 cella széles, 5 hosszú
   (kelet-nyugat), majd egy oszlopot (észak-dél): gerincelemek sora, a vége
   egyenesen levágott. Szélesítsd 2-re (két lejtő találkozik), 3-ra (lejtők és
   gerinc a közepén, egy emelettel feljebb). A gerinc mindig a hosszabbik oldal
   mentén fut; négyzeten kelet-nyugat.
6. Mindhárom forma: Z visszavon egy húzást egyben, mentés + újratöltés után ugyanaz,
   a Select eszközzel egy elemre kattintva az „Automata tető" panel, a textúra
   választása az egész tetőre érvényes (a tető panelen is).
7. Régi formák (csak ferde / ferde és lapos / hajlított): ugyanúgy néznek ki, mint
   eddig (a meglévő térképek, pl. a Forest, változatlanok).
8. Nézd meg a lejtők és a gerinc találkozását: ne legyen rés vagy lépcső a
   szomszédos elemek között (kivétel: a nyeregtető két eltérő széles szakasza
   között, ott a lépcső várt).