import { PRISM_MAX_INSET, PRISM_MAX_SIDES, PRISM_MIN_SIDES, prismInset, prismSides, prismWrap } from "../game/propPrism";
import type { EditableProp } from "../game/props";
import { t } from "../i18n";
import { searchAnchor } from "../search/searchAnchor";
import { NumberField } from "./NumberField";

type Prism = Extract<EditableProp, { kind: "prism" }>;

export function PrismPropFields({ definition, textures, edit, field, readOnly }: {
  definition: Prism; textures: ReadonlyMap<string, { label: string }>; edit: (patch: Partial<Prism>) => void; field: string; readOnly?: boolean;
}) {
  return <>
    <NumberField disabled={readOnly} anchor={searchAnchor("assetManager.prop.sides")} label={t("assetManager.propDraft.prismSides")} value={prismSides(definition.sides)}
      min={PRISM_MIN_SIDES} max={PRISM_MAX_SIDES} step={1} onChange={sides => edit({ sides })}/>
    <NumberField disabled={readOnly} anchor={searchAnchor("assetManager.prop.inset")} label={t("assetManager.propDraft.prismInset")} value={prismInset(definition.inset)}
      min={0} max={PRISM_MAX_INSET} step={1} unit="%" defaultValue={0} slider onChange={inset => edit({ inset })}/>
    <NumberField disabled={readOnly} anchor={searchAnchor("assetManager.prop.wrap")} label={t("assetManager.propDraft.prismWrap")} value={prismWrap(definition.wrap)}
      min={0} max={PRISM_MAX_SIDES} step={1} defaultValue={0} slider onChange={wrap => edit({ wrap })}/>
    <label>{t("assetManager.propDraft.textureB")}
      <select {...searchAnchor("assetManager.prop.textureB")} className={field} value={definition.textureB ?? ""} onChange={event => edit({ textureB: event.target.value || undefined })}>
        <option value="">{t("assetManager.propDraft.sameTexture")}</option>
        {definition.textureB && !textures.has(definition.textureB) && <option value={definition.textureB}>{definition.textureB}</option>}
        {[...textures].map(([id, texture]) => <option key={id} value={id}>{texture.label}</option>)}
      </select>
    </label>
    <p className="text-xs text-neutral-400">{t("assetManager.propDraft.prismHint")}</p>
  </>;
}
