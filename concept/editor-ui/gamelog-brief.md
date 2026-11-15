# Game log colours (branch feature/game-log-kinds)
Repo = your cwd. Small mechanical task. `src/game/useGameState.ts` has `pushLog(text, kind?)` with `LogKind` = info | editor | error | warn | success | heal | damage | danger, and `src/components/LogPanel.tsx` colours lines by kind (KIND_COLOR). Almost no in-game call passes a kind, so combat and events all look the same.
Do: add the right `kind` to the in-game `pushLog(...)` calls (and any helper that builds log lines: grep `pushLog(` in src/game/*.ts, src/components/*.tsx, src/*.tsx; also steps with `step.kind === "log"` if they can carry a kind - only if trivial):
- a crew member is hit / takes damage ("X hits <crew> for N") -> `damage` (orange); a crew member goes down or dies, "it's destroyed" of crew, security alarm/"Ship security: ..." escalation -> `danger` (red).
- crew hits an enemy, enemy destroyed -> `info` stays default (green), except "stunned"/"disarmed"/"slowed" -> `warn`.
- healing ("heals", medkit, stim) -> `heal`.
- locked/blocked/"nothing to use here"/"too high to climb"/"Something is in the way" -> `warn`.
- loot/salvage/pick up/credits -> `success`.
Decide per message text; where a call's text is built from a template, tag it by which branch builds it. Do NOT change any message text, the colour map, layout or logic. Do not touch editor-only messages (they already have kinds).
Run `npx tsc --noEmit` (clean). Commit on this branch; do not push. Write 5 lines of notes (which categories, what you left untagged) to concept/editor-ui/NOTES-gamelog.md.
