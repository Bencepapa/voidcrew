# Asset tree ? 2026-11-15

- Replaced the toolbar palette rows with `AssetTree.tsx`, docked below the minimap.
  The neutral editor panel and each group collapse independently; results scroll
  inside the available height. The enlarged minimap hides the tree.
- Textures have Wall/Floor/Ceiling tabs and map-default entries. Props have
  3D/Billboard/Pillar-Chamfer tabs (cross props share Billboard). Search spans
  texture surfaces and prop tabs, matches names, identifiers and category/kind,
  and preserves the existing `assetInWorld` filter.
- Props, items, actors and decals use existing choices and placement handlers.
  Choosing any entry clears the old selection. Lights and all seven existing
  particle effect kinds update the next-placement template, keeping the placing
  Inspector behavior. Non-asset tools remain in the top toolbar.
- Group eye buttons reuse hiddenLayers. Added surface and light visibility and
  included particle emitter markers. Lights hide fixtures and pooled illumination;
  baked ambient lighting and ceiling texture emissive artwork remain part of the
  surface rendering. Texture visibility hides surface panels and wall backing.
- Double-click opens the existing Asset Manager on the texture, prop, decal,
  item or NPC. Procedural light/particle presets have no Asset Manager resource;
  edit those through their placing Inspector. Map-default entries open their
  explicitly configured texture when one exists.
- Catalog texture, item and NPC names are translated for the tree; technical
  asset identifiers are retained. Search also matches English names. UI strings use
  src/i18n en/hu; existing translated group, tab and effect names are reused.
- Tree buttons release focus; search retains typing keys and Enter/Escape
  releases it. The existing keyboardFocus text-entry rules continue to apply.

Validation:
- `npx.cmd tsc --noEmit`: passed.
- `git diff --check`: passed.
- Isolated Vite server: http://127.0.0.1:3301/voidcrew/, cacheDir
  `.vite-asset-tree` (ignored). Uses configLoader runner to avoid writing the
  shared node_modules/.vite-temp directory. HTTP GET returned 200.
- Browser interaction could not be verified: native automation returned
  ?Computer Use was not approved to use Google Chrome?. Fantasy/sci-fi picking
  and placement, thumbnails, search, layer restoration, Asset Manager selection,
  WASD/Tab after clicks and the 1024x768 layout still need an interactive check.
  No browser verification is claimed.
- Commit blocked: git add and git commit both returned permission denied for
  C:/dev/js/VoidCrew/.git/worktrees/voidcrew-tree/index.lock, outside this
  writable folder. No commit or push was made.
