# Asset tree (branch feature/asset-tree, folder voidcrew-tree)

Work only in this folder. `npx tsc --noEmit` must be clean. Commit on this branch (if the sandbox blocks it, say so in the
notes); do not push. All text through `src/i18n` (en + hu). Own dev server on another port than 3000/3100/3201, with a
separate Vite cacheDir (see `concept/editor-ui/NOTES-fixes.md`). Editor UI is its own minimal style (see the existing
Inspector / top bar), not the game UI.

Implement plan-v2 section 5 ("Bal panel - asset-fa", `concept/editor-ui/plan-v2.md`, step 6 of section 13). Today the
left side has separate palette rows in `src/editor/EditorBar.tsx` (texture, prop, decal, item, NPC buttons...). Replace
them with ONE collapsible tree in a new `src/editor/AssetTree.tsx`:
- Groups: Textures (Wall / Floor / Ceiling tabs, plus "Default" = the map's own), Props (3D / Billboard / Pillar-Chamfer),
  Decals, Items, NPCs, Lights (ceiling / point; the effects), Particles (the effect kinds). Use the existing data and
  `assetInWorld` world filter; thumbnails from the images the palettes already use.
- Clicking an entry selects that kind's placing tool with that entry as the choice (what the palette buttons do now:
  `propChoice`, `itemChoice`, `robotChoice`, the texture/decal choices in `src/App.tsx`); clicking in the view places one.
  Keep the "placing" Inspector behaviour (templates) working.
- A search box (name and kind), world filter respected; an "only the active category" switch is optional.
- An eye icon per group hides/shows that layer in the view: the app already has hidden layers (`hiddenLayersRef` in
  `GameViewport.tsx`, props `hiddenLayers`...): reuse it.
- Double click on an entry opens the Asset Manager on that asset (see how it is opened today).
- Tools that are not assets (dig/fill, height, ladder, bridge, door, chance wall, start, exit, restricted) stay in the top
  tool bar, unchanged.
- Keyboard focus: after a click in the tree, WASD/Tab must still work in the 3D view (see `src/keyboardFocus.ts`), except
  while typing in the search box.
- Both languages; 1024x768 must still fit (the tree scrolls inside its panel).

## Done when
tsc clean; in the browser (fantasy and sci-fi world) every palette's items can be picked from the tree and placed, search
works, the eye icons hide layers, double click opens the Asset Manager. Write notes to
`concept/editor-ui/NOTES-tree.md`, including what you could not verify.
