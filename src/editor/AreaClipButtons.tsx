import { t } from "../i18n";
import type { useAreaClipboard } from "./useAreaClipboard";

// The area clipboard's buttons in the big minimap's block panel (the keys do the same: see useAreaClipboard):
// Copy (when a block is selected) and Paste, and while pasting the area's size, Turn, Mirror and Done.
export function AreaClipButtons({ area, canCopy, className }: { area: ReturnType<typeof useAreaClipboard>; canCopy: boolean; className: string }) {
  if (area.pasting && area.size) {
    return (
      <>
        <span className="text-amber-200">{t("area.pasting", { w: area.size.w, h: area.size.h })}</span>
        <button type="button" className={className} onClick={() => area.rotate(1)} title={t("area.turnTitle")}>{t("area.turn")}</button>
        <button type="button" className={className} onClick={() => area.mirror()} title={t("area.mirrorTitle")}>{t("area.mirror")}</button>
        <button type="button" className={className} onClick={() => area.cancel()} title={t("area.stopTitle")}>{t("area.stop")}</button>
      </>
    );
  }
  return (
    <>
      {canCopy && <button type="button" className={className} onClick={() => void area.copy()} title={t("area.copyTitle")}>{t("area.copy")}</button>}
      {area.clip && <button type="button" className={className} onClick={() => area.startPaste()} title={t("area.pasteTitle")}>{t("area.paste")}</button>}
    </>
  );
}
