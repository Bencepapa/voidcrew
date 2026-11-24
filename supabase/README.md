# Shared editor trial

The Pages build can connect to a Supabase project for shared maps and PNG textures. Each save appends a map revision. Only the latest revision of each map appears in the shared list. A stale save gets a conflict and the editor can save a separate copy.

## Set up a dedicated Free project

1. Create a project at [Supabase Dashboard](https://supabase.com/dashboard). Run [shared-editor.sql](./shared-editor.sql), then [shared-map-authors.sql](./shared-map-authors.sql), then [shared-texture-folders.sql](./shared-texture-folders.sql) in its SQL Editor. For an existing trial, run only the ones it hasn't had yet: the second records the author and time of new saves, the third lets the texture bucket take the `meta.json` files of the Assets window's textures.
2. Under **Authentication → Users**, create and confirm two test accounts with passwords. Turn off public signups for this private trial. Grant editor access to those accounts by running the following SQL with their actual email addresses.

   ```sql
   insert into public.void_editors (user_id)
   select id from auth.users where email in ('anna@example.com', 'bela@example.com')
   on conflict do nothing;
   ```

3. In the GitHub repository under **Settings → Secrets and variables → Actions → Variables**, set `VITE_SUPABASE_URL` to the project URL and `VITE_SUPABASE_PUBLISHABLE_KEY` to the public project key. Run **Deploy to GitHub Pages** again. For local development the same variable names can go in Vite's local environment file. The browser bundle includes these values. Use only a publishable or legacy anon key.

Publishing requires editor access. To allow guests to open shared maps and list textures, run [shared-public-read.sql](./shared-public-read.sql). Guests can read existing map revisions. Uploaded texture images have public read URLs, so use assets suitable for public distribution. PNG uploads are limited to 8 MiB per file.

### Bundling shared content for a release

Run `npm run pull:shared` before building the release. The script uses the publishable credentials from the environment or the local Vite environment files. It downloads the latest published map and texture revisions, generates Auto normal and depth maps, and writes the bundled asset catalog. The original IDs are kept so existing maps can still find their textures.

To preview the import in a separate directory, run `npm run pull:shared -- <output-directory>`. The importer preserves existing files and reports when a newer shared revision is available. Review the imported files before including them in a release.

`npm run pull:shared -- --list` only says what would be bundled (and what is kept as it is); it writes nothing and downloads no images. The script bundles textures, stills, decals, pickups (the picture plus its normal and depth maps and its look), props, door types, NPCs, dialogues, shops and maps.

Without bundled content a guest on the public build loads only what the map on screen references, by id (no store listing); the editor, a signed-in editor and `?shared=on` load the whole store (see `src/editor/autoSharedPolicy.ts`). Bundling the finished content makes the guest path need no request at all.

### Textures

Shared textures are made and published in the editor's **Assets** window (**+ New texture**, then **Publish** in the yellow bar), not in the Shared maps dialog. Publishing only ever adds files (editors can insert and select; nothing is updated). Deleting a whole texture from the Assets window needs the delete policy in [shared-texture-folders.sql](./shared-texture-folders.sql):

```
void-textures/<world>/<uuid>-name.png              old flat files: still read as before (flat normal and depth, floor and wall)
void-textures/<world>/<uuid>/r<rev>/meta.json      name, kinds (wall/floor/ceiling), pixelArt, rev, transparency, the mode of every map, the Auto recipe
void-textures/<world>/<uuid>/r<rev>/diffuse.png    plus normal.png, depth.png, surface.png (gloss in green, metal in blue), emissive.png: only the uploaded ones
```

`meta.json` is uploaded last and the loader uses the highest `r<rev>` folder that has one, so a half-published folder is never shown. Publishing again adds the next `r<rev>` folder, which replaces the old one in the game; the old one stays in storage, unlisted. Auto maps are not stored: the browser makes them from the diffuse. Publishing needs [shared-texture-folders.sql](./shared-texture-folders.sql) to have been run (it adds `application/json` to the bucket's allowed types and a Storage delete policy for editors; the insert and select policies already cover the folders). A texture's look tuning (normal strength, relief depth, roughness, metalness) and its smooth-relief flag are part of its `meta.json`.

The **Portraits and decals** panel uses the same PNG bucket and policies. Images are stored under `<world>/portrait/<uuid>/r<rev>/` or `<world>/decal/<uuid>/r<rev>/`. The release importer includes both image types. Published decals appear in the editor's decal palette.

### Lossless WebP colour maps (NPC sprite sheets)

An NPC's colour map is published as `diffuse.webp` when a lossless WebP is smaller than the PNG and decodes to exactly the same visible pixels, otherwise as `diffuse.png`. The file name is stored in the NPC's `meta.json` (`definition.diffuseFile`; revisions without it use `diffuse.png`). The normal map stays PNG. Run [shared-webp-mime.sql](./shared-webp-mime.sql) once so the bucket accepts `image/webp`; until then the editor falls back to PNG and says so. The 8 MiB limit applies to whichever file is stored.


## Try it from two browsers

1. Open the same game world in two browser profiles. Enter the editor with **Tab**, click **Shared maps** and sign in with different accounts.
2. Make two differently named maps with the Map tool. In the first browser, make a texture in the **Assets** window (**+ New texture**, a diffuse PNG, **Publish**), then paint it onto the first map. Use **Shared maps → Save** in each browser.
3. Reload both pages, sign in and open **Shared maps**. Both maps should appear. Open the textured map from the second browser and check the painted surface.
4. For the conflict test, open the same shared revision in both browsers. Save an edit in the first. Saving from the second must show a conflict. Use **Save as separate copy**, refresh the list and check both versions.

The editor's Download button exports the local map JSON. The shared PNG files live in the project's `void-textures` bucket. This trial does not bundle them into that download.
