import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Download, FilePlus, FolderOpen, LogOut, MousePointer2, Pickaxe, Redo2, Save, SlidersHorizontal, Undo2 } from "lucide-react";
import { t } from "../i18n";
import type { EditTool } from "./mapEdits";
import { neutralStyle } from "./inspector/parts";

// The floating tool strip and File/Map menu over the 3D view while editing
// (see concept/editor-ui/topbar-removal-plan.md, steps 1-2): Select, Dig/Fill,
// Height, Undo and Redo, and one menu button for the map's file actions.
export interface FloatToolbarProps {
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
  onNewMap: () => void;
  // shows the map's settings panel without changing the tool
  onMapProps: () => void;
  // phone layout: a row along the bottom instead of a column on the left
  compact?: boolean;
}

const BTN = "relative flex h-8 w-8 items-center justify-center rounded-sm border text-[11px] disabled:opacity-30";
const idle = "border-neutral-600 bg-black/60 text-neutral-200 hover:bg-neutral-800";
const active = "border-amber-400 bg-amber-400/20 text-amber-200";

export function FloatToolbar(p: FloatToolbarProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", esc); };
  }, [open]);
  const tools: { id: EditTool; on: boolean; icon: typeof Pickaxe; title: string }[] = [
    { id: "select", on: p.tool === "select", icon: MousePointer2, title: t("editorBar.selectToolTitle") },
    { id: "dig", on: p.tool === "dig" || p.tool === "fill", icon: Pickaxe, title: `${t("editorBar.digFill")}: ${t("editorBar.leftClickDigAWallOutRight")}` },
    { id: "height", on: p.tool === "height", icon: ArrowUpDown, title: `${t("editorBar.height")}: ${t("editorBar.raiseLeftClickOrLowerRightClick")}` },
  ];
  const sep = <span className={p.compact ? "mx-0.5 h-5 w-px bg-neutral-600" : "my-0.5 h-px w-5 bg-neutral-600"} />;
  const item = "flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] text-neutral-200 hover:bg-neutral-800";
  const run = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div
      style={neutralStyle}
      className={`voidcrew-editor-controls absolute z-20 flex items-center gap-1 font-mono ${p.compact ? "bottom-2 left-2 right-2 flex-row justify-center" : "left-2 top-2 flex-col"}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => { if (e.currentTarget.contains(e.target as Node)) e.stopPropagation(); }}
      onWheel={(e) => e.stopPropagation()}
    >
      <div ref={menuRef} className="relative">
        <button type="button" className={`${BTN} ${open ? active : idle}`} aria-haspopup="menu" aria-expanded={open} title={t("floatBar.fileMenu")} aria-label={t("floatBar.fileMenu")} onClick={(e) => { setOpen(!open); e.currentTarget.blur(); }}>
          <FolderOpen size={16} aria-hidden="true" />
          {p.unsaved && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />}
        </button>
        {open && (
          <div role="menu" className={`absolute z-30 min-w-40 border border-neutral-600 bg-neutral-950 py-1 shadow-xl ${p.compact ? "bottom-full left-0 mb-1" : "left-full top-0 ml-1"}`}>
            <button type="button" role="menuitem" className={item} onClick={run(p.onNewMap)}><FilePlus size={14} aria-hidden="true" />{t("editorBar.newMap")}</button>
            {import.meta.env.DEV && <button type="button" role="menuitem" className={item} onClick={run(p.onSave)} title="Ctrl+S"><Save size={14} aria-hidden="true" />{t("editorBar.save", { v1: p.unsaved ? " •" : "" })}</button>}
            <button type="button" role="menuitem" className={item} onClick={run(p.onDownload)}><Download size={14} aria-hidden="true" />{t("editorBar.download")}</button>
            <button type="button" role="menuitem" className={item} onClick={run(p.onMapProps)} title={t("editorBar.theMapSSizeOpenMakeOr")}><SlidersHorizontal size={14} aria-hidden="true" />{t("floatBar.mapProperties")}</button>
            <button type="button" role="menuitem" className={item} onClick={run(p.onExit)} title="Tab"><LogOut size={14} aria-hidden="true" />{t("editorBar.exitEditor")}</button>
          </div>
        )}
      </div>
      {sep}
      {tools.map(({ id, on, icon: Icon, title }) => (
        <button key={id} type="button" className={`${BTN} ${on ? active : idle}`} title={title} aria-label={title} aria-pressed={on} onClick={(e) => { p.onTool(id); e.currentTarget.blur(); }}>
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
      {sep}
      <button type="button" className={`${BTN} ${idle}`} disabled={!p.canUndo} title={`${t("editorBar.undo")} (Z)`} aria-label={t("editorBar.undo")} onClick={(e) => { p.onUndo(); e.currentTarget.blur(); }}><Undo2 size={16} aria-hidden="true" /></button>
      <button type="button" className={`${BTN} ${idle}`} disabled={!p.canRedo} title={`${t("editorBar.redo")} (Y)`} aria-label={t("editorBar.redo")} onClick={(e) => { p.onRedo(); e.currentTarget.blur(); }}><Redo2 size={16} aria-hidden="true" /></button>
    </div>
  );
}
