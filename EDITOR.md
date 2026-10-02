# Map editor – plan

A level editor for the deck maps (`src/maps/<id>.json`, see
`src/game/mapFormat.ts`). Step 1 of the order below is built (`src/editor/`):
Tab (or "Edit map" in the debug panel) toggles edit mode; a click digs out
the wall pointed at, the right button (or the Fill tool on touch) fills a
floor in; Z / Y undo and redo, Ctrl+S saves to disk, Download downloads.
Each edit rebuilds the deck's scene (about 0.2 s) - fine for now, an
incremental rebuild can come later.

## Approach: one editor, two views

Both views edit the same map file, so they are two tools on one document,
not two editors.

- **In-game (primary).** Toggle edit mode while playing and change the deck
  in place, Minecraft-style: dig walls out, fill floor back in, and put
  lights, decals and props exactly where you look. What you see is the
  final lighting and textures, and testing is instant – toggle edit mode
  off and walk.
- **2D map view (secondary).** An enlarged, editable minimap for what is
  slow or blind in 3D: painting the layout of a large area, heights as
  numbers, doors and windows on cell edges, enemy patrol routes, and
  "test from here".

| | 2D view | In-game |
| --- | --- | --- |
| Layout, large areas | fast, painted with the mouse | slow, one cell at a time |
| Heights, ladders, bridges | exact numbers | visible, but hard to pick |
| Decals, lights, props | blind (surface coordinates by guess) | click where it should be |
| Mood: light, textures | not visible | final look at once |
| Patrol routes | drawn on the map | awkward |
| Testing | "test from here" jumps into the game | just toggle edit mode off |
| Mobile | good (tap, pinch) | good with a big-button toolbar |

## Groundwork already in place

- **Picking:** the aiming raycasts already tell the wall / floor / prop /
  actor under a screen point (and the spot on its surface).
- **Saving:** the actor editor writes JSON to disk through a Vite dev
  server endpoint (`vite.config.ts`); maps can save the same way, and HMR
  reloads them at once.
- **Download:** the debug panel downloads the current map file as it is in
  the repo – the way to save when there's no dev server (the GitHub Pages
  build, a phone).
- **2D base:** the minimap already draws cells, doors, windows and bridges.
- **Format:** decals already carry surface coordinates (`px`, `py`),
  windows their wall, props their cell, anchor and rotation.
- **Testing aids:** noclip, immortal crew, `?map=<id>`, the teleport hook.

## In-game edit mode

- **Toggle:** a key (Tab or E) or a button. While editing: no combat, no
  fog, the headlamp on, enemies frozen, noclip on; the surface under the
  cursor (or crosshair on touch) is highlighted, with its cell and face.
- **Dig and fill:** click a wall to dig it out (it becomes floor at the
  neighbour's height); right-click (the Fill tool on touch) a floor to fill
  it in as wall. Digging takes what was on the wall's faces with it – the
  decals on them and the props mounted on them (shelves, posters,
  curtains); a window in it blocks the dig. Filling takes the cell's decals
  and ceiling light. Undo brings any of it back.
- The party panel is hidden while editing (no fighting, and the room).
- **Heights:** on a floor or ceiling, the wheel (or +/- buttons) raises or
  lowers it by one height step (0.25).
- **Palette** at the bottom, placing the chosen thing where you click:
  - wall / floor / ceiling texture – paints the face (or the cell's layer);
  - decal – at the exact spot on the surface, rotation with the wheel;
  - light – on the ceiling of the cell (its colour from the deck);
  - prop – in the cell, at the nearest anchor (center, sides, corners),
    rotation with the wheel;
  - window – in the wall face (width grows along the wall);
  - door / lift door – in the cell, facing the passage;
  - ladder – against the wall toward the higher neighbour;
  - enemy – in the cell, facing away from the camera.
- **Select, move, delete:** click a placed thing to select it (outlined, as
  the aiming highlight); Delete removes it, dragging moves it.
- **Undo / redo:** Z / Y (and buttons); every edit is one step on a stack of
  map file snapshots.
- **Save:** to disk through the dev server, or download (see above).

## 2D map view

- Opened by clicking the minimap in edit mode (or a key), over the game
  view.
- Paint cells wall/floor; a brush for a layer (floor height, ceiling height,
  floor/wall/ceiling texture) with the layer's legend as the palette.
- Doors and windows on cell edges; ladders and bridges as markers.
- Enemies: place, then click cells to build the patrol route.
- **Test from here:** drops the party into the picked cell facing the picked
  direction, and closes the view.
- Pan and zoom with the mouse or pinch.

## Structure tools

- **Height:** a click raises the floor or ceiling pointed at by 0.25, the
  right button lowers it (an unset ceiling stays one panel above its
  floor, so raising a floor lifts it too).
- **Ladder:** a click near a floor's edge (or on a step's face) puts a
  ladder up that side to the higher cell; again takes it out.
- **Bridge:** a click on a floor spans it the way the party faces, at the
  height of the ledges on either side; again takes it out.
- **Door:** a click on a floor makes the cell a door (its front along the
  passage) and picks it; a click on a door picks it, the right button
  turns it back into floor. The picked one moves along its passage - the
  arrows (as the party sees it; Shift: more), the Place slider, or Back
  edge / Middle / Front edge - up to flush with the cell's edge, in line
  with the walls (`offset` in the map, +-0.42 toward its front). A door
  blocks only where its plane is crossed: flush with one edge, its cell is
  walkable from that side, and it opens when gone through. Flip front
  turns it round where it stands; Label stencils the panel.
- **Prop:** the palette picks the prop; a click on a floor puts it at the
  nearest side or corner (or the center), a wall-hung one on the nearest
  side, and picks it. A click on a prop picks it, the right button takes
  it out. The picked one: arrows nudge it (as the party sees it), Page Up /
  Down raise it, R turns it 90 degrees (Shift+R: 15), Delete takes it out;
  its panel sets the turn and height, and **Stack on top** puts the
  palette's prop on top of it (`offset` and `elevation` in the map).
  **Texture** dresses a box, pillar, chamfer, panel or plant in another
  set (`texture` in the map; a box's top uses `<set>_top` if there is one).
  - **Pillars** (`pillar1`, `pillar2`) reach from the floor to the ceiling,
    widening at the foot and the head; the deck's wall texture by default.
  - **Chamfers** (`chamfer1`: half of each side cut off, `chamfer2`: 70%)
    go across a corner of the cell at 45 degrees, in the cell's wall
    texture - a click near a corner puts one there. They move and turn
    like any prop. Decoration: the cell stays walkable (free movement
    collides with a box around it).
- **Item:** the palette picks a loot item (src/game/items.ts); a click on
  a floor - or on the top of a table, a bed, a crate - puts it right there
  and picks it. A click on an item picks it, the right button takes it
  out. The picked one: arrows nudge it (Shift: more), Page Up / Down raise
  it, Delete takes it out; its panel sets the item, count, height, chance
  and links (`items` in the map). An item lying on a prop is only there
  with it.
- **Smoke:** a click on a wall, floor or anything else puts a smoke
  emitter just off that spot and picks it (a small wire marker shows it
  while editing); a click on a marker picks it, the right button takes it
  out. The picked one: arrows and Page Up / Down move it (Shift: more),
  Delete takes it out; its panel sets the amount, the puffs' size, the
  height, the color (white: steam), the chance and the links (`smokes` in
  the map) - and **Blow**: the speed it's blown out with (a vent, a burst
  pipe; 0: it just rises), with its heading (0 north, 90 east) and tilt (up
  or down from level); a line from the marker shows the way. Blown smoke
  gets about 0.6 cells far for each unit of speed, slows down and rises
  from there (walls don't stop it - aim it along the room). The puffs rise,
  widen, gather under the ceiling and fade; each takes its light from the
  baked light where it is - thick and bright in a lamp's light, thin in the
  dark.
- **Exit:** a click on a floor makes it a way off the ship (a glowing
  EXIT plate on the floor) and picks it; a click on one picks it, the
  right button takes it out; its panel sets its name ("Hangar bay" - for
  the log and the run's summary). Standing on it, Use ends the run (`exits`
  in the map).
- **Decal:** the palette shows every decal (public/decals/index.json); a
  click on a wall, floor or ceiling puts the picked one there, centered on
  the click, and picks it. A click on a decal picks it, the right button
  takes it off. The picked one: arrows move it over its surface (4 pixels,
  Shift: 16), R turns it (Shift+R: 15 degrees), Delete takes it off.

Every edit is checked by the map loader: one that would break the map (a
ladder with no higher cell, a bridge out of its room's height...) is
refused, and the log says why.

## Maps

The **Map** tool's panel:

- **Map** dropdown: opens another map straight away (no lift ride), at its
  start. The URL's `?map=` follows, so a reload stays on it.
- **+N / −N, +S / −S, +W / −W, +E / −E:** a row or column of wall added
  at that edge, or cut off (only if it's all wall with nothing placed on
  it). Adding or cutting at the north or west moves everything on the map
  (and the party) with it.
- **New map…:** asks for an id (the file name), a name and a size; all
  wall but a small lit room at the start, in the current deck's look.
  Save (or Download) keeps it.
- **Save as…:** copies the current map under a new id and name, opens it
  and (dev server) saves it. Its lifts still lead where the original's did
  - point them at the right decks for a new ship.
- **Baked light:** the map's baked light samples per cell (default: the
  debug panel's). Few (3): softer, light from a lit cell spills into the
  cells around it. Many (9+): sharper shadows, lightmap-like, but less of
  that spill. More samples bake slower (about 1 s at 12), on load and on
  every light edit.
- **Relief:** how deep the map's wall relief is (default: the debug
  panel's). Changing it rebuilds the deck.

## Variations

Every prop, decal, light and actor can have a `chance` (0..1, unset:
always) of being there. A deck is played as a variation: a seed decides
each item (src/game/variation.ts) - the same seed and deck always give the
same result, another seed another one. The seed is `?seed=` in the URL,
else a new one each start; the debug panel shows it, and Reroll makes a
new one. While editing there's no variation - everything shows, so the
panels edit the map as it is; leaving edit mode plays (and so previews)
the current variation.

The Chance slider is in the light, prop, decal, robot and door panels (all
the way up: always, left out of the file). A door left out leaves an open
doorway.

**Links:** every item can have a **Name** (`id`), and be there only
**With** (`with`) or only **Without** (`without`) the item of another name,
of any kind - a decal only with the crate it's painted on, a red lamp only
without the white one. The panels' fields offer the map's names. A prop
stacked on another is only there with it, without a link. Links round in a
circle, or to a name nothing has, don't count.

**Chance wall** tool: a click on a wall (or a floor, walled in) leaves it
to chance - a wall in some variations, an open floor in others (a caved-in
passage, a blocked corridor); its panel sets the chance and the links, and
**Plain wall** (or the right button) makes it an ordinary wall again. While
editing it shows as a wall. In the map: `chanceWalls: [{ "x", "y",
"chance" }]`, their cells walls in the layout. Its chance is the wall's;
its links speak of its opening: **With** - it opens only when that item is
there (for another chance wall: when that one opened too), **Without** -
only when it isn't. So a wide breach's side walls get `with` the middle
one's name, and loot behind a wall `with` the wall's name.

The seed also rolls the ship's mood, the same on all its decks: **light**
(dark, dim, bright - the lights' chances), **threat** (low, medium, high -
the actors') and **clutter** (sparse, normal, cluttered - the props' and
decals'). The low level divides an item's odds by 6, the high one
multiplies them by 6: a 50% item gets 14% / 50% / 86%, a 20% one 4% / 20%
/ 60%, an 80% one 40% / 80% / 96%. Items without a chance are always there
- use that for what a deck can't do without. The debug panel shows the
rolled mood and can set each part instead.

**Robot:** the palette picks the actor type; a click on a floor puts one
in (facing the party) and picks it; a click on a robot picks it, the right
button takes it out. With one picked, Shift+click on a floor adds that
cell to its patrol route (starting from where it stands); its panel sets
its facing and chance, and clears its route.

## Lights

Every light is placed on the map - nothing is generated any more (the old
mood lighting's lamps were written into the maps as ordinary lights; its
random red and blue glows and the windows' glow are gone). The Light tool
works on the map's `lights`:

```json
"lights": [
  { "x": 6, "y": 2 },
  { "x": 4, "y": 1, "pos": [-0.02, 0.5, 0.38], "color": "#ff2010", "intensity": 3, "range": 2.4 }
]
```

- A plain entry is a ceiling lamp; with `pos` (from the cell's center and
  floor: across, up in wall heights, along) it's a free-standing light,
  drawn as a small bulb. `color`, `intensity`, `range` default to the
  deck's lamp.
- A click on a floor or ceiling picks the cell's lamp or hangs one; Shift+click (or Place: Point light)
  puts a light just off the surface pointed at; a click on a bulb picks it;
  the right button removes. The panel sets color, intensity, range and
  height; the arrows (as the party sees it) and Page Up / Down move a
  free-standing light; Delete removes it. Slider drags are one undo step.
- Light edits don't rebuild the deck: only its lighting is redone.
- **Effect** (`effect` in the map): `flicker` (a failing tube: steady, with
  fits of flickering), `spark` (dark, with bursts of short bright flashes)
  or `pulse` (an alarm's slow throb). An unsteady light isn't baked: one of
  the few real lights (see the light grid) serves it while it's near, and a
  ceiling lamp's glowing panel flickers with it. Keep them few in a room.
- The baked light is shadowed by walls, floors and ceilings, props (not
  plants) and bridge decks - not by doors: it's baked as if they were all
  open.

## Map file handling

- The editor works on the `MapFile` (the JSON as written), not on the parsed
  `GameMap`, and re-parses it after every edit (parseMap is cheap) so the
  game shows it at once.
- Writing it back must keep the repo's layout, so diffs stay small: one
  value per line only when it doesn't fit in about 100 characters, and
  object keys in their original order. (Numeric-looking keys such as
  legend characters "1".."4" lose their order in a JS object, so the
  serializer has to keep the key order of the loaded file itself.)
- New maps: a size and a name, all wall, the party in a dug-out start cell.

## Mobile

- Both views work by touch; the toolbar uses big buttons, long-press stands
  in for the right click and +/- buttons for the wheel.
- Saving on a phone: download the file and copy it into the repo.

## Order

1. ✅ Edit mode toggle, highlight under the cursor, dig / fill, undo, save
   to disk and download.
2. ✅ Palette: textures, lights. Still to come: decals (at the exact spot),
   props (anchor and rotation).
3. Heights, ladders, bridges, doors, windows.
4. 2D view: painting, patrol routes, "test from here".
5. Mobile toolbar; new maps.

## Palette sources

No hand-kept list of its own – each palette reads what's already there:

- props: `PROP_TYPES` (`src/game/props.ts`);
- enemies: `ACTOR_TYPES` (`src/game/actors.ts`);
- decals: `public/decals/index.json` (written by `npm run decals:import`);
- textures: the `TEXTURE_SETS` table in `src/render/textureSets.ts` (id →
  kind: wall, floor, ceiling, door, window or prop face; and a short label),
  with `TextureSetId` derived from its keys. The palette filters it by kind:
  walls for a wall face, floors for a floor.

## Decisions

- Saving on a phone is by download only; saving to the repo needs the dev
  server on the computer.
