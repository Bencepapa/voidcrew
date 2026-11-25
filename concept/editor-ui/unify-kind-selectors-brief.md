# Read-only analysis: unify "kind" selectors in the Inspector

Do not edit source. Write the result to `concept/editor-ui/UNIFY-KINDS.md`.

In the editor Inspector (`src/editor/Inspector.tsx`, `src/editor/inspector/*Fields.tsx`) a light chooses its kind with
separate choices (ceiling light vs point light), while a particle effect uses one dropdown for the same purpose
(smoke / mist / ground fog / fire ...). Find every place where an element picks its "kind"/"mode" (lights, particles,
props, items, actors, walls, doors) and list: the control used, the data field, the i18n keys. Then propose one
consistent control (e.g. a segmented button row for <= 4 options, dropdown for more) and the exact edits per file.
Keep it under one page, in English.
