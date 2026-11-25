# Fences and blocks

Branch `feature/fence-blocks`. Three new building pieces, placed like the roof autotile (a stroke over cells, a group in
the asset tree beside *Roof (autotile)*), because transparent textures (a forest strip, a hedge, a wooden or iron
fence) were a constant need and neither a wall (the texture repeats upwards, no floor under it, the cells behind it
are culled) nor a raised floor (no floor texture) does them well:

| tool | id | piece | what it is |
|---|---|---|---|
| Block (*Blokk*) | `fenceblock` | `fence_block` | a full cell-sized block, texture on its four sides, 1 wall height by default; neighbouring blocks hide their shared faces; closes its cell |
| Fence on the edge (*Kerítés a szélen*) | `fenceedge` | `fence_edge` | a fence along ONE EDGE of a cell (`at`: N / E / S / W); that edge is shut, both cells can be walked right up to it |
| Fence in the middle (*Kerítés középen*) | `fencemid` | `fence_mid` | a fence through the middle of its cell, the same from both sides; turns by itself where mid pieces / blocks are next to it |

Code: `src/game/fences.ts` (all the pure logic: pieces, edge ids, the index, arms and segments, the model's faces, sight,
marks), `src/editor/fenceEdits.ts` (map file edits), `src/editor/TexturePicker.tsx`, `src/editor/inspector/FenceFields.tsx`,
the viewport's `buildFence` (`src/components/GameViewport.tsx`), tests `src/game/fences.test.ts`,
`src/game/fenceMovement.test.ts`, `src/editor/fenceEdits.test.ts`.

## The architecture decision

**The pieces are props** (`PropType.kind === "fence"`, three ids), placed by tools that paint strokes, exactly the road
the roof took - so selecting, moving, deleting (Delete), undo/redo (one undo step per stroke), saving, the map JSON,
the inspector, the layer lock/hide ("Props") and the editor's problems list are the props' own. Blocking follows
the pillars' route (`PropType.blocks` for block and mid; `propBoxes` for free movement; `passage` for grid movement).

**What differs from the roof, deliberately:** the roof stores a *computed* piece per cell (`prop` / `rotation` /
`elevation` are rewritten by `reevaluateRoofs` after every edit, and a piece can be `detached`). A fence has nothing
to compute into the file: how a piece connects (a mid piece's arms, a block's hidden faces, which piece of a run
carries the decoration) depends only on its neighbours, so it is worked out **whenever it is needed** from the props list
(`fenceIndex(map.props)`, cached per list) - the renderer, the collision, the sight check and the minimap all read the
same index. Consequences: nothing to keep in step (no re-evaluation pass, no `auto` group ids, no detach), an
edit of one cell can never leave a neighbour stale, and the file stays small (`{ "prop": "fence_mid", "x": 3, "y": 5 }`).
The viewport's model key for a piece is its `FenceModelSpec` (settings + neighbours), so a piece is rebuilt exactly when
its neighbours change what it looks like.

A separate `fences` list in the map (like `windows` / `ladders`) was the other option; it would have meant a second set
of selection, undo-merge, inspector and pick code. Not worth it: the prop machinery already does all of it.

## Map format (additive, backward compatible)

Optional fields of a `props` entry (also `PropSpec`):

```json
{ "prop": "fence_block", "x": 5, "y": 3, "texture": "fantasy_shared_0123abcd", "fence": { "height": 1.5, "opaque": false } }
{ "prop": "fence_edge",  "x": 3, "y": 3, "at": "E", "texture": "fantasywall1", "fence": { "thickness": 0.2, "top": "wall4", "deco": { "every": 4, "post": true } } }
{ "prop": "fence_mid",   "x": 3, "y": 5, "rotation": 90 }
```

- `texture`: the piece's texture set (any set with a picture: wall, prop face, door kind; a shared one too). Unset: the deck's wall set.
- `at` (edge pieces only): the side of its cell the fence stands on. **The same edge has one id however it is named**
  (the north of (3,4) is the south of (3,3)); a second piece on one edge is a mistake (the editor drops it; Problems warns).
  A block and a mid piece can't share a cell. Edge pieces may share a cell with blocks/mid pieces and with other edges.
- `rotation` (mid pieces only, 0 / 90): how a piece with NO neighbour lies - along x (east-west, 0) or along z (90).
  With neighbours the piece turns by itself. A block ignores it.
- `fence` (all optional; defaults are left out of the file; `cleanFenceStyle` pulls values into range and drops junk):

| field | meaning | default |
|---|---|---|
| `height` | wall heights (0.25..3) | 1 |
| `thickness` | cells between the two faces of an edge / mid fence (0..0.8). 0: the texture's own relief is all the thickness | 0 |
| `top` | a texture set covering the gap between a thick fence's faces; for a block: its top texture | none (a block's top: its own texture) |
| `opaque` | whether it blocks SIGHT (it always blocks bodies) | block: true; edge, mid: false |
| `deco` | `{ every: 1..32, texture?, post? }`: every `every`-th piece of a straight run is decorated - with another texture, or with a post (a 0.22 wide column, 0.1 taller than the fence, in `deco.texture` or the piece's own) standing in the line | none |

- `parseMap` errors: `fence` on a prop that is no fence piece; `fence` that isn't an object; an edge piece without
  `at` N/E/S/W; and, as for any prop, a piece in a wall / door cell. Soft values are clamped, not refused.
- `elevation` (the Height slider) lifts the model; bodies are still stopped from the floor up to its top. `scale` is ignored.

## How the pieces connect

- **Block**: one per cell. A side facing another block's cell is not drawn (transparent or not: what is shared is shared).
  Each side shows the whole texture (a tile per side, as a wall panel does); the top uses `top`, else the sides' texture.
  Faces are single-sided, outward: looking through a transparent block's holes you see the real scene behind, not the
  inside of the far face.
- **Edge fence**: one straight face along its edge, drawn from both sides (front and mirrored back, the way panels are, so
  it looks the same either way). No corner geometry: where two edge fences meet at a corner of the grid they simply
  end there (a corner post can be a prop put on top - or use `deco.post`). Runs for the decoration are the colinear edges:
  counted from the west (horizontal) or north (vertical) end, a gap starts a new run.
- **Mid fence**: *arms* are the sides that have a mid piece or a block next to them.
  - no arm: one straight face the whole cell across, along `rotation`;
  - arms on one line (one arm, or two opposite): one straight face along that line - an end piece runs right through its cell;
  - two arms at right angles (a **corner**): the texture is cut in two and the halves are joined at 90 degrees - the first
    half (u 0..0.5) runs in from the first arm to the middle, the second (u 0.5..1) out to the other, so the picture
    goes round the bend continuously, from both sides (the arms are taken clockwise from north: N->E, E->S, S->W, W->N);
  - three arms (a T): the straight line they make and a half-length stub for the odd one; four: two straight lines.
  - With a thickness, each half of a corner (and the stub of a T) reaches half the thickness past the middle, so the outer
    corner closes, and its texture range grows with it.
  - The decoration only counts on straight pieces (a corner / T / cross has none), counted from the west / north end of the
    chain of mid pieces in its row / column.
- A piece's faces are `fenceFaces(spec)`: upright relief cutouts (`buildPropRelief`, the same machinery as the
  `panel` prop: transparent texels are holes in the geometry, so a hedge or a gate really is see-through) and flat caps.
  The thickness moves the two faces apart by +-thickness/2; the `top` texture is a flat cap over the gap (none without one).

## Walkability (the rule, once)

- **Block**: the cell is closed - grid movement (the party in grid mode, NPCs, enemies, **AI pathing**: all go through
  `passage`) can't enter it; in free movement the whole cell is a solid box.
- **Edge fence**: the edge between the two cells is shut for everyone (`passage` returns `blocked`/`prop` whichever way
  the step goes, and the validator's reachability sees it, so an unfenced-in region is reported as unreachable). In free
  movement a thin box (half-width max(0.05, thickness/2)) stands on the edge and is listed under BOTH cells, so a body
  walks right up to it from either side.
- **Mid fence**: *grid movement*: the cell is closed like a block's - the party stands on cell centres, which is where the
  fence is. *Free movement* (the simplest consistent rule): the fence is a bar of the same half-width along its segments
  (arms, or straight through), and each side of the cell stays walkable up to the bar; the rest of the cell is free.
  Consequence: in free movement a body can stand in a mid fence's cell (beside the bar), the grid state (`poseCell`) then
  names a closed cell. Nothing breaks (AI pathing treats that cell as closed and ends beside it).
- **Heights**: a box blocks feet below `elevation + height` over the cell's floor (as props do); the grid ignores the height.
- **Line of sight** (`lineOfSight` - what the enemies' seeing and shooting use): only OPAQUE pieces block it, by a proper
  segment-against-box test (a thin fence can't be stepped over by the sampler); with eye heights, a piece lower than the
  line is looked over; a box that contains the line's start or end is looked out of. See-through pieces (the default for
  edge / mid fences, and any block with `opaque: false`) are looked through but stop bodies.
  `visibleCells` (which cells are drawn / lit) deliberately ignores fences: **the cells behind a transparent block always render**.
- **Shots**: the viewport's rays hit the pieces' relief geometry, so an opaque face stops a shot and the holes of a transparent
  texture let it through. (An enemy's shot also needs `lineOfSight`, above.)
- Smoke, and the baked light grid's shadows, ignore fences (a hedge is mostly gaps; no baked shadow).

## The editor

- **Tree**: group *Fences and blocks* (`fence.group`) under the roof's, three entries; always listed, like the roof tool
  (the prop ids are in `FANTASY_ASSETS`, so the world filter treats them like the roof pieces; they are left out of the
  plain Props palette and the Asset manager's list).
- **Stroke**: click / drag with the left button puts pieces in the cells crossed, right button takes them out
  (3D view, top-down view, or a click on the minimap); one undo step per stroke; the "Props" layer lock applies.
  A cell that isn't a floor cell is left alone (an edge on the border of the map goes to the floor cell next to it);
  a block put on a mid piece's cell replaces it (and the other way round).
- **Edge side**: from where you click - the cell's side nearest the pointer (the hover highlight shows that edge as a slab) -
  and a drag keeps the side it began on. Right in the middle of the cell the click doesn't say: the panel's *Edge* choice
  (from the click / north / east / south / west) decides, and with "from the click" the log asks you to pick or click nearer.
- **Panel** with a tool in hand: texture (picker), height, thickness, top, "blocks sight", decoration (none / texture / post,
  every N, its texture), and for the edge tool the side, for the mid tool how a lone piece lies.
  **Selected piece**: the same fields, plus (edge) its side, (mid) its lie, *Remove the whole run*, and the switch
  *Apply to the whole connected run*: a change of texture or settings reaches the connected pieces (blocks / mid pieces in
  the cells beside it; edges sharing a corner of the grid) that looked the same before - the ones set apart keep their own.
  A new side that another piece holds is refused.
- **Texture picker** (`TexturePicker.tsx`, one reusable component): a button with the selected texture's face and name; a
  click opens a list (thumbnail + name, a search box over 8 entries) as the asset tree shows them. Used for every
  texture field of the fence panel, and replacing the select/buttons for the roof's texture, an ordinary prop's texture,
  the deck's default textures (Map settings) and a door's leaf / frame texture.
- **Floor marks** (edit mode only; removed from the scene in play so shots' rays never hit them): a hatched square for a
  block, a strip along the edge or the bars for the fences (amber / cyan / green); they are pickable, so a hedge with
  nothing opaque in it can still be selected. **Minimap**, always: a block is an amber square with a cross (dashed when it
  is see-through), a fence a line - cyan on an edge, green through the middle (dashed when see-through) - on a dark underline.
- **Validation** (Problems panel): two pieces on one edge, two in one cell, an edge piece without a side; plus the
  reachability check sees fenced-in regions.
- **Gates**: not part of this. A door placed on a fence cell is not blocked: `reevaluateFences` (after every edit) drops the
  piece in a cell that became a door or wall, so the door tool simply replaces it. (The door tool's own `doorFits` rules - walls
  either side of the passage - still apply to any door.) An edge fence stays a barrier around a door cell; take it out where
  the gate goes.

## Foliage: layered and X fences (`feature/foliage`)

Dense plants (a hedge, tall grass, wheat) drawn as ONE transparent plane look flat and vanish edge-on. Several planes
side by side, or two crossing ones, read as a mass from every side - and because the planes are the same relief cutouts
as every fence (transparent texels are real holes, no blending), the scene shows through the gaps of each. Two new tools
in the *Fences and blocks* group, **Layered fence** (`fencelayer`) and **X fence** (`fencecross`), put down ordinary
`fence_edge` / `fence_mid` pieces with these extra settings.

**The model (why).** No new form and no new prop id: foliage is *style fields* on the existing edge / mid pieces
(`layers` 1 is the plain fence). Old maps and the three form tools are untouched, the one-id-per-edge / one-piece-per-cell
rules, undo, selection, area copy, `fenceRun` all apply as they were, and a layered edge is still *the* edge fence of
its edge for the game. A new form (`fence_layered`, `fence_cross`) would have needed its own prop ids, `PropType`s, world
lists, parse rules and a second set of problem / dedupe logic for nothing. The two tools are presets of the panel
(`fenceToolStyle`): picking one starts the panel with walkable foliage (`layers` 3, or `cross: "axes"`); the form tools
drop the foliage fields so a plain fence stays plain. The viewport treats the layered tool as the edge or mid tool
(`fenceToolForViewport`: hover highlight, strokes), the X tool as the mid tool.

**Stored format** (all optional, defaults left out, `cleanFenceStyle` pulls values into range):

```json
{ "prop": "fence_edge", "x": 4, "y": 2, "at": "N", "texture": "grass_patch_fall_01",
  "fence": { "layers": 3, "spacing": 0.2, "jitter": 0.3, "solid": false } }
{ "prop": "fence_mid", "x": 6, "y": 3, "texture": "grass_patch_fall_01",
  "fence": { "cross": "diagonal", "layers": 2, "solid": false } }
```

| field | meaning | default |
|---|---|---|
| `layers` | 1..8 parallel planes (1: the plain fence) | 1 |
| `spacing` | 0.04..0.5 cells between planes (shrunk if the stack would leave its cell: an edge stack spans at most 0.88, a mid stack 0.8) | 0.15 |
| `jitter` | 0..0.5: how much each plane is nudged (see below); 0 is regular | 0.1 |
| `cross` | mid pieces only: `"axes"` (north-south + east-west) or `"diagonal"`: two crossing planes in the cell's middle, whatever the neighbours; with `layers`, several X side by side | none |
| `solid` | `false`: bodies walk through it (written only when false) | true |

**What it works out** (`src/game/fenceLayers.ts`, pure; `foliagePlanes(spec)` lists the planes - middle, direction, yaw,
length, `sx`/`sy` size, `flip`, texture `shift`):

- edge: layer 0 exactly on the edge, the others `spacing` apart going into the cell the piece is stored in; mid: symmetric
  about its line (each straight stretch, corners included - the stubs are not slid or shifted); X: each of the two
  planes repeated the same way, perpendicular to itself.
- jitter (`unitHash` of the piece's variant, layer and plane: deterministic): a slide along the plane (alternating
  sides, up to `jitter` cells), a small nudge across (at most 0.06 and at most what the spacing leaves), a width and
  height variation (up to `0.2 * jitter`), a reversed picture, and a cyclic texture shift (quarters; the plane is cut
  in two relief panels, from the shift on and before it, so the picture goes round; use horizontally tileable
  textures). Layer 0 is always the plain plane. No colour variation (the kit materials are shared: left out).
- variants: the variant is `fenceVariant(x, y)`, 8 of them, so pieces of one style share 8 models (not one each) and
  still do not repeat row after row.
- A piece is *foliage* if `layers > 1` or it has `cross`: no thickness, top or decoration (single sheets), the panel
  hides them. `fenceModelSpec` carries `layers / spacing / jitter / cross / seed`, so the viewport's model key changes with
  them.

**Walkability (a correction of the brief).** The existing transparent fences DO stop bodies (only `opaque` is about sight).
Foliage is made walkable with the new `solid: false` (the tool presets set it; the checkbox is "Blocks movement"):
no grid-closed cell (`fenceClosesCell`, `propBlocks`), no body box (`fenceBoxes`), no shut edge (`edgeFenceBetween`), and
the validator's reachability counts the cell as open. `opaque` is independent and false by default, so sight passes; an
opaque foliage piece still blocks `lineOfSight` (its box is kept for sight only). A *solid* X is a bush: the whole cell
is closed / a whole-cell box. A solid layered piece stops bodies at its base line only (as the plain fence). An X is not
an arm of a mid fence line (`midArms`, decoration runs).

**Rendering** (`src/render/viewport/foliageMesh.ts`): the relief panels of all planes, both sides each (the fences' own
front + mirrored back convention), are baked into ONE merged geometry per piece model (2 draw calls: the front faces and
the step sides, whatever the layer count), with distant versions merged the same way under a `LOD`. The panels are the
usual cached ones (`buildRelief` caches by shape). Memory: one merged geometry per distinct style x variant (8) per scene.
A column-cut panel (`cols`, used by the shift and by the mid corners) now shares the whole panel's AO map like `rows` do
(its second UV set runs over the whole panel; before, the last cut part's own map was assigned to the kit).

**Z-fighting.** (a) Within a piece: planes never come nearer than `FOLIAGE_MIN_GAP` = 0.02 cells - `spacing >= 0.04` and
the cross nudge is capped by `(spacing - 0.02) / 2` (a test checks every plane pair over layers 1..8, spacings, jitters
and variants). (b) Across pieces: two layered edges / mids can only meet in one cell, where the kinds get fixed biases
(edge layers beyond 0 +0.0053, mid / X +0.0031 cells), so equal spacings do not make coincident planes; two edge pieces on
one edge are still the one-per-edge mistake (the first keeps it), and stacks stay inside their cell. (c) The fence
panels are geometry cutouts (transparent texels are holes; in the smooth relief mode `alphaTest` 0.5), no blending, so
draw order never matters. Per-layer `polygonOffset` was not used: separate materials per layer would break the single
merged draw call, and the geometric separation does the job (checked in the running app on adjacent 2x2 X cells).

**Editor.** The panel shows layers, spacing, jitter, X mode (mid pieces), "Blocks movement" for every non-block piece
(layer fields hide thickness / top / decoration when the piece is foliage), and the layered tool's "stands on" (edge /
middle). Floor marks: lime strips round each plane family (magenta for an X, diagonals turned). Minimap: layered
fences are up to three parallel lime bands (dashed if see-through), an X is a magenta X (diagonal or axes, up to three
offset copies for layers). Problems: *a layered fence blocks sight* (`layers > 1` and `opaque`).

**Limits.** Colour tint per layer is left out. A solid layered piece's body box is its base line only. A cyclic shift of a
non-tileable texture shows a seam. Dragging a spacing slider builds a model per value (kept until the scene is torn
down). Layers of an edge piece go into the cell it is stored in (the one the click was in).

**Manual test (hu):** a lista a `concept/verification-checklist.md`-ben (Növényzet: réteges és X kerítés).
## Not done / limits

- No special corner geometry (edge fences meeting at a grid corner just end; a post prop or `deco.post` closes it);
  the mid fence's corner is just the two halves joined at the right angle (no mitred joint).
- The decoration is a swap of texture or a post; no other models. A post stands in the line of the fence, always at the piece's middle.
- Elevation lifts the model but not the body; a fence on a ledge's edge uses the floor of the cell it is stored in.
- A mid fence is a closed cell for grid movement (see above); a half-cell walkable rule for grid movement would need the
  party to stand off the cell centres.
- Opaque pieces block `lineOfSight` only; `visibleCells` (culling and the baked light's reach) is unchanged on purpose.
- Fences cast no baked shadow and are not smoke obstacles.
- Elevation, scale (ignored) and R-turn on an edge piece do nothing useful; the arrow-key nudge sets an `offset` that is ignored.
- Not checked in the running app (no browser in this work): everything drawn - see the risks in the report - and the pointer handling.

## Tests

`npx tsx src/game/fences.test.ts` (ids, style cleaning, edge naming, the index, arms / segments / corners and their
orientation maths, the faces' yaw and positions, decoration, sight, marks, problems), `npx tsx src/game/fenceMovement.test.ts`
(map round trip and validation, grid `passage` both ways, free-movement bodies by simulating steps, line of sight), `npx tsx
src/editor/fenceEdits.test.ts` (placing, erasing, tidying, runs, edits reaching the run).

## Kézi teszt (magyarul)

1. Szerkesztő mód (Tab), fantasy térkép, egy nyílt rész. A fában a **Tető (automata)** alatt ott a **Kerítések és blokkok** csoport három eszközzel.
2. **Blokk:** válaszd, a jobb oldali panelen a Textúra gombra kattintva miniatűrös lista nyílik; válassz egy átlátszó textúrát (sövény, erdősáv). Húzz végig néhány cellán: a blokkok megjelennek, az egymás melletti blokkok közös oldala nem látszik; az átlátszó részeken át a valódi jelenet és a padló látszik (nem fekete). Magasság, „Teteje” textúra, „Eltakarja a kilátást” kapcsoló.
3. A cellák padlóján (csak szerkesztő módban) csíkos jelölés (blokk: borostyán négyzet, szélső kerítés: cián sáv a szélen, középső: zöld sáv); a minimapon borostyán négyzet kereszttel (szaggatott, ha átlátszó). Játék módban (Tab) a padlójelölés eltűnik, a minimapon marad.
4. **Kerítés a szélen:** kattints egy cella széléhez közel: a kiemelés azt a szélt mutatja, oda kerül a kerítés; húzd végig egy sor mentén: ugyanazon az oldalon sorban áll. A cella közepére kattintva a napló kéri, hogy válaszd ki a szélt a panelen (Szél: a kattintásból / észak / kelet / dél / nyugat). Mindkét szomszéd cellából el lehet menni a kerítésig, át nem.
5. **Kerítés középen:** húzz egy egyenes szakaszt, majd egy sarkot és egy T-t: az elemek maguktól fordulnak; a sarokban a textúra két felét derékszögben illesztve látod, mindkét oldalról ugyanúgy. Egyedülálló elem iránya a panelen (kelet–nyugat / észak–dél). Szabad mozgásban a cella két fele a kerítésig járható; rácsos mozgásban a cella le van zárva.
6. **Vastagság:** állíts be vastagságot (pl. 0,2) egy sövényen vagy kőfalon, és „Teteje” textúrát: a két oldal eltávolodik, a rést a tető textúra fedi. Átlátszó (sövény) és átlátszatlan (kőfal) anyaggal is.
7. **Díszítés:** „Díszítés: textúra” vagy „oszlop”, „Minden: 3”: egy egyenes szakasz minden harmadik eleme más lesz / oszlop áll benne; a szakasz módosítása eltolja a sorrendet.
8. **Kijelölés / törlés / visszavonás:** Select eszközzel kattints egy elemre (az átlátszó sövényt a padlójelölésre kattintva is eléred): a panelen az elem mezői; a textúra módosítása átmegy az összefüggő, ugyanilyen elemekre (kikapcsolható: „Az egész összefüggő szakaszra”); Delete törli; Z visszavon (egy húzás = egy lépés); „Az egész szakasz eltávolítása”.
9. **Mentés / betöltés:** mentsd el és töltsd újra: minden megvan (a JSON-ban `fence_block`/`fence_edge`/`fence_mid` elemek). Régi térkép betöltése változatlan.
10. **Játék:** a csapat, az ellenfelek és az AI útkeresés nem megy át a blokkon / a szélső kerítésen / a középső kerítésen; az átlátszó elem mögött lévő ellenség lát és lő a csapatra, átlátszatlan blokk mögött nem lát (ha a „Eltakarja a kilátást” be van kapcsolva).
11. Ajtó rakása egy kerítéscellára: a kerítés eltűnik a cellából, az ajtó áll (kapu később).
12. **Textúraválasztó** a többi helyen: tető textúra, tárgy textúra, a Térkép (deck) alap-textúrái, ajtó lapja/kerete: a kiválasztott miniatűrjével és legördülő listával.
