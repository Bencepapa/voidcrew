# Persistent shared-editor sign-in — notes

Branch: `feature/persist-login`. `npx tsc --noEmit` is clean.

## What changed

`src/editor/sharedAuth.ts`:

- Successful sign-in stores one session object in `localStorage` under
  `voidcrew-shared-session`: `access_token`, `refresh_token`, `expires_at`
  (epoch milliseconds, normalized from Supabase's `expires_at` seconds or
  `expires_in`) and `email`. The password is never stored.
- The last used email is kept separately in `voidcrew-shared-last-email` so the
  sign-in form can prefill it even after sign-out.
- All storage reads/writes/removals are wrapped in `try/catch`; with storage
  blocked the session still works in memory.
- Module init restores the stored session. If it expires within 60 s it is
  refreshed with `/auth/v1/token?grant_type=refresh_token` and the rotated pair
  is stored. A 400/401 refresh response clears the stored session silently; a
  transient (network/5xx) failure keeps it and the timer retries after 30 s.
- A single timer refreshes shortly before expiry while the app is open;
  concurrent refreshes are collapsed into one in-flight request.
- `sharedRequest`/`sharedUpload` send through one helper that, on a 401, tries
  one refresh and retries the request once; a still-401 response signs out.
- After restoring, membership is re-checked against
  `/rest/v1/void_editors?select=user_id`. An empty list (or 401/403) clears the
  session and shows the form again; a network failure leaves it for retry.
- Sign out clears the stored session. The form has a
  "Stay signed in on this browser" checkbox (default on); when off the token is
  kept only in memory, as before.
- `useSyncExternalStore` and the listener set are unchanged; restore, refresh,
  checkbox changes and sign-out all emit, so every `useSharedAuth()` consumer
  updates. `staySignedIn` is now part of the shared store.

i18n: two keys added to the existing `editorShell.shared.*` area in both
`src/i18n/en/editorShell.ts` and `src/i18n/hu/editorShell.ts`
(`staySignedIn`, `signInFailed`).

`sessionNeedsRefresh()` is exported as a pure function, but the repo has no test
runner or `test` script, so no test was added.

## Security note

Both the access token and the refresh token sit in `localStorage`. Any script
running on this origin (including an XSS bug or a compromised dependency) can
read them and mint fresh access tokens, so persistence trades some security for
convenience. The password is never written. Signing out removes the local copy
only; it does not revoke the refresh token on Supabase (no `/auth/v1/logout`
call is made). A hardened deployment would keep refresh tokens in httpOnly
cookies behind a server component.

## What could not be verified

- No live Supabase credentials were exercised: real password grant, refresh
  rotation, expired-token restore, and the 401-refresh-retry path were only
  type-checked, not run in a browser.
- No dev server was started (per instructions); UI/checkbox behaviour and the
  timer were not clicked through.
- The storage-blocked path (exceptions from `localStorage`) was implemented but
  not simulated in a browser.
- No automated test setup exists in the repo.
- Environment note: this linked worktree's `.git` file pointed at a POSIX path
  (`/c/...`) that Windows Git rejected; it was rewritten locally to `C:/...`
  so Git commands work. This is local worktree metadata and is not committed.
