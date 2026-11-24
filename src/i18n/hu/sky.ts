// Égboltok: 2:1 arányú panoráma feltöltése az Assets managerben, és kiválasztása a pálya beállításaiban (lásd game/skyImage.ts).
import type { skyEn } from "../en/sky";

export const skyHu: Partial<Record<keyof typeof skyEn, string>> = {
  "assetManager.skies": "Égboltok",
  "assetManager.newSky": "Új égbolt",
  "assetManager.image.sky": "Égbolt",
  "sky.file": "Égbolt képe (PNG, JPG vagy WebP)",
  "sky.formatHint": "2:1 arányú panoráma, pl. 2048 × 1024 (szélesség 1024–4096). Az alsó él a horizont, a legfelső sor a függőlegesen felfelé néző pont, a bal és a jobb szélnek pedig egymásba kell érnie: az égbolt 360°-ban körbeér.",
  "sky.noPicture": "Még nincs kép.",
  "sky.size": "Méret: {width} × {height}",
  "sky.previewStrip": "A teljes panoráma (alul a horizont, a bal szél a jobb szélhez ér)",
  "sky.previewWrap": "A varrat körül: a jobb fél, utána a bal fél (a vonal az illesztés helye)",
  "sky.seamOk": "A varrat rendben van: a két szél {seam} (255-ből) eltérést mutat (a kép oszlopról oszlopra {baseline} értékkel változik).",
  "sky.seamBad": "Látszó varrat: a bal és a jobb szél {seam} (255-ből) eltér, miközben a kép oszlopról oszlopra csak {baseline} értékkel változik.",
  "sky.seamFix": "Varrat eltüntetése",
  "sky.seamFixHint": "Mindkét szélen a kép 8%-át összekeveri a másik szél tükörképével, így a két szélső oszlop azonos lesz. A kép többi része nem változik, a méret ugyanaz marad. Visszavonás: töltsd fel újra a fájlt.",
  "sky.seamFixed": "A varratot elmostuk: a két szél most egyezik.",
  "sky.uploaded": "A kép betöltve: {width} × {height}.",
  "sky.issue.tooNarrow": "Az égbolt {width} képpont széles: legalább {min} kell.",
  "sky.issue.tooWide": "Az égbolt {width} képpont széles: legfeljebb {max} lehet.",
  "sky.issue.badAspect": "Az égboltnak 2:1 arányú panorámának kell lennie (a szélesség a magasság kétszerese); ez a kép {ratio}:1.",
  "sky.issue.aspectOff": "A kép {ratio}:1 arányú, nem 2:1: az égbolt megnyúlva fog látszani.",
  "sky.err.format": "{name} nem PNG, JPG vagy WebP fájl.",
  "sky.err.pngTooBig": "{name} PNG-ként {mb} MB lenne: a határ 8 MB. Használj kisebb képet, pl. 2048 × 1024.",
  "editorBar.skyNotLoaded": "(az égbolt nincs betöltve: {id})",
  "minimap.problem.unknownSky": "A pálya égboltja ({id}) nem ismert megosztott égbolt (nincs közzétéve, vagy még nem töltődött be).",
};
