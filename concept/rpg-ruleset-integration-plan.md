# RPG ruleset (AD&D) beemelése a voidcrew-ba (terv, 2026-11-17)

Forrás: github.com/Bencepapa/rpg_ruleset_editor (React 19, zustand, zod; `src/rpg-core/`: `engine/` kockák, THAC0, XP, morál,
validátor; `runtime/RpgRuntime` eseménybusz + `reloadRuleset()`; `editor/StatsEditorModal` teljes képernyős szerkesztő).

## Döntések

- **Egy szabálymotor, két ruleset:** a fantasy az AD&D 2e; a sci-fi ugyanazt a motort egyszerűbb rulesettel használja
  (nincs Vancian varázslás, kevés osztály, lövés = támadás kockával, páncél = AC). A séma nem kényszeríthet AD&D-specifikus
  mezőt (pl. `spellSchool`) a sci-fi rulesetre: ezt ellenőrizni kell.
- **Munkamegosztás:** az RPG-motor a szabályok és statok (HP, sebzés, tulajdonságok); a játék a megjelenés (sprite, hang,
  modell, textúra, effekt). A kapocs **string azonosító** (`goblin2`, `longsword`, `effect:flame`), a hivatkozás az RPG-adatban él.
- **Megjelenés mint attribútum az RPG-adatban:** pl. egy tárgyon `visual: { effects: ["glow","flame"], tint: "blue" }`.
  A játék oldali adapter építi fel; ismeretlen effektnél alapértelmezett. Az effektek paraméterezhetők, így nem kell
  minden kardhoz új asset.
- **Külső függőség:** a `src/rpg-core/` külön csomag (workspace / `file:` link; később git-függőség), a szabályrendszer
  **verziózott adat** (`default-ruleset.json` + séma, `rulesetVersion`), a motor ritkán változik. A motor soha nem importál
  a játékból; egy vékony **adapter** fordítja az eseményeit (`attack`, `spellCast`, `moraleBreak`, ...) a játék aktorjaira és
  naplójára.

## Validálás (kétlépcsős, a build része)

1. **Séma** (zod, megvan): az adat szerkezete.
2. **Hivatkozás-ellenőrzés a játék manifestje ellen:** minden string azonosító (`texture`, `sprite`, `effect`, `loot`,
   `actorType`) létezik-e a játékban. A szerkesztő pirossal jelzi, az `npm run check` megbuktatja.
   - A **manifestet a játék generálja a kódból** (`ACTOR_TYPES`, `FANTASY_ASSETS`, tárgyak, effekt-lista, textúrák):
     nem kézzel karbantartott, nem tud elavulni.
   - Fordítva: a játék figyelmeztet a nem létezőre mutató RPG-hivatkozásra és a használaton kívüli assetre.
- A szerkesztő legördülői a manifestből töltődnek (nincs szabad szöveg az azonosítókra).

## Nyitott pontok

- A mai HP/sebzés/fegyver (`actors.ts`, `combat.ts`, `meta.ts`) leképezése THAC0/AC-re, különösen a sci-fi finomhangolása.
- A szörnyek és tárgyak forrása: az RPG-bundle a stat, a játék a megjelenés; egy bejegyzés ne éljen két helyen.
- Stílus: a szerkesztő Tailwind-osztályai a mi UI-nk témájához igazítandók; a piszkozat `localStorage` kulcsa fix.
- Csomagolás: a `package.json` jelenleg `react-example`, nincs `exports`/lib build; a `typescript@7`, `@google/genai`, `express`
  az appra tartozik, nem a magra.
- A bundle verziózása és a régi mentések migrálása.

## Sorrend

1. A játék manifestet exportál (aktorok, tárgyak, effektek, textúrák).
2. `validateAgainstManifest(bundle, manifest)` az RPG-motorban; a szerkesztő legördülői a manifestből.
3. Csomag/link, a szerkesztő megnyitása egy gombról, majd egy fantasy-harc (pl. a farkas) az AD&D motoron adapterrel.
4. A sci-fi egyszerűbb ruleset megírása; döntés a tárgyak/szörnyek forrásáról.
