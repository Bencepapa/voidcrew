# Roof props

Branch `feature/roof-props`. Roof pieces for building houses on raised ground
(the Height tool raises a block 1 or 2 storeys; the roof goes on top).

## Interpretation

The brief was short, so:

- A roof piece is a **prop** (`kind: "roof"` in `src/game/props.ts`) that fills
  one cell. It is placed, selected, moved and rotated like any other prop
  (Select tool, top-down view, inspector sliders).
- Its surface is a 45 degree pitch: it rises one cell for every cell it runs.
- "Bends to horizontal partway along" = the profile has a slope segment and
  then a flat segment.
- "Corner piece" = two such slopes meeting in a diagonal ridge and then
  continuing flat. Both the outer corner (hip) and the inner corner (valley)
  exist.
- The texture is a per-placement choice (`PropSpec.texture`, already in the
  map format and persisted/loaded), picked from the prop inspector.

## Profile model

```ts
roof: { kind: "roof", profile: RoofSegment[], corner?: "outer" | "inner", texture? }
RoofSegment = { kind: "slope" | "flat", run: number }   // run in cells; a slope rises as much as it runs
```

The profile is the piece's side view measured from the **eave** (the low edge,
at the piece's front, +z; unrotated = facing south). What the profile does not
cover is flat. `corner` combines two profiles, one from the front edge and one
from the left (outer) or right (inner) edge:

- outer (hip): `height = min(f(a), f(b))`, eaves at front and left, the slopes
  rise to the back and right and meet in a diagonal ridge.
- inner (valley): `height = max(f(a), f(b))`, eaves at front and right.

Presets (all in `PROP_TYPES`, listed in the Assets tree under Props / 3D,
fantasy world via `FANTASY_ASSETS`):

| id | shape |
|---|---|
| `roof_slope` | one 45 degree slope across the cell, rises 1 |
| `roof_slope_flat` | slope for half a cell (rises 0.5), then flat for the other half |
| `roof_flat` | the flat top |
| `roof_corner` / `roof_corner_flat` | outer (hip) corner, full / bent |
| `roof_inner` / `roof_inner_flat` | inner (valley) corner, full / bent |

Tiling: the pieces meet edge to edge. A piece's `size[1]` is its rise (not its
thickness), so "Stack on top" or the Height slider set to the rise puts the next
piece's surface exactly level with this one's far edge. Example 3x3 hip roof on
a 1-storey block: corners `roof_corner` (rotation 0 = SW, 270 = SE, 90 = NW,
180 = NE), edges `roof_slope` (rotation 0 = eave south, 90 = west, 180 = north,
270 = east), centre `roof_flat` at Height 1. With the bent pieces the ring is
`*_flat` (rise 0.5) and the centre flat is at Height 0.5.

Rotation is the usual prop rotation: degrees clockwise seen from above, and the
eave (front) turns from south toward west at 90.

## Geometry and texture (`src/render/roofMesh.ts`)

- The surface is a heightfield over the 1x1 cell, cut into triangles along
  every bend and along the ridge/valley diagonal so each triangle is exactly
  planar (crisp creases, flat normals per face). Thickness 0.06
  (`ROOF_THICKNESS`): the underside lies 0.06 under the surface, the four cell
  edges have a vertical cut face, so it is a slab and not paper. The lowest
  point of the underside is the piece's origin (it sits on the floor).
- UVs: u along the eave, v is the **arc length along the profile** (a 45 degree
  stretch counts sqrt(2) per cell, flat counts 1), one texture tile per world
  unit, so the texture continues unbroken through the bend. In a corner each
  slope uses its own direction (the texture rotates 90 degrees across the
  ridge) and the flat part takes the UV of the slope on its side of the
  continued ridge, so the flat part meets both slopes it borders without a seam.
- The wall set's diffuse and normal map (and glow/surface maps if it has them)
  are used. The roof gets its own kit with **repeating copies** of the maps
  (`roofKitFor` in `GameViewport.tsx`), because the walls' maps clamp and the
  slope is longer than one tile. Normals work because three.js derives the
  tangent frame from the UVs.
- Default texture when the placement has none: the deck's wall set (like a
  pillar). Per placement: `PropSpec.texture`.

## Texture selection

`PropFields.tsx` now uses `KindChoice` (the chips/select component the map
settings use) for the prop's texture, and refreshes with the texture library
(`useTextureVersion`), so shared textures that finish loading appear. For a
roof the list is the wall-kind sets (the sky set is left out); other retexturable
props keep their wall + prop-face list. Absent `texture` = the prop type's
default ("its own" chip). The choice is stored in the map JSON like any prop
field; it is backward compatible.

## Collision / other systems

Roofs are decoration: `blocks` is never set, and in addition `propBoxes` (free
movement), the smoke bodies' boxes and the light-grid occluders skip roof
props. Reason: a roof sits at Height (usually on top of a riser block) and would
otherwise make a column from its elevation to its top that blocks free movement
and light for the whole cell. Consequence: a roof casts no shadow and cannot be
walked into, and is not a solid thing under the pieces.

## What was not done / limits

- **No relief geometry.** The roof is flat triangles with the diffuse and normal
  map (and the set's AO is not applied), not the relief mesh the walls use. A
  relief panel is a rectangle, the hip pieces are triangles with a diagonal
  seam, so true relief there would need clipping the relief mesh to the
  triangles. The straight pieces could use rotated relief panels; I kept one
  code path so all pieces look the same. At the default relief depth the loss
  is mostly in silhouettes of the bricks.
- The roof's texture orientation at a hip is a 90 degree turn across the ridge
  (no mitred bricks).
- A roof slope is true 45 degrees only while the wall height setting is 1 (the
  rise is in world units and the Height slider is in wall heights).
- The roof does not light the cell below it differently, there is no "roof hides
  when inside" behaviour, and the underside has the plain texture without the
  normal map.
- The Asset Manager's prop preview shows a roof as a plain textured box (the
  generic fallback); the type is not editable in the prop editor (like
  pillars/chamfers).
- Not checked: rotating an inner corner and the Hungarian/English strings other
  than in the Assets list (names exist in en and hu), the editor's
  "problems" checks for a roof on a wall cell.
