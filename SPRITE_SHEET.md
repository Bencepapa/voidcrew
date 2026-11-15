# Adding an actor sprite sheet (NPC / enemy)

Worked example: the three fantasy sheets (`farkas`, `nekromata`, `goblin_baltas`) became `wolf1`, `necromancer1`,
`goblin2`.

## 1. The source sheet

- One PNG/WebP on a **magenta** background (#ff00ff), a grid of **5 columns x 7 rows**, one figure per cell.
- Columns = viewing angles: front, front-3/4, side, back-3/4, back.
- Rows = poses: 0 idle, 1 walk A, 2 walk B, 3 attack, 4 hit, 5 kneeling/down, 6 dead.
  (Other row counts work too: pass `--rows`, and set the row indices in the actor type.)
- Keep the figures at one scale and out of the neighbours' cells.

## 2. Cutting it into the game's sheet

Run from the repo root. Writes `public/actors/<name>/diffuse.png` (magenta keyed to transparent, figures re-placed
into exact cells, standing on the cell's bottom edge) and `normal.png`.

```bash
# default: finds every figure as a blob; fails if it counts != cols*rows
npm run actors:sheet -- --diffuse "C:/path/necromancer.webp" --name necromancer1 --cols 5 --rows 7

# if "found 33 figures, not 35" (figures touch or have specks): cut along the sheet's own gaps
npm run actors:sheet -- --diffuse "C:/path/wolf.webp" --name wolf1 --cols 5 --rows 7 --bands

# or as an exact grid (what I used for the wolf; stray pixels of neighbours can end up in cells)
npm run actors:sheet -- --diffuse "C:/path/wolf.webp" --name wolf1 --cols 5 --rows 7 --grid
```

Other flags: `--anchor top` (hung from the ceiling: turrets, cameras), `--width 96 --height 128` (output cell size),
`--source-scale` and comma-separated `--diffuse a.png,b.png --rows 3,1` (several sheets stacked into one).

Without `--depth`, a **flat** depth map is used ("no --depth: a flat one for now"), so `normal.png` is flat too.
Look at the result (`public/actors/<name>/diffuse.png`) before going on.

## 3. Hand edits to get it into the game

1. **`src/game/actors.ts`**: add an entry to `ACTOR_TYPES` (copy a similar one: `goblin1` / `ogre1` for melee,
   `mage1` for ranged). Key = the sheet name. Set `name` (shown in the log), `sheet` (the folder), `cols`, `rows`,
   `idleRow`, `walkRows`, `shootRow`, `hitRow`, `dieRows`, `wreckRow`, `height`, `hp`, `damage`, `attackRange`,
   `melee`, `tactics`, the body `parts` zones and `loot` (a key of the loot tables in `src/game/items.ts`;
   leave it out for no loot).
2. **`src/game/worlds.ts`**: add the id to `FANTASY_ASSETS` (fantasy sheets). Without it the actor counts as a
   sci-fi asset and shows up in the wrong world's palettes. (Sci-fi ones need nothing.)
3. **`src/i18n/en/assetTree.ts` and `hu/assetTree.ts`**: add `"assetTree.name.<the actor's name>"` with the
   English and Hungarian display name.
4. Glowing parts (eyes, lights): give the type a `glow` zone, then `npm run actors:emissive -- <sheet>`
   (see `scripts/make-actor-emissive.ts`).
5. `npx tsc --noEmit`, then place it from the editor's asset tree (NPCs) and check the poses in game.
   The actor sprite editor (`?editor=actors`) nudges each figure's offset: save writes `src/actors/<sheet>.json`.

## 4. When the depth map comes later

Same command again, adding the depth sheet. It must have the **same layout** as the color sheet (same grid,
poses and order); black or magenta background are both accepted.

```bash
npm run actors:sheet -- --diffuse "C:/path/wolf.webp" --depth "C:/path/wolf_depth.png" --name wolf1 --cols 5 --rows 7 --grid
```

- Use the **same cutting flags** (`--grid` / `--bands` / `--source-scale`) as before, so the figures land in the
  same cells; the depth figures are fitted onto the color ones.
- It overwrites `diffuse.png` and `normal.png` (and `depth.png`) for that name. No change to `actors.ts`,
  `worlds.ts` or the i18n files.
- If you painted `emissive.png` by hand, re-running `actors:emissive` overwrites it; pass `--keep` to leave existing ones.
- Check the normals in the viewer's "normal maps" view mode.
