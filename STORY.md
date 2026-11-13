# Story and scripting – design

A plan for how stories, dialogue, cutscenes, traps and party changes are
authored and run. **Status: draft (2026-11-12), nothing built yet.** It grows
the system described in [TOOLS.md](TOOLS.md) ("The story: terminals, locks,
triggers", `src/game/story.ts`) instead of replacing it. The first story to
serve is the fantasy "necromancer" idea (Adim's notes); everything here must
also work for the sci-fi Void Crew.

## What we have, and what we keep

Flags (run flags, lasting `story.*` flags in the base save), terminals with
locks, triggers (`enter`, `open`, `read`, `pickup`, `start`) with `if` flag
conditions and `do` actions (`set`, `clear`, `log`, `alert`, `power`,
`turrets`, `cameras`, `stance`, `show`, `unlock`, `open`), and the ship
**alert** meter (0-100: calm, suspicious, alert, lockdown) that wakes actors.
All of it stays, and keeps working for existing maps.

## Goals and constraints

- **Authors are not coders.** The common cases are forms and pickers in the
  map editor; scripting is an *advanced* layer on top, never required.
- **Foolproof:** a broken script must not crash or soft-lock a run. Every
  script is validated when a map loads (missing flag, unknown actor, a choice
  with no way out) and the editor shows the problems.
- **Loading a map takes 5-10 s**, so a story can't switch maps for a short
  scene. Flashbacks and cutscene stages live **inside the same map**, in a
  separate area.
- **Phone-friendly:** the dialogue UI works by touch, big targets.
- **Two worlds, one system.** Content differs, the engine doesn't.

## Architecture: three layers

```
 world layer        narrative layer           presentation layer
 (cells, things)    (what is said / done)     (how it is shown)
 triggers, traps,   scenes: dialogue, choices, scene runner: camera, UI lock,
 plates, NPCs,      thoughts, steps; written  portraits, toasts, fades, looks,
 alert, flags       as forms or as ink        input
        \               |                          /
         +------- one story state: flags, counters, party, items -------+
```

1. **World layer (JSON, engine code).** Anything tied to a place or a
   moment in the simulation: a trigger on a cell, a pressure plate, a lever,
   an NPC you can talk to, the alert level. Kept in the map file, edited with
   editor tools. It *starts* scenes and *reacts* to their results.
2. **Narrative layer (scenes).** A scene is a script: lines, choices, small
   logic, and *commands* for the engine. Two authoring forms of the same
   thing (see "Authoring"): a step list (simple) and ink (advanced).
3. **Presentation layer (scene runner, React + three.js).** Plays a scene:
   dialogue panel, toasts, portraits, camera moves, fades. Owns the input
   lock. Knows nothing about story rules.

The story state is one store (flags, counters, party, inventory, knowledge)
saved with the run / base; both layers read and write it through the same
small API, so the sci-fi terminals and the fantasy dialogues share it.

## Choosing a story engine

We want branching dialogue with variables that non-coders can read and
write, a good editor, and a small JS runtime. Candidates:

| | ink (inkle) | Yarn Spinner | own JSON graph | Twine / Twee |
|---|---|---|---|---|
| Form | text markup, knots/choices/diverts | text markup, nodes | node graph in our editor | text/graph, HTML-bound |
| JS runtime | `inkjs` (port of the C# runtime, runs compiled JSON) | community ports only | ours | story formats, not embeddable |
| Editor | Inky (free, live preview) | VS Code / Yarn editor | we'd build it | Twine app |
| Variables / logic | variables, conditions, functions, lists, tunnels | variables, commands, functions | whatever we build | format-specific |
| Engine hooks | `EXTERNAL` functions, `#tags`, variable observers | commands | native | none |
| Risk | low; mature, widely used; compile step | runtime ports less certain | most work, fits perfectly | wrong tool |

**Recommendation: ink via `inkjs`** for the narrative layer, *in addition to*
a built-in simple step-list form. Reasons: it is made for exactly "text with
branches", writers learn it in an hour, Inky gives a live preview without our
editor, its compiled JSON is small and loads with the map, and its two
extension points (tags and external functions) are the bridge to the engine.
It is **not** used for places and timing (triggers, traps, alert): those stay
in the world layer, where the editor already works with cells.

**Decision gate:** before committing, prototype one scene (the necromancer's
"How did it happen?") in ink, load it with `inkjs` in the game, and check:
bundle size, the compile step in our build (`inklecate` or the JS compiler),
mobile performance, and that the tags/external-function bridge below is
comfortable. Also check that `inkjs` is still maintained. If any of it
fails, the fallback is the step-list form alone (it must be complete anyway).

### How ink talks to the game

- **Lines and speakers:** `NARRATOR: text` or `MERLEN: text` - speaker ids
  match crew/NPC ids (portrait from `public/portraits/<id>.webp`).
- **Tags carry commands:** `# camera:grave_view  # wait:1.5  # sfx:thud
  # look:flashback  # toast` - the scene runner executes them in order with
  the line they belong to.
- **External functions:** `~ recruit("skeleton")`, `~ setFlag("met_osvald")`,
  `~ alert(+20)`, `~ hasItem("red_keycard")`, `~ partyHas("borin")` - thin
  wrappers over the story store.
- **Variables:** ink variables are the story state for conversations; those
  named `story_*` / `world_*` are mirrored with our flags and counters
  (observer on change).

## Features

### 1. Dialogue, choices, cutscenes, thoughts (needed)

**Scene kinds** (one runner):

- **Dialogue panel:** speaker, portrait, text, 0-N choices; typed or
  instant; tap to continue; choices can be conditional (shown / greyed with a
  reason) and can have effects (set flag, recruit, alert).
- **Toast / thought:** a short line over the live game or a cutscene, with
  or without a portrait, auto-dismiss, several in a row for a short exchange.
  Does not stop the game unless the scene says so.
- **Cutscene:** a scripted sequence that takes over the camera and (optionally)
  disables the UI and input: *steps*.

**Steps** (the cutscene vocabulary, same in the step-list and as ink tags):

| step | does |
|---|---|
| `say speaker "text"` | a dialogue line |
| `toast speaker "text"` | a toast |
| `choice [...]` | choices, each with its own steps |
| `camera <path or marker>` | move the camera along a path of markers placed in the map (position, yaw, pitch, fov, duration, easing), or cut to a marker |
| `wait seconds` | pause |
| `ui off` / `ui on` | hide / show HUD (minimap, party, log); input lock follows |
| `fade out/in seconds` | to/from black (or white) |
| `look <name>` | switch a **look** (below); `look default` switches back |
| `actor <id> ...` | walk to a marker, face a direction, play a pose, appear, disappear |
| `party ...` | recruit, leave, die (feature 3) |
| `set / clear / add flag...` | story state |
| `sfx / music` | sounds (when we have them) |
| `goto marker` | teleport the party / camera to a map marker (flashbacks) |
| `end` | return control |

**Skippable:** every cutscene can be skipped with one button; skipping runs
only the state-changing steps (flags, party, goto) and ends. Replayable ones
(the flashback) are marked `replay`.

**Stages inside the map (no loading).** A cutscene or flashback location is
an area of the same map, away from the play space, reached with `goto`.
Markers (named points with position + yaw) are a new editor object; scenes
refer to markers by name. Actors for a stage are placed there normally and
are inactive (not woken, not in the sight/culling cost of the play area:
culling already hides what is not in sight).

**Looks.** A look is a named bundle of render settings applied for the
scene and restored after: the existing per-map `render` values (fov, lights,
skybox, fog, ambient...) plus post effects for flashbacks (desaturate, film
grain, vignette, sepia tint, blur). The post effects are **new work**:
a small full-screen pass (cheap on phones, optional, off in Low graphics).
`look flashback` = grey + grain + slightly higher exposure, for example.
The scene runner saves the current look and restores it even when a scene is
skipped or fails.

**The opening** (inside the grave looking up, the old necromancer with a
spade speaking): a cutscene on a stage marker, camera fixed, one `say`, a
`fade`, `goto` the first room, `ui on`.

**The recurring "How did it happen?"**: a scene `recall_ruby` with
`replay`, triggered by a dialogue choice or by a party member's question. It
`fade`s, switches `look flashback`, `goto stage_lab`, plays the speech (same
every time, with a different reaction line from the listener, picked from a
list by a counter), then returns the party to where it was (the runner
stores position and look on entry, restores on exit).

**Input and UI lock.** A scene sets a lock level: `none` (toasts),
`movement` (dialogue: the world runs, the party stands), `full` (cutscene:
HUD hidden, world paused or running as the scene says). The runner always
releases the lock when the scene ends, errors or is skipped.

### 3. Recruiting and losing party members (needed; also sci-fi)

The party is no longer a fixed four:

- A **roster** (all known characters with stats, portrait, sprite, state:
  `away`, `in party`, `dead`, `waiting at <map/cell>`) and a **party** (the
  members currently with you, up to a max, e.g. four, plus a reserve that
  waits at the base or where they were left).
- **Join / leave / die** are story actions: `recruit id`, `dismiss id`
  (goes to the reserve or the base), `kill id` (dead; optionally leaves a
  body prop/loot), `revive id` (when resurrection exists; skipped for now),
  `swap a b`. Callable from dialogue choices, triggers, cutscenes and ink
  (`~ recruit("borin")`).
- **Party UI** already draws from `crew`; it needs to handle 0-N cards
  (hide empty slots), a "down" state, and a new member appearing with a
  short toast. Weapons/loadout: the meta store (`loadout[crew]`) already
  keys by crew id, so a recruit brings or is given a starting weapon.
- **Fail condition** stays "everyone in the party is down", counted over the
  current party.
- **Scripted deaths** are `kill` with a scene attached (the informant struck
  by lightning): the world layer triggers the scene, the scene calls `kill`.
- NPC actors in the world that become members: a `talk` trigger on the
  actor starts a scene; `recruit` removes the world actor and adds the
  roster entry (or the other way round for a death).

### 5. Traps, plates and other trigger events (needed)

Generalise triggers from "a cell was entered" to **world events with
conditions**, editable with the existing Trigger tool and scriptable:

- **Events:** `enter`, `leave`, `open`, `read`, `pickup`, `start`
  (existing), plus `use` (the Use button facing a prop/cell), `talk` (an
  NPC), `step` (a pressure plate: someone is on the cell), `timer`
  (every N seconds / once after N), `kill` (an actor died), `alert` (the
  alert level crossed a threshold), `flag` (a flag changed).
- **Conditions** (`if`, see 7) can include **who**: the party member
  stepping on it, its weight/size, "any / all / only role X" - this is the
  hook for later per-member puzzles (feature 4 is skipped, but the data
  shape leaves room: `who`).
- **Actions** (existing plus): `damage cell N` / `damage party N`,
  `spawn actor ...`, `despawn`, `door open/close/lock`, `move prop`
  (a portcullis), `shoot` (an arrow volley from a wall launcher: a world
  object with a direction and rate, started and stopped by flags),
  `scene id` (start a scene), `toast`, `alert`, `sfx`.
- **Trap objects** (props with behaviour): pressure plate (visible or
  hidden, with a "detect" difficulty later), dart/arrow launcher,
  spike pit, gas vent; each is a prop kind with a few parameters and the
  events above. They reuse `fire.ts`'s approach (a world cell effect that
  damages what stands in it) and the actor combat code for projectiles.
- **Disarm:** a trap can have `disarm` conditions (a flag, an item, a
  role) - checked by the Use button.

### 6. RPG stats, inventory, knowledge/skill tree (plan; fantasy first)

Not built for sci-fi, but the data model must not block it, and the story
store is where it lives:

- **Stats per character:** level/xp, attributes (e.g. strength, agility,
  mind), derived HP/EN/accuracy. Today `Crewmate` has `hp/maxHp/en/maxEn`
  only; stats extend it with defaults so old saves and the sci-fi crew
  still load.
- **Inventory:** today the meta store counts scraps by type. Extend with
  typed items: stackables (scraps, potions, ingredients, keys) and
  uniques (a named weapon, a grimoire) with an `owner` or `stash`.
  Equipment slots per character are an extension of the existing two
  weapon slots, not a rewrite.
- **Knowledge / skill / spell tree:** a data-driven graph (JSON per world):
  nodes = a spell, skill or knowledge entry; edges = prerequisites; each
  node has a cost (points, a found grimoire, a trainer) and effects (grants
  an ability = a weapon-like action with a cooldown, a passive modifier, or
  a story flag). The story store records which nodes are learned. A
  grimoire item `unlocks node X` when read. Ink and triggers can ask
  `~ knows("raise_skeleton")` and teach (`~ learn("...")`). The UI is a
  tree screen reachable from the base / menu; the first version can be a
  list grouped by branch.
- **Counters:** the story store gains numbers (see 7) for `knowledge`,
  `gold`, reputation, time left, etc.
- This needs its own design pass before building (balance, UI, saves);
  here we only fix that the story layer can read/write it.

### 7. Conditions and values (needed) and the alert system

**Values.** The story store holds three kinds: **flags** (up/down, as now),
**counters** (integers, `add`/`set`), and **text/ids** (rarely; for "who
you chose"). Names are namespaced: `story.*` lasts for good, `run.*` for
the run, `world.<mapId>.*` per map (the existing `unlocked:`... flags fit).

**Conditions** are a small expression form, also in editor pickers:

- `flag`, `!flag`, `counter >= 3`, `counter == 0`
- `has item [n]`, `party has id`, `party size >= 2`, `knows node`
- `alert >= suspicious`, `time > N`, `map == id`
- `all [...]`, `any [...]`, `not ...` (this adds the OR the old `if` lacked)

The old `"if": ["flag", "!flag"]` stays valid (it means `all`). In text
form (advanced scripts) it is `if flag and not other or count > 2`, parsed
into the same structure so the editor can show both.

**Alert for the fantasy world.** The ship-security meter is reused as a
general **alert** per zone/map (a stronghold, a house, a town):

- Same 0-100 with named levels, but with per-map **names and thresholds**
  (calm / suspicious / alarmed / hunted), a **decay** (cools down when
  unseen, per map setting), and per-map **sources**: being seen, noise
  (shots, forced locks), a corpse found, a stolen item picked up, time.
- **Factions.** Guards can be neutral or friendly until alert crosses their
  threshold (`wake` already exists for robots: it generalises to "an
  actor's reaction at alert level X": ignore → watch → question → attack),
  and for already hostile guards a higher alert **attracts** more (reinforce
  waves, patrols re-route, doors lock).
- **Stealth play:** disguise/forged papers (an item or flag) as the existing
  `stance: fooled`, sneaking lowers noise, shadows lower "being seen"
  (light level at the party's cell is available from the light grid).
- Scenes can raise or lower alert (`~ alert(-30)` after a bribe), and
  conditions can read it.

### 8. Authoring: simple and advanced

Two modes in the editor, one underlying data format, switchable per script:

**Simple (default): forms.**
- **Trigger tool** (exists in JSON only today): click a cell or an object,
  choose the event from a list, add conditions from pickers (flag, item,
  counter, party member), add actions from a list with typed fields (a
  flag *picker* that knows existing flags, an actor/marker/door picker that
  highlights the target in the map, a scene picker). Validation messages in
  plain words.
- **Scene editor:** a vertical list of steps (like a chat/storyboard): add
  a line (speaker dropdown with portrait, text), a choice (each branch is a
  nested list), a camera step (pick a marker; the editor previews the
  view), wait, fade, set flag... drag to reorder; a Preview button plays it
  in the map. No syntax anywhere.
- **Marker tool** for camera paths, stages and spawn/teleport points.
- **Story overview:** a list of all flags/counters with where each is set
  and read (find broken or orphaned ones), and a map-level problem list.

**Advanced: scripts.**
- A scene can be switched to *script view*: an ink text editor with syntax
  highlighting, a compile-error list, and the same Preview button. The
  step list and ink are two views of the same scene where possible (every
  step has an ink equivalent: line, `*` choice, tags); ink features beyond
  the step list (tunnels, lists, weaves, visit counts) make the scene
  "advanced only" (one-way, shown with a note).
- External `.ink` files per map / chapter are allowed (writers can use
  Inky); the editor lists them and reports compile errors. Compiled at
  build time or in dev by the Vite plugin; shipped as JSON.
- The same expression language for conditions in scripts as in 7.
- Triggers/traps stay form-based (they are about places); an advanced
  trigger can hold a small action script (the same `do` list in text).

**Safety nets** (both modes): a scene or script that errors logs it, shows a
toast in dev, releases the input lock and look, and continues the game; an
unreachable end or a loop with no choices is flagged by the validator; an
undo/redo and "revert to last saved" in the scene editor.

## Data sketches

Map file (the world layer):

```json
"markers": { "stage_lab": { "x": 40, "y": 3, "yaw": 90 }, "grave_cam1": { "x": 41, "y": 4, "yaw": 180, "pitch": 20 } },
"scenes": { "opening": { "lock": "full", "steps": [ { "ui": "off" }, { "goto": "grave_cam1" }, { "say": "NECRO", "text": "Rise, and do as I say!" }, { "fade": "out", "s": 1 }, { "goto": "start" }, { "ui": "on" } ] },
            "recall_ruby": { "replay": true, "ink": "recall_ruby.ink" } },
"triggers": [
  { "on": "start", "do": [ { "scene": "opening" } ] },
  { "on": "step", "x": 7, "y": 12, "if": { "all": [ "!trap7_off" ] }, "do": [ { "shoot": "launcher_a", "volley": 6 } ] },
  { "on": "talk", "actor": "osvald", "do": [ { "scene": "osvald_talk" } ] },
  { "on": "alert", "level": "alarmed", "do": [ { "toast": "GUARD", "text": "Intruder!" } ] }
]
```

Ink (the narrative layer), with the engine bridge:

```ink
=== recall_ruby ===
# look:flashback  # fade:in  # goto:stage_lab
NECRO: I had everything ready. Every rune, every candle.
...
# look:default  # goto:return
-> DONE

=== ask_how ===
SKELETON: So how did this happen, boss?
+ [Tell the story] -> recall_ruby ->
    ~ remembered += 1
    { remembered > 2: BORIN: We know. You forgot the sun-cracked ruby. }
+ [Not now] -> END
```

The story store API used by both layers (names tentative): `get/set/add`,
`hasItem`, `partyHas`, `recruit/dismiss/kill`, `learn/knows`, `alert`,
`startScene`.

## Build order (each step playable and useful alone)

1. **Story store and conditions.** Counters, namespaced values, the
   expression form (`all/any/not`, comparisons, `has`, `party`), the old `if`
   still valid; the validator that lists unknown names. Pure code and
   tests; no UI.
2. **Scene runner, step-list form.** Dialogue panel, toasts, `ui`/`wait`/
   `fade`/`say`/`choice`/`set`; markers; skippable; lock handling; used by
   the `scene` action in triggers and by terminals. Unlocks the opening and
   simple conversations.
3. **Camera, stages and looks.** Marker paths, `goto`, looks with the
   post-effect pass (grain, desaturate); flashback working in a test map.
4. **Roster and party changes.** `recruit/dismiss/kill`, variable party
   size in the UI and combat, saves migrated.
5. **World events and traps.** `step/use/talk/timer/kill/alert/flag` events,
   pressure plate, launcher, spike pit, disarm; editor Trigger tool v1
   (forms), Marker tool.
6. **Ink bridge** (after the decision-gate prototype): `inkjs` runner behind
   the same scene interface, tags/externals, Vite compile step, editor script
   view, Inky workflow documented.
7. **Alert generalisation.** Per-map alert profile, actor reaction levels,
   stealth sources; guards for a stronghold/house test map.
8. **Stats, items, knowledge tree** (its own design doc first), then wire
   `learn/knows/hasItem` to the real data.
9. **Scene editor and story overview** polish: previews, undo, orphan flag
   finder, per-map problem list.

Steps 1-5 need no external dependency; ink (6) is an authoring convenience
that plugs into 2.

## Open questions

- Is ink the final choice, or do we prefer a pure in-house step list plus a
  graph view (no external engine)? Decide after the prototype in step 6's
  gate - *the gate can be run before step 2*, since it shapes the scene
  interface.
- Voice/audio and music: not planned; lines are text only for now.
- Localisation: lines should live in data (not code), ids not text, so
  Hungarian/English can be added later; decide the file layout early.
- Max party size and the reserve: four on screen (the party strip is built
  for four) or more with a scroll?
- Saving mid-scene: scenes are not saved mid-way (a save happens outside
  them); is that acceptable?
- Post effects on phones: allowed on Medium or only High?
- Per-member capabilities (feature 4) and resurrection (feature 2) are
  postponed; `who` in events and the roster `state` are the places left
  open for them.
