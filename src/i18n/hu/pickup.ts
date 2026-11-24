// Magyar szövegek: tárgyfelvétel (game/pickupMode.ts), az ellenfelek tesztelési kapcsolója
// (game/enemiesOff.ts) és a csapat újraélesztése szerkesztés közben (game/editorWipe.ts).
export const pickupHu = {
  "pickup.tooFar": "Túl messze van - lépj közelebb, hogy felvehesd.",
  "pickup.mode": "Tárgyfelvétel",
  "pickup.modeHint": "Auto: a tárgyra lépve felveszed. Kattintás: csak a rákattintás (vagy a Használ) veszi fel, így ami nem kell, a földön marad.",
  "pickup.default": "A világ alapértéke ({mode})",
  "pickup.auto": "Auto (ráléptél)",
  "pickup.click": "Kattintás (vagy Használ)",
  "pickup.mapDefault": "A játékos választása / világ alapértéke",
  "pickup.mapHint": "Hogyan veszik fel a földön heverő tárgyakat ezen a pályán. Üresen: a játékos választása, különben a világé (hajós kör: auto, nyílt világ: kattintás).",
  "debug.enemiesInactive": "Ellenfelek inaktívak (állnak, és nem ártanak)",
  "editor.crewRevived": "Szerkesztő: a csapat újraélesztve",
  "play.start": "Play: az ellenfelek és a csapdák bekapcsolása",
  "play.stop": "Vissza a barangoló módba: ellenfelek és csapdák kikapcsolva",
  "play.wander": "Barangoló mód: ellenfelek és csapdák kikapcsolva",
  "play.logOn": "Játék mód: az ellenfelek és a csapdák élesek.",
  "pickup.dropFull": "Tele a hátizsák - a tárgy ott marad, ahol van.",
  "pickup.dropHand": "{who} kézbe veszi: {item}.",
  "pickup.dropUse": "{who} használja: {item} ({gains}).",
  "pickup.dropDown": "{who} elesett - {item} a hátizsákba kerül.",
  "pickup.dropNoNeed": "{who}: most nincs rá szüksége - {item} a hátizsákba kerül.",
  "play.logOff": "Barangoló mód: az ellenfelek állnak, a csapdák ki vannak kapcsolva.",
} as const satisfies Record<string, string>;
