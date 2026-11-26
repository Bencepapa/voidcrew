import { PRISM_MAX_INSET, PRISM_MAX_SIDES, PRISM_MIN_SIDES, prismInset, prismSides } from "../game/propPrism";
import type { EditableProp } from "../game/props";
import { t } from "../i18n";
import { NumberField } from "./NumberField";

type Prism = Extract<EditableProp, { kind: "prism" }>;

export function PrismPropFields({ definition, textures, edit, field }: {
  definition: Prism; textures: ReadonlyMap<string, { label: string }>; edit: (patch: Partial<Prism>) => void; field: string;
}) {
  return <>
    <NumberField label={t("assetManager.propDraft.prismSides")} value={prismSides(definition.sides)}
      min={PRISM_MIN_SIDES} max={PRISM_MAX_SIDES} step={1} onChange={sides => edit({ sides })}/>
    <NumberField label={t("assetManager.propDraft.prismInset")} value={prismInset(definition.inset)}
      min={0} max={PRISM_MAX_INSET} step={1} unit="%" defaultValue={0} slider onChange={inset => edit({ inset })}/>
    <label>{t("assetManager.propDraft.textureB")}
      <select className={field} value={definition.textureB ?? ""} onChange={event => edit({ textureB: event.target.value || undefined })}>
        <option value="">{t("assetManager.propDraft.sameTexture")}</option>
        {definition.textureB && !textures.has(definition.textureB) && <option value={definition.textureB}>{definition.textureB}</option>}
        {[...textures].map(([id, texture]) => <option key={id} value={id}>{texture.label}</option>)}
      </select>
    </label>
    <p className="text-xs text-neutral-400">{t("assetManager.propDraft.prismHint")}</p>
  </>;
}
