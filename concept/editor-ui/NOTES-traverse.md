# Traverse / Events / top bar removal (steps 3-5 of topbar-removal-plan)

Done
- Asset tree: "Traverse" (hu Közlekedés) group at the top: Ladder, Bridge, Door (separate entries, each calls onTool as the old button did; icon tiles for ladder/bridge, the door1 texture for Door). "Events" (hu Események) section at the END of the tree, with a thicker top border: Exit, Start, Restricted, Chance wall. Both groups have no eye/lock buttons (the old bar had no Hide for those tools).
- Asset Manager: new "traverse" filter on the Textures tab listing door1 (leaf) and doorframe1 (frame). Double-clicking the Door entry opens door1.
- Per-layer Clear all removed (App clearLayer, onClearLayer prop, CLEARABLE_TOOLS); the bar's Hide button removed (Hide stays on the tree group headers).
- EditorBar component deleted (the file keeps the shared prop/info types, editorToolLabel and the exported TOOL_HELP). MORE_TOOLS removed. The `shared` slot and `toolbarDock` prop are gone from the Inspector props.
- Tool help line: small floating hint at the bottom centre of the view (bottom-12 in compact), rendered by FloatToolbar.
- Shared levels: inside the FloatToolbar File menu, under a "Shared levels" label (hu Megosztott pályák), containing SharedEditor and the Asset Manager button. Kept mounted (hidden when the menu is closed) so their dialogs survive.
- i18n: traverse.group, events.group, floatBar.sharedLevels (en + hu, editorShell files).

Omitted / notes
- Ladder and Bridge have no texture ids (built in code), so they are not listed in the Asset Manager; their tree tiles are icons.
- The app.clear* and editorBar.clearAll / takeEverything... i18n keys are now unused but were left in place (no mass delete).
- The editor header row (View select, ?, Debug) in App.tsx is not the EditorBar and stays; only its toolbar dock div was removed.
- Compact (<md) layout not visually checked. Shared-levels content with a configured shared store not checked (only the Asset Manager button showed in the menu here).

Verified (browser, port 3600): editor opens with no top bar; tree shows Traverse and Events; each of the 7 entries sets its tool (pressed state, status bar tool name, hint text); File menu lists the items plus Shared levels / Asset Manager; Asset Manager opens on door1 with the traverse filter. A door placement click hit a wall cell and gave a validation message, so actual door placement was not confirmed. tsc --noEmit clean after each step.
