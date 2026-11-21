# Simple shop

A shop without a Twine dialogue: portrait + greeting + the shop window in one popup.

## Rules
- Friendly NPC with a `dialogue`: the dialogue opens (a Twine `@shop` still opens shops). Otherwise with a `shop`: the simple shop opens. Otherwise nothing (`talkMode` in `src/game/simpleShop.ts`).
- `ActorSpec.greeting` (plain string, empty = default `shop.greeting`), `shop` and `portrait` are reused.
- Interaction kind `shop` `{ shop, greeting?, portrait?, npc?, actorId? }` works on walls, doors, props, decals and items. `readInteraction` drops it without a shop id.
- Shown by `ShopPanel` with the `intro` prop (portrait or silhouette + speech-bubble text). Opened from a dialogue, the layout is unchanged.
- `worldPause`: a `shop` interaction pauses the world and blocks party/view like a dialogue. Esc (the shop window's own handler) closes it via `closeInteraction`. The NPC turns to the party (`faceActor`).

## Editor
- NPC Inspector, Talk group: shop id is a select of bundled + shared shops (selecting one makes the NPC friendly), Greeting textarea (only without a dialogue), hint line about the direct opening.
- Event tool: new "Simple shop" kind (shop select, portrait select, greeting, on-use).
- Validation: `missingShop` warning (unknown shop id) for NPCs without dialogue and shop events.

## Tests
`src/game/simpleShop.test.ts` (mode selection, reader, refs, unknown shops), `worldPause.test.ts`.

## Not verified
No browser run: layout of the intro header, Esc/pause in the real game, the editor panels.
