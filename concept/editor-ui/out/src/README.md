# voidcrew / Level editor UI

12-page Hungarian design document. Static mockups, no application changes.

## Outputs
- ../editor-ui-design.pdf - A4 landscape, 12 pages
- ../mockups/*.png - 1440x860 desktop and diagrams; Decorate and Build also 1024x768; additional native mobile views 900x600 and 390x844
- icon-*.svg - original line icons
- assets/ - copies of the actual screenshots and public diffuse textures used in these compositions

## Rebuild (from concept/editor-ui)
python out/src/build.py
python out/src/document.py
python out/src/refine.py
python out/src/finish-sources.py
python out/src/last-pass.py
python out/src/extras.py
python out/src/render.py
powershell -NoProfile -ExecutionPolicy Bypass -File out/src/verify-pdf.ps1

Uses installed Google Chrome via Python Playwright (no web server). ui.css and document.css contain the final QA adjustments. NPC previews use first-cell CSS cropping (500% 700%, position 0 0). The PDF preserves vector SVG diagrams and selectable Hungarian text; viewport scenes are composited rasters.

The PDF marks unimplemented behavior as TERV. Sample numeric values are illustrative. Source assets remain unchanged.
