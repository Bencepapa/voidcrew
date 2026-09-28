// The map editor's toolbar, over the top of the game view while editing
// (see EDITOR.md): what a click or tap does - dig a wall out, or fill a
// floor in (the right mouse button always fills) - undo and redo, saving to
// disk (dev server only), downloading the file, and leaving edit mode.

export type EditTool = "dig" | "fill";

interface Props {
  tool: EditTool;
  onTool: (tool: EditTool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  unsaved: boolean;
  onSave: () => void;
  onDownload: () => void;
  onExit: () => void;
  // the phone layout: at the bottom (the minimap and the menu take the top)
  compact?: boolean;
}

const BUTTON = "px-2 py-1 border rounded-sm text-[11px] disabled:opacity-30";
const idle = "border-neutral-600 bg-black/60 text-neutral-200 hover:bg-neutral-800";
const active = "border-amber-400 bg-amber-400/20 text-amber-200";

export function EditorBar(p: Props) {
  return (
    <div
      className={`absolute ${p.compact ? "bottom-2" : "top-2"} inset-x-2 z-20 flex flex-wrap justify-center gap-1 font-mono`}
      // the view underneath mustn't take these as peeks or steps
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <button type="button" className={`${BUTTON} ${p.tool === "dig" ? active : idle}`} onClick={() => p.onTool("dig")}>
        Dig
      </button>
      <button type="button" className={`${BUTTON} ${p.tool === "fill" ? active : idle}`} onClick={() => p.onTool("fill")}>
        Fill
      </button>
      <span className="w-2" />
      <button type="button" className={`${BUTTON} ${idle}`} disabled={!p.canUndo} onClick={p.onUndo} title="Z">
        Undo
      </button>
      <button type="button" className={`${BUTTON} ${idle}`} disabled={!p.canRedo} onClick={p.onRedo} title="Y">
        Redo
      </button>
      <span className="w-2" />
      {import.meta.env.DEV && (
        <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onSave} title="Ctrl+S">
          Save{p.unsaved ? " •" : ""}
        </button>
      )}
      <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onDownload}>
        Download
      </button>
      <span className="w-2" />
      <button type="button" className={`${BUTTON} ${idle}`} onClick={p.onExit} title="Tab">
        Exit editor
      </button>
    </div>
  );
}
