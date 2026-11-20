import { useContext } from "react";
import { t } from "../../i18n";
import { useSharedImages } from "../../render/sharedImages";
import type { EditorBarProps } from "../EditorBar";
import { CommitContext } from "./parts";

type Props = Pick<EditorBarProps, "selectedEvent" | "onEventChange" | "onEventRemove" | "eventWorld">;
const field = "w-full rounded border border-neutral-600 bg-neutral-950 p-1 text-neutral-100";
const positions = ["top", "center", "bottom"] as const;

export function EventFields({ selectedEvent: event, onEventChange, onEventRemove, eventWorld }: Props) {
  const shared = useSharedImages();
  const commit = useContext(CommitContext);
  if (!event) return <p className="p-2">{t("events.place")}</p>;
  if (event.kind === "dialogue") return <div className="grid gap-2 p-2">
    <p>{t("events.dialogue")}: {event.library} / {event.entry}</p>
    <button type="button" className="justify-self-start rounded border border-neutral-600 px-2 py-1" onClick={onEventRemove}>
      {t("events.remove")}
    </button>
  </div>;
  const images = shared.filter(image => image.world === eventWorld && image.type === "portrait");
  return <div className="grid gap-2 p-2">
    {event.kind === "image" && <label>
      {t("events.still")}
      <select className={field} value={event.image ?? ""} onFocus={commit}
        onChange={e => onEventChange({ ...event, image: e.target.value || undefined })}>
        <option value="">{t("events.noImage")}</option>
        {event.image && !images.some(image => image.id === event.image) && <option value={event.image}>{event.image}</option>}
        {images.map(image => <option key={image.id} value={image.id}>{image.name}</option>)}
      </select>
    </label>}
    <label>
      {t("events.text")}
      <textarea className={field} rows={4} value={event.text} onFocus={commit}
        onChange={e => onEventChange({ ...event, text: e.target.value })}/>
    </label>
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={!event.clickOnly} onFocus={commit}
        onChange={e => onEventChange({ ...event, clickOnly: e.target.checked ? undefined : true })}/>
      {t("events.onUse")}
    </label>
    {event.kind === "message" && <>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={event.modal} onFocus={commit}
          onChange={e => onEventChange({ ...event, modal: e.target.checked })}/>
        {t("events.modal")}
      </label>
      <label>
        {t("events.position")}
        <select className={field} value={event.position} onFocus={commit}
          onChange={e => onEventChange({ ...event, position: positions[e.target.selectedIndex] ?? "center" })}>
          {positions.map(position => <option key={position} value={position}>{t(`events.${position}`)}</option>)}
        </select>
      </label>
      <label>
        {t("events.timeout")}
        <input className={field} type="number" min={0} step="any" value={event.timeout ?? ""} onFocus={commit}
          onChange={e => onEventChange({ ...event, timeout: e.target.valueAsNumber || undefined })}/>
      </label>
    </>}
    <button type="button" className="justify-self-start rounded border border-neutral-600 px-2 py-1" onClick={onEventRemove}>
      {t("events.remove")}
    </button>
  </div>;
}
