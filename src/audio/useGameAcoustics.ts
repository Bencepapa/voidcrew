// Tells the game's sound system where the rooms echo: the map's sound zones, else each room's automatic estimate (see
// acoustics.ts). A zone edited gives a new map, so the effect runs again and the listener hears the change at once.
import { useEffect } from "react";
import type { GameMap } from "../game/types";
import { zoneAt } from "./acoustics";
import { gameSound } from "./gameSound";

export function useGameAcoustics(map: GameMap) {
  useEffect(() => {
    gameSound.setAcoustics((x, y) => zoneAt(map, x, y));
    return () => gameSound.setAcoustics(null);
  }, [map]);
}
