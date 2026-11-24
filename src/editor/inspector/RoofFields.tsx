import { t } from "../../i18n";
import type { EditorBarProps } from "../EditorBar";
import { ROOF_FORMS } from "../../game/roofAutotile";
import { textureSetsOfKind } from "../../render/textureSets";
import { useTextureVersion } from "../textureLibrary";
import { KindChoice } from "./parts";
import { TexturePicker, textureOptions } from "../TexturePicker";

// The settings of the Roof tool's next roof: its form and the texture its new pieces wear
// (a piece already placed is changed in its own inspector, and that changes the whole roof)
export function RoofFields(p: EditorBarProps) {
  useTextureVersion();
  return <div className="flex min-w-0 flex-col gap-2 border-t border-neutral-700 p-2 [&_select]:min-w-0 [&_select]:max-w-full [&_select]:flex-1 [&_select]:border [&_select]:border-neutral-700 [&_select]:bg-neutral-800">
    <p className="text-neutral-400">{t("roofauto.help")}</p>
    <KindChoice label={t("roofauto.form")} title={t("roofauto.formHint")} value={p.roofForm}
      options={ROOF_FORMS.map(value => ({ value, label: t(`roofauto.${value}`) }))}
      onChange={form => p.onRoofForm(form as typeof p.roofForm)}/>
    <p className="text-neutral-500">{t(`roofauto.hint.${p.roofForm}`)}</p>
    <TexturePicker label={t("editorBar.texture")} value={p.roofTexture}
      options={textureOptions(textureSetsOfKind("wall").filter(id => id !== "sky"), [{ value: "", label: t("editorBar.itsOwn") }])}
      onChange={p.onRoofTexture}/>
  </div>;
}
