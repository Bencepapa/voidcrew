import { useMemo, useState } from "react";
import { DEFAULT_SETTINGS, GameViewport } from "../components/GameViewport";
import { DOOR_MOTIONS, type DoorType } from "../game/doorTypes";
import { parseMap } from "../game/mapFormat";
import type { ReliefMode } from "../game/renderLook";
import type { WorldId } from "../game/worlds";
import { t } from "../i18n";
import { NumberField } from "./NumberField";
import { BUTTON, idle } from "./inspector/parts";
import { sharedConfigured, useSharedAuth } from "./sharedAuth";
import { discardDoorDraft, doorTextureOptions, getDoorDrafts, publishDoor, saveDoorDraft, type DoorDraft } from "./sharedDoorTypes";
import { errorText, SignInPopover } from "./TexturePanel";
import { isEditable } from "./textureLibrary";

const field = "block w-full min-w-0 rounded border border-neutral-600 bg-neutral-900 px-2 py-1";
const front = { x: 2, y: 3 };
const rear = { x: 2, y: 1 };
const noDoorsOpen = new Set<string>();
const sampleDoorOpen = new Set(["2,2"]);
const sceneLayout = ["WWWWW", "W...W", "WWDWW", "W...W", "WWWWW"];

export function DoorAssemblyPreview({ door, world, reliefMode, reliefDepth, wallDetail }: {
  door: DoorType; world: WorldId; reliefMode: ReliefMode; reliefDepth: number; wallDetail: number;
}) {
  const [open, setOpen] = useState(false);
  const [back, setBack] = useState(false);
  const map = useMemo(() => ({
    ...parseMap("asset-door-preview", {
      name: "", deck: 0, layout: sceneLayout, start: { x: 2, y: 3, facing: "N" },
      doors: [{ x: 2, y: 2, kind: "standard", facing: "S" }],
    }), world,
  }), [world]);
  const { leaf, frame, motion, hinge, swingTo, angle } = door;
  const preview = useMemo(() => ({ name: "", leaf, frame, motion, hinge, swingTo, angle }), [leaf, frame, motion, hinge, swingTo, angle]);
  const settings = useMemo(() => ({
    ...DEFAULT_SETTINGS, wallProfile: "flat" as const, reliefMode, reliefDepth, wallDetail,
    normalMaps: 1 as const, particleQuality: 0, pixelRatioCap: 1, decalsEnabled: false, headlamp: true,
  }), [reliefMode, reliefDepth, wallDetail]);
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <span>{t("assetManager.doorType.assembly")}</span>
      <button type="button" className={`${BUTTON} ${idle}`} onClick={() => setOpen(value => !value)}>
        {t(open ? "assetManager.doorType.shut" : "assetManager.doorType.open")}
      </button>
      <button type="button" className={`${BUTTON} ${idle}`} aria-pressed={back} onClick={() => setBack(value => !value)}>
        {t("assetManager.doorType.reverseView")}
      </button>
    </div>
    <div className="relative min-h-64 flex-1 overflow-hidden rounded border border-neutral-800">
      <GameViewport map={map} doorPreview={preview} pos={back ? rear : front} dir={back ? "S" : "N"} elevation={0}
        openDoors={open ? sampleDoorOpen : noDoorsOpen} settings={settings}/>
    </div>
  </div>;
}

export function DoorAssetFields({ asset, editable, onError }: {
  asset: DoorDraft; editable: boolean; onError: (message: string) => void;
}) {
  const auth = useSharedAuth();
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const { definition, world, id } = asset;
  const textures = doorTextureOptions(world);

  function edit(patch: Partial<DoorType>) {
    const latest = getDoorDrafts().find(draft => draft.id === id);
    if (!latest || busy || !editable) return;
    try { saveDoorDraft({ ...latest, definition: { ...latest.definition, ...patch } }); }
    catch (error) { onError(errorText(error)); }
  }

  async function publish() {
    const latest = getDoorDrafts().find(draft => draft.id === id);
    if (!latest || busy) return;
    setBusy(true);
    try { await publishDoor(latest); }
    catch (error) { onError(errorText(error)); }
    finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-2 text-sm">
    <fieldset disabled={!editable || busy} className="flex min-w-0 flex-col gap-2">
      <label>{t("assetManager.image.name")}
        <input className={field} value={definition.name} maxLength={100} onChange={e => edit({ name: e.target.value })}/>
      </label>
      {(["leaf", "frame"] as const).map(key => <label key={key}>{t(`assetManager.doorType.${key}`)}
        <select className={field} value={definition[key]} onChange={e => edit({ [key]: e.target.value })}>
          {!textures.some(([id]) => id === definition[key]) && <option value={definition[key]}>{definition[key]}</option>}
          {textures.map(([id, texture]) => <option key={id} value={id}>{texture.label}</option>)}
        </select>
      </label>)}
      <label>{t("assetManager.doorType.motion")}
        <select className={field} value={definition.motion} onChange={e => edit({ motion: DOOR_MOTIONS[e.target.selectedIndex] })}>
          {DOOR_MOTIONS.map(motion => <option key={motion} value={motion}>{t(`assetManager.doorType.${motion}`)}</option>)}
        </select>
      </label>
      {definition.motion === "swing" && <>
        <label>{t("assetManager.doorType.hinge")}
          <select className={field} value={definition.hinge} onChange={e => edit({ hinge: e.target.value === "right" ? "right" : "left" })}>
            <option value="left">{t("assetManager.doorType.left")}</option>
            <option value="right">{t("assetManager.doorType.right")}</option>
          </select>
        </label>
        <label>{t("assetManager.doorType.swingTo")}
          <select className={field} value={definition.swingTo} onChange={e => edit({ swingTo: e.target.value === "back" ? "back" : "front" })}>
            <option value="front">{t("assetManager.doorType.front")}</option>
            <option value="back">{t("assetManager.doorType.back")}</option>
          </select>
        </label>
        <NumberField label={t("assetManager.doorType.angle")} value={definition.angle} min={45} max={140} step={5} unit="°" defaultValue={90}
          onChange={angle => edit({ angle })}/>
      </>}
    </fieldset>
    {/* a door type owns no texture: its leaf and frame are textures of the Textures category, whose maps (depth, normal, AI)
        are edited there with the shared channel UI; for an editable (shared) one this opens it */}
    {(["leaf", "frame"] as const).filter(key => isEditable(definition[key])).map(key =>
      <button key={key} type="button" className={`${BUTTON} ${idle} self-start`}
        onClick={() => window.dispatchEvent(new CustomEvent("voidcrew:open-asset", { detail: { sample: "material", id: definition[key] } }))}>
        {t(`assetManager.doorType.${key}`)} · {t("assetManager.openTexture")}
      </button>)}
    {editable && <div className="flex flex-wrap gap-1">
      <button type="button" className={`${BUTTON} ${idle}`} disabled={busy || !definition.name.trim()} onClick={() => {
        if (!sharedConfigured) onError(t("assetManager.notConfigured"));
        else if (!auth.token) setSignIn(true);
        else void publish();
      }}>{t("assetManager.image.publish")}</button>
      <button type="button" className={`${BUTTON} ${idle}`} disabled={busy} onClick={() => {
        if (!window.confirm(t("assetManager.image.discardConfirm", { name: definition.name || t("assetManager.untitled") }))) return;
        try { discardDoorDraft(id); } catch (error) { onError(errorText(error)); }
      }}>{t("assetManager.image.discard")}</button>
    </div>}
    <p className="text-xs text-neutral-400">{t(editable ? busy ? "assetManager.image.working" : "assetManager.image.statusDraft" : "assetManager.image.statusPublished")}</p>
    {signIn && <SignInPopover className="fixed left-1/2 top-24 z-30 -translate-x-1/2"
      onDone={() => { setSignIn(false); void publish(); }} onCancel={() => setSignIn(false)} onError={onError}/>}
  </div>;
}
