# A felső sáv megszüntetése (terv, 2026-11-17)

Cél: a felső eszközsor teljesen megszűnik. Minden elem új helyre kerül.

## Hova kerül minden

| Ma (felső sáv) | Új hely |
| --- | --- |
| Kijelölés, Ásás/Töltés, Magasság | **Lebegő eszköz-ikonok** (függőleges sáv a nézet szélén, ikon + tooltip, aktív kiemelés) |
| Visszavonás / Újra | Lebegő ikonok (az eszközök mellett, külön csoport) |
| Térkép (tulajdonságok) | Lebegő **Fájl/Térkép menü** (lásd lent) |
| Mentés, Letöltés, Kilépés | Ugyanaz a Fájl/Térkép menü |
| Létra, Híd, Ajtó | **Asset-fa**, „Közlekedés / Traverse” csoport, három külön elem. Az Asset Managerben is megjelennek textúrával (ajtó: ajtólap + keret; híd és létra: ismétlődő textúra); később 3D modell lehet a kódból generált helyett |
| Kijárat, Start, Tiltott, Esélyfal | **Események / triggerek** külön összecsukható szakasz az asset-fa alatt (a fa végén) |
| Rétegenkénti Elrejt | Marad az asset-fa csoportfejlécében (szem) |
| Rétegenkénti Töröl | **Kikerül**, nem pótoljuk. Később: többes kijelölés (mozgatás, tulajdonság, törlés) |

## Javaslat a Fájl/Térkép menühöz

Egy lebegő ikon (térkép/fájl), lenyíló menü: **Új · Betöltés · Mentés · Letöltés · Térkép tulajdonságai · Kilépés**.
A Térkép tulajdonságai a meglévő Térkép-panelt nyitja (nem eszköz, nem vált szerkesztő eszközt).

## Események (triggerek) később

- Kijárat: több is lehet; kell olyan, ami másik térképre visz (mint a lift a sci-finél), más átmenettel:
  lépcső le/fel (szakaszos, elhalványuló fel-le haladás) vagy helyszín elhagyása (a kamera a ködbe halad, a kép elhalványul).
- Esélyfal: lehet, hogy az ásás/töltés kiegészítése lesz (pl. Ctrl/Shift+kattintás: a normál falat álfalként jelöli).
  Addig trigger az események között.

## Külön jegyek (issue)

1. Magasságkülönbség (pl. árok) falán nem lehet decalt elhelyezni: csak a felső út oldala „fal”. Az esélyfal sem viselkedik rendes falként.
2. Többes kijelölés (közös mozgatás, tulajdonság, törlés).
3. Hangolás (textureTuning) mentése: most Pages-en „JSON letöltése/másolása”; később a megosztott tárba (meta.json, Assets-terv 5–6. lépés).

## Építési sorrend

1. Lebegő eszköz-ikonok (Kijelölés, Ásás/Töltés, Magasság) + Visszavonás/Újra. [Claude]
2. Fájl/Térkép menü (Új, Betöltés, Mentés, Letöltés, Tulajdonságok, Kilépés). [Claude vagy OpenCode]
3. Közlekedés (Létra, Híd, Ajtó) az asset-fába + Asset Manager bejegyzések. [Claude]
4. Események szakasz (Kijárat, Start, Tiltott, Esélyfal). [OpenCode vagy Claude]
5. Rétegenkénti Töröl kivétele, a felső sáv eltávolítása. [OpenCode]
6. Hangolás letöltése Pages-en (független, kicsi). [OpenCode]
