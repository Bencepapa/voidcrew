# Shared editor trial

The Pages build can connect to a Supabase project for shared maps and PNG textures. Each save appends a map revision. Only the latest revision of each map appears in the shared list. A stale save gets a conflict and the editor can save a separate copy.

## Set up a dedicated Free project

1. Create a project at [Supabase Dashboard](https://supabase.com/dashboard). Run [shared-editor.sql](./shared-editor.sql), then [shared-map-authors.sql](./shared-map-authors.sql) in its SQL Editor. For an existing trial, run only the latter to record the author and time of new saves.
2. Under **Authentication → Users**, create and confirm two test accounts with passwords. Turn off public signups for this private trial. Grant editor access to those accounts by running the following SQL with their actual email addresses.

   ```sql
   insert into public.void_editors (user_id)
   select id from auth.users where email in ('anna@example.com', 'bela@example.com')
   on conflict do nothing;
   ```

3. In the GitHub repository under **Settings → Secrets and variables → Actions → Variables**, set `VITE_SUPABASE_URL` to the project URL and `VITE_SUPABASE_PUBLISHABLE_KEY` to the public project key. Run **Deploy to GitHub Pages** again. For local development the same variable names can go in Vite's local environment file. The browser bundle includes these values. Use only a publishable or legacy anon key.

Shared maps require editor access. Uploaded texture images have public read URLs, so use assets suitable for public distribution. PNG uploads are limited to 8 MiB per file. Each upload gets a new ID.

## Try it from two browsers

1. Open the same game world in two browser profiles. Enter the editor with **Tab**, click **Shared maps** and sign in with different accounts.
2. Make two differently named maps with the Map tool. In the first browser, upload a PNG using **Shared maps → Add wall / floor PNG**, close the dialog and paint it onto the first map. Use **Shared maps → Save** in each browser.
3. Reload both pages, sign in and open **Shared maps**. Both maps should appear. Open the textured map from the second browser and check the painted surface.
4. For the conflict test, open the same shared revision in both browsers. Save an edit in the first. Saving from the second must show a conflict. Use **Save as separate copy**, refresh the list and check both versions.

The editor's Download button exports the local map JSON. The shared PNG files live in the project's `void-textures` bucket. This trial does not bundle them into that download.
