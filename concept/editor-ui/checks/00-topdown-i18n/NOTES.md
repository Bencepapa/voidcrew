# Gate check: top-down experiment, i18n, coloured log (sci-fi + fantasy)

- Top-down (O) works on the sci-fi medical deck: floors and lights readable from above, walls as dark translucent caps, WASD/wheel work.
- Hungarian labels fit the dock buttons in both worlds at 1440x860 (checked); 1024x768 not yet checked.
- Finding: in the sci-fi world the left column (minimap, log) keeps the game's green style while the right column (dock, Debug) is gold/brown: the two worlds' styles mix. The new editor style (EDITOR_UI_PLAN.md) replaces both.
- Finding: the sci-fi home-ship screen (BaseScreen) is English only - the game UI outside the editor is not translated yet.
- Not yet checked: coloured log lines against the sci-fi log background; top-down frame rate on the large decks.
