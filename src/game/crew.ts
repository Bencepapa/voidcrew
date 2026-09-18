import type { Crewmate } from "./types";

export const initialCrew: Crewmate[] = [
  { id: "reese", name: "REESE", role: "MARINE", hp: 42, maxHp: 42, en: 28, maxEn: 30 },
  { id: "lyn", name: "LYN", role: "ENGINEER", hp: 36, maxHp: 36, en: 40, maxEn: 42 },
  { id: "orion", name: "ORION", role: "ANDROID", hp: 30, maxHp: 30, en: 50, maxEn: 50 },
  { id: "kell", name: "KELL", role: "MEDIC", hp: 28, maxHp: 28, en: 46, maxEn: 48 },
];
