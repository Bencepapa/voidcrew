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
  passage), on a door turns it back into floor. Doors on a cell edge (see
  below) are still to come.
- **Prop:** the palette picks the prop; a click on a floor puts it at the
  nearest side or corner (or the center), a wall-hung one on the nearest
  side; R turns the next one; the right button takes out the one nearest
  the click.

Every edit is checked by the map loader: one that would break the map (a
ladder with no higher cell, a bridge out of its room's height...) is
refused, and the log says why.

## Lights

The Light tool works on the map's `lights` (and `lightsOff`, which
switches generated lamps off):

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
- A click on a floor or ceiling picks the cell's lamp (a generated one
  becomes the map's own) or hangs one; Shift+click (or Place: Point light)
  puts a light just off the surface pointed at; a click on a bulb picks it;
  the right button removes. The panel sets color, intensity, range and
  height; the arrows (as the party sees it) and Page Up / Down move a
  free-standing light; Delete removes it. Slider drags are one undo step.
- Light edits don't rebuild the deck: only its lighting is redone.

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
