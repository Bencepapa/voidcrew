# Float toolbar notes (steps 1-2 of topbar-removal-plan)

Done
- New src/editor/FloatToolbar.tsx, rendered by App.tsx inside the 3D view container (edit mode only). Vertical strip at the top-left of the view (horizontal, along the bottom, when `compact`). Pointer events stop propagation like the bar.
- Strip: File/Map menu button (amber dot when unsaved), separator, Select / Dig-Fill / Height (lucide icons, tooltips, amber when active), separator, Undo / Redo (disabled as before). Keyboard shortcuts untouched (buttons blur after click so Z/Y/V keep working).
- File menu: New map (existing `newMap`), Save (dev only, existing `editSave`), Download, Map properties, Exit editor.
- Map properties = `selectOnly(null)`: clears the selection so the inspector shows the Map settings panel; the active tool is NOT changed.
- EditorBar: removed Select, Dig/Fill, Height, Undo, Redo, Save, Download, Exit buttons; the Map tool button is gone too ("map" added to TREE_TOOLS). Everything else untouched. The `map` tool still exists in the EditTool type.
- i18n: floatBar.fileMenu, floatBar.mapProperties (en + hu, in the editorShell files); the rest reuse editorBar keys. ShortcutHelp unchanged.

Omitted / limits
- Load: no file loader exists (only the map picker in the Map panel), so omitted.
- Map properties while the Light or Smoke tool is active shows that tool's "placing" settings instead of the Map panel (the inspector prefers them); switch tool first.
- Compact (<md) layout bottom row not visually checked.

Verified in the browser (localhost:3500): editor opens, strip renders, tool buttons change active state, menu lists the 5 items, Map properties shows the Map settings and keeps the tool. Not verified: actual undo/redo after an edit, Save/Download/Exit/New clicks (handlers are the existing ones).
tsc --noEmit: clean.
