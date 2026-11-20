import type { ActorType } from "../game/actors";
import { actorView } from "../game/actorSheets";

export function actorSheetFiles(type: ActorType): NonNullable<ActorType["sheetFiles"]> {
  const base = `${import.meta.env.BASE_URL}actors/${type.sheet}/`;
  return type.sheetFiles ?? { diffuse: base + "diffuse.png", normal: base + "normal.png" };
}

export function actorThumbnail(type: ActorType) {
  const { col, mirror } = actorView(type, 0);
  return {
    backgroundImage: `url(${actorSheetFiles(type).diffuse})`,
    backgroundSize: `${type.cols * 100}% ${type.rows * 100}%`,
    backgroundPosition: `${col / Math.max(1, type.cols - 1) * 100}% ${type.idleRow / Math.max(1, type.rows - 1) * 100}%`,
    transform: mirror ? "scaleX(-1)" : undefined,
    imageRendering: "pixelated" as const,
  };
}
