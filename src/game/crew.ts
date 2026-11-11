import type { Crewmate } from "./types";
import type { WorldId } from "./worlds";

// Void Crew's crew (the ship's marines and robots)
export const initialCrew: Crewmate[] = [
  { id: "reese", name: "REESE", role: "MARINE", hp: 42, maxHp: 42, en: 28, maxEn: 30 },
  { id: "lyn", name: "LYN", role: "ENGINEER", hp: 36, maxHp: 36, en: 40, maxEn: 42 },
  { id: "orion", name: "ORION", role: "ANDROID", hp: 30, maxHp: 30, en: 50, maxEn: 50 },
  { id: "kell", name: "KELL", role: "MEDIC", hp: 28, maxHp: 28, en: 46, maxEn: 48 },
];

// Void Fantasy's party: a warrior, a dwarf, a mage and an elf (their portraits are
// public/portraits/<id>.webp)
export const fantasyCrew: Crewmate[] = [
  { id: "aldra", name: "ALDRA", role: "WARRIOR", hp: 46, maxHp: 46, en: 30, maxEn: 32 },
  { id: "borin", name: "BORIN", role: "DWARF", hp: 52, maxHp: 52, en: 26, maxEn: 28 },
  { id: "merlen", name: "MERLEN", role: "MAGE", hp: 28, maxHp: 28, en: 50, maxEn: 52 },
  { id: "elara", name: "ELARA", role: "ELF", hp: 34, maxHp: 34, en: 44, maxEn: 46 },
];

// the party a world starts with
export function crewOf(world: WorldId): Crewmate[] {
  return world === "fantasy" ? fantasyCrew : initialCrew;
}
