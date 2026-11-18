import { useId, useMemo, useState } from "react";
import { t } from "../i18n";
import { WORLDS, LOCKED_WORLD } from "../game/worlds";
import type { WorldId } from "../game/worlds";
import { Dialog, DIALOG_BUTTON, DIALOG_INPUT, DIALOG_PRIMARY } from "./Dialog";
import { deriveMapId, placesOf } from "./mapStore";

export type MapDialogMode = "new" | "saveAs" | "rename";
export interface MapDialogValues { place: string; name: string; world: WorldId; width: number; height: number }

// One dialog for a new map, a copy ("Save as") and a rename: the place (pick
// one of the places the world has, or type a new one) and the name. The
// technical id isn't asked: it is made from them (shown, for new and copies).
export function MapDialog({ mode, initial, onSubmit, onClose }: {
  mode: MapDialogMode;
  initial: MapDialogValues;
  // an error text keeps the dialog open
  onSubmit: (v: MapDialogValues) => string | null;
  onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const listId = useId();
  const places = useMemo(() => placesOf(v.world), [v.world]);
  const place = v.place.trim();
  const name = v.name.trim();
  const ok = !!place && !!name;
  const id = mode === "rename" ? null : deriveMapId(place, name);
  const submit = () => {
    if (!ok) return;
    const err = onSubmit({ ...v, place, name });
    if (err) setError(err);
  };
  const label = "mb-3 flex flex-col gap-1 text-xs text-neutral-300";
  const num = (key: "width" | "height") => (
    <input type="number" min={7} max={200} className={DIALOG_INPUT} value={v[key]} onChange={(e) => setV({ ...v, [key]: Number(e.target.value) })} />
  );
  return (
    <Dialog title={t(`mapDialog.title.${mode}`)} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {mode === "new" && (
          <label className={label}>
            {t("mapDialog.world")}
            <select className={DIALOG_INPUT} disabled={!!LOCKED_WORLD} value={v.world} onChange={(e) => setV({ ...v, world: e.target.value as WorldId })}>
              {(Object.keys(WORLDS) as WorldId[]).map((w) => <option key={w} value={w}>{t(`mapDialog.world.${w}`)}</option>)}
            </select>
          </label>
        )}
        <label className={label}>
          {t("mapDialog.place")}
          <input className={DIALOG_INPUT} list={listId} value={v.place} placeholder={t("mapDialog.placePlaceholder")} onChange={(e) => setV({ ...v, place: e.target.value })} />
          <datalist id={listId}>{places.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <label className={label}>
          {t("mapDialog.name")}
          <input className={DIALOG_INPUT} value={v.name} placeholder={t("mapDialog.namePlaceholder")} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </label>
        {mode === "new" && (
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-neutral-300">
            <label className="flex flex-col gap-1">{t("mapDialog.width")}{num("width")}</label>
            <label className="flex flex-col gap-1">{t("mapDialog.height")}{num("height")}</label>
          </div>
        )}
        {id && ok && <p className="mb-3 text-xs text-neutral-400">{t("mapDialog.idHint", { id })}</p>}
        {error && <p role="alert" className="mb-3 text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={DIALOG_BUTTON} onClick={onClose}>{t("dialog.cancel")}</button>
          <button type="submit" className={DIALOG_PRIMARY} disabled={!ok}>{t(`mapDialog.submit.${mode}`)}</button>
        </div>
      </form>
    </Dialog>
  );
}
