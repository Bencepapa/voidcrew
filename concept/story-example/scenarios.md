# Scenarios (expected results for the engine tests)

Each scenario sets a starting state (the test window / a unit test does the same), runs the steps and checks the result.

| # | Start state | Steps | Expected |
|---|---|---|---|
| 1 | campaign start | begin | active chapter `chapter-1-zsarnok`; the `Intro` handler text is shown once |
| 2 | chapter 1 | talk to `smith` | entry = `Smith Chapter1` (overlay), NOT `Start Smith` |
| 3 | chapter 1 | talk to `smith`, choose "Kérek egy jó kardot" | `quest("sword")=="active"` |
| 4 | #3 + `frost_ore` x3 | talk to `smith` | `quest("sword")=="ready"`, the turn-in choice is offered; after it: runic_sword in inventory, `quest("sword")=="done"` |
| 5 | chapter 1 | `enemy_dead tyrant` | `campaign.tyrant_fate=="killed"`, `campaign.heroism==2`, chapter closes, next = chapter 2 |
| 6 | chapter 1 | judgement -> "Megkíméled" | `tyrant_spared` raised, `tyrant_fate=="spared"`, `heroism==1`, chapter closes |
| 7 | chapter 1, sword `active` | close the chapter | `quest("sword")=="expired"`; chapter variable `heard_rumor` gone |
| 8 | #7, chapter 2 | talk to `smith` | entry = global `Start Smith`; the "az érc elfogyott" line appears |
| 9 | chapter 1, ring `active` | close the chapter | `quest("ring")` is still `"active"` (global); `lana` offers the turn-in after `lana_ring` is found |
| 10 | #9 + `lana_ring` in inventory | talk to `lana` in chapter 2 | turn-in choice offered; after it ring `done`, credits +40 |
| 11 | chapter 1 | `heard_rumor` set, then close | in chapter 2, a chapter variable `heard_rumor` is not readable (checker: unknown variable) |
| 12 | chapter 2 | talk to `pilgrim`, choose "Kivezetem" | `pilgrim_helped`, `campaign.labyrinth_route=="secret"`, `heroism` +1 |
| 13 | chapter 2 | `level_exit labirintus` without helping | `labyrinth_route=="front"` (the `[on]` handler runs; it has no `@endchapter`, the chapter stays open) |
| 13b | chapter 2 | talk to `captain`, choose "Az alvilág felé..." | `@endchapter` without target: campaign `@next end`, the story ends |
| 13c | chapter 2 | talk to `captain`, choose "Hajóra szállsz" | `heroism` +1 still applied (rest of the passage runs), then chapter 3 starts, chapter 2 is closed |
| 19 | chapter 1 | `enemy_dead tyrant` while a dialogue with `smith` is open | the dialogue finishes first, then the chapter closes |
| 20 | a dialogue, a shop or a cutscene running | `canSave()` | false; the auto-save is postponed until it ends |
| 21 | a passage with `@endchapter` followed by `@set campaign.heroism += 1` | run it | `heroism` +1 applied before the chapter closes |
| 14 | chapter 2 | talk to `pilgrim` after the chapter closed | `pilgrim` has no entry at all, silent (chapter-only NPC) |
| 15 | party has `mira`, `rook` | `enemy_dead tyrant` | `Banter Tyrant Dead` shown once; `rook` answers 2 s later; a second kill event shows nothing (`@once`) |
| 16 | chapter 1 | write `@set campaign.foo = 1` | checker error: not in `@returns` |
| 17 | chapter 1 | `Smith Chapter1` loses all unguarded choices | checker warning: no fallback entry |
| 18 | save in chapter 1, reload | load | same chapter, same chapter variables, quest states, campaign variables |

## Checker cases (static)

- unknown variable / unknown file in `file/Passage` / unknown quest id in `@quest`
- `@set campaign.x` where `x` is not in `@returns`
- a `[quest]` without `@fate`, a `carry` quest whose turn-in exists only in a chapter file
- `@ends_on` missing in a chapter file; a chapter named in `@next` that does not exist
- `[[Label->Target]] @if e` with a malformed expression
