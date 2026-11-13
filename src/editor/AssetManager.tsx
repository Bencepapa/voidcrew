import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PROP_TYPES, propEditable } from "../game/props";
import { ACTOR_TYPES } from "../game/actors";
import { TEXTURE_SETS, type TextureSetPaths } from "../render/textureSets";
import { baseMaps, channels, importImage, type Channel, type MaterialMaps } from "./materialMaps";
import { createReliefWallGeometry, downsampleHeightGrid, loadHeightGrid } from "../render/reliefMesh";

const button = "rounded border border-neutral-500 bg-neutral-800 px-3 py-2 text-left hover:border-amber-400 aria-pressed:border-amber-400 aria-pressed:bg-neutral-700";
type Sample = "material" | "actor" | "prop" | "item";
import { ITEM_TYPES } from "../game/items";
import { assetInWorld, assetWorld, type WorldId } from "../game/worlds";
import { fetchDecalManifest } from "../render/decals";
import { propEdit } from "./propEditState";
import { textureFolder } from "../render/textureSets";
import { saveTextureTuning, setTextureTuning, textureTuning, type TextureTuning } from "../render/textureTuning";
const catalog = TEXTURE_SETS as Record<string, TextureSetPaths>;
// the texture folder a prop shows (also the key of its tuning)
function propTexture(id: string) {
  const p = PROP_TYPES[id];
  return p.kind==="views" ? p.views+"_front" : p.kind==="box" ? p.side : p.kind==="cabin" ? p.door : ("texture" in p && p.texture) || "wall1";
}
function propImage(id: string) {
  const tex = propTexture(id);
  return (catalog[tex] ?? textureFolder(tex)).diffuse;
}
// what the tuning sliders change (see textureTuning.ts); every one a multiplier of the game's own value
const TUNING: { key: keyof TextureTuning; label: string; max: number; hint: string }[] = [
  { key: "normal", label: "Normal map force", max: 3, hint: "how strongly the normal map bends the light" },
  { key: "relief", label: "Relief depth", max: 3, hint: "walls, floors and ceilings: the height map's real depth (rebuilds the geometry in the game)" },
  { key: "rough", label: "Roughness", max: 2, hint: "lower is shinier" },
  { key: "metal", label: "Metalness", max: 3, hint: "not for a texture with its own surface map" },
];


export function AssetManager() {
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState<Sample>("material");
  const [selected, select] = useState("fantasywall1");
  const [world, setWorld] = useState<WorldId | "All">("All");
  const [sub, setSub] = useState("All");
  const [orientation, orient] = useState("Wall");
  const [background, setBackground] = useState("Gray");
  const [ceiling, setCeiling] = useState("Auto");
  const [rgb, setRgb] = useState(false);
  const [pose, setPose] = useState(-1);
  const [placement, setPlacement] = useState("Auto");
  const [decals,setDecals] = useState<Awaited<ReturnType<typeof fetchDecalManifest>>>({});
  useEffect(()=>{if(open) fetchDecalManifest(import.meta.env.BASE_URL,"").then(setDecals).catch(()=>setError("Could not load decals."));},[open]);
  const entries = sample==="material" ? Object.entries(catalog).filter(([,v])=>[v.kind].flat().some(k=>["wall","floor","ceiling"].includes(k))).map(([key,v])=>({key,label:v.label,img:v.diffuse,groups:[v.kind].flat() as string[]}))
    : sample==="actor" ? Object.entries(ACTOR_TYPES).map(([key,v])=>({key,label:v.name,img:import.meta.env.BASE_URL+"actors/"+v.sheet+"/diffuse.png",groups:[] as string[]}))
    : sample==="item" ? Object.entries(ITEM_TYPES).map(([key,v])=>({key,label:v.name,img:textureFolder("item_"+key).diffuse,groups:[] as string[]}))
    : [...Object.entries(PROP_TYPES).map(([key,v])=>({key,label:key,img:propImage(key),groups:[v.kind==="billboard"?"billboard":"3D"]})),...Object.keys(decals).map(d=>({key:"decal:"+d,label:d,img:import.meta.env.BASE_URL+"decals/"+d+"/diffuse.png",groups:["decal"]}))];
  const visible = entries.filter(e=>(world==="All" || assetInWorld(e.key.replace(/^decal:/,""),world)) && (sub==="All" || e.groups.includes(sub)));
  const entry = visible.find(e=>e.key===selected) ?? visible[0];
  const id = entry?.key ?? "";
  const prop = sample==="prop" ? PROP_TYPES[id] : undefined;
  const top = prop ? prop.size[1] + ("elevation" in prop ? prop.elevation ?? 0 : 0) : 0;
  const showCeiling = ceiling==="On" || (ceiling==="Auto" && top<=1);
  const shot = useRef<{position:THREE.Vector3,target:THREE.Vector3} | null>(null);

  const [layout, setLayout] = useState("Single");
  const [joinEdges, setJoinEdges] = useState(true);
  const [groups,setGroups] = useState<Record<string,MaterialMaps>>({});
  const [view,setView] = useState("textured");
  const [hidden,setHidden] = useState<Record<string,boolean>>({});
  const [edits, setEdits] = useState<MaterialMaps>({});
  const primary = prop ? propTexture(id) : id;
  const maskKey = (group:string, channel:Channel) => [sample,id,group,channel].join(":");
  useEffect(() => {
    if(!open || !id)return;
    let active=true;
    setGroups({}); setEdits({});
    async function read(){
      let result:Record<string,MaterialMaps>={};
      if(sample==="actor"){
        const actor=ACTOR_TYPES[id], dir=import.meta.env.BASE_URL+"actors/"+actor.sheet+"/";
        result[id]={diffuse:dir+"diffuse.png",normal:dir+"normal.png",emissive:actor.glow ? dir+"emissive.png" : undefined};
      }else if(id.startsWith("decal:")){
        const dir=import.meta.env.BASE_URL+"decals/"+id.slice(6)+"/";
        result[id]={diffuse:dir+"diffuse.png",normal:decals[id.slice(6)]?.normal ? dir+"normal.png" : undefined};
      }else{
        const names=prop?.kind==="views"?["front","side","top"].map(v=>prop.views+"_"+v)
          : prop?.kind==="box"?[prop.side,prop.top]
          : prop?.kind==="cabin"?[prop.door,prop.inside,prop.views+"_side",prop.views+"_top"]:[primary];
        result=Object.fromEntries(await Promise.all(names.map(async name=>[name,await baseMaps(catalog[name] ?? textureFolder(sample==="item"?"item_"+id:name))])));
      }
      if(active)setGroups(result);
    }
    if(sample==="material")try {setEdits(JSON.parse(localStorage.getItem("asset-preview:"+id) || "{}"));} catch {setError("Could not read saved preview maps.");}
    read().catch(()=>{if(active)setError("Could not read asset maps.");});
    return ()=>{active=false;};
  },[open,id,sample,primary,prop,decals]);
  function edit(channel: Channel, url?: string) {
    const next = { ...edits, [channel]: url };
    try {
      localStorage.setItem("asset-preview:" + id, JSON.stringify(next));
      setEdits(next);
    } catch { setError("Browser storage is full. Try a smaller image."); }
  }
  const [keyLight, setKeyLight] = useState(true);
  const [rimLight, setRimLight] = useState(true);
  const [turn, setTurn] = useState(0);
  const [error, setError] = useState("");
  const [listOpen, setListOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tuneStamp, setTuneStamp] = useState(0);
  const [saveNote, setSaveNote] = useState("");
  // the texture whose look the sliders tune (an NPC's normal strength is set in the NPC editor, a decal has none)
  const tuneId = !entry || sample==="actor" || id.startsWith("decal:") ? "" : sample==="material" ? id : sample==="item" ? "item_"+id : propTexture(id);
  void tuneStamp;
  const tune: TextureTuning | undefined = tuneId ? { ...textureTuning(tuneId) } : undefined;
  const tuneRef = useRef(tune);
  tuneRef.current = tune;
  function changeTune(key: keyof TextureTuning, value: number) {
    setTextureTuning(tuneId, { ...tuneRef.current, [key]: value });
    setTuneStamp(n => n + 1);
    setSaveNote("");
  }
  async function saveTune() {
    try { setSaveNote("Saved to " + await saveTextureTuning()); }
    catch { setSaveNote("Could not save (only the dev server can write the file)."); }
  }
  const lights = useRef({ keyLight, rimLight, turn });
  lights.current = { keyLight, rimLight, turn };
  const liveCamera = useRef<{camera:THREE.PerspectiveCamera,controls:OrbitControls} | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const previewRenderer = useRef<THREE.WebGLRenderer | null>(null);
  useEffect(() => {
    if (!open || !host.current) return;
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
  }, [open]);
  useEffect(() => {
    const el = host.current;
    const renderer = previewRenderer.current;
    if (!open || !el || !entry || !groups[primary] || !renderer) return;
    let disposed = false;
    setError("");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x28292c);
    const camera = new THREE.PerspectiveCamera(40,1,.02,30);
    camera.position.set(1.5,1.1,2);
    const controls = new OrbitControls(camera,renderer.domElement);
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label","3D preview. Use WASD to move.");
    const keys = new Set<string>();
    let walked = false;
    const orbitSubject = (event: PointerEvent) => {
      if (event.button!==0 || !walked) return;
      const selectedProp=sample==="prop" ? PROP_TYPES[id] : undefined;
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
      const t=keep(loader.load(url,undefined,undefined,()=>{if(!disposed)setError("Could not load "+url);}));
      if(color)t.colorSpace=THREE.SRGBColorSpace;
      t.magFilter=THREE.NearestFilter; return t;
    };
    const n = background==="5×5" ? 5 : 3;
    const half = n/2;
    const fantasy = (world==="All" ? assetWorld(id.replace(/^decal:/,"")) : world)==="fantasy";
    const roomSets = fantasy ? ["fantasyfloor1","fantasywall1","fantasywall1"] : ["floor1","wall1","ceiling1"];
    if(background!=="Empty" && !(sample==="material" && background==="Selected texture")) {
      const surfaces = [[0,0,0,-Math.PI/2,0,n,n,0],[0,1,0,Math.PI/2,0,n,n,2],[0,.5,-half,0,0,n,1,1],[0,.5,half,0,Math.PI,n,1,1],[-half,.5,0,0,Math.PI/2,n,1,1],[half,.5,0,0,-Math.PI/2,n,1,1]];
      for(const [x,y,z,rx,ry,w,h,kind] of surfaces){
        if(kind===2 && !showCeiling) continue;
        const horizontalSample = sample==="material" && ((orientation==="Floor" && kind===0) || (orientation==="Ceiling" && kind===2));
        const src = catalog[roomSets[kind]]?.diffuse;
        const map = background!=="Gray" && src ? texture(src) : null;
        if(map){map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(w,h);}
        // Fit the backing behind the full relief range, including at max tuning.
        const clearance = horizontalSample ? .08 * (tune?.relief ?? 1) + .01 : 0;
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
      if(detail && !["item","material"].includes(sample) && prop?.kind!=="cross" && prop?.kind!=="panel"){
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
      const height = set.depth ? loadHeightGrid(set.depth) : Promise.resolve({width:2,height:2,data:new Float32Array(4)});
      height.then(grid=>{
        if(disposed)return;
        const joined = joinEdges && layout!=="Single";
        const options={wallWidth:1,wallHeight:1,depth:depthScale*.08*(tuneRef.current?.relief ?? 1),levels:5,minIsland:2,aoRadius:2,smooth:true};
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
      }).catch(()=>{if(!disposed)setError("Could not load the height map.");});
    } else if(sample==="actor") {
      const actor=ACTOR_TYPES[id];
      const mat=assetMaterial(primary,{alphaTest:.5,side:THREE.DoubleSide});
      const sprite=new THREE.Mesh(keep(new THREE.PlaneGeometry(actor.height*actor.cellAspect,actor.height)),mat);
      sprite.position.y=actor.height/2; object.add(sprite);
      animate=time=>{
        const yaw=Math.atan2(camera.position.x,camera.position.z);
        sprite.rotation.y=yaw-object.rotation.y;
        const direction=((Math.round((yaw-object.rotation.y)/(Math.PI/4))%8)+8)%8;
        const col=Math.min(direction,8-direction), mirror=direction>4;
        const row=pose>=0 ? pose : actor.walkRows[Math.floor(time/180)%actor.walkRows.length] ?? actor.idleRow;
        for(const t of [mat.map,mat.normalMap,mat.emissiveMap]) {
          if(!t)continue;
          t.repeat.set((mirror?-1:1)/actor.cols,1/actor.rows);
          t.offset.set((col+(mirror?1:0))/actor.cols,1-(row+1)/actor.rows);
        }
      };
    } else if(id.startsWith("decal:")) {
      const info=decals[id.slice(6)];
      const stamp=assetMaterial(primary,{alphaTest:.5,roughness:info?.water ? .14 : .75,metalness:.15,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
      async function projectSamples(){
        const image = await new THREE.ImageLoader().loadAsync(entry!.img);
        if(disposed)return;
        const scale=.65/Math.max(image.width,image.height);
        const size=new THREE.Vector3(image.width*scale,image.height*scale,.32);
        for(const floor of [true,false]){
          const paths=catalog[roomSets[floor?0:1]];
          const textured=background!=="Empty" && background!=="Gray";
          const grid=textured ? await loadHeightGrid(paths.depth) : undefined;
          if(disposed)return;
          const relief=grid && createReliefWallGeometry(grid,{wallWidth:1,wallHeight:1,depth:.08,levels:5,minIsland:2,aoRadius:2,smooth:true,flushEdges:true,floorEdges:floor});
          const geo=keep(relief?.geometry ?? new THREE.PlaneGeometry(1,1));
          if(relief)keep(relief.aoMap);
          const surfaceMat=keep(new THREE.MeshStandardMaterial({map:textured?texture(paths.diffuse):null}));
          for(let side=0;side<(floor?1:4);side++){
            const angle=side*Math.PI/2;
            const surface=new THREE.Mesh(geo,surfaceMat);
            surface.rotation.set(floor?-Math.PI/2:0,angle,0);
            const radius=half-(textured?.09:.002);
            surface.position.set(floor?0:-radius*Math.sin(angle),floor?(textured?.09:.002):.5,floor?0:-radius*Math.cos(angle));
            surface.updateMatrixWorld();
            if(textured)scene.add(surface);
            const geometry=keep(new DecalGeometry(surface,surface.position,surface.rotation,size));
            scene.add(new THREE.Mesh(geometry,stamp));
          }
        }
      }
      void projectSamples().catch(()=>{if(!disposed)setError("Could not load the decal preview.");});
    } else {
      const prop=sample==="prop" ? PROP_TYPES[id] : undefined;
      const onWall=!!prop && (placement==="Wall" || (placement==="Auto" && prop.wall));
      if(onWall)object.position.z=-half+(prop?.size[2] ?? .02)/2+.01;
      if(prop && "elevation" in prop)object.position.y=prop.elevation ?? 0;
      if(!prop || prop.kind!=="views"){
        // (its normal map too, where it has one - for the tuning)
      const mat=assetMaterial(primary,{alphaTest:.4,side:THREE.DoubleSide});
      apply = () => { const t = tuneRef.current, n = t?.normal ?? 1; mat.normalScale.set(n, n); mat.roughness = Math.min(1, .85 * (t?.rough ?? 1)); mat.metalness = Math.min(1, .02 * (t?.metal ?? 1)); };
        const [w,h,d]=prop?.size ?? (sample==="item"?[.24,.24,.15]:[.6,.6,.02]);
        const flat=!prop || ["panel","billboard","cross","chamfer"].includes(prop.kind);
        const geo: THREE.BufferGeometry=flat ? keep(new THREE.PlaneGeometry(w,h)) : keep(new THREE.BoxGeometry(w,h,d));
        const faceMat=(name:string)=>assetMaterial(name,{alphaTest:.4});
        let faces: THREE.Material | THREE.Material[]=mat;
        if(prop?.kind==="box"){const top=faceMat(prop.top);faces=[mat,mat,top,top,mat,mat];}
        if(prop?.kind==="cabin"){const side=faceMat(prop.views+"_side"),top=faceMat(prop.views+"_top");faces=[side,side,top,top,mat,faceMat(prop.inside)];}
        const mesh=new THREE.Mesh(geo,faces); mesh.position.y=onWall && !prop?.wall ? .5 : h/2; object.add(mesh);
        if(prop?.kind==="pillar"){
          const height=prop.height ?? h;
          mesh.scale.set(prop.shaft/w,(height-2*prop.flare)/h,prop.shaft/d);mesh.position.y=height/2;
          for(const y of [prop.flare/2,height-prop.flare/2]){
            const cap=new THREE.Mesh(keep(new THREE.BoxGeometry(w,prop.flare,d)),mat);cap.position.y=y;object.add(cap);
          }
        }
        if(sample==="item"){
          const height=.2;
          const tilt=-Math.PI/12;
          mesh.rotation.order="YXZ";
          mesh.rotation.x=tilt;
          mesh.position.y=height*Math.cos(tilt)/2;
          animate=()=>{mesh.rotation.y=Math.atan2(camera.position.x,camera.position.z)-object.rotation.y;};
          loadHeightGrid(textureFolder("item_"+id).depth).then(grid=>{
            if(disposed)return;
            const result=createReliefWallGeometry(grid,{wallWidth:height*grid.width/grid.height,wallHeight:height,depth:depthScale*.025*(tuneRef.current?.relief ?? 1),levels:5,minIsland:2,aoRadius:2,flushEdges:false});
            mesh.geometry=keep(result.geometry);mat.aoMap=keep(result.aoMap);mat.needsUpdate=true;
          }).catch(()=>{if(!disposed)setError("Could not load the item height map.");});
        }
        if(prop?.kind==="billboard")animate=()=>{mesh.rotation.y=Math.atan2(camera.position.x,camera.position.z)-object.rotation.y;};
        if(prop?.kind==="cross" || prop?.kind==="panel"){
          const paths=catalog[prop.texture] ?? textureFolder(prop.texture);
          loadHeightGrid(paths.depth).then(grid=>{
            if(disposed)return;
            const depth=depthScale*.08*(prop.relief ?? 1)*(tuneRef.current?.relief ?? 1);
            const result=createReliefWallGeometry(downsampleHeightGrid(grid,2),{wallWidth:w,wallHeight:h,depth,levels:5,minIsland:2,aoRadius:2,flushEdges:false});
            const relief=keep(result.geometry);keep(result.aoMap);
            object.remove(mesh);
            mat.side=THREE.FrontSide;mat.aoMap=result.aoMap;mat.needsUpdate=true;
            for(const angle of prop.kind==="cross"?[0,Math.PI/2]:[0]){
              for(const back of [false,true]){
                const face=new THREE.Mesh(relief,mat);
                face.rotation.y=angle+(back?Math.PI:0);
                if(back)face.scale.x=-1;
                face.position.copy(mesh.position);
                object.add(face);
              }
            }
          }).catch(()=>{if(!disposed)setError("Could not load the prop height map.");});
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
  },[open,sample,id,groups,view,hidden,edits,layout,joinEdges,orientation,background,showCeiling,world,rgb,pose,placement,tune?.relief]);
  const strip = "grid w-8 shrink-0 place-items-start rounded border border-neutral-600 bg-neutral-900 py-2 text-lg hover:border-amber-400";
  return <><button className={button} onClick={()=>{if(document.pointerLockElement)document.exitPointerLock();setOpen(true);}}>Asset Manager</button>{open && createPortal(
    <div role="dialog" aria-label="Asset Manager" aria-modal="true" className="fixed inset-0 z-[2147483647] bg-black/75 p-2 text-white pointer-events-auto" onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation(); if(e.key==="Escape")setOpen(false);}}>
      <section className="flex h-full w-full flex-col rounded-lg border border-neutral-500 bg-neutral-950 p-3">
        <header className="mb-2 flex shrink-0 items-center justify-between gap-3"><strong>Asset Manager</strong><span className="min-w-0 flex-1 truncate text-sm text-neutral-300">{error || "Left drag to orbit · Middle or right drag to pan · Wheel to zoom"}</span><button aria-label="Close Asset Manager" className={button} onClick={()=>setOpen(false)}>×</button></header>
        <div className="flex min-h-0 flex-1 gap-2">
          {listOpen ? <aside className="flex w-72 shrink-0 flex-col gap-2 overflow-hidden rounded border border-neutral-700 p-2">
            <div className="flex items-center justify-between gap-2"><strong>Assets</strong><button aria-label="Collapse the asset list" title="Collapse" className="px-2 hover:text-amber-400" onClick={()=>setListOpen(false)}>◀</button></div>
            <div className="flex flex-wrap gap-1">{(["material","prop","actor","item"] as const).map((t,i)=><button key={t} className={button+" !px-2 !py-1"} aria-pressed={sample===t} onClick={()=>{setSample(t);if(background==="Selected texture" && t!=="material")setBackground("3×3");setSub("All");setPose(-1);setTurn(0);setPlacement("Auto");}}>{["Textures","Props","NPCs","Items"][i]}</button>)}</div>
            <label>World <select className={button+" !py-1"} value={world} onChange={e=>{setWorld(e.target.value as typeof world);setPose(-1);}}><option>All</option><option value="scifi">Sci-fi</option><option value="fantasy">Fantasy</option></select></label>
            {["material","prop"].includes(sample) && <div className="flex flex-wrap gap-1">{["All",...(sample==="material"?["wall","floor","ceiling"]:["3D","billboard","decal"])].map(k=><button key={k} className={button+" !px-2 !py-1"} aria-pressed={sub===k} onClick={()=>setSub(k)}>{k}</button>)}</div>}
            <div className="grid min-h-0 flex-1 content-start grid-cols-2 gap-1 overflow-auto">{visible.map(e=>{
              const a=sample==="actor"?ACTOR_TYPES[e.key]:undefined;
              return <button key={e.key} className={button+" !p-1 text-xs"} aria-pressed={id===e.key} onClick={()=>{select(e.key);setPose(-1);setPlacement("Auto");}}>
                {a?<span className="block h-12 w-12" style={{backgroundImage:"url("+e.img+")",backgroundSize:a.cols*100+"% "+a.rows*100+"%",backgroundPosition:"0 "+a.idleRow/Math.max(1,a.rows-1)*100+"%"}}/>:<img src={e.img} loading="lazy" alt="" className="h-14 w-full object-contain"/>}{e.label}</button>;
            })}</div>
          </aside> : <button aria-label="Show the asset list" title="Assets" className={strip} onClick={()=>setListOpen(true)}>▶</button>}
          <main className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 flex-wrap items-center gap-2"><strong>{entry?.label ?? "No matching assets"}</strong>
              {sample==="material" && <>{["Wall","Floor","Ceiling"].map(v=><button className={button+" !py-1"} aria-pressed={orientation===v} key={v} onClick={()=>{orient(v);if(v==="Ceiling" || v==="Floor"){const cam=liveCamera.current;if(cam){cam.camera.position.y=v==="Ceiling"?.25:1.7;cam.controls.target.y=v==="Ceiling"?.95:.05;cam.controls.update();}}if(v!=="Wall" && layout==="Block")setLayout("Single");}}>{v}</button>)}{(orientation==="Wall"?["Single","Pair","Block"]:["Single","Pair"]).map(v=><button className={button+" !py-1"} aria-pressed={layout===v} key={v} onClick={()=>setLayout(v)}>{v}</button>)}</>}
              {sample==="actor" && entry && <><label>Pose <select className={button+" !py-1"} value={pose} onChange={e=>setPose(+e.target.value)}><option value={-1}>Walk cycle</option>{Array.from({length:ACTOR_TYPES[id].rows},(_,i)=><option key={i} value={i}>Row {i+1}{i===ACTOR_TYPES[id].idleRow?" · Idle":""}</option>)}</select></label><a className={button+" !py-1"} target="_blank" rel="noreferrer" href={"?editor=actors&actor="+encodeURIComponent(id)}>Open NPC editor</a></>}
              {sample==="prop" && propEditable(PROP_TYPES[id]) && <button className={button+" !py-1"} onClick={()=>{setOpen(false);propEdit.set({name:id,part:0});}}>Open prop editor</button>}
              {!id.startsWith("decal:") && sample==="prop" && <label>Mount <select className={button+" !py-1"} value={placement} onChange={e=>setPlacement(e.target.value)}>{["Auto","Floor","Wall"].map(v=><option key={v}>{v}</option>)}</select></label>}</div>
            <div className="flex flex-wrap gap-1" aria-label="Asset preview view">{["textured","faces","wireframe","normals","depth"].map(v=><button key={v} className={button+" !py-1 capitalize"} aria-pressed={view===v} onClick={()=>setView(v)}>{v}</button>)}</div>
            {sample==="material" && layout!=="Single" && <label><input type="checkbox" checked={joinEdges} onChange={e=>setJoinEdges(e.target.checked)}/> Join panel edges</label>}
            <div className="min-h-0 max-h-[65vh] flex-1 overflow-hidden rounded border border-neutral-700 [&>canvas]:block" ref={host}/>
          </main>
          {panelOpen ? <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-auto rounded border border-neutral-700 p-2">
            <div className="flex items-center justify-between gap-2"><strong>Properties</strong><button aria-label="Collapse the properties panel" title="Collapse" className="px-2 hover:text-amber-400" onClick={()=>setPanelOpen(false)}>▶</button></div>
            <details open className="rounded border border-neutral-800 p-2"><summary className="cursor-pointer font-semibold">Look · {tuneId || "no tuning"}</summary>
              {tune ? <>
                <p className="my-1 text-xs text-neutral-400">Multipliers of the game's own values, so the debug sliders still work on top. Saved per texture, in the project.</p>
                {TUNING.map(({key,label,max,hint})=><label key={key} className="my-1 block text-sm" title={hint}>{label}: <strong>{(tune[key]??1).toFixed(2)}×</strong><input className="block w-full" type="range" min="0" max={max} step=".05" value={tune[key]??1} onChange={e=>changeTune(key,+e.target.value)}/></label>)}
                <div className="mt-2 flex flex-wrap items-center gap-2"><button className={button+" !py-1"} onClick={saveTune}>Save to project</button><button className={button+" !py-1"} onClick={()=>{setTextureTuning(tuneId,undefined);setTuneStamp(n=>n+1);setSaveNote("");}}>Reset</button></div>
                {saveNote && <p className="mt-1 text-xs text-neutral-300">{saveNote}</p>}
              </> : <p className="my-1 text-xs text-neutral-400">{sample==="actor" ? "An NPC's normal strength is set in the NPC editor." : "This one has no tuning."}</p>}
            </details>
            <details open className="rounded border border-neutral-800 p-2"><summary className="cursor-pointer font-semibold">Preview room &amp; lights</summary>
              <div className="mt-1 flex flex-col gap-2 text-sm">
                <label>Room <select className={button+" !py-1"} value={background} onChange={e=>setBackground(e.target.value)}>{["Empty","Gray","3×3","5×5",...(sample==="material"?["Selected texture"]:[])].map(v=><option key={v}>{v}</option>)}</select></label>
                <label>Room ceiling <select className={button+" !py-1"} value={ceiling} onChange={e=>setCeiling(e.target.value)}>{["Auto","On","Off"].map(v=><option key={v}>{v}</option>)}</select></label>
                <p className="text-xs text-neutral-300">Click the preview, then use W/S to move and A/D to strafe.</p>
                <label><input type="checkbox" checked={rgb} onChange={e=>setRgb(e.target.checked)}/> RGB lights</label>
                <label><input type="checkbox" checked={keyLight} onChange={e=>setKeyLight(e.target.checked)}/> Key light</label>
                <label><input type="checkbox" checked={rimLight} onChange={e=>setRimLight(e.target.checked)}/> Side light</label>
                <label>Rotation <input className="block w-full" type="range" min="-180" max="180" value={turn} onChange={e=>setTurn(+e.target.value)}/></label>
              </div>
            </details>
            {<details open className="rounded border border-neutral-800 p-2"><summary className="cursor-pointer font-semibold">Asset maps · local preview</summary>{Object.entries(groups).map(([group,layers])=><section key={group}>{Object.keys(groups).length>1 && <strong>{group}</strong>}<div className="mt-1 grid grid-cols-2 gap-2">{channels.map(channel=>{
              const url=(sample==="material"?edits[channel]:undefined) ?? layers[channel];
              if(!url && sample!=="material")return null;
              const key=maskKey(group,channel);
              return <div key={channel} className="border border-neutral-700 p-2 text-sm"><strong>{channel}</strong>{url && <button className="float-right px-1" title={(hidden[key]?"Enable ":"Disable ")+channel} aria-label={(hidden[key]?"Enable ":"Disable ")+group+" "+channel} aria-pressed={!hidden[key]} onClick={()=>setHidden(old=>({...old,[key]:!old[key]}))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12Q12 -2 22 12Q12 26 2 12Z"/><circle cx="12" cy="12" r="3"/>{hidden[key] && <path d="M2 2L22 22"/>}</svg></button>}{url ? <img src={url} alt={channel} className="h-14 w-full object-contain"/> : <p className="h-14">Empty</p>}
                {sample==="material" && <><label className="cursor-pointer underline">Import<input type="file" accept="image/*" className="sr-only" onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(file)try{edit(channel,await importImage(file));}catch{setError("Could not import image.");}}}/></label>
                {url && <button className="ml-1 underline" onClick={()=>edit(channel,"")}>Clear</button>}
                {edits[channel]!==undefined && <button className="underline" onClick={()=>edit(channel)}>Restore original</button>}</>}
              </div>;
            })}</div></section>)}</details>}
          </aside> : <button aria-label="Show the properties panel" title="Properties" className={strip} onClick={()=>setPanelOpen(true)}>◀</button>}
        </div>
      </section>
    </div>,document.body)}</>;
}
