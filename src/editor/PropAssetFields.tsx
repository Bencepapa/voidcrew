import { useState } from "react";
import { t } from "../i18n";
import type { EditableProp } from "../game/props";
import { NumberField } from "./NumberField";
import { PrismPropFields } from "./PrismPropFields";
import { sharedConfigured, useSharedAuth } from "./sharedAuth";
import { attachPropTexture, discardPropDraft, getPropDrafts, PROP_SHAPES, propTextureId, propTextures, publishProp, savePropDraft, type PropDraft } from "./sharedProps";
import { errorText, SignInPopover } from "./TexturePanel";
import { BUTTON, idle } from "./inspector/parts";

const field = "w-full min-w-0 rounded border border-neutral-600 bg-neutral-900 px-2 py-1";

export function PropAssetFields({ draft, ownedReady, mapsBusy, onPublishing, onError }: {
  draft: PropDraft;
  ownedReady: boolean;
  mapsBusy: boolean;
  onPublishing: (busy: boolean) => void;
  onError: (message: string) => void;
}) {
  const { definition } = draft;
  const auth = useSharedAuth();
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const textures = propTextures(draft.world);
  const own = propTextureId(draft.id);
  const usesOwnTexture = definition.texture === own;
  const current = () => getPropDrafts().find(row => row.id === draft.id);

  function edit(patch: Partial<EditableProp>) {
    const latest = current();
    if (!latest || busy) return;
    try { savePropDraft({ ...latest, definition: { ...latest.definition, ...patch } }); }
    catch (error) { onError(errorText(error)); }
  }

  async function publish() {
    const latest = current();
    if (!latest || busy) return;
    setBusy(true);
    onPublishing(true);
    onError("");
    try { await publishProp(latest); }
    catch (error) { onError(errorText(error)); }
    finally { setBusy(false); onPublishing(false); }
  }

  async function useOwnTexture() {
    setBusy(true);
    onError("");
    try { await attachPropTexture(draft); }
    catch (error) { onError(errorText(error)); }
    finally { setBusy(false); }
  }

  function startPublish() {
    if (!sharedConfigured) { onError(t("assetManager.notConfigured")); return; }
    if (!auth.token) { setSignIn(true); return; }
    void publish();
  }

  return <details open className="rounded border border-neutral-800 p-2">
    <summary className="cursor-pointer font-semibold">{t("assetManager.propDraft.fields")}</summary>
    <fieldset disabled={busy || mapsBusy} className="mt-2 flex min-w-0 flex-col gap-2">
      <label>{t("assetManager.image.name")}
        <input className={field} value={definition.name ?? ""} maxLength={100} onChange={event => edit({ name: event.target.value })}/>
      </label>
      <label>{t("assetManager.propDraft.shape")}
        <select className={field} value={definition.kind} onChange={event => {
          const kind = PROP_SHAPES[event.target.selectedIndex];
          const [width, height] = definition.size;
          edit(kind === "prism" ? { kind, size: [width, height, width] } : { kind });
        }}>
          {PROP_SHAPES.map(kind => <option key={kind} value={kind}>{t(`assetManager.propDraft.${kind}`)}</option>)}
        </select>
      </label>
      <label>{t("assetManager.propDraft.texture")}
        <select className={field} value={definition.texture} onChange={event => {
          if (event.target.value === own) void useOwnTexture();
          else edit({ texture: event.target.value });
        }}>
          <option value="">{t("assetManager.propDraft.pickTexture")}</option>
          <option value={own}>{t("assetManager.propDraft.ownTexture")}</option>
          {definition.texture && !usesOwnTexture && !textures.has(definition.texture) && <option value={definition.texture}>{definition.texture}</option>}
          {[...textures].map(([id, texture]) => <option key={id} value={id}>{texture.label}</option>)}
        </select>
      </label>
      {definition.kind === "prism" && <PrismPropFields definition={definition} textures={textures} edit={edit} field={field}/>}
      {(["width", "height", "depth"] as const).map((axis, index) =>
        <NumberField key={axis} value={definition.size[index]} min={axis === "depth" ? .01 : .05} max={8} step={.01}
          label={t(`assetManager.propDraft.${axis}`)} onChange={value => {
            const size: EditableProp["size"] = [...definition.size];
            size[index] = value;
            edit({ size });
          }}/>)}
      <p className="text-xs text-neutral-400">{t("assetManager.propDraft.footprintHint")}</p>
      <NumberField label={t("assetManager.propDraft.elevation")} value={definition.elevation ?? 0} min={0} max={8} step={.05}
        defaultValue={0} onChange={elevation => edit({ elevation })}/>
      {definition.kind !== "billboard" && definition.kind !== "prism" && <NumberField label={t("assetManager.reliefDepth")} value={definition.relief ?? 1}
        min={0} max={3} step={.05} defaultValue={1} onChange={relief => edit({ relief })}/>}
      <label><input type="checkbox" checked={definition.wall ?? false} onChange={event => edit({ wall: event.target.checked })}/> {t("assetManager.propDraft.wall")}</label>
      <label><input type="checkbox" checked={definition.blocks ?? false} onChange={event => edit({ blocks: event.target.checked })}/> {t("assetManager.propDraft.blocks")}</label>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={`${BUTTON} ${idle}`} disabled={!definition.name?.trim() || !(usesOwnTexture ? ownedReady : textures.has(definition.texture))}
          onClick={startPublish}>{t("assetManager.image.publish")}</button>
        <button type="button" className={`${BUTTON} ${idle}`} onClick={async () => {
          if (!window.confirm(t("assetManager.image.discardConfirm", { name: definition.name || t("assetManager.untitled") }))) return;
          try { await discardPropDraft(draft.id); } catch (error) { onError(errorText(error)); }
        }}>{t("assetManager.image.discard")}</button>
      </div>
    </fieldset>
    <p className="mt-1 text-xs text-yellow-300">{t(busy ? "assetManager.image.working" : "assetManager.image.statusDraft")}</p>
    {signIn && <SignInPopover className="fixed left-1/2 top-24 z-30 -translate-x-1/2"
      onDone={() => { setSignIn(false); void publish(); }} onCancel={() => setSignIn(false)} onError={onError}/>}
  </details>;
}
