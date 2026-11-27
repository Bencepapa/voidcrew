import type { Key } from "../i18n";
import type { SearchTarget } from "./targets";

const a = (id: string, titleKey: Key, synonyms: readonly string[], keywords: readonly string[] = []): SearchTarget =>
  ({ id, kind: "assetTree", titleKey, synonyms, keywords });

export const ASSET_TREE_TARGETS: readonly SearchTarget[] = [
  a("tool.ladder", "editorBar.ladder", ["létra", "ladder", "climb"]),
  a("tool.bridge", "editorBar.bridge", ["híd", "bridge", "catwalk"]),
  a("tool.door", "editorBar.door", ["ajtó", "door", "gate"]),
  a("tool.stairs", "link.stairsTool", ["lépcső", "stairs", "staircase"]),
  a("tool.exit", "editorBar.exit", ["kijárat", "exit", "airlock"]),

  a("tool.roof.slope", "roofauto.slope", ["lejtős tető", "roof slope"]),
  a("tool.roof.flat", "roofauto.flat", ["lapos tető", "flat roof"]),
  a("tool.roof.bent", "roofauto.bent", ["tört tető", "bent roof"]),
  a("tool.roof.pyramid", "roofauto.pyramid", ["piramis tető", "pyramid roof", "hip roof"]),
  a("tool.roof.pyramidcell", "roofauto.pyramidcell", ["cellánkénti piramis", "pyramid per cell"]),
  a("tool.roof.gable", "roofauto.gable", ["nyeregtető", "gable roof"]),

  a("tool.fence.block", "fence.block", ["tömb", "block", "hedge block"]),
  a("tool.fence.edge", "fence.edge", ["kerítés szélen", "edge fence", "fence"]),
  a("tool.fence.mid", "fence.mid", ["kerítés középen", "middle fence"]),
  a("tool.fence.layered", "fence.layered", ["réteges kerítés", "layered fence", "foliage"]),
  a("tool.fence.cross", "fence.crossTool", ["x kerítés", "x fence", "cross fence"]),

  a("tool.start", "editorBar.start", ["kezdőpont", "start", "spawn"]),
  a("tool.restricted", "editorBar.restricted", ["tiltott", "restricted", "no go"]),
  a("tool.chanceWall", "editorBar.chanceWall", ["véletlen fal", "chance wall", "random wall"]),
  a("tool.message", "events.message", ["üzenet", "message", "event message"]),
  a("tool.image", "events.image", ["kép esemény", "image event", "interior"]),
  a("tool.shop", "events.shop", ["bolt", "shop", "event shop"]),

  a("tool.light.ceiling", "editorBar.ceilingLamp", ["mennyezeti lámpa", "ceiling lamp"]),
  a("tool.light.ceiling.flicker", "editorBar.flicker", ["pislogó lámpa", "flicker lamp"]),
  a("tool.light.ceiling.spark", "editorBar.spark", ["szikrázó lámpa", "spark lamp"]),
  a("tool.light.ceiling.pulse", "editorBar.pulse", ["pulzáló lámpa", "pulse lamp"]),
  a("tool.light.point", "editorBar.pointLight", ["pontfény", "point light"]),
  a("tool.light.point.flicker", "editorBar.flicker", ["pislogó pontfény", "flicker point light"]),
  a("tool.light.point.spark", "editorBar.spark", ["szikrázó pontfény", "spark point light"]),
  a("tool.light.point.pulse", "editorBar.pulse", ["pulzáló pontfény", "pulse point light"]),

  a("tool.smoke.smoke", "effects.smoke", ["füst", "smoke", "particle"]),
  a("tool.smoke.fire", "effects.fire", ["tűz", "fire", "flame"]),
  a("tool.smoke.mist", "effects.mist", ["pára", "mist"]),
  a("tool.smoke.groundfog", "effects.groundfog", ["talajköd", "ground fog"]),
  a("tool.smoke.motes", "effects.motes", ["por", "motes", "dust"]),
  a("tool.smoke.petals", "effects.petals", ["szirmok", "petals"]),
  a("tool.smoke.fireflies", "effects.fireflies", ["szentjánosbogár", "fireflies"]),
];
