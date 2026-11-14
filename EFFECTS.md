# Ambient effects

Smoke-tool emitters share position (cell x/y plus pos), density (default 1), size
(default 1), color (hex tint), blow (speed/yaw/pitch), chance and variation links.
Use effect to select smoke, fire, mist, groundfog, motes, petals or fireflies.
Legacy fire:true remains fire; legacy petals:true remains the original glowing
square motes. Editing the effect removes both old flags from the saved entry.

Examples (all entries belong in the map smokes array):
```json
[
  {"x":2,"y":2,"pos":[0,0.2,0],"effect":"smoke"},
  {"x":2,"y":2,"pos":[0,0.1,0],"effect":"fire","decorative":true},
  {"x":2,"y":2,"pos":[0,0.2,0],"effect":"mist","mistStyle":"standing"},
  {"x":2,"y":2,"pos":[0,0,0],"effect":"groundfog","spread":3,"height":0.6,"density":1},
  {"x":2,"y":2,"pos":[0,1,0],"effect":"motes","color":"#f4a6c0"},
  {"x":2,"y":2,"pos":[0,1,0],"effect":"petals","sprite":"petal1.png"},
  {"x":2,"y":2,"pos":[0,0.7,0],"effect":"fireflies","color":"#d9ef78"}
]
```
Standing mist reuses soft smoke puffs with no rise or ceiling gathering, slow
bounded movement and 25–40 second lifetimes. Ground fog uses up to 48 soft billowing sprites per emitter, with no puff physics.
Its spread is a radius in cells (0.25–12), height is in wall heights (0.05–2),
and its tint is affected by the baked light grid. It follows each local floor,
fades near walls and the area edge, and is culled outside its nearby area. Height controls the cloud top for
falling particles/fireflies; ground fog hugs the local floor. Blow supplies the
horizontal wind for sprite effects; standing mist stays in place.

Add a transparent 16x16 or 32x32 PNG to public/particles and append its filename
to public/particles/index.json (an array of strings). The sprite picker reads
that manifest; no code change is needed. White emitter color preserves the art.
Generate the three bundled pixel sprites with `node --experimental-strip-types
scripts/make-particles.ts` (or `npx tsx scripts/make-particles.ts`).

Map weather is separate from emitters:
```json
"weather": {"type":"rain","intensity":1,"wind":[0.1,0],"indoors":false}
```
Use type snow for flakes, intensity 0–2 (default 1), wind in world x/z per second.
Omit weather for none. The Map tool provides type, intensity and indoors controls.
Only walkable columns with ceiling texture sky receive precipitation, unless
indoors is true. Particles remain between each column's floor and ceiling.
Weather particles move in world space, so walking through them produces parallax.
Only the recycling volume follows the camera. Covered columns and walls hide
precipitation; open sky allows it above the nominal ceiling. Updates are live
without a scene rebuild. Weather uses at most 360 instances in one draw call.

Existing fogColor and view distance already provide global distance fog. A future
render.fogDensity can use THREE.FogExp2 instead of linear Fog and join the render
look schema, editor controls and live settings; it is not added here.
