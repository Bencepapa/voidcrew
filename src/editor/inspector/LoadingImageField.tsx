import { useContext } from "react";
import { t, type Key } from "../../i18n";
import { useSharedImages } from "../../render/sharedImages";
import type { WorldId } from "../../game/worlds";
import { CommitContext } from "./parts";

const FIELD = "min-w-0 max-w-full flex-1 bg-neutral-800 border border-neutral-700 px-1 py-0.5";

// A picker for a loading screen's picture (see MapFile.loadingImage): one of the
// shared still images of the world, those made for loading screens first. The
// chosen one shows as a small preview.
export function LoadingImageField({ value, world, label, hint, onChange }: {
  value: string | undefined;
  world: WorldId;
  label: Key;
  hint: Key;
  onChange: (id: string | undefined) => void;
}) {
  const commit = useContext(CommitContext);
  const stills = useSharedImages().filter((image) => image.type === "portrait" && image.world === world);
  const sorted = [...stills].sort((a, b) => Number(b.purpose === "loading") - Number(a.purpose === "loading") || a.name.localeCompare(b.name));
  const chosen = value ? stills.find((image) => image.id === value) : undefined;
  return (
    <div className="flex flex-col gap-1" title={t(hint)}>
      <label>{t(label)}
        <select className={FIELD} value={value ?? ""} onFocus={commit} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">{t("link.loadingImageNone")}</option>
          {value && !chosen && <option value={value}>{t("link.loadingImageMissing", { id: value })}</option>}
          {sorted.map((image) => <option key={image.id} value={image.id}>{image.name}</option>)}
        </select>
      </label>
      {chosen && <img src={chosen.url} alt="" className="h-16 w-full rounded-sm border border-neutral-700 object-cover" />}
    </div>
  );
}
