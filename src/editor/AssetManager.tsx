import { t, type Key } from "../i18n";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PROP_TYPES, PROP_RELIEF_SCALE, isSharedPropId, propEditable, propReliefAmount, propReliefCells } from "../game/props";
import { ACTOR_TYPES, actorHeight } from "../game/actors";
import { ActorSizeFields, useActorSizes } from "./ActorSizeFields";
import { actorView, isSharedActorId } from "../game/actorSheets";
import { actorSheetFiles } from "../render/actorSheetFiles";
import { ActorThumb, Thumb } from "./Thumb";
import { actorOffsets } from "../render/actorOffsets";
import { ActorEditor } from "./ActorEditor";
import { NpcAssetEditor } from "./NpcAssetEditor";
import { createActorDraft, loadActorDrafts, loadSharedActors, reviseActor, useActorDrafts, useSharedActorVersion, type ActorDraft } from "./sharedActors";
import { TEXTURE_SETS, type TextureSetPaths } from "../render/textureSets";
import { baseMaps, channels, type Channel, type MaterialMaps } from "./materialMaps";
import { decode } from "./imageTools";
import { AutoBadge, ChannelControls, errorText, SignInPopover, TextureFields, UnsavedBar, useTextureEditor } from "./TexturePanel";
import { useDialogueDrafts } from "./dialogueDrafts";
import { useShopDrafts } from "./shopDrafts";
import { draftCounts, draftId, isPropTexture, newDraft, saveDraft, useDrafts, type SurfaceKind } from "./textureDrafts";
import { autoChannels, isEditable, textureStatus, useTextureVersion, wantSharedTexture } from "./textureLibrary";
import { ChannelCards, useBlobUrl } from "./ChannelControls";
import { ownedPropTexture, SURFACE_CHANNELS } from "./channelEditor";
import { loadSharedTextures } from "./sharedTextures";
import { loadOnce, type LoadKind } from "./loadGate";
import { SharedHttpError, sharedConfigured, sharedToken } from "./sharedAuth";
import { migrateLegacyPreviews, readPreview, writePreview, type PreviewMaps } from "./previewStore";
import { Lock, RefreshCw } from "lucide-react";
import { DEFAULT_SETTINGS, FLOOR_BASE_DEPTH } from "../components/GameViewport";
import type { ReliefMode } from "../game/renderLook";
import { createReliefWallGeometry, downsampleHeightGrid, loadHeightGrid } from "../render/reliefMesh";

const button = "rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 text-left text-neutral-200 hover:bg-neutral-700 aria-pressed:border-amber-400 aria-pressed:bg-amber-400/15 aria-pressed:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40";
const selectClass = "min-w-0 rounded-sm border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-xs text-neutral-200";
export type Sample = "material" | "actor" | "prop" | "item" | "still" | "sky" | "door" | "dialogue" | "shop" | "sound";
type Entry = { key: string; label: string; img: string; groups: string[]; world: WorldId; draft?: ImageDraft; image?: SharedImage; builtinDecal?: string; propDraft?: PropDraft; actorDraft?: ActorDraft };
import { ITEM_TYPES } from "../game/items";
import { activeWorld, assetInWorld, assetWorld, type WorldId } from "../game/worlds";
import { fetchDecalManifest } from "../render/decals";
import { sharedImage, useSharedImages, type ImagePurpose, type SharedImage } from "../render/sharedImages";
import { neutralStyle } from "./inspector/parts";
import { createImageDraft, loadSharedImages, getImageDrafts, useImageDrafts, type ImageDraft } from "./sharedImages";
import { ImageAssetInspector, useImageDraftPreview, usePickupDraftMaps } from "./ImageAssetsPanel";
import { propEdit } from "./propEditState";
import { attachPropTexture, createPropDraft, getPropDrafts, loadSharedProps, propTextures, reviseSharedProp, usePropDrafts, useSharedPropVersion, type PropDraft } from "./sharedProps";
import { PropAssetFields } from "./PropAssetFields";
import { DialoguesPanel } from "./DialoguesPanel";
import { ShopsPanel } from "./ShopsPanel";
import { SoundAssetsPanel } from "./SoundAssetsPanel";
import { searchAnchor } from "../search/searchAnchor";
import { isPrismField, type AssetManagerSearchRequest } from "../search/assetManagerTargets";
import { findSearchProp, searchPropExample } from "./assetManagerSearchProps";
import { loadSharedSounds } from "./sharedSounds";
import { SOUND_CATEGORIES, isSoundCategory } from "../audio/sharedSamples";
import { prismFaces, prismInset, prismSides } from "../game/propPrism";
import { propPrismGeometry } from "../render/propPrismMesh";
import { DoorAssemblyPreview, DoorAssetFields } from "./DoorAssetFields";
import { createDoorDraft, getDoorDrafts, loadSharedDoors, useDoorCatalog, useDoorDrafts } from "./sharedDoorTypes";
import { textureFolder } from "../render/textureSets";
import { saveTextureTuning, setTextureTuning, textureTuning, textureTuningJson, type TextureTuning } from "../render/textureTuning";
const displayKeys: Record<string,
  Key> = {
  "All": "assetManager.all",
  "scifi": "assetManager.scifi",
  "fantasy": "assetManager.fantasy",
  "Textures": "assetManager.textures",
  "Props": "assetManager.props",
  "NPCs": "assetManager.npcs",
  "Items": "assetManager.items",
  "wall": "assetManager.wallFilter",
  "floor": "assetManager.floorFilter",
  "ceiling": "assetManager.ceilingFilter",
  "traverse": "traverse.group",
  "3D": "assetManager.threeD",
  "billboard": "assetManager.billboard",
  "decal": "assetManager.decal",
  "Wall": "assetManager.wall",
  "Floor": "assetManager.floor",
  "Ceiling": "assetManager.ceiling",
  "Single": "assetManager.single",
  "Pair": "assetManager.pair",
  "Block": "assetManager.block",
  "Auto": "assetManager.auto",
  "On": "assetManager.on",
  "Off": "assetManager.off",
  "Empty": "assetManager.emptyRoom",
  "Gray": "assetManager.gray",
  "3×3": "assetManager.room3",
  "5×5": "assetManager.room5",
  "Selected texture": "assetManager.selectedTexture",
  "textured": "assetManager.textured",
  "faces": "assetManager.faces",
  "wireframe": "assetManager.wireframe",
  "normals": "assetManager.normals",
  "depth": "assetManager.depth",
  "diffuse": "assetManager.diffuse",
  "normal": "assetManager.normal",
  "glow": "assetManager.glow",
  "emissive": "assetManager.emissive",
  "gloss": "assetManager.gloss",
  "metal": "assetManager.metal"
};
const display = (value: string) => t(displayKeys[value]);
const categories: { value: Sample; label: Key }[] = [
  { value: "material", label: "assetManager.textures" },
  { value: "prop", label: "assetManager.props" },
  { value: "door", label: "assetManager.doorType.title" },
  { value: "actor", label: "assetManager.npcs" },
  { value: "item", label: "assetManager.pickups" },
  { value: "still", label: "assetManager.stills" },
  { value: "sky", label: "assetManager.skies" },
  { value: "dialogue", label: "assetManager.dialogues" },
  { value: "shop", label: "assetManager.shops" },
  { value: "sound", label: "sound.assets.title" },
];
const subsOf: Record<Sample, string[]> = {
  material: ["All", "wall", "floor", "ceiling", "traverse"],
  prop: ["All", "3D", "billboard", "decal"],
  actor: ["All"],
  door: ["All"],
  item: ["All"],
  still: ["All", "loading", "portrait", "room"],
  sky: ["All"],
  dialogue: ["All"],
  shop: ["All"],
  sound: ["All", ...SOUND_CATEGORIES],
};
const subLabel = (sample: Sample, value: string) => {
  if (value === "All") return t("assetManager.all");
  if (sample === "sound" && isSoundCategory(value)) return t(`sound.assets.category.${value}`);
  if (value === "wall") return t("assetManager.wall");
  if (value === "floor") return t("assetManager.floor");
  if (value === "ceiling") return t("assetManager.ceiling");
  if (value === "traverse") return t("traverse.group");
  if (value === "decal") return t("assetManager.decals");
  if (sample === "still") {
    if (value === "loading") return t("assetManager.image.purposeLoading");
    if (value === "room") return t("assetManager.image.purposeRoom");
    if (value === "portrait") return t("assetManager.image.purposePortrait");
  }
  return t(displayKeys[value]);
};
const worldName = (world: WorldId) => t(world === "fantasy" ? "assetManager.fantasy" : "assetManager.scifi");

// A still draft's own preview, processed the same way as the game will see it.
function DraftThumb({ draft }: { draft: ImageDraft }) {
  const url = useImageDraftPreview(draft);
  return url
    ? <img src={url} alt="" className="h-9 w-9 shrink-0 object-contain"/>
    : <span className="grid h-9 w-9 shrink-0 place-items-center text-neutral-500">…</span>;
}

function useImageSize(url?: string) {
  const [size, setSize] = useState<{ width: number; height: number }>();
  useEffect(() => {
    setSize(undefined);
    if (!url) return;
    let live = true;
    const image = new Image();
    image.onload = () => { if (live) setSize({ width: image.naturalWidth, height: image.naturalHeight }); };
    image.src = url;
    return () => { live = false; };
  }, [url]);
  return size;
}

// A still image is not a room: show it flat, with wheel zoom and drag to pan. The percentage is the real scale
// (Fit = the scale that fits the window, 100% = one image pixel per screen pixel); the wheel zooms from the shown scale.
function StillPreview({ url, alt }: { url?: string; alt: string }) {
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => { setFit(true); setZoom(1); setPan({ x: 0, y: 0 }); setNatural({ w: 0, h: 0 }); }, [url]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [url]);
  if (!url) return <div className="grid h-full min-h-0 place-items-center rounded-sm border border-neutral-800 text-sm text-neutral-500">{t("assetManager.image.noPng")}</div>;
  const fitScale = natural.w > 0 && natural.h > 0 && box.w > 0 && box.h > 0 ? Math.min((box.w - 2) / natural.w, (box.h - 2) / natural.h) : 1;
  const scale = fit ? fitScale : zoom;
  const clamp = (value: number) => Math.min(16, Math.max(.05, value));
  return <div className="flex min-h-0 flex-1 flex-col gap-1">
    <div className="flex shrink-0 items-center gap-1 text-xs">
      <button type="button" className={button} onClick={() => { setFit(true); setPan({ x: 0, y: 0 }); }}>{t("assetManager.fit")}</button>
      <button type="button" className={button} onClick={() => { setFit(false); setZoom(1); setPan({ x: 0, y: 0 }); }}>{t("assetManager.actualSize")}</button>
      <span className="text-neutral-400">{Math.round(scale * 100)}%</span>
    </div>
    <div ref={area} className="relative min-h-0 flex-1 overflow-hidden rounded-sm border border-neutral-800 bg-neutral-900 [&_img]:select-none"
      onWheel={event => { event.preventDefault(); event.stopPropagation(); const next = clamp(scale * Math.exp(-event.deltaY * .0015)); setFit(false); setZoom(next); }}
      onPointerDown={event => { if (event.button !== 0 || fit) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y }; }}
      onPointerMove={event => { if (!drag.current) return; setPan({ x: drag.current.px + event.clientX - drag.current.x, y: drag.current.py + event.clientY - drag.current.y }); }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}>
      <img src={url} alt={alt} draggable={false}
        onLoad={event => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
        className="absolute left-1/2 top-1/2 max-h-none max-w-none object-contain"
        style={natural.w > 0 ? { width: natural.w, height: natural.h, transform: `translate(calc(-50% + ${fit ? 0 : pan.x}px), calc(-50% + ${fit ? 0 : pan.y}px)) scale(${scale})`, imageRendering: scale > 2 ? "pixelated" : "auto" } : { opacity: 0 }}/>
    </div>
  </div>;
}
// the dev server can write textureTuning.json; a production build can only download it
const dev = import.meta.env.DEV;
const catalog = TEXTURE_SETS as Record<string, TextureSetPaths>;
// the Traverse group's textures: every door set (leaf, frame, lift door; per world), see isTraverse
// (ladders and bridges are built in code, no texture yet)
// the texture folder a prop shows (also the key of its tuning)
function propTexture(id: string) {
  const p = PROP_TYPES[id];
  return p.kind==="views" ? p.views+"_front" : p.kind==="box" ? p.side : p.kind==="cabin" ? p.door : ("texture" in p && p.texture) || "wall4";
}
function propImage(id: string) {
  const tex = propTexture(id);
  return (catalog[tex] ?? textureFolder(tex)).diffuse;
}
// what the tuning sliders change (see textureTuning.ts); every one a multiplier of the game's own value
const TUNING: { key: keyof TextureTuning; label: Key; max: number; hint: Key }[] = [
  { key: "normal", label: "assetManager.normalForce", max: 3, hint: "assetManager.normalHint" },
  { key: "relief", label: "assetManager.reliefDepth", max: 3, hint: "assetManager.reliefHint" },
  { key: "rough", label: "assetManager.roughness", max: 2, hint: "assetManager.roughHint" },
  { key: "metal", label: "assetManager.metalness", max: 3, hint: "assetManager.metalHint" },
];


export function openAssetManager(sample: Sample, id: string, search?: AssetManagerSearchRequest) {
  window.dispatchEvent(new CustomEvent("voidcrew:open-asset", {detail: {sample, id, search}}));
}

export function AssetManager({ reliefMode, reliefDepth, wallDetail }: {
  reliefMode: ReliefMode;
  reliefDepth: number;
  wallDetail: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const imageCatalog = useSharedImages();
  const actorDrafts = useActorDrafts();
  // (the built-in NPC size factors: the preview is built again when the selected one's changes)
  const npcSizes = useActorSizes();
  const actorVersion = useSharedActorVersion();
  const [npcEditor, setNpcEditor] = useState<string | ActorDraft | null>(null);
  const [openingNpc, setOpeningNpc] = useState(false);
  const [sample, setSample] = useState<Sample>("material");
  const [selected, select] = useState("fantasywall1");
  const [world, setWorld] = useState<WorldId | "All">("All");
  const [sub, setSub] = useState("All");
  const [query, setQuery] = useState("");
  const [searchRequest, setSearchRequest] = useState<AssetManagerSearchRequest>();
  const drafts = useDrafts();
  const imageDrafts = useImageDrafts();
  const propDrafts = usePropDrafts();
  const doorDrafts = useDoorDrafts();
  const dialogueDrafts = useDialogueDrafts();
  const shopDrafts = useShopDrafts();
  const doorCatalog = useDoorCatalog();
  useSharedPropVersion();
  const pendingScroll = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useTextureVersion();
  useEffect(() => {
    const openAsset = (event: Event) => {
      const {sample, id: requestedId, search} = (event as CustomEvent<{sample: Sample; id: string; search?: AssetManagerSearchRequest}>).detail;
      const id = requestedId || (search?.propField ? findSearchProp(search.propField, activeWorld(), getPropDrafts(), PROP_TYPES, assetInWorld) : "");
      setSearchRequest(search);
      setQuery("");
      if (search?.propField) setPanelOpen(true);
      const imageDraft = getImageDrafts().find(d => d.id === id);
      // Select the category, sub-category and world that make the item visible.
      const propDraft = getPropDrafts().find(draft => draft.id === id);
      const doorDraft = getDoorDrafts().find(draft => draft.id === id);
      if (doorDraft) {
        setSample("door"); setSub("All"); setWorld(doorDraft.world);
      } else if (propDraft) {
        setSample("prop"); setSub("All"); setWorld(propDraft.world);
      } else if (imageDraft) {
        // (a local image draft: its category, purpose and world)
        if (imageDraft.type === "decal") { setSample("prop"); setSub("decal"); }
        else if (imageDraft.type === "item") { setSample("item"); setSub("All"); }
        else if (imageDraft.type === "sky") { setSample("sky"); setSub("All"); }
        else { setSample("still"); setSub(imageDraft.purpose ?? "portrait"); }
        setWorld(imageDraft.world);
      } else if (sample === "material") {
        setSample("material"); setSub("All"); setWorld(id ? assetWorld(id) : activeWorld());
      } else if (sample === "prop") {
        if (id.startsWith("decal:")) {
          const name = id.slice(6);
          setSample("prop"); setSub("decal"); setWorld(sharedImage(name)?.world ?? assetWorld(name));
        } else {
          const kind = PROP_TYPES[id]?.kind;
          setSample("prop"); setSub(kind === "billboard" || kind === "cross" ? "billboard" : "3D");
          setWorld(id ? assetWorld(id) : activeWorld());
        }
      } else {
        setSample(sample); setSub("All"); setWorld(id ? assetWorld(id) : activeWorld());
      }
      select(id); setOpen(true);
    };
    window.addEventListener("voidcrew:open-asset", openAsset);
    return () => window.removeEventListener("voidcrew:open-asset", openAsset);
  }, []);
  const [orientation, orient] = useState("Wall");
  const [background, setBackground] = useState("Gray");
  const [ceiling, setCeiling] = useState("Auto");
  const [rgb, setRgb] = useState(false);
  const [pose, setPose] = useState(-1);
  const [placement, setPlacement] = useState("Auto");
  const [decals,setDecals] = useState<Awaited<ReturnType<typeof fetchDecalManifest>>>({});
  useEffect(()=>{if(open) fetchDecalManifest(import.meta.env.BASE_URL,"").then(setDecals).catch(()=>setError(t("assetManager.loadDecals")));},[open]);
  const isTraverse = (v: TextureSetPaths) => [v.kind].flat().includes("door");
  const decalDrafts = imageDrafts.filter(d => d.type === "decal");
  const stillDrafts = imageDrafts.filter(d => d.type === "portrait");
  const pickupDrafts = imageDrafts.filter(d => d.type === "item");
  const skyDrafts = imageDrafts.filter(d => d.type === "sky");
  // (the Dialogues and Shops categories are panels of their own, with no asset list, world or preview)
  const ownPanel = sample==="dialogue" || sample==="shop" || sample==="sound";
  const entries: Entry[] = ownPanel ? []
    : sample==="material" ? Object.entries(catalog).filter(([key,v])=>(!!searchRequest && key===selected)||isTraverse(v)||[v.kind].flat().some(k=>["wall","floor","ceiling"].includes(k))).map(([key,v])=>({key,label:v.label,img:v.diffuse,groups:isTraverse(v)?["traverse"]:[v.kind].flat() as string[],world:assetWorld(key)}))
      // (a new draft with no diffuse yet isn't in the registry)
      .concat(drafts.filter(d=>!isPropTexture(d.kinds) && !catalog[draftId(d)]).map(d=>({key:draftId(d),label:d.name || t("assetManager.untitled"),img:"",groups:d.kinds as string[],world:d.world})))
    : sample==="door" ? [...doorCatalog.filter(asset => !doorDrafts.some(draft => draft.id === asset.id)), ...doorDrafts]
      .map(({id,world,definition}) => ({ key:id, world, label:definition.name || t("assetManager.untitled"),
        img:catalog[definition.leaf]?.diffuse ?? "", groups:[] }))
    : sample==="actor" ? [
      ...Object.entries(ACTOR_TYPES).map(([key, v]) => ({
        key, label: actorDrafts.find(d => d.id === key)?.name || v.name, img: actorSheetFiles(v).diffuse,
        groups: [], world: assetWorld(key), actorDraft: actorDrafts.find(d => d.id === key),
      })),
      ...actorDrafts.filter(d => !ACTOR_TYPES[d.id]).map(d => ({
        key: d.id, label: d.name || t("assetManager.untitled"), img: "", groups: [], world: d.world, actorDraft: d,
      })),
    ]
    : sample==="item" ? [
      // (a published pickup being revised is listed once: as its draft)
      ...Object.entries(ITEM_TYPES).filter(([key])=>!pickupDrafts.some(d=>d.id===key)).map(([key,v])=>{
        const image = imageCatalog.find(image=>image.id === key);
        return {key,label:v.name,img:image?.url ?? textureFolder("item_"+key).diffuse,groups:[],world:assetWorld(key),image};
      }),
      ...pickupDrafts.map(d=>({key:d.id,label:d.name || t("assetManager.untitled"),img:"",groups:[],world:d.world,draft:d})),
    ]
    : sample==="still" ? [
      ...imageCatalog.filter(image=>image.type==="portrait").map(image=>({key:image.id,label:image.name,img:image.url,groups:[image.purpose ?? "portrait"],world:image.world,image})),
      ...stillDrafts.map(d=>({key:d.id,label:d.name || t("assetManager.untitled"),img:"",groups:[d.purpose ?? "portrait"],world:d.world,draft:d})),
    ]
    : sample==="sky" ? [
      // (a published sky being revised is listed once: as its draft)
      ...imageCatalog.filter(image=>image.type==="sky" && !skyDrafts.some(d=>d.id===image.id)).map(image=>({key:image.id,label:image.name,img:image.url,groups:[],world:image.world,image})),
      ...skyDrafts.map(d=>({key:d.id,label:d.name || t("assetManager.untitled"),img:"",groups:[],world:d.world,draft:d})),
    ]
    : [...Object.entries(PROP_TYPES).filter(([key,v])=>v.kind!=="fence" && v.kind!=="operable" && !propDrafts.some(draft=>draft.id===key)).map(([key,v])=>({key,label:v.name ?? key,img:propImage(key),groups:[v.kind==="billboard"||v.kind==="cross"?"billboard":"3D"],world:assetWorld(key)})),
      ...propDrafts.map(d=>({key:d.id,label:d.definition.name || t("assetManager.untitled"),img:catalog[d.definition.texture]?.diffuse ?? propTextures(d.world).get(d.definition.texture)?.diffuse ?? "",
        groups:[d.definition.kind==="billboard"||d.definition.kind==="cross"?"billboard":"3D"],world:d.world,propDraft:d})),
      ...Object.keys(decals).map(d=>({key:"decal:"+d,label:d,img:import.meta.env.BASE_URL+"decals/"+d+"/diffuse.png",groups:["decal"],world:assetWorld(d),builtinDecal:d})),
      ...imageCatalog.filter(image=>image.type==="decal" && !decalDrafts.some(d=>d.id===image.id)).map(image=>({key:"decal:"+image.id,label:image.name,img:image.url,groups:["decal"],world:image.world,image})),
      ...decalDrafts.map(d=>({key:d.id,label:d.name || t("assetManager.untitled"),img:"",groups:["decal"],world:d.world,draft:d}))];
  const visible = entries.filter(e=>(world==="All" || (e.draft || e.image || e.propDraft || e.actorDraft ? e.world===world : assetInWorld(e.key.replace(/^decal:/,""),world))) &&
    (sub==="All" || e.groups.includes(sub) || (e.propDraft && e.key===selected && sub!=="decal")));
  const term = query.trim().toLocaleLowerCase();
  const shown = term ? visible.filter(e=>`${e.label} ${e.key}`.toLocaleLowerCase().includes(term)) : visible;
  const entry = shown.find(e=>e.key===selected) ?? (searchRequest?.propField && !selected ? undefined : shown[0]);
  const id = entry?.key ?? "";
  const selectedActor = sample === "actor" ? ACTOR_TYPES[id] : undefined;
  const doorDraft = sample === "door" ? doorDrafts.find(draft => draft.id === id) : undefined;
  const doorAsset = sample === "door" ? doorDraft ?? doorCatalog.find(asset => asset.id === id) : undefined;
  const selectedImageDraft = imageDrafts.find(d => d.id === id);
  const selectedDecalDraft = selectedImageDraft?.type === "decal" ? selectedImageDraft : undefined;
  const selectedStillDraft = selectedImageDraft?.type === "portrait" ? selectedImageDraft : undefined;
  const selectedPickupDraft = selectedImageDraft?.type === "item" ? selectedImageDraft : undefined;
  const selectedSkyDraft = selectedImageDraft?.type === "sky" ? selectedImageDraft : undefined;
  const isPickupDraft = !!selectedPickupDraft;
  const pickup = sample === "item" ? selectedPickupDraft?.pickup ?? entry?.image?.pickup : undefined;
  const pickupMaps = usePickupDraftMaps(selectedPickupDraft, setError);
  const pickupDraftPreview = useImageDraftPreview(selectedPickupDraft);
  const [inventoryPreview, setInventoryPreview] = useState(false);
  const preview2D = sample === "still" || sample === "sky" || (sample === "item" && inventoryPreview);
  const decalDraftPreview = useImageDraftPreview(selectedDecalDraft);
  const decalDraftNormal = useBlobUrl(selectedDecalDraft?.decalNormal);
  const stillDraftPreview = useImageDraftPreview(selectedStillDraft);
  const skyDraftPreview = useImageDraftPreview(selectedSkyDraft);
  const previewUrl = selectedDecalDraft ? decalDraftPreview : selectedStillDraft ? stillDraftPreview : selectedSkyDraft ? skyDraftPreview : isPickupDraft ? pickupDraftPreview : (entry?.img ?? "");
  const isDecal = sample === "prop" && !!entry && entry.groups.includes("decal");
  const builtinDecalSize = useImageSize(entry?.builtinDecal ? entry.img : undefined);
  const propDraft = entry?.propDraft;
  const searchProp = searchRequest?.propField && !propDraft
    ? searchPropExample(searchRequest.propField, world === "All" ? activeWorld() : world, id, PROP_TYPES[id])
    : undefined;
  // the prop's own texture: a draft's, or a published prop's when that texture is editable (it is then edited in place; the
  // first change makes the prop's draft, so that Publish carries the texture along)
  const sharedPropId = sample==="prop" && !propDraft && isSharedPropId(id) ? id : "";
  const publishedOwn = sharedPropId ? ownedPropTexture(sharedPropId, (PROP_TYPES[sharedPropId] as { texture?: string } | undefined)?.texture) : "";
  const ownedTexture = propDraft ? ownedPropTexture(propDraft.id, propDraft.definition.texture) : publishedOwn && isEditable(publishedOwn) ? publishedOwn : "";
  const [propAiTexture, setPropAiTexture] = useState("");
  const [publishingProp, setPublishingProp] = useState("");
  const prop = sample==="prop" ? propDraft?.definition ?? PROP_TYPES[id] : undefined;
  const propRenderKey = prop && JSON.stringify([prop.kind, prop.size, prop.elevation, prop.wall, prop.relief,
    ...(prop.kind === "prism" ? [prop.sides, prop.inset, prop.wrap, prop.normal] : [])]);
  const alternateTexture = prop?.kind === "prism" ? prop.textureB : undefined;
  const top = prop ? prop.size[1] + ("elevation" in prop ? prop.elevation ?? 0 : 0) : 0;
  const showCeiling = ceiling==="On" || (ceiling==="Auto" && top<=1);
  const shot = useRef<{position:THREE.Vector3,target:THREE.Vector3} | null>(null);

  const [layout, setLayout] = useState("Single");
  const [joinEdges, setJoinEdges] = useState(true);
  const [groups,setGroups] = useState<Record<string,MaterialMaps>>({});
  const [view,setView] = useState("textured");
  const [hidden,setHidden] = useState<Record<string,boolean>>({});
  const [edits, setEdits] = useState<MaterialMaps>({});
  const primary = propDraft ? propDraft.definition.texture || id : prop ? propTexture(id) : id;
  // the selected texture (or the prop's / door's own) is shown: its Auto maps are made now (the rest of the store's are not)
  const doorLeaf = doorAsset?.definition.leaf, doorFrame = doorAsset?.definition.frame;
  useEffect(() => { if (open) for (const tex of [id, primary, alternateTexture, doorLeaf, doorFrame]) if (tex) wantSharedTexture(tex); }, [open, id, primary, alternateTexture, doorLeaf, doorFrame]);
  const maskKey = (group:string, channel:Channel) => [sample,id,group,channel].join(":");
  // the files of the selected texture (they change when a draft changes a map)
  const selectedTexture = (sample === "material" || sample === "prop") ? catalog[primary] : undefined;
  const texSig = selectedTexture ? [selectedTexture.diffuse, selectedTexture.normal, selectedTexture.depth, selectedTexture.surface, selectedTexture.emissive].join("|") : "";
  const alternateSig = alternateTexture ? JSON.stringify(catalog[alternateTexture]) : "";
  // a built-in or old shared texture can't be edited: a map imported there is a local preview, kept in IndexedDB
  const previewBlobs = useRef<PreviewMaps>({});
  const previewUrls = useRef<string[]>([]);
  function showPreview(blobs: PreviewMaps) {
    previewBlobs.current = blobs;
    previewUrls.current.forEach(u=>URL.revokeObjectURL(u));
    previewUrls.current = [];
    const urls: MaterialMaps = {};
    for(const [channel,blob] of Object.entries(blobs)){
      if(blob===""){urls[channel as Channel]="";}
      else if(blob){const url=URL.createObjectURL(blob);previewUrls.current.push(url);urls[channel as Channel]=url;}
    }
    setEdits(urls);
  }
  useEffect(() => {
    if(!open || !id || npcEditor)return;
    let active=true;
    setGroups({}); showPreview({});
    if(sample==="still" || sample==="sky" || sample==="door" || ownPanel || (sample==="actor" && !selectedActor))return;
    async function read(){
      let result:Record<string,MaterialMaps>={};
      if(propDraft && (!propDraft.definition.texture || (ownedTexture && !selectedTexture))){
        result[primary]={};
      }else if(selectedDecalDraft){
        result[id]=previewUrl ? {diffuse:previewUrl, normal:decalDraftNormal || undefined} : {};
      }else if(isPickupDraft){
        result[id]=pickupMaps ?? {};
      }else if(sample==="item" && entry?.image?.pickup){
        result[id]={diffuse:entry.image.url, depth:entry.image.pickup.depthUrl, normal:entry.image.pickup.normalUrl};
      }else if(sample==="actor"){
        const actor = selectedActor!;
        result[id] = { ...actorSheetFiles(actor), emissive: actor.glow ? import.meta.env.BASE_URL + "actors/" + actor.sheet + "/emissive.png" : undefined };
      }else if(id.startsWith("decal:")){
        const dir=import.meta.env.BASE_URL+"decals/"+id.slice(6)+"/";
        result[id]={diffuse:sharedImage(id.slice(6))?.url ?? dir+"diffuse.png",normal:sharedImage(id.slice(6))?.normalUrl ?? (decals[id.slice(6)]?.normal ? dir+"normal.png" : undefined)};
      }else{
        const names=prop?.kind==="views"?["front","side","top"].map(v=>prop.views+"_"+v)
          : prop?.kind==="box"?[prop.side,prop.top]
          : prop?.kind==="cabin"?[prop.door,prop.inside,prop.views+"_side",prop.views+"_top"]
          : alternateTexture && alternateTexture !== primary ? [primary, alternateTexture] : [primary];
        // (a new draft without a diffuse has no files yet)
        result=sample==="material" && !catalog[id] ? {[id]:{}} : Object.fromEntries(await Promise.all(names.map(async name=>[name,await baseMaps(catalog[name] ?? textureFolder(sample==="item"?"item_"+id:name))])));
      }
      if(active)setGroups(result);
    }
    if(sample==="material" && !isEditable(id)) migrateLegacyPreviews().then(()=>readPreview(id)).then(blobs=>{if(active)showPreview(blobs);}).catch(()=>{if(active)setError(t("assetManager.readPreview"));});
    read().catch(()=>{if(active)setError(t("assetManager.readMaps"));});
    return ()=>{active=false;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open,id,sample,primary,prop?.kind,alternateTexture,alternateSig,decals,texSig,imageCatalog,previewUrl,selectedDecalDraft,decalDraftNormal,isPickupDraft,pickupMaps,actorVersion,npcEditor,ownedTexture]);
  async function edit(channel: Channel, file?: Blob | "") {
    const next: PreviewMaps = { ...previewBlobs.current, [channel]: file };
    if (file === undefined) delete next[channel];
    try {
      await writePreview(id, next);
      showPreview(next);
    } catch (error) { setError(errorText(error)); }
  }
  const [keyLight, setKeyLight] = useState(true);
  const [rimLight, setRimLight] = useState(true);
  const [turn, setTurn] = useState(0);
  // editing the selected texture (drafts of shared textures): its settings and the channel cards of the maps panel
  const editor = useTextureEditor(ownedTexture || (sample==="material" && entry ? id : ""), setError, select, () => { if (sharedPropId) reviseSharedProp(sharedPropId); });
  const editable = sample==="material" && !!entry && isEditable(id);
  // the shared textures and images are listed when the window opens (and on Refresh); the old local previews are moved over once
  // (manual: the Refresh button says what happened - or why nothing did; the automatic one on opening stays quiet)
  const [notice, setNotice] = useState("");
  const [signInOpen, setSignInOpen] = useState(false);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 6000); return () => clearTimeout(timer); }, [notice]);
  async function refreshShared(manual = false) {
    if (!sharedConfigured) { if (manual) { setNotice(""); setError(t("assetManager.sharedNotConfigured")); } return; }
    if (manual) { setError(""); setNotice(t("assetManager.sharedRefreshing")); }
    try {
      // (opening the window reuses what this page load already fetched in full; the Refresh button fetches it all again)
      const both = (kind: LoadKind, load: (world: WorldId) => Promise<unknown>) =>
        (["scifi","fantasy"] as const).map((world) => loadOnce(kind, world, () => load(world), manual));
      await Promise.all([
        ...both("textures", (world) => loadSharedTextures(world)),
        ...both("images", (world) => loadSharedImages(world)),
        ...both("props", (world) => loadSharedProps(world)),
        ...both("doors", (world) => loadSharedDoors(world)),
        ...both("actors", (world) => loadSharedActors(world)),
        ...both("sounds", (world) => loadSharedSounds(world)),
      ]);
      if (manual) setNotice(t("assetManager.sharedRefreshed"));
    } catch (e) {
      if (!manual) { setError(errorText(e)); return; }
      setNotice("");
      // (401 / 403: the store needs a sign-in, or the guest-read SQL has not been run)
      if (e instanceof SharedHttpError && (e.status === 401 || e.status === 403) && !sharedToken()) { setError(t("assetManager.sharedSignInNeeded")); setSignInOpen(true); }
      else setError(errorText(e));
    }
  }
  useEffect(() => { if(!open)return; void migrateLegacyPreviews(); if(sharedConfigured)void refreshShared(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function createTexture() {
    try {
      const draft = await newDraft(world==="All" ? activeWorld() : world, t("assetManager.newTextureName"));
      // the new draft gets the surface of the selected sub-category
      const surface = sub==="wall" || sub==="floor" || sub==="ceiling" ? sub : undefined;
      const saved = surface ? { ...draft, kinds: [surface] as SurfaceKind[] } : draft;
      if (surface) await saveDraft(saved);
      setSample("material");
      if (!surface) setSub("All");
      setPose(-1); setTurn(0); setPlacement("Auto");
      setQuery("");
      pendingScroll.current = draftId(saved);
      select(draftId(saved));
    } catch (e) { setError(errorText(e)); }
  }
  async function createDecal() {
    try {
      const draft = await createImageDraft(activeWorld(), "decal");
      setSample("prop"); setSub("decal");
      if (world !== "All" && world !== draft.world) setWorld(draft.world);
      setPose(-1); setPlacement("Auto"); setQuery("");
      pendingScroll.current = draft.id;
      select(draft.id);
    } catch (e) { setError(errorText(e)); }
  }
  async function createStill() {
    try {
      const purpose: ImagePurpose = sub === "loading" || sub === "room" ? sub : "portrait";
      const draft = await createImageDraft(activeWorld(), "portrait", purpose);
      setSample("still"); setSub(purpose);
      if (world !== "All" && world !== draft.world) setWorld(draft.world);
      setQuery("");
      pendingScroll.current = draft.id;
      select(draft.id);
    } catch (e) { setError(errorText(e)); }
  }
  async function createSky() {
    try {
      const draft = await createImageDraft(world === "All" ? activeWorld() : world, "sky");
      setSub("All");
      setQuery("");
      pendingScroll.current = draft.id;
      select(draft.id);
    } catch (e) { setError(errorText(e)); }
  }
  async function createPickup() {
    try {
      const draft = await createImageDraft(world === "All" ? activeWorld() : world, "item");
      setSub("All");
      setQuery("");
      setInventoryPreview(false);
      pendingScroll.current = draft.id;
      select(draft.id);
    } catch (e) { setError(errorText(e)); }
  }
  async function createProp() {
    try {
      const targetWorld = world === "All" ? activeWorld() : world;
      const draft = createPropDraft(targetWorld, searchRequest?.propField && isPrismField(searchRequest.propField) ? "prism" : sub === "billboard" ? "billboard" : "panel");
      await attachPropTexture(draft);
      setQuery("");
      setPose(-1); setTurn(0); setPlacement("Auto");
      pendingScroll.current = draft.id;
      select(draft.id);
    } catch (e) { setError(errorText(e)); }
  }
  useEffect(() => {
    if (open) void loadActorDrafts().catch(reason => setError(errorText(reason)));
  }, [open]);
  async function openNpcEditor(entry?: Entry) {
    setOpeningNpc(true);
    setError("");
    try {
      if (entry) {
        if (!isSharedActorId(entry.key)) setNpcEditor(entry.key);
        else setNpcEditor(entry.actorDraft ?? await reviseActor(entry.key, entry.world));
      } else {
        const draft = await createActorDraft(world === "All" ? activeWorld() : world);
        setQuery("");
        pendingScroll.current = draft.id;
        select(draft.id);
        setNpcEditor(draft);
      }
    } catch (reason) { setError(errorText(reason)); }
    finally { setOpeningNpc(false); }
  }
  async function createDoor() {
    try {
      const draft = createDoorDraft(world === "All" ? activeWorld() : world);
      setQuery("");
      pendingScroll.current = draft.id;
      select(draft.id);
    } catch (error) { setError(errorText(error)); }
  }
  // closing with local drafts left asks first (the drafts stay on this computer either way)
  function requestClose() {
    const c = draftCounts(drafts);
    // (the other kinds of local drafts count too: images, props, door types, NPCs, dialogues, shops)
    const others = imageDrafts.length + propDrafts.length + doorDrafts.length + actorDrafts.length + dialogueDrafts.length + shopDrafts.length;
    if (!drafts.length && !others) { setOpen(false); return; }
    const message = others ? t("assetManager.closeWarningAll", { n: c.added + c.changed + others }) : t("assetManager.closeWarning", { n: c.added, m: c.changed });
    if (window.confirm(message)) setOpen(false);
  }
  // the dialog always opens in the world the editor is working in
  function openManager() {
    setSearchRequest(undefined);
    if (document.pointerLockElement) document.exitPointerLock();
    setWorld(activeWorld());
    setOpen(true);
  }
  function changeSample(next: Sample) {
    setSearchRequest(undefined);
    setSample(next);
    setSub("All");
    setPose(-1); setTurn(0); setPlacement("Auto");
    if (background === "Selected texture" && next !== "material") setBackground("3×3");
  }
  const [listOpen, setListOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  // a narrow window folds both side panels away; the strips still open them
  useEffect(() => {
    if (!open) return;
    const fit = () => { if (window.innerWidth < 900) { setListOpen(false); if (!searchRequest?.propField) setPanelOpen(false); } };
    window.addEventListener("resize", fit);
    fit();
    return () => window.removeEventListener("resize", fit);
  }, [open, searchRequest]);
  const [tuneStamp, setTuneStamp] = useState(0);
  const [saveNote, setSaveNote] = useState("");
  const [copyNote, setCopyNote] = useState("");
  // the texture whose look the sliders tune (an NPC's normal strength is set in the NPC editor, a decal has none)
  const tuneId = !entry || sample==="actor" || sample==="still" || sample==="sky" || sample==="door" || isDecal || pickup || (propDraft && !ownedTexture) || id.startsWith("decal:") ? "" : sample==="material" ? id : sample==="item" ? "item_"+id : ownedTexture || propTexture(id);
  // a prop that uses a shared wall / floor / ceiling texture: that texture's maps are edited in Textures (a link says so)
  const propSurfaceTexture = sample==="prop" && !ownedTexture && prop && "texture" in prop && prop.texture ? prop.texture : "";
  const elsewhereTexture = propSurfaceTexture && isEditable(propSurfaceTexture) && !isPropTexture([catalog[propSurfaceTexture]?.kind ?? []].flat()) ? propSurfaceTexture : "";
  // (a shared texture's own - a material's, or a prop's own texture's - tuning lives in its draft and is published with it)
  const tuneEditable = editable || (!!ownedTexture && isEditable(ownedTexture));
  void tuneStamp;
  const tune: TextureTuning | undefined = tuneId ? { ...textureTuning(tuneId) } : undefined;
  const tuneRef = useRef(tune);
  tuneRef.current = tune;
  function changeTune(key: keyof TextureTuning, value: number) {
    const next = { ...tuneRef.current, [key]: value };
    setTextureTuning(tuneId, next);
    // a shared texture keeps its tuning with itself (a draft, published with the texture), not in the project file
    if (tuneEditable) void editor.setTuning(Object.fromEntries(Object.entries(next).filter(([,v]) => typeof v==="number" && v!==1)) as TextureTuning);
    setTuneStamp(n => n + 1);
    setSaveNote("");
    setCopyNote("");
  }
  async function saveTune() {
    try { setSaveNote(t("assetManager.saved", { path: await saveTextureTuning() })); }
    catch { setSaveNote(t("assetManager.saveError")); }
  }
  function downloadTune() {
    const url = URL.createObjectURL(new Blob([textureTuningJson()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "textureTuning.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function copyTune() {
    try {
      await navigator.clipboard.writeText(textureTuningJson());
      setCopyNote(t("assetManager.copied"));
    } catch { setCopyNote(t("assetManager.copyError")); }
  }
  const lights = useRef({ keyLight, rimLight, turn });
  lights.current = { keyLight, rimLight, turn };
  const liveCamera = useRef<{camera:THREE.PerspectiveCamera,controls:OrbitControls} | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const previewRenderer = useRef<THREE.WebGLRenderer | null>(null);
  useEffect(() => {
    if (!open || npcEditor || preview2D || sample==="door" || !host.current) return;
    const renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    host.current.appendChild(renderer.domElement);
    previewRenderer.current = renderer;
    return () => {
      previewRenderer.current = null;
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [open, sample, preview2D, npcEditor]);
  useEffect(() => {
    const el = host.current;
    const renderer = previewRenderer.current;
    if (!open || npcEditor || preview2D || sample==="door" || !el || !entry || !groups[primary] || !renderer) return;
    let disposed = false;
    setError("");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x28292c);
    const camera = new THREE.PerspectiveCamera(40,1,.02,30);
    camera.position.set(1.5,1.1,2);
    const controls = new OrbitControls(camera,renderer.domElement);
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label",t("assetManager.canvasHint"));
    const keys = new Set<string>();
    let walked = false;
    const orbitSubject = (event: PointerEvent) => {
      if (event.button!==0 || !walked) return;
      const selectedProp=prop;
      controls.target.copy(object.position);
      controls.target.y+=selectedProp ? selectedProp.size[1]/2 : sample==="material" && orientation==="Floor" ? 0 : .5;
      controls.update();
      walked=false;
    };
    canvas.addEventListener("pointerdown",orbitSubject,true);
    const focus = () => canvas.focus({preventScroll:true});
    const clear = () => keys.clear();
    const walkKey = (e: KeyboardEvent) => {
      if (!["KeyW","KeyA","KeyS","KeyD"].includes(e.code) || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type==="keydown") keys.add(e.code); else keys.delete(e.code);
    };
    canvas.addEventListener("pointerdown",focus);
    canvas.addEventListener("keydown",walkKey);
    canvas.addEventListener("keyup",walkKey);
    canvas.addEventListener("blur",clear);
    window.addEventListener("blur",clear);
    liveCamera.current={camera,controls};
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    controls.target.set(0,.45,0);
    controls.maxPolarAngle = Math.PI * .95;
    controls.minDistance = .35;
    controls.maxDistance = 5;
    if(shot.current){camera.position.copy(shot.current.position);controls.target.copy(shot.current.target);}
    controls.update();
    const resize = new ResizeObserver(() => {
      const w=el.clientWidth, h=el.clientHeight;
      renderer.setSize(w,h); camera.aspect=w/Math.max(1,h); camera.updateProjectionMatrix();
    });
    resize.observe(el);
    const resources: { dispose(): void }[] = [];
    function keep<T extends {dispose():void}>(r:T) { resources.push(r); return r; }
    scene.add(new THREE.AmbientLight(0xffffff,.45));
    const main=new THREE.PointLight(0xffdfba,9), rim=new THREE.PointLight(0xaacfff,6);
    main.position.set(1.4,1.8,1); rim.position.set(-1,.7,.2); scene.add(main,rim);
    const object=new THREE.Group(); scene.add(object);
    const loader=new THREE.TextureLoader();
    const texture=(url:string, color=true) => {
      const loaded=keep(loader.load(url,undefined,undefined,()=>{if(!disposed)setError(t("assetManager.loadError", { url }));}));
      if(color)loaded.colorSpace=THREE.SRGBColorSpace;
      loaded.magFilter=THREE.NearestFilter; return loaded;
    };
    const n = background==="5×5" ? 5 : 3;
    const half = n/2;
    const fantasy = (world==="All" ? assetWorld(id.replace(/^decal:/,"")) : world)==="fantasy";
    const roomSets = fantasy ? ["fantasyfloor1","fantasywall1","fantasywall1"] : ["floor1","wall4","ceiling1"];
    if(background!=="Empty" && !(sample==="material" && background==="Selected texture")) {
      const surfaces = [[0,0,0,-Math.PI/2,0,n,n,0],[0,1,0,Math.PI/2,0,n,n,2],[0,.5,-half,0,0,n,1,1],[0,.5,half,0,Math.PI,n,1,1],[-half,.5,0,0,Math.PI/2,n,1,1],[half,.5,0,0,-Math.PI/2,n,1,1]];
      for(const [x,y,z,rx,ry,w,h,kind] of surfaces){
        if(kind===2 && !showCeiling) continue;
        const horizontalSample = sample==="material" && ((orientation==="Floor" && kind===0) || (orientation==="Ceiling" && kind===2));
        const src = catalog[roomSets[kind]]?.diffuse;
        const map = background!=="Gray" && src ? texture(src) : null;
        if(map){map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(w,h);}
        // Fit the backing behind the full relief range, including at max tuning.
        const clearance = horizontalSample ? FLOOR_BASE_DEPTH * (tune?.relief ?? 1) + .01 : 0;
        const wall=new THREE.Mesh(keep(new THREE.PlaneGeometry(w,h)),keep(new THREE.MeshStandardMaterial({map,color:map?0xffffff:0x73706a})));
        wall.rotation.set(rx,ry,0);wall.position.set(x,y+(kind===2?clearance:-clearance),z);scene.add(wall);
      }
    }
    if(rgb){
      main.color.set(0xff2323);rim.color.set(0x264cff);
      const green=new THREE.PointLight(0x25ff56,5);
      green.position.set(.2,.65,-.8);scene.add(green);
    }
    let animate = (_time:number) => {};
    // the tuning's live values (see TUNING), set on the preview's material every frame
    let apply = () => {};
    const groupMaps=(group:string):MaterialMaps=>group===primary && sample==="material" ? {...groups[group],...edits} : groups[group] ?? {};
    const enabled=(group:string,ch:Channel)=>!hidden[maskKey(group,ch)];
    const depthScale=enabled(primary,"depth") ? 1 : 0;
    function assetMaterial(group:string, params:THREE.MeshStandardMaterialParameters={}){
      const layers=groupMaps(group);
      const load=(c:Channel,color=false)=>layers[c] && enabled(group,c) ? texture(layers[c]!,color) : null;
      // Keep the diffuse alpha silhouette when hiding its colour or inspecting a data map.
      const diffuse=layers.diffuse ? texture(layers.diffuse) : null;
      const emission=load("glow",true) ?? load("emissive",true);
      const gloss=load("gloss"), metal=load("metal");
      const detail=load("depth");
      const mat=keep(new THREE.MeshStandardMaterial({...params,map:diffuse,normalMap:load("normal"),emissiveMap:emission,emissive:emission?0xffffff:0,
        roughnessMap:gloss,metalnessMap:metal,metalness:metal?1:params.metalness ?? 0,wireframe:view==="wireframe"}));
      if(detail && !["item","material"].includes(sample) && prop?.kind!=="cross" && prop?.kind!=="panel" && prop?.kind!=="prism"){
        mat.bumpMap=detail;mat.bumpScale=.035;
      }
      const inspect=view==="normals"?mat.normalMap:view==="depth"?detail:null;
      mat.onBeforeCompile=shader=>{
        if(!enabled(group,"diffuse"))shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>","#ifdef USE_MAP\n diffuseColor.a *= texture2D(map,vMapUv).a;\n#endif");
        if(gloss)shader.fragmentShader=shader.fragmentShader.replace("#include <roughnessmap_fragment>","float roughnessFactor = roughness * (1.0 - texture2D(roughnessMap, vRoughnessMapUv).g);");
        if(view==="faces" || view==="normals" || view==="depth"){
          shader.uniforms.inspectLayer={value:inspect};
          const value=view==="faces"?"normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition))) * .5 + .5"
            :inspect && diffuse?"texture2D(inspectLayer,vMapUv).rgb":view==="normals"?"vec3(.5,.5,1.)":"vec3(.5)";
          shader.fragmentShader="uniform sampler2D inspectLayer;\n"+shader.fragmentShader.replace("#include <opaque_fragment>","outgoingLight = "+value+";\n#include <opaque_fragment>");
        }
      };
      mat.customProgramCacheKey=()=>[view,!!inspect,!!diffuse,!!gloss,enabled(group,"diffuse")].join("-");
      return mat;
    }
    if(sample==="material") {
      const set=groupMaps(primary);
      const mat=assetMaterial(primary);
      apply=()=>{const t=tuneRef.current;mat.normalScale.setScalar(t?.normal ?? 1);mat.roughness=mat.roughnessMap?1:Math.min(1,.55*(t?.rough ?? 1));mat.metalness=mat.metalnessMap?1:Math.min(1,.45*(t?.metal ?? 1));};
      // a depth map that can't be read leaves a flat preview (with the error shown), not a blank view
      const flatGrid = {width:2,height:2,data:new Float32Array(4)};
      const height = set.depth ? loadHeightGrid(set.depth).catch((e)=>{if(!disposed)setError(t("assetManager.heightError")+" ("+(e instanceof Error ? e.message : String(e))+")");return flatGrid;}) : Promise.resolve(flatGrid);
      height.then(grid=>{
        if(disposed)return;
        const joined = joinEdges && layout!=="Single";
        // (the game's own relief: a floor's base depth is its own, and its relief mode, levels and island size are the viewer's defaults,
        // unless the texture asks for smooth - so what shows here at relief 1.0 is what the game builds)
        const options={wallWidth:1,wallHeight:1,depth:depthScale*(orientation==="Floor" ? FLOOR_BASE_DEPTH : reliefDepth)*(tuneRef.current?.relief ?? 1),levels:DEFAULT_SETTINGS.reliefLevels,minIsland:DEFAULT_SETTINGS.reliefMinIsland,aoRadius:2,smooth:!!catalog[primary]?.smooth || reliefMode==="smooth",smoothCells:wallDetail};
        const surface=createReliefWallGeometry(grid,{...options,flushEdges:!joined && layout==="Block",
          joinEdges:joined && orientation==="Wall" ? 1 : undefined,
          edgeModes:joined && layout==="Block" ? [1,1] : undefined,
          floorEdges:joined && orientation!=="Wall"});
        const geo=keep(surface.geometry); keep(surface.aoMap); mat.aoMap=surface.aoMap; mat.needsUpdate=true;
        if(background==="Selected texture"){
          const roomSurface=joined ? createReliefWallGeometry(grid,{...options,flushEdges:false}) : surface;
          const roomGeo=roomSurface===surface ? geo : keep(roomSurface.geometry);
          if(roomSurface!==surface) keep(roomSurface.aoMap);
          for(let a=0;a<n;a++)for(let b=0;b<n;b++){
            const x=a-half+.5,z=b-half+.5;
            for(const [y,angle] of [[0,-Math.PI/2],[1,Math.PI/2]]){
              if(y===1 && !showCeiling) continue;
              const tile=new THREE.Mesh(roomGeo,mat);tile.position.set(x,y,z);tile.rotation.x=angle;scene.add(tile);
            }
          }
          for(let a=0;a<n;a++)for(let side=0;side<4;side++){
            const angle=side*Math.PI/2, tile=new THREE.Mesh(roomGeo,mat);
            tile.position.set((a-half+.5)*Math.cos(angle)-half*Math.sin(angle),.5,-(a-half+.5)*Math.sin(angle)-half*Math.cos(angle));
            tile.rotation.y=angle;scene.add(tile);
          }
        }
        const faces = layout === "Block" && orientation==="Wall" ? [[0,.5,0],[.5,0,Math.PI/2],[0,-.5,Math.PI],[-.5,0,-Math.PI/2]]
          : layout === "Pair" ? [[-.5,0,0],[.5,0,0]] : [[0,0,0]];
        for(const [x,z,angle] of faces) {const face=new THREE.Mesh(geo,mat); face.position.set(x,.5,z); face.rotation.y=angle;
          if(orientation!=="Wall"){face.rotation.set(orientation==="Floor"?-Math.PI/2:Math.PI/2,0,0);face.position.set(x,orientation==="Floor"?.02:.98,0);} object.add(face);}
      }).catch(()=>{if(!disposed)setError(t("assetManager.heightError"));});
    } else if(sample==="actor") {
      const actor=ACTOR_TYPES[id];
      const mat=assetMaterial(primary,{alphaTest:.5,side:THREE.DoubleSide});
      // (the size as the game has it now, with the size factor)
      const height=actorHeight(id);
      const sprite=new THREE.Mesh(keep(new THREE.PlaneGeometry(height*actor.cellAspect,height)),mat);
      sprite.position.y=height/2; object.add(sprite);
      animate=time=>{
        const yaw=Math.atan2(camera.position.x,camera.position.z);
        sprite.rotation.y=yaw-object.rotation.y;
        const { col, mirror } = actorView(actor, sprite.rotation.y);
        const row=pose>=0 ? pose : actor.walkRows[Math.floor(time/180)%actor.walkRows.length] ?? actor.idleRow;
        const fix = actorOffsets(actor.sheet);
        const [dx, dy] = fix?.offsets[row * actor.cols + col] ?? [0, 0];
        const px = fix ? height / fix.cell[1] : 0;
        const shift = (mirror ? -dx : dx) * px;
        sprite.position.set(Math.cos(sprite.rotation.y) * shift, height / 2 - dy * px, -Math.sin(sprite.rotation.y) * shift);
        for(const t of [mat.map,mat.normalMap,mat.emissiveMap]) {
          if(!t)continue;
          t.repeat.set((mirror?-1:1)/actor.cols,1/actor.rows);
          t.offset.set((col+(mirror?1:0))/actor.cols,1-(row+1)/actor.rows);
        }
      };
    } else if(isDecal) {
      const info=id.startsWith("decal:") ? decals[id.slice(6)] : undefined;
      const stamp=assetMaterial(primary,{alphaTest:.5,roughness:info?.water ? .14 : .75,metalness:.15,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
      // a draft paints on its own selected surface; a published/built-in decal shows on both, as before
      const draftSurface=selectedDecalDraft?.surface;
      const surfaces:("floor"|"wall"|"ceiling")[] = draftSurface ? [draftSurface] : ["floor","wall"];
      async function projectSamples(){
        if(!previewUrl)return;
        const image = await new THREE.ImageLoader().loadAsync(previewUrl);
        if(disposed)return;
        const scale=.65/Math.max(image.width,image.height);
        const size=new THREE.Vector3(image.width*scale,image.height*scale,.32);
        for(const name of surfaces){
          const floor=name==="floor", ceiling=name==="ceiling";
          const paths=catalog[roomSets[name==="floor"?0:name==="wall"?1:2]];
          const textured=background!=="Empty" && background!=="Gray";
          const grid=textured ? await loadHeightGrid(paths.depth) : undefined;
          if(disposed)return;
          const relief=grid && createReliefWallGeometry(grid,{wallWidth:1,wallHeight:1,depth:.08,levels:5,minIsland:2,aoRadius:2,smooth:true,flushEdges:true,floorEdges:floor});
          const geo=keep(relief?.geometry ?? new THREE.PlaneGeometry(1,1));
          if(relief)keep(relief.aoMap);
          const surfaceMat=keep(new THREE.MeshStandardMaterial({map:textured?texture(paths.diffuse):null}));
          for(let side=0;side<(name==="wall"?4:1);side++){
            const angle=side*Math.PI/2;
            const surface=new THREE.Mesh(geo,surfaceMat);
            surface.rotation.set(floor?-Math.PI/2:ceiling?Math.PI/2:0,angle,0);
            const radius=half-(textured?.09:.002);
            surface.position.set(floor||ceiling?0:-radius*Math.sin(angle),floor?(textured?.09:.002):ceiling?1-(textured?.09:.002):.5,floor||ceiling?0:-radius*Math.cos(angle));
            surface.updateMatrixWorld();
            if(textured)scene.add(surface);
            const geometry=keep(new DecalGeometry(surface,surface.position,surface.rotation,size));
            scene.add(new THREE.Mesh(geometry,stamp));
          }
        }
      }
      void projectSamples().catch(()=>{if(!disposed)setError(t("assetManager.decalError"));});
    } else if (!propDraft || groups[primary]?.diffuse) {
      const onWall=!!prop && (placement==="Wall" || (placement==="Auto" && prop.wall));
      if(onWall)object.position.z=-half+(prop?.size[2] ?? .02)/2+.01;
      if(prop && "elevation" in prop)object.position.y=prop.elevation ?? 0;
      if(!prop || prop.kind!=="views"){
        // (its normal map too, where it has one - for the tuning)
      const mat=assetMaterial(primary,{alphaTest:prop?.kind==="prism"?.5:.4,side:THREE.DoubleSide});
      apply = () => { const t = tuneRef.current, n = t?.normal ?? 1; mat.normalScale.set(n, n); mat.roughness = Math.min(1, .85 * (t?.rough ?? 1)); mat.metalness = Math.min(1, .02 * (t?.metal ?? 1)); };
        const [w,h,d]=prop?.size ?? (sample==="item"?[.24,.24,.15]:[.6,.6,.02]);
        const flat=!prop || ["panel","billboard","cross","chamfer"].includes(prop.kind);
        const alternate = alternateTexture && groups[alternateTexture]?.diffuse ? alternateTexture : undefined;
        const geo = keep(prop?.kind==="prism"
          ? propPrismGeometry(prismFaces(w,d,prismSides(prop.sides),prismInset(prop.inset),!!alternate,prop.wrap),h)
          : flat ? new THREE.PlaneGeometry(w,h) : new THREE.BoxGeometry(w,h,d));
        const faceMat=(name:string)=>assetMaterial(name,{alphaTest:.4});
        let faces: THREE.Material | THREE.Material[]=mat;
        if(prop?.kind==="box"){const top=faceMat(prop.top);faces=[mat,mat,top,top,mat,mat];}
        if(prop?.kind==="cabin"){const side=faceMat(prop.views+"_side"),top=faceMat(prop.views+"_top");faces=[side,side,top,top,mat,faceMat(prop.inside)];}
        if(prop?.kind==="prism") {
          const alternateMat = alternate && alternate !== primary
            ? assetMaterial(alternate, { alphaTest: .5, side: THREE.DoubleSide })
            : mat;
          faces = [mat, alternateMat];
          const applyPrimary = apply;
          const normal = DEFAULT_SETTINGS.normalStrength * (prop.normal ?? 1);
          apply = () => {
            applyPrimary();
            mat.normalScale.multiplyScalar(normal);
            if (alternate && alternateMat !== mat) {
              alternateMat.normalScale.setScalar(normal * (textureTuning(alternate)?.normal ?? 1));
            }
          };
        }
        const mesh=new THREE.Mesh(geo,faces);
        mesh.position.y=(onWall && !prop?.wall ? .5 : h/2)-(prop?.kind==="prism" ? h/2 : 0);
        object.add(mesh);
        if(prop?.kind==="pillar"){
          const height=prop.height ?? h;
          mesh.scale.set(prop.shaft/w,(height-2*prop.flare)/h,prop.shaft/d);mesh.position.y=height/2;
          for(const y of [prop.flare/2,height-prop.flare/2]){
            const cap=new THREE.Mesh(keep(new THREE.BoxGeometry(w,prop.flare,d)),mat);cap.position.y=y;object.add(cap);
          }
        }
        if(sample==="item"){
          const height=pickup?.height ?? .2;
          if (pickup) {
            mat.emissiveMap = mat.map;
            mat.emissive.setHex(0xffffff);
            mat.emissiveIntensity = pickup.glow;
          }
          const tilt=-Math.PI/12;
          mesh.rotation.order="YXZ";
          mesh.rotation.x=tilt;
          mesh.position.y=height*Math.cos(tilt)/2;
          animate=()=>{mesh.rotation.y=Math.atan2(camera.position.x,camera.position.z)-object.rotation.y;};
          const depth = groups[primary]?.depth;
          if (depth) void loadHeightGrid(depth).then(grid=>{
            if(disposed)return;
            const smooth = reliefMode === "smooth";
            const result=createReliefWallGeometry(grid,{
              wallWidth:height*grid.width/grid.height,wallHeight:height,
              depth:depthScale*reliefDepth*PROP_RELIEF_SCALE*.6*(tuneRef.current?.relief ?? 1),
              levels:DEFAULT_SETTINGS.reliefLevels,minIsland:DEFAULT_SETTINGS.reliefMinIsland,aoRadius:2,flushEdges:false,
              smooth,smoothHoles:smooth,smoothCells:Math.min(wallDetail,24),
            });
            if (smooth) mat.alphaTest = .5;
            mesh.geometry=keep(result.geometry);mat.aoMap=keep(result.aoMap);mat.needsUpdate=true;
          }).catch(()=>{if(!disposed)setError(t("assetManager.itemHeightError"));});
        }
        if(prop?.kind==="billboard")animate=()=>{mesh.rotation.y=Math.atan2(camera.position.x,camera.position.z)-object.rotation.y;};
        if(prop?.kind==="cross" || prop?.kind==="panel"){
          const paths=catalog[prop.texture] ?? textureFolder(prop.texture);
          loadHeightGrid(paths.depth).then(grid=>{
            if(disposed)return;
            const smooth = reliefMode === "smooth";
            const depth=depthScale*propReliefAmount(reliefDepth,prop,smooth)*(tuneRef.current?.relief ?? 1);
            const result=createReliefWallGeometry(smooth ? grid : downsampleHeightGrid(grid,2),{
              wallWidth:w,wallHeight:h,depth,levels:DEFAULT_SETTINGS.reliefLevels,minIsland:DEFAULT_SETTINGS.reliefMinIsland,
              aoRadius:2,flushEdges:false,smooth,smoothHoles:smooth,smoothCells:Math.min(wallDetail,propReliefCells(prop)),
              outwardRelief:prop.kind==="cross",
            });
            const relief=keep(result.geometry);keep(result.aoMap);
            object.remove(mesh);
            mat.side=THREE.FrontSide;mat.aoMap=result.aoMap;mat.needsUpdate=true;
            if (smooth) mat.alphaTest = .5;
            for(const angle of prop.kind==="cross"?[0,Math.PI/2]:[0]){
              for(const back of [false,true]){
                const face=new THREE.Mesh(relief,mat);
                face.rotation.y=angle+(back?Math.PI:0);
                if(back)face.scale.x=-1;
                face.position.copy(mesh.position);
                object.add(face);
              }
            }
          }).catch(()=>{if(!disposed)setError(t("assetManager.propHeightError"));});
        }
      }
      if(prop?.kind==="views") {
        const mats=["side","top","front"].map(view=>assetMaterial(prop.views+"_"+view,{roughness:1,alphaTest:.4,side:THREE.DoubleSide}));
        const [w,h,d]=prop.size;
        for(const part of prop.parts) {
          const min=new THREE.Vector3(...part.min), max=new THREE.Vector3(...part.max);
          const size=max.clone().sub(min), center=max.clone().add(min).multiplyScalar(.5);
          if(part.shape==="cylinder"){
            // an upright round part filling its box: its front and back quarters from the front view, its ends from the side view, its top from the top view
            const rx=size.x/2, rz=size.z/2, N=24;
            const front={p:[] as number[],u:[] as number[]}, ends={p:[] as number[],u:[] as number[]}, cap={p:[] as number[],u:[] as number[]};
            const at=(a:number):[number,number]=>[center.x+rx*Math.sin(a),center.z+rz*Math.cos(a)];
            const uvFront=(x:number,y:number)=>[.5+x/w,y/h], uvSide=(z:number,y:number)=>[.5-z/d,y/h], uvTop=(x:number,z:number)=>[.5+x/w,.5-z/d];
            for(let k=0;k<N;k++){
              const a0=k/N*Math.PI*2, a1=(k+1)/N*Math.PI*2, mid=(a0+a1)/2;
              const [x0,z0]=at(a0), [x1,z1]=at(a1);
              const round=Math.abs(Math.cos(mid))>=Math.abs(Math.sin(mid)) ? front : ends;
              const uvOf=(x:number,z:number,y:number)=>round===front ? uvFront(x,y) : uvSide(z,y);
              for(const [x,y,z] of [[x0,min.y,z0],[x1,min.y,z1],[x1,max.y,z1],[x0,min.y,z0],[x1,max.y,z1],[x0,max.y,z0]]){round.p.push(x,y,z);round.u.push(...uvOf(x,z,y));}
              for(const [x,z] of [[center.x,center.z],[x1,z1],[x0,z0]]){cap.p.push(x,max.y,z);cap.u.push(...uvTop(x,z));}
            }
            for(const [bufs,material] of [[front,mats[2]],[ends,mats[0]],[cap,mats[1]]] as const){
              const geo=keep(new THREE.BufferGeometry());
              geo.setAttribute("position",new THREE.Float32BufferAttribute(bufs.p,3));
              geo.setAttribute("uv",new THREE.Float32BufferAttribute(bufs.u,2));
              geo.computeVertexNormals();
              object.add(new THREE.Mesh(geo,material));
            }
            continue;
          }
          const geo=keep(new THREE.BoxGeometry(size.x,size.y,size.z)), pos=geo.attributes.position, uv=geo.attributes.uv;
          for(let i=0;i<pos.count;i++){
            const x=pos.getX(i)+center.x,y=pos.getY(i)+center.y,z=pos.getZ(i)+center.z;
            const axis=Math.floor(i/8);
            uv.setXY(i,axis===0?.5-z/d:.5+x/w,axis===1?.5-z/d:y/h);
          }
          const box=new THREE.Mesh(geo,[mats[0],mats[0],mats[1],mats[1],mats[2],mats[2]]);
          box.position.copy(center); object.add(box);
        }
      }
    }
    const forward = new THREE.Vector3(), right = new THREE.Vector3();
    let lastTime = performance.now();
    renderer.setAnimationLoop(time=>{
      const dt = Math.min(.05,Math.max(0,(time-lastTime)/1000));
      lastTime=time;
      const f=Number(keys.has("KeyW"))-Number(keys.has("KeyS"));
      const r=Number(keys.has("KeyD"))-Number(keys.has("KeyA"));
      if(f || r){
        camera.getWorldDirection(forward);
        forward.y=0;
        forward.normalize();
        right.crossVectors(forward,camera.up);
        forward.multiplyScalar(f).addScaledVector(right,r).normalize().multiplyScalar(dt*1.5);
        camera.position.add(forward);
        controls.target.add(forward);
        walked=true;
        controls.update();
      }
      main.visible=lights.current.keyLight; rim.visible=lights.current.rimLight;
      object.rotation.y=lights.current.turn*Math.PI/180;
      apply(); animate(time); renderer.render(scene,camera);
    });
    return ()=>{
      canvas.removeEventListener("pointerdown",focus);
      canvas.removeEventListener("pointerdown",orbitSubject,true);
      canvas.removeEventListener("keydown",walkKey);
      canvas.removeEventListener("keyup",walkKey);
      canvas.removeEventListener("blur",clear);
      window.removeEventListener("blur",clear);
      liveCamera.current=null;
      shot.current={position:camera.position.clone(),target:controls.target.clone()};
      disposed=true;
      if(previewRenderer.current===renderer) {
        renderer.setAnimationLoop(null);
        renderer.clear();
      }
      resize.disconnect();
      controls.dispose();
      resources.forEach(r=>r.dispose());
    };
  },[open,sample,id,groups,view,hidden,edits,layout,joinEdges,orientation,background,showCeiling,world,rgb,pose,placement,tune?.relief,reliefMode,reliefDepth,wallDetail,previewUrl,selectedDecalDraft?.surface,preview2D,pickup?.height,pickup?.glow,propRenderKey,primary,npcEditor,npcSizes[id]]);
  const newInfo: { disabled: boolean; title: string; run?: () => Promise<void> } =
    sample === "material" ? { disabled: false, title: t("assetManager.newTexture"), run: createTexture }
      : sample === "still" ? { disabled: false, title: t("assetManager.newStill"), run: createStill }
        : sample === "sky" ? { disabled: false, title: t("assetManager.newSky"), run: createSky }
        : sample === "item" ? { disabled: false, title: t("assetManager.pickup.new"), run: createPickup }
        : sample === "door" ? { disabled: false, title: t("assetManager.doorType.new"), run: createDoor }
        : sample === "actor" ? { disabled: openingNpc, title: t("assetManager.npcSheet.new"), run: () => openNpcEditor() }
        : sample === "prop" ? sub === "decal"
          ? { disabled: false, title: t("assetManager.newDecal"), run: createDecal }
          : { disabled: false, title: t("assetManager.propDraft.new"), run: createProp }
          : { disabled: true, title: t("assetManager.newUnsupported") };
  const decalImage: SharedImage | undefined = entry?.image ?? (entry?.builtinDecal ? {
    id: entry.builtinDecal, world: entry.world, type: "decal", name: entry.label,
    width: builtinDecalSize?.width ?? 0, height: builtinDecalSize?.height ?? 0, url: entry.img,
  } : undefined);
  const strip = "grid w-8 shrink-0 place-items-start rounded-sm border border-neutral-700 bg-neutral-900 py-2 text-lg text-neutral-400 hover:text-neutral-200";
  return <><button className={button} onClick={openManager}>{t("assetManager.title")}</button>{open && createPortal(
    <div role="dialog" aria-label={t("assetManager.title")} aria-modal="true" className="fixed inset-0 z-[2147483647] bg-black/75 p-2 text-white pointer-events-auto" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation(); if(e.key==="Escape" && !npcEditor && !openingNpc)requestClose();}}>
      <section className="voidcrew-editor-controls flex h-full w-full flex-col rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-neutral-200" style={neutralStyle}>
        <style>{".theme-fantasy .voidcrew-editor-controls .border { box-shadow: none; }"}</style>
        {typeof npcEditor === "string" ? <ActorEditor key={npcEditor} initialActor={npcEditor} onBack={() => setNpcEditor(null)}/>
          : npcEditor ? <NpcAssetEditor key={npcEditor.id} initial={npcEditor} onBack={() => setNpcEditor(null)}
            onPublished={webpRefused => { setNpcEditor(null); setNotice(t(webpRefused ? "assetManager.npcSheet.webpRefused" : "assetManager.npcSheet.published")); }}/>
          : <>
        <header className="mb-2 flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-700 pb-2">
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">{t("assetManager.mainCategory")}
            <select className={selectClass} value={sample} onChange={e=>changeSample(e.target.value as Sample)}>
              {categories.map(c=><option key={c.value} value={c.value}>{t(c.label)}</option>)}
            </select>
          </label>
          {(!ownPanel || sample==="sound") && <><label className="flex items-center gap-1 text-[11px] text-neutral-400">{t("assetManager.subCategory")}
            <select className={selectClass} value={sub} onChange={e=>setSub(e.target.value)}>
              {subsOf[sample].map(k=><option key={k} value={k}>{subLabel(sample,k)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-[11px] text-neutral-400">{t("assetManager.world")}
            <select className={selectClass} value={world} onChange={e=>{setWorld(e.target.value as typeof world);setPose(-1);}}>
              <option value="All">{t("assetManager.all")}</option>
              <option value="scifi">{t("assetManager.scifi")}</option>
              <option value="fantasy">{t("assetManager.fantasy")}</option>
            </select>
          </label></>}
          <button type="button" className={button + " grid h-7 w-7 place-items-center !p-0"} aria-label={t("assetManager.refresh")} title={t("assetManager.refresh")} onClick={()=>void refreshShared(true)}><RefreshCw size={14} aria-hidden="true"/></button>
          <span className={"min-w-0 flex-1 truncate text-xs " + (error ? "text-red-300" : notice ? "text-emerald-300" : "text-neutral-400")} title={error || notice}>{error || notice || (!ownPanel && t("assetManager.orbitHint"))}</span>
          {signInOpen && <SignInPopover className="fixed left-1/2 top-24 -translate-x-1/2" onDone={()=>{setSignInOpen(false);setError("");void refreshShared(true);}} onCancel={()=>setSignInOpen(false)} onError={setError}/>}
          <button aria-label={t("assetManager.close")} className={button} disabled={openingNpc} onClick={requestClose}>×</button>
        </header>
        <UnsavedBar onError={setError}/>
        {sample==="dialogue" ? <DialoguesPanel onError={setError} onNotice={setNotice}/> : sample==="shop" ? <ShopsPanel onError={setError} onNotice={setNotice}/> : sample==="sound" ?
          <SoundAssetsPanel key={selected} initialId={selected} world={world} targetWorld={world==="All" ? activeWorld() : world}
            category={sub} searchTargetId={searchRequest?.targetId} onError={setError} onNotice={setNotice}/> : <div className="flex min-h-0 flex-1 gap-2">
          {listOpen ? <aside className="flex w-64 shrink-0 flex-col gap-1 overflow-hidden border-r border-neutral-800 pr-2">
            <div className="flex items-center justify-between gap-2"><strong className="text-sm">{t("assetManager.assets")}</strong><button aria-label={t("assetManager.collapseAssets")} title={t("assetManager.collapse")} className="px-2 text-neutral-400 hover:text-neutral-200" onClick={()=>setListOpen(false)}>◀</button></div>
            <div className="flex items-center gap-1">
              <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("assetManager.searchAssets")} aria-label={t("assetManager.searchAssets")}
                className="min-w-0 flex-1 rounded-sm border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100"/>
              <button type="button" className={button + " shrink-0"} disabled={newInfo.disabled} title={newInfo.title} onClick={()=>void newInfo.run?.()}>+ {t("assetManager.new")}</button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto" ref={listRef}>
              {shown.map(e=>{
                const a=sample==="actor"?ACTOR_TYPES[e.key]:undefined;
                const status=sample==="material" ? textureStatus(e.key) : undefined;
                const auto=sample==="material" ? autoChannels(e.key) : [];
                const draft=!!e.draft || !!e.propDraft || !!e.actorDraft || status==="new" || status==="changed" || (sample==="door" && doorDrafts.some(draft => draft.id === e.key));
                return <button key={e.key} type="button" data-key={e.key}
                  ref={node=>{if(node && pendingScroll.current===e.key){node.scrollIntoView({block:"nearest"});pendingScroll.current=null;}}}
                  className={"flex w-full items-center gap-2 rounded-sm border px-1 py-0.5 text-left text-xs "+(id===e.key?"border-amber-400 bg-amber-400/10 text-amber-100":"border-transparent text-neutral-200 hover:bg-neutral-900")}
                  aria-pressed={id===e.key} onClick={()=>{setSearchRequest(undefined);select(e.key);setPose(-1);setPlacement("Auto");}}>
                  {a?<ActorThumb type={a} className="block h-9 w-9 shrink-0"/>
                    :e.draft?<DraftThumb draft={e.draft}/>
                    :e.img?<Thumb src={e.img} className="h-9 w-9 shrink-0 object-contain"/>
                    :<span className="grid h-9 w-9 shrink-0 place-items-center text-neutral-500">…</span>}
                  <span className="min-w-0 flex-1 truncate">{e.label}</span>
                  {auto.length>0 && <AutoBadge/>}
                  {draft && <span role="img" aria-label={t("assetManager.draftTitle")} title={t("assetManager.draftTitle")} className="h-2 w-2 shrink-0 rounded-full bg-yellow-400"/>}
                  {status==="builtin" && <span title={t("assetManager.lockedTitle")} aria-label={t("assetManager.lockedTitle")} className="shrink-0 text-neutral-500"><Lock size={11}/></span>}
                </button>;
              })}
              {!shown.length && <p className="p-2 text-xs text-neutral-500">{t("assetManager.noAssets")}</p>}
            </div>
          </aside> : <button aria-label={t("assetManager.showAssets")} title={t("assetManager.assets")} className={strip} onClick={()=>setListOpen(true)}>▶</button>}
          <main className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 flex-wrap items-center gap-2"><strong {...(searchRequest && !searchRequest.propField && id && id===selected ? searchAnchor(searchRequest.targetId) : {})} tabIndex={-1}>
              {entry?.label ?? t(searchProp ? "editorSearch.propExample" : "assetManager.noAssets")}
            </strong>
              {sample==="material" && <>{["Wall","Floor","Ceiling"].map(v=><button className={button} aria-pressed={orientation===v} key={v} onClick={()=>{orient(v);if(v==="Ceiling" || v==="Floor"){const cam=liveCamera.current;if(cam){cam.camera.position.y=v==="Ceiling"?.25:1.7;cam.controls.target.y=v==="Ceiling"?.95:.05;cam.controls.update();}}if(v!=="Wall" && layout==="Block")setLayout("Single");}}>{display(v)}</button>)}{(orientation==="Wall"?["Single","Pair","Block"]:["Single","Pair"]).map(v=><button className={button} aria-pressed={layout===v} key={v} onClick={()=>setLayout(v)}>{display(v)}</button>)}</>}
              {sample==="actor" && entry && <>
                {selectedActor && <label>{t("assetManager.pose")} <select className={selectClass} value={pose} onChange={e=>setPose(+e.target.value)}>
                  <option value={-1}>{t("assetManager.walkCycle")}</option>
                  {Array.from({length:selectedActor.rows},(_,i)=><option key={i} value={i}>{t(i===selectedActor.idleRow ? "assetManager.idleRow" : "assetManager.row", { n: i+1 })}</option>)}
                </select></label>}
                <button className={button} disabled={openingNpc} onClick={() => void openNpcEditor(entry)}>{t("assetManager.npcEditor")}</button>
              </>}
              {sample==="prop" && !propDraft && propEditable(prop) && <button className={button} onClick={()=>{
                if (isSharedPropId(id)) {
                  try { reviseSharedProp(id); } catch (error) { setError(errorText(error)); }
                } else { setOpen(false); propEdit.set({name:id,part:0}); }
              }}>{t("assetManager.propEditor")}</button>}
              {!isDecal && sample==="prop" && <label>{t("assetManager.mount")} <select className={selectClass} value={placement} onChange={e=>setPlacement(e.target.value)}>{["Auto","Floor","Wall"].map(v=><option key={v} value={v}>{display(v)}</option>)}</select></label>}</div>
            {sample==="item" && <div className="flex gap-1">
              <button type="button" className={button} aria-pressed={inventoryPreview} onClick={()=>setInventoryPreview(true)}>{t("assetManager.pickup.icon")}</button>
              <button type="button" className={button} aria-pressed={!inventoryPreview} onClick={()=>setInventoryPreview(false)}>{t("assetManager.pickup.world")}</button>
            </div>}
            {!preview2D && sample!=="door" && <div className="flex flex-wrap gap-1" aria-label={t("assetManager.previewView")}>{["textured","faces","wireframe","normals","depth"].map(v=><button key={v} className={button+" capitalize"} aria-pressed={view===v} onClick={()=>setView(v)}>{display(v)}</button>)}</div>}
            {sample==="material" && layout!=="Single" && <label className="text-xs"><input type="checkbox" checked={joinEdges} onChange={e=>setJoinEdges(e.target.checked)}/> {t("assetManager.joinEdges")}</label>}
            {sample==="door" ? doorAsset && <DoorAssemblyPreview key={id} door={doorAsset.definition} world={doorAsset.world}
              reliefMode={reliefMode} reliefDepth={reliefDepth} wallDetail={wallDetail}/> : preview2D
              ? <StillPreview url={previewUrl} alt={entry?.label ?? ""}/>
              : <div className="min-h-0 max-h-[65vh] flex-1 overflow-hidden rounded-sm border border-neutral-800 [&>canvas]:block" ref={host}/>}
          </main>
          {panelOpen ? <aside tabIndex={-1} className="flex w-72 shrink-0 flex-col gap-2 overflow-auto border-l border-neutral-800 pl-2">
            <div className="flex items-center justify-between gap-2"><strong className="text-sm">{t("assetManager.properties")}</strong><button aria-label={t("assetManager.collapseProperties")} title={t("assetManager.collapse")} className="px-2 text-neutral-400 hover:text-neutral-200" onClick={()=>setPanelOpen(false)}>▶</button></div>
            {sample==="door" ? doorAsset && <DoorAssetFields key={id} asset={doorAsset} editable={!!doorDraft} onError={setError}/>
              : sample==="still" || sample==="sky" || isDecal || (sample==="item" && (isPickupDraft || entry?.image?.pickup)) ? <>
              {selectedImageDraft && <p className="text-xs text-neutral-400">{t("assetManager.world")}: {worldName(selectedImageDraft.world)}</p>}
              <ImageAssetInspector key={id} draft={selectedImageDraft} image={isDecal ? decalImage : entry?.image} pickupPreview={pickupMaps} onError={setError} onRevised={select}/>
            </> : <>
            {searchProp && <p className="text-xs text-neutral-400">{t(id ? "editorSearch.propReadOnly" : "editorSearch.propExampleHint")}</p>}
            {(propDraft || searchProp) && <PropAssetFields key={id} draft={(propDraft ?? searchProp)!} readOnly={!!searchProp}
              ownedReady={!!editor.view?.slot("diffuse").has}
              mapsBusy={!!ownedTexture && (editor.busy || propAiTexture === ownedTexture)}
              onPublishing={busy => setPublishingProp(busy ? id : "")} onError={setError}/>}
            {ownedTexture && <details open key={ownedTexture} className="rounded border border-neutral-800 p-2">
              <summary className="cursor-pointer font-semibold">{t("assetManager.propDraft.ownTexture")}</summary>
              <fieldset className="mt-1" disabled={publishingProp === id}>
                <TextureFields editor={editor} embedded/>
                <ChannelCards editor={editor} channels={SURFACE_CHANNELS} urls={groups[primary] ?? {}} onAiRunning={running => setPropAiTexture(running ? ownedTexture : "")}/>
              </fieldset>
            </details>}
            {sample==="material" && <details open className="rounded border border-neutral-800 p-2">
              <summary className="cursor-pointer font-semibold">{t("assetManager.baseColor")}</summary>
              <div className="mt-1 flex flex-col gap-1">
                {(() => { const url = edits.diffuse ?? groups[primary]?.diffuse; return url
                  ? <img src={url} alt={t("assetManager.diffuse")} className="max-h-40 w-full object-contain"/>
                  : <p className="text-xs text-neutral-500">{t("assetManager.image.noPng")}</p>; })()}
                <label className="cursor-pointer self-start rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 text-[11px] text-neutral-200 hover:bg-neutral-700">
                  {t("assetManager.chooseFile")}
                  <input type="file" accept="image/png" className="sr-only" onChange={async e=>{
                    const file=e.target.files?.[0]; e.target.value="";
                    if(!file)return;
                    if(editable) void editor.chooseFile("diffuse",file);
                    else try { await decode(file); await edit("diffuse",file); } catch { setError(t("assetManager.importError")); }
                  }}/>
                </label>
              </div>
            </details>}
            {sample==="actor" && entry && (selectedActor && !isSharedActorId(id) ? <ActorSizeFields key={id} typeName={id}/>
              : isSharedActorId(id) && <p className="rounded border border-neutral-800 p-2 text-xs text-neutral-400">{t("assetManager.npcSize.shared")}</p>)}
            <details className="rounded border border-neutral-800 p-2"><summary className="cursor-pointer font-semibold">{t("assetManager.look", { texture: sample==="material" ? (entry?.label ?? "") : (tuneId || t("assetManager.noTuning")) })}</summary>
              {tune ? <>
                <p className="my-1 text-xs text-neutral-400">{t("assetManager.tuningHint")}</p>
                {TUNING.map(({key,label,max,hint})=><label key={key} className="my-1 block text-sm" title={t(hint)}>{t(label)}: <strong>{(tune[key]??1).toFixed(2)}×</strong><input className="block w-full" type="range" min="0" max={max} step=".05" value={tune[key]??1} onChange={e=>changeTune(key,+e.target.value)}/></label>)}
                <div className="mt-2 flex flex-wrap items-center gap-2">{!tuneEditable && <button className={button+" !py-1"} onClick={dev ? saveTune : downloadTune}>{t(dev ? "assetManager.save" : "assetManager.download")}</button>}{!tuneEditable && !dev && <button className={button+" !py-1"} onClick={copyTune}>{t("assetManager.copy")}</button>}<button className={button+" !py-1"} onClick={()=>{setTextureTuning(tuneId,undefined);if(tuneEditable)void editor.setTuning(undefined);setTuneStamp(n=>n+1);setSaveNote("");setCopyNote("");}}>{t("assetManager.reset")}</button></div>
                {tuneEditable && <p className="mt-1 text-xs text-neutral-300">{t("assetManager.tuningShared")}</p>}
                {saveNote && <p className="mt-1 text-xs text-neutral-300">{saveNote}</p>}
                {copyNote && <p className="mt-1 text-xs text-neutral-300">{copyNote}</p>}
                {!dev && !tuneEditable && <p className="mt-1 text-xs text-neutral-400">{t("assetManager.downloadHint")}</p>}
              </> : <p className="my-1 text-xs text-neutral-400">{sample==="actor" ? t("assetManager.actorTuning") : t("assetManager.noTuningHint")}</p>}
            </details>
            <details open className="rounded border border-neutral-800 p-2"><summary className="cursor-pointer font-semibold">{t("assetManager.roomLights")}</summary>
              <div className="mt-1 flex flex-col gap-2 text-sm">
                <label>{t("assetManager.room")} <select className={button+" !py-1"} value={background} onChange={e=>setBackground(e.target.value)}>{["Empty","Gray","3×3","5×5",...(sample==="material"?["Selected texture"]:[])].map(v=><option key={v} value={v}>{display(v)}</option>)}</select></label>
                <label>{t("assetManager.roomCeiling")} <select className={button+" !py-1"} value={ceiling} onChange={e=>setCeiling(e.target.value)}>{["Auto","On","Off"].map(v=><option key={v} value={v}>{display(v)}</option>)}</select></label>
                <p className="text-xs text-neutral-300">{t("assetManager.walkHint")}</p>
                <label><input type="checkbox" checked={rgb} onChange={e=>setRgb(e.target.checked)}/> {t("assetManager.rgb")}</label>
                <label><input type="checkbox" checked={keyLight} onChange={e=>setKeyLight(e.target.checked)}/> {t("assetManager.keyLight")}</label>
                <label><input type="checkbox" checked={rimLight} onChange={e=>setRimLight(e.target.checked)}/> {t("assetManager.sideLight")}</label>
                <label>{t("assetManager.rotation")} <input className="block w-full" type="range" min="-180" max="180" value={turn} onChange={e=>setTurn(+e.target.value)}/></label>
              </div>
            </details>
            {!ownedTexture && <details open className="rounded border border-neutral-800 p-2"><summary className="cursor-pointer font-semibold">{t(editable ? "assetManager.mapsEditable" : "assetManager.maps")}</summary>
              {elsewhereTexture && <div className="mt-1 flex flex-col gap-1 text-xs text-neutral-300">
                <p>{t("assetManager.propTextureElsewhere", { name: catalog[elsewhereTexture]?.label ?? elsewhereTexture })}</p>
                <button className={button+" self-start !py-1"} onClick={()=>openAssetManager("material", elsewhereTexture)}>{t("assetManager.openTexture")}</button>
              </div>}
              {sample==="material" && entry &&<div className="mt-1"><TextureFields editor={editor}/></div>}{Object.entries(groups).map(([group,layers])=><section key={group}>{Object.keys(groups).length>1 && <strong>{sample==="material" ? (entry?.label ?? "") : group}</strong>}<div className="mt-1 grid grid-cols-2 gap-2">{channels.map(channel=>{
              const url=(sample==="material"?edits[channel]:undefined) ?? layers[channel];
              if(!url && sample!=="material")return null;
              if(editable && channel==="glow" && !url)return null;
              const key=maskKey(group,channel);
              return <div key={channel} className="border border-neutral-700 p-2 text-sm"><strong>{display(channel)}</strong>{sample==="material" && (autoChannels(id) as string[]).includes(channel) && <AutoBadge className="ml-1"/>}{url &&<button className="float-right px-1" title={t(hidden[key] ? "assetManager.enableMap" : "assetManager.disableMap", { map: display(channel) })} aria-label={t(hidden[key] ? "assetManager.enableGroupMap" : "assetManager.disableGroupMap", { group: sample==="material" ? (entry?.label ?? "") : group, map: display(channel) })} aria-pressed={!hidden[key]} onClick={()=>setHidden(old=>({...old,[key]:!old[key]}))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12Q12 -2 22 12Q12 26 2 12Z"/><circle cx="12" cy="12" r="3"/>{hidden[key] && <path d="M2 2L22 22"/>}</svg></button>}{url ? <img src={url} alt={display(channel)} className="h-14 w-full object-contain"/> : <p className="h-14">{t("assetManager.empty")}</p>}
                {editable && channel!=="glow" && <ChannelControls editor={editor} channel={channel}/>}
                {sample==="material" && !editable && <><label className="cursor-pointer underline">{t("assetManager.import")}<input type="file" accept="image/*" className="sr-only" onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(file)try{await decode(file);await edit(channel,file);}catch{setError(t("assetManager.importError"));}}}/></label>
                {url && <button className="ml-1 underline" onClick={()=>void edit(channel,"")}>{t("assetManager.clear")}</button>}
                {edits[channel]!==undefined && <button className="underline" onClick={()=>void edit(channel)}>{t("assetManager.restore")}</button>}</>}
              </div>;
            })}</div></section>)}</details>}</>}
          </aside> : <button aria-label={t("assetManager.showProperties")} title={t("assetManager.properties")} className={strip} onClick={()=>setPanelOpen(true)}>◀</button>}
        </div>}
        </>}
      </section>
    </div>,document.body)}</>;
}
