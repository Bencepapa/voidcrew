# Assets rename + sharedAuth extraction — 2026-11-17

Steps 1 and 2 of `asset-manager-textures-plan.md`, section 7.

## Step 1 — Assets / Assetek

- `assetManager.title` is now "Assets" (hu: "Assetek"). It is used by the
  window header, the dialog aria-label and the File menu's text button, so all
  three show the new name; the spoken name stays "Asset Manager".
- New key `assetManager.open` = "Asset Manager" / "Asset menedzser" is the
  tooltip and aria-label of the new icon button.
- `assetManager.assets` (the asset list heading) also uses "Assetek" in
  Hungarian now, matching the tree's word.
- `AssetTree.tsx`: a small `Library` icon button sits in the tree's header row,
  next to the search box (above the groups). It calls the existing
  `openAssetManager("material", "")`, which opens the manager on its first
  visible texture, the same default state the File menu button used.
- The File menu's Asset Manager text button was kept.

## Step 2 — sharedAuth.ts

- New `src/editor/sharedAuth.ts` exports:
  - `sharedConfigured`, `sharedProject`;
  - `sharedToken()` and `sharedRequest<T>()` (token, headers, 409/401 handling);
  - `SharedAuth`, `useSharedAuth()` (email/password fields, `signIn` token +
    editor membership check, `signOut`);
  - `sharedButton` (the shared button style) and `SharedLoginForm` (the login
    form, built with `createElement` because the module is `.ts`).
- `SharedEditor.tsx` now uses the hook and form; its map-specific work after
  sign-in (refresh, latest-revision load/confirm) stays in `SharedEditor`.
- The token is still an in-memory module value for this tab, exactly as before;
  it was not moved to `localStorage` ("storage" here means the module store).
  A small `useSyncExternalStore` subscription keeps the hook in sync when a 401
  clears the token, matching the old re-render-from-module-variable behaviour.
- `App.tsx` imports `sharedConfigured` from `sharedAuth` now.

## Validation

- `npx tsc --noEmit` passed after both commits.
- Not verified in a browser: the icon's position/appearance, opening the
  manager from it, and a real sign-in against Supabase. No dev server was run.
