# Dark fantasy post-process (kísérlet, 2026-11-18)

Branch `feature/dark-fantasy-post`. Opcionális, alapból KI: Debug panel > „Sötét fantasy hangulat (kísérlet)".

## Mi ez
Egy színes utófeldolgozó pass (`src/render/darkFantasyShader.ts`, a felhasználó által beillesztett GLSL portja): összenyomott árnyékok
(megtartott hidegkék), a kékes-lilás színek mélykék, a vörös-narancs-sárga színek egységes izzó tűzszín felé húzva (HSV-maszkok),
kiemelt telítettség, a meleg fényfoltok megtartása, kontraszt, vignetta. Türkiz / sárgászöld (0,37 hue) védett („fontos tárgyak").

## Bekötés
`GameViewport.tsx`: `renderPost()` — `EffectComposer` (félfloat célpont, MSAA ha az élsimítás be van kapcsolva) → `RenderPass` →
`OutputPass` (tone mapping + sRGB) → `ShaderPass` (a színes pass LEGUTOLJÁRA, a képernyőre; a shader display-referred bemenetet vár).
Csak a „textúrázott" nézetben fut (`geometryView === "textured"` és `postDark`); a többi debug-nézet (lapok, drótváz, normálok,
mélység) a normál úton renderel. A beállítások (`postDark`, `postDarkness`, `postWarm`, `postCold`, `postSaturation`, `postPalette`,
`postVignette`) a `ViewportSettings`-ben, futás közben csúszkákkal állíthatók; nem mentődnek a térképbe.

## Tapasztalat
- Egy hiba: a three `ShaderMaterial` előtagja már definiál `luminance`-t, ezért a shader függvényét `lumOf`-ra kellett nevezni.
- A dungeon-on (meleg fáklyafény, vörösesbarna kő) az alapértékekkel (`uDarkness 0.7`, `uWarmBoost 1.8`, `uPalette 0.9`) erősen vörös/fekete a kép:
  a kő színe is a „meleg" családba esik, így tűzszínt kap. A hidegkék akkor látszik, ha van kékes felület/fény. Hangolandó: `uPalette` (kisebb = több
  eredeti szín), `uWarmBoost`, `uDarkness`.
- A kép szerint a legtöbbet a **fények módosítása** adna (kisebb ambient, hideg kék ambient, szűkebb fáklya-hatósugár), a shader csak erősít.
- Nincs mérve: a teljesítmény (extra render célpont + MSAA), a mobil/kis felbontás, és az átlátszó/mélységi nézetek.
- Nincs megoldva: a `snapshot`/`bench` fejlesztői segédek a composer méretét nem állítják (csak fejlesztői használat).

## Ötletek (nincs megépítve)
Szemantikus színmaszk (útvonal, kapcsolók, szereplők külön targetből), szelektív bloom (fáklyák, mágikus tárgyak), színkvantálás
(festményszerű lépcsőzés). Fények: hideg mélykék ambient, szűkebb fáklya-sugár a világ szintjén (a fantasy világ beállításaiban).
