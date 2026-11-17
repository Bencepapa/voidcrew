# Iron fence and stone arch props

- `fence1`: `panel`, texture `fantasygate1`, size `[1, 1, 0.08]`, elevation 0,
  `blocks: true` (it closes the cell to grid movement like a real fence),
  free-standing (`wall` false).
- `arch1`: `panel`, texture `fantasydoorframe1`, size `[1, 1, 0.08]`,
  elevation 0, `blocks: false` (grid movement passes through), free-standing.

Both use the default panel relief (1). The size mirrors the in-game door
frame: the door code stretches the 256×341 (0.75 aspect) texture across one
cell and one wall height, and that also leaves the fence bars ~93% of the cell
wide and the arch opening ~69% wide.

The arch's blocking footprint cannot be left out. `blocks` only affects grid
movement; `propBoxes` still includes every prop's footprint, so free movement
collides with the arch's thin (0.08-cell) plane. There is no per-prop
"no footprint" flag, so it stays `blocks: false`.

World/i18n: both ids are in `FANTASY_ASSETS` (neither starts with "fantasy").
Added `assetTree.name.fence1` / `arch1` ("Iron fence"/"Vaskerítés",
"Stone arch"/"Kőboltív") and a small `hasKey` helper so a translated prop name
is used only when a translation exists; other props keep showing their id.

No extra texture registration was needed: both textures are already in
`TEXTURE_SETS` (kind `door`) and the panel lookup, Asset Manager `propImage`
and the Asset Tree's `TEXTURE_SETS[tex] ?? textureFolder(tex)` all resolve
them. The tree thumbnails load `fantasygate1/diffuse.png` and
`fantasydoorframe1/diffuse.png`.

Verified: `npx tsc --noEmit` clean. In a headless browser on a temporary Vite
server (port 4100, `/voidcrew/`, own cache dir; removed afterwards) both props
appear in the fantasy Assets tree under Props with their names and thumbnails,
and the Asset Manager lists both. Temporarily placing `fence1` at (3,3) and
`arch1` at (3,4) in the fantasy map showed the free-standing iron fence with
see-through gaps and the stone arch behind it; the map file was then restored.
Could not reliably verify the Asset Manager's 3D pane headlessly: even the
existing `curtain_closed` preview stays black/empty there, so that is a
headless-WebGL limitation rather than these props.
