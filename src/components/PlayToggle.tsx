import { Play, Square } from "lucide-react";
import { setPlayActive, useEditorAvailable, usePlayActive } from "../game/playMode";
import { t } from "../i18n";

// The Play button (see game/playMode.ts): it turns the enemies and the traps on, and back off
// (wander mode: they stand still and do no harm). It sits beside the Debug button, in the map
// editor's top-right cluster and in the Debug panel's header; a build without an editor (the
// packaged release, a guest) is always playing and shows nothing.
const BTN = "relative flex h-8 w-8 items-center justify-center rounded-sm border text-[11px]";
const idle = "border-neutral-600 bg-black/60 text-neutral-200 hover:bg-neutral-800";
const active = "border-emerald-400 bg-emerald-400/20 text-emerald-200";

export function PlayToggle({ badge = true }: { badge?: boolean }) {
  const available = useEditorAvailable();
  const playing = usePlayActive();
  if (!available) return null;
  const title = t(playing ? "play.stop" : "play.start");
  return (
    <>
      <button
        type="button"
        className={`${BTN} ${playing ? active : idle}`}
        title={title}
        aria-label={title}
        aria-pressed={playing}
        onClick={(e) => {
          setPlayActive(!playing);
          e.currentTarget.blur();
        }}
      >
        {playing ? <Square size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
      {badge && !playing && (
        <span className="pointer-events-none absolute right-0 top-full mt-1 whitespace-nowrap rounded-sm bg-black/60 px-2 py-0.5 text-center font-mono text-[10px] text-amber-200" role="status">
          {t("play.wander")}
        </span>
      )}
    </>
  );
}
