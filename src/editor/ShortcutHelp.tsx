import { useEffect } from "react";
import { t, type Key } from "../i18n";
import { neutralStyle } from "./inspector/parts";

// The map editor's keyboard shortcuts, as the handlers really have them (see
// App.tsx, GameViewport and useViewControls). The keys themselves are not
// translated - only the descriptions.
type Row = readonly [keys: string, text: Key];
interface Group {
  title: Key;
  rows: readonly Row[];
}

const GENERAL: Group = {
  title: "editorShell.shortcutsEditor",
  rows: [
    ["Tab", "editorShell.scTab"],
    ["Ctrl + S", "editorShell.scSave"],
    ["Z / Y", "editorShell.scUndo"],
    ["Ctrl + C / V", "editorShell.scCopy"],
    ["?", "editorShell.scHelp"],
    ["Esc", "editorShell.scEscape"],
  ],
};

const VIEW: Group = {
  title: "editorShell.shortcutsView",
  rows: [
    ["Mouse drag", "editorShell.scDragView"],
    ["W S / ↑ ↓", "editorShell.scMove"],
    ["A D", "editorShell.scAd"],
    ["Q E / ← →", "editorShell.scQe"],
    ["X", "editorShell.scDown"],
    ["O", "editorShell.scTopdown"],
    ["Wheel", "editorShell.scWheel"],
    ["Ctrl + wheel", "editorShell.scCtrlWheel"],
    ["Middle drag", "editorShell.scPan"],
    ["L", "editorShell.scLamp"],
  ],
};

const SELECTION: Group = {
  title: "editorShell.shortcutsSelection",
  rows: [
    ["Arrows", "editorShell.scArrows"],
    ["Shift + arrows", "editorShell.scShiftArrows"],
    ["Page Up / Down", "editorShell.scPage"],
    ["R / Shift + R", "editorShell.scTurn"],
    ["Delete", "editorShell.scDelete"],
    ["Ctrl + drag", "editorShell.scCopyDrag"],
    ["Shift + drag", "editorShell.scAltDrag"],
    ["Wheel", "editorShell.scWheelSel"],
    ["Ctrl / Alt + wheel", "editorShell.scScaleRotate"],
  ],
};

const TOOLS: Group[] = [
  {
    title: "editorBar.select",
    rows: [
      ["V / Esc", "editorShell.scSelect"],
      ["Alt (hold)", "editorShell.scAltSelect"],
    ],
  },
  { title: "editorBar.digFill", rows: [["Left / right click", "editorShell.scDig"]] },
  { title: "editorBar.height", rows: [["Left / right click", "editorShell.scHeight"]] },
  { title: "editorBar.texture", rows: [["Left / right click", "editorShell.scTexture"]] },
  {
    title: "editorBar.light",
    rows: [
      ["Click", "editorShell.scLightClick"],
      ["Shift + click", "editorShell.scLightShift"],
    ],
  },
  { title: "editorShell.shortcutsLadderBridge", rows: [["Click", "editorShell.scLadder"]] },
  {
    title: "editorBar.door",
    rows: [
      ["Click / drag", "editorShell.scDoorClick"],
      ["Arrows / right click", "editorShell.scDoorArrows"],
    ],
  },
  {
    title: "editorBar.prop",
    rows: [
      ["Click / drag", "editorShell.scPropClick"],
      ["R / right click", "editorShell.scPropTurn"],
    ],
  },
  {
    title: "roofauto.group",
    rows: [
      ["Click / drag", "roofauto.scPaint"],
      ["Right click / drag", "roofauto.scErase"],
      ["Shift + click", "roofauto.scBlock"],
      ["Ctrl + click", "roofauto.scNew"],
    ],
  },
  {
    title: "editorBar.decal",
    rows: [
      ["Click / drag / arrows", "editorShell.scDecalClick"],
      ["R / right click", "editorShell.scDecalTurn"],
    ],
  },
  {
    title: "editorBar.npc",
    rows: [
      ["Click / drag", "editorShell.scNpcClick"],
      ["Shift + click / right click", "editorShell.scNpcShift"],
    ],
  },
  {
    title: "editorShell.shortcutsItemSmoke",
    rows: [
      ["Click / drag", "editorShell.scPickClick"],
      ["Right click", "editorShell.scPickRight"],
    ],
  },
  { title: "editorBar.exit", rows: [["Click / right click", "editorShell.scExit"]] },
  { title: "editorBar.start", rows: [["Click", "editorShell.scStart"]] },
  { title: "editorBar.restricted", rows: [["Click", "editorShell.scRestricted"]] },
  { title: "editorBar.chanceWall", rows: [["Click / right click", "editorShell.scChance"]] },
];

function GroupBlock({ group }: { group: Group }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-neutral-800 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200">{t(group.title)}</h3>
      <dl className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-3 gap-y-0.5 text-xs">
        {group.rows.map(([keys, text]) => (
          <div key={keys + text} className="contents">
            <dt>
              <kbd className="rounded-sm border border-neutral-700 bg-neutral-900 px-1 py-0.5 font-mono text-[10px] text-neutral-200">{keys}</kbd>
            </dt>
            <dd className="text-neutral-300">{t(text)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// A modal panel over the editor: Escape or a click outside closes it (the ? key
// and the top bar's button open it - see App).
export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("editorShell.shortcutsTitle")}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-2"
      style={neutralStyle}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <section className="max-h-[85vh] w-[min(42rem,94vw)] overflow-auto rounded-lg border-2 border-neutral-500 bg-neutral-950 p-5 text-left text-sm text-white shadow-2xl">
        <header className="mb-4 flex items-center justify-between border-b border-neutral-700 pb-3">
          <strong>{t("editorShell.shortcutsTitle")}</strong>
          <button
            type="button"
            className="rounded border border-neutral-500 bg-neutral-800 px-3 py-1 text-xs hover:border-amber-400 hover:bg-neutral-700"
            onClick={onClose}
            aria-label={t("editorShell.shortcutsClose")}
          >
            ×
          </button>
        </header>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <GroupBlock group={GENERAL} />
            <GroupBlock group={VIEW} />
          </div>
          <GroupBlock group={SELECTION} />
          <h4 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">{t("editorShell.shortcutsTools")}</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS.map((group) => (
              <GroupBlock key={group.title} group={group} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
