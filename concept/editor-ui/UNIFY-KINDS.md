# Unify kind/mode selectors in the Inspector

Read-only analysis. No source was changed; this is the proposed edit plan.

## Where kinds/modes are picked today

| Element / place | Control today | Data field | i18n keys |
|---|---|---|---|
| Light placement — `EditorBar.tsx:577-598` (Light tool) | two toggle buttons (`BUTTON` + `active`/`idle`), `lightPlace` state in `App.tsx:153` | none in the map: `MapLight.pos` means point light, its absence means ceiling lamp (`bulb` is point-only); `LightPlace = "ceiling" \| "point"` is UI state | `editorBar.place159`, `ceilingLamp`, `pointLight`; titles `aClickOnAFloorOrCeiling`, `aClickPutsALightJustOff`; help `clickPickPlaceRightClickRemove` |
| Light effect — `LightFields.tsx:42-55` | styled `<select>` (4: steady/flicker/spark/pulse) | `MapLight.effect` → `LightEffect` | `editorBar.effect`, `steady`, `flicker`, `spark`, `pulse`; title `anUnsteadyLightIsnTBakedOne` |
| Particle effect — `EffectFields.tsx:9-11` | styled `<select>` (7: smoke/fire/mist/groundfog/motes/petals/fireflies) | `SmokeSpec.effect` → `AmbientEffect` | `effects.effect`, `effects.smoke/fire/mist/groundfog/motes/petals/fireflies` |
| Particle mist style | no control; legacy data only | `SmokeSpec.mistStyle` (`standing`/`ground`); `mapFormat.ts:379` folds `mist + ground` into `groundfog` | unused `effects.style`, `effects.standing`, `effects.ground` |
| Particle decorative | `SmokeFields.tsx:16-20`, checkbox when `effect === "fire"` | `SmokeSpec.decorative` (modifier, not a kind) | `editorBar.decoration`, `onlyDecorationATorchTheFlamesAnd` |
| Prop type — `EditorBar.tsx:537-552` | palette of `<button>`s, `propChoice` in `App.tsx:155` | `PropSpec.prop`; inspector exposes it as `PropInfo.name` | no key for asset names (raw ids); inspector heading uses `editorBar.prop` |
| Item type — `EditorBar.tsx:557-568` **and** `ItemFields.tsx:17-29` | palette of buttons and a separate `<select>` for the same pick | `MapItem.item`; `itemChoice` in `App.tsx:1482` | `editorBar.item`; option text is `ITEM_TYPES[id].name`, not i18n |
| Actor type — `EditorBar.tsx:510-528` | palette of `<button>`s, `robotChoice` in `App.tsx:171` | `ActorSpec.actor` | `editorBar.npc`, `pickATypeToPutIn`; labels are raw ids |
| Actor wake mode — `ActorFields.tsx:47-69` | `<select>` combining `mode × level` + a blank "on guard" entry | `ActorSpec.wake.mode` (`dormant`/`fooled`/`arrive`) and `.level` (1-3) | `editorBar.untilAlert`, `onGuardFromTheStart`, `wake.{dormant,fooled,arrive}.{1,2,3}` |
| Wall/chance wall — `ChanceWallFields.tsx` | no kind control; presence in `chanceWalls` is the kind; "Plain wall" is a removal action | `ChanceWall` entry | `editorBar.plainWall`, `alwaysAWall`, `chanceWallLower` |
| Wall/surface textures — `MapFields.tsx:64-84` and `EditorBar.tsx:474-509` | per-slot `<select>`; texture palette buttons grouped by surface | `MapLook.textures[slot]`, `paint[surface]`; local `kind` only filters texture sets (`wall`/`floor`/`ceiling`/`door`/`window`) | `editorBar.wall/floor/ceiling/door/doorFrame/liftDoor/window`, `default`, `defaultTexture`, `theTextureTheMapGivesThisSurface` |
| Door kind — no control; header in `Inspector.tsx:41` | kind is shown, never editable | `DoorSpec.kind` (`standard`/`lift`) → `DoorInfo.kind` | `editorBar.doorFront`, `doorKindLift`, `doorKindStandard` |
| Door hack — `DoorFields.tsx:39-50` | styled `<select>` (none/easy/hard/very hard) | `DoorSpec.lock.hack` (0-3) | `editorBar.hack`, `no`, `easy`, `hard`, `veryHard` |
| Same pattern, outside the seven named kinds | weather `<select>` (`WeatherFields.tsx:6-8`) and decal palette (`DecalPalette` in `EditorBar.tsx`) | `Weather.type` (`rain`/`snow`); `DecalSpec.decal` | `effects.weather`, `none`, `rain`, `snow`; decal names are raw ids |

Key finding: light *kind* is placement state, not a `LightInfo` field, so it cannot be changed after a light is selected. Particle kind is an inspector `<select>`; prop/actor/item kinds are toolbar palettes; door kind has no control at all.

## Proposal

Add one generic `KindChoice` to `src/editor/inspector/parts.tsx`:

- `options.length <= 4`: segmented button row (`role="radiogroup"`, one `aria-checked` item), using the existing `BUTTON` + `active`/`idle` tokens.
- `options.length > 4`: the existing styled `<select>`.
- Props: `label?`, `title?`, `value`, `options: {value,label,title?}[]`, `onChange`, optional `buttonClass`/`activeClass` so the toolbar can keep its darker button tone.
- Every listed kind/mode uses it. Asset *palettes* stay as palettes for fast placement; the selected element's kind is edited through `KindChoice` in the Inspector. Checkboxes (decorative, lock code) stay checkboxes; sliders stay sliders.
- Labels reuse existing keys. Only new key: `editorBar.kind` ("Kind"/"Fajta") for the door control.

## Exact edits per file

- **`src/editor/inspector/parts.tsx`**: add exported `ChoiceOption` type and `KindChoice` component as above; use the existing `BUTTON`, `active`, `idle`.
- **`src/editor/EditorBar.tsx`**: replace the two light-place buttons (577-598) with `KindChoice` using `editorBar.place159`, `ceilingLamp`, `pointLight`; pass the local dark button classes. Extend callback patch types: `onPropChange` with `prop?: string` (71-113), `onActorChange` with `actor?: string` (78-79), `onDoorChange` with `kind?: "standard" | "lift"` (83-85). Leave prop/item/actor/decal palettes unchanged.
- **`src/editor/inspector/LightFields.tsx`**: in Look add a `KindChoice` for `pos ? "point" : "ceiling"`; choosing point sends `{ pos: pos ?? [0, clamp(roomHeight/2), 0], bulb }`, choosing ceiling sends `{ pos: undefined, bulb: undefined }`. Replace the effect `<select>` (42-55) with `KindChoice` (4 options → segmented).
- **`src/editor/EffectFields.tsx`**: replace the effect `<select>` (9-11) with `KindChoice` (7 options → dropdown). Do not expose `mistStyle`; remove the dead keys instead.
- **`src/editor/inspector/PropFields.tsx`**: add a type `KindChoice` to Look (options from `PROP_TYPES`, filtered by `assetInWorld`), value `p.prop.name`, patch `{ prop }`; keep the texture select separate.
- **`src/editor/inspector/ItemFields.tsx`**: replace the item `<select>` (17-29) with `KindChoice` (dropdown); same filtered `ITEM_TYPES` options.
- **`src/editor/inspector/ActorFields.tsx`**: add a new `Section kind="actor" section="look"` containing a type `KindChoice` (value `p.actor.type`, patch `{ actor }`, options from `ACTOR_TYPES` filtered by `assetInWorld`). Replace the wake `<select>` (47-69) with `KindChoice` (10 options → dropdown), keeping the existing `${mode} ${level}` parsing and `arrive` preservation.
- **`src/editor/inspector/DoorFields.tsx`**: add a `KindChoice` for `p.door.kind` (2 → segmented) in Logic; label `editorBar.kind`, options reuse `doorKindStandard`/`doorKindLift`. Replace the hack `<select>` (39-50) with `KindChoice` (4 → segmented), values `"0".."3"`, patch `doorLock(..., { hack: Number(v) || undefined })`.
- **`src/editor/inspector/MapFields.tsx`**: replace each texture-slot `<select>` (64-84) with `KindChoice`; include an empty option for `editorBar.defaultLower` and map `""` back to `undefined`. >4 options → dropdown, so layout is unchanged.
- **`src/editor/WeatherFields.tsx`**: replace the weather `<select>` (6-8) with `KindChoice` (3 → segmented), mapping `"none"` to `undefined`.
- **`src/editor/inspector/ChanceWallFields.tsx`**: no change; a chance wall has no sub-kind, and "Plain wall" is an action, not a choice.
- **`src/editor/Inspector.tsx`**: no change; the header already derives prop/actor/item/door type text from the updated fields.
- **`src/App.tsx`**: update the explicit `changeDoor` patch type (around 1326) to include `kind`; no runtime change needed (`updateProp`, `updateActor`, `updateDoor` already accept the fields). Light kind switching needs no App change (`Partial<MapLight>` already has `pos`/`bulb`).
- **`src/i18n/en/editorBar.ts`**, **`src/i18n/hu/editorBar.ts`**: add `editorBar.kind`; optionally delete unused `editorBar.fire`, `editorBar.smoke`, `editorBar.fire140`, `editorBar.petals`. **`src/i18n/en/effects.ts`**, **`src/i18n/hu/effects.ts`**: remove `effects.style`/`standing`/`ground` if `mistStyle` stays hidden.
