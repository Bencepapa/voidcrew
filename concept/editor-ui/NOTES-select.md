# Select tool - 2026-11-17 (branch feature/select-tool2)

## What it does
- New tool `"select"` (EditTool), first button in the top bar, the editor's default
  (set whenever the editor opens, Esc from any other tool, V, the Select button).
- With Select active a click picks the nearest object under the pointer of any kind:
  NPC, item, prop, decal, light, particle emitter (ray based: the nearest hit wins; a decal
  counts when it is as near as the nearest surface). Empty space deselects. Esc in Select
  deselects too. Doors, exits, chance walls etc. are not picked by Select (their tools stay).
- Picking reuses the per-kind code in `GameViewport.editTargetAt` (the filters that only let
  actors/lights/see-through items through for their own tool also let them through for
  Select); the press handler derives the dragged kind from what was hit, so drag, Ctrl+drag
  copy and the setters in `App.onEditDrag` are exactly the kind tools'. Locked layers are
  looked through, hidden layers are not drawn, so neither is pickable.
- `App.selectOnly(kind, index)` keeps one pick at a time (the other selection states are
  cleared); the Inspector follows through the existing selection bridge.
- `keyTool` in App = the tool the arrows / R / Delete / PgUp-PgDn / wheel work by: the tool
  in hand, or - in Select, or in a placing tool with nothing of its own kind selected - the
  kind that is selected. The five kind key effects and `onEditAdjust` use it, so Delete,
  R, nudging, height and the wheel work on a Select pick. Undo is the normal edit history.
- Alt held (window keydown/keyup, cleared on blur and when the editor closes) makes the
  viewport behave as Select (`editTool` prop is passed as "select"); the tool in hand is
  untouched, so released = back. The thing picked stays selected (Inspector + Delete/R work
  through `keyTool` in the placing tools). Alt + drag keeps its old meaning (raise/lower the
  selected thing), so a drag with Alt held does not move it.
- Tree entries still switch to the placing tool (`chooseTool`) with the placing Inspector.
- Category protection of dig/fill/height/ladder/bridge/door/chance wall/start/restricted/
  texture is untouched (they do not use keyTool; Alt-picking there only selects/inspects).
- Hover highlight for Select frames whatever a click would pick.
- `selectedSmoke` state moved up next to the other picks (needed by keyTool); no other
  refactor. ShortcutHelp: V / Esc and Alt (hold) rows, en + hu. i18n en + hu.
- Not done: Ctrl+C / Ctrl+V still need the kind tool (paste needs its tool's placing rules);
  minimap marker clicks still switch to the kind tool as before.

## Verification
- `npx tsc --noEmit`: clean.
- Own Vite on :3400 (`cacheDir` .select2-cache via a throw-away wrapper config, deleted),
  built-in browser, 1024x768, fantasy world, Tab into the editor. Verified with real clicks:
  - editor opens with Select highlighted, help line shown;
  - Select picked a torch prop, particle emitters (fire and ground fog), a medkit item, an
    NPC (ogre), a decal, a point light; Inspector showed each; empty space deselected;
  - Delete on an emitter, Z restored it; R on a decal rotated 90 and Z undid it;
  - dragged an emitter (synthetic pointer events: down/move/up): it moved, Z undid it;
  - Esc from the Light/Prop tool returns to Select (and deselects in Select);
  - tree entry (ceiling lamp -> light tool, then point light placed; torch1 -> prop tool,
    torch placed) still places with the placing Inspector;
  - Alt held in the Prop tool (synthetic key events) picked a point light; the tool stayed
    Prop; Delete then removed the light; Z restored it;
  - locked Light layer: the bulb was not pickable, picked again after unlocking; hidden
    Light layer: not pickable;
  - WASD still moved the party after clicks; Tab leaves/enters the editor (Select again).
- Not verified: a real mouse drag (the harness' left_click_drag did nothing, only synthetic
  pointer events were used), a physical Alt key (synthetic key events), dragging
  NPC/item/prop/decal/light under Select (shared code path, not exercised), ceiling lamp
  panels and wall props, touch. The pane is throttled while hidden, so screenshots lag a
  frame; maps were not saved (edits were in memory only).
