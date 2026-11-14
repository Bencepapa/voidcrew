# i18n extraction brief (shared by all agents)

Repo: C:\dev\js\voidcrew (React + TypeScript + Vite). Goal: the interface must work in English and Hungarian. The scaffold exists in `src/i18n/` - read `src/i18n/index.ts` first.

## How it works
- `t("area.some.key")` returns the text in the current language; `t("area.edit.filled", { n: 15 })` fills `{n}` in the text. `formatNumber(v)` writes a number with the language's decimal mark.
- English is the source of the keys: add each string to `src/i18n/en/<area>.ts` (the object, keys `"<area>.<name>"`), and its Hungarian to `src/i18n/hu/<area>.ts` with the SAME key. Missing Hungarian falls back to English, but give every key a Hungarian text.
- ONLY edit the files assigned to you plus your own `src/i18n/en/<area>.ts` and `src/i18n/hu/<area>.ts`. Other agents edit other files in parallel: do not touch any other file (not `src/i18n/index.ts`, not other areas' i18n files, not other components).
- Do NOT change layout, styling, logic, class names, or behaviour. Only replace user-visible text (labels, button text, tooltips `title=`/`aria-label`, placeholders, option texts, headings, messages, log lines, error texts) by `t(...)` calls.
- Strings held in module-level constants/arrays (e.g. a list of `{ label: "Height" }` sliders): keep a KEY in the constant and call `t(key)` at render time, otherwise the text would not follow a language change. Type those keys as `Key` (exported from `src/i18n/index.ts`).
- Template strings with values become `{name}` placeholders in the text: `` `Editor: ${n} cells` `` -> `t("app.cells", { n })` with `"app.cells": "Editor: {n} cells"`. Keep a sentence one key; do not build sentences from fragments (word order differs in Hungarian).
- Do not translate: ids, file names, code tokens (`terminal:<id>`), asset ids/names coming from data, key names, units that are symbols. Asset display names from data files (labels in textureSets/props/actors) stay as they are (another task).
- Hungarian style: short, imperative or noun labels, as in desktop software. Glossary (use consistently): Dig = Ásás, Fill = Betömés, Height = Magasság, Floor = Padló, Ceiling = Plafon, Wall = Fal, Paint = Festés, Texture = Textúra, Prop = Tárgy, Item = Felszedhető tárgy, Decal = Matrica, Light = Fény, Particles = Részecskék, Smoke = Füst, Chance = Esély, Inspector = Tulajdonságok, Undo = Visszavonás, Redo = Újra, Save = Mentés, Download = Letöltés, Exit = Kilépés, Door = Ajtó, Ladder = Létra, Bridge = Híd, Start = Kezdőpont, Restricted = Tiltott terület, Chance wall = Esélyfal, Map = Pálya, Settings = Beállítások, Debug = Hibakeresés, NPC = NPC, Robot = Robot, Hack = Feltörés, Lock = Zár, Link = Kapcsolat, Rotation/Turn = Forgatás, Scale = Méret, Elevation = Emelés, Intensity = Erősség, Range = Hatótáv, Color = Szín, Select = Kijelölés.
- Hungarian text is about 25% longer than English: keep labels short.
- Use real Hungarian letters (ő, ű, á, é, í, ó, ö, ü, ú), files are UTF-8.
- A component that shows `t()` text under `App` re-renders on language change automatically (App calls `useLang()`). If a component is wrapped in `React.memo` or lives outside App's tree, call `useLang()` in it.

## Finish
- Run `npx tsc --noEmit` in the repo root: it must be clean.
- Do not run git commit. Do not start dev servers.
- Report: the number of keys added, anything you left untranslated on purpose and why, anything you were unsure about.
