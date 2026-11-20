import { useCallback, useEffect, useRef, useState } from "react";
import { t, useLang } from "../i18n";
import { ACTOR_TYPES } from "../game/actors";
import { isSharedActorId } from "../game/actorSheets";
import { actorOffsets, type ActorOffsets } from "../render/actorOffsets";
import { ActorAlignment } from "./ActorAlignment";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t("editorShell.actorEditor.loadFailed", { src })));
    img.src = src;
  });
}

export function ActorEditor({ initialActor, onBack }: { initialActor?: string; onBack?: () => void } = {}) {
  useLang();
  const names = Object.keys(ACTOR_TYPES).filter(id => !isSharedActorId(id));
  const [name, setName] = useState(() => { const id = initialActor ?? new URLSearchParams(location.search).get("actor"); return id && names.includes(id) ? id : names[0]; });
  const type = ACTOR_TYPES[name];
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const cellW = image ? image.width / type.cols : 1;
  const cellH = image ? image.height / type.rows : 1;
  const count = type.cols * type.rows;

  const [offsets, setOffsets] = useState<[number, number][]>([]);
  const [status, setStatus] = useState("");
  // the sheet's normal map strength in the game (1: as made)
  const [normal, setNormal] = useState(1);

  const loadVersion = useRef(0);

  // (re)load the sheet and its saved fixes; `bust` re-reads a regenerated one
  const load = useCallback(
    async (bust = false) => {
      const version = ++loadVersion.current;
      const img = await loadImage(`${import.meta.env.BASE_URL}actors/${type.sheet}/diffuse.png${bust ? `?${Date.now()}` : ""}`);
      if (version !== loadVersion.current) return;
      setImage(img);
      const saved = actorOffsets(type.sheet);
      setOffsets(Array.from({ length: type.cols * type.rows }, (_, i) => saved?.offsets[i] ?? [0, 0]));
      setNormal(saved?.normal ?? 1);
      setStatus(bust ? t("editorShell.actorEditor.sheetReloaded") : "");
    },
    [type],
  );
  useEffect(() => {
    setImage(null);
    load().catch((err) => setStatus(String(err)));
    return () => { loadVersion.current++; };
  }, [load]);

  const data = (): ActorOffsets => ({ cell: [cellW, cellH], offsets, ...(normal !== 1 ? { normal } : {}) });
  const save = async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}__voidcrew/actor-offsets?name=${type.sheet}`, {
      method: "POST",
      body: JSON.stringify(data()),
    });
    const text = await res.text();
    setStatus(res.ok ? t("editorShell.actorEditor.saved", { path: text }) : t("editorShell.actorEditor.saveFailed", { error: text }));
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data(), null, 2)], { type: "application/json" }));
    a.download = `${type.sheet}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  };

  const button = "px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-sm hover:bg-neutral-700";

  return (
    <div className={`bg-neutral-950 text-neutral-300 p-4 flex flex-col gap-3 text-xs ${onBack ? "min-h-0 overflow-auto" : "min-h-screen"}`}>
      <div className="flex flex-wrap items-center gap-3">
        {onBack && <button className={button} onClick={onBack}>{t("assetManager.npcSheet.back")}</button>}
        <span className="font-semibold uppercase tracking-wide text-neutral-400">{t("editorShell.actorEditor.title")}</span>
        <select value={name} onChange={(e) => setName(e.target.value)} className="bg-neutral-800 border border-neutral-600 px-1">
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button className={button} onClick={() => void load(true).catch(err => setStatus(String(err)))}>
          {t("editorShell.actorEditor.reloadSheet")}
        </button>
        <label className="flex items-center gap-1" title={t("editorShell.actorEditor.normalHint")}>
          {t("editorShell.actorEditor.normal")}
          <input
            type="number"
            step={0.1}
            min={0}
            value={normal}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v >= 0) setNormal(v);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-14 bg-neutral-800 border border-neutral-600 px-1 text-right"
          />
        </label>
        <button className={button} disabled={!image} onClick={() => void save().catch(err => setStatus(String(err)))}>
          {t("editorShell.save")}
        </button>
        <button className={button} disabled={!image} onClick={download}>
          {t("editorShell.actorEditor.downloadJson")}
        </button>
        <span className="text-green-400">{status}</span>
      </div>

      <ActorAlignment key={name} image={image} layout={type} offsets={offsets} onOffsetsChange={setOffsets} />
      <div className="text-neutral-500">
        {t("editorShell.actorEditor.footer", { count, sheet: type.sheet })}
      </div>
    </div>
  );
}
