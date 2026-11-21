// The "Shops" category of the Asset Manager: the bundled and shared shops (read-only, with a local copy to edit) and the
// local drafts (autosaved in IndexedDB, layered into the shop catalog so they play at once), the stock table with live
// prices, a problems list, Publish to the shared store, and a .json import/export.
import { useState } from "react";
import { Lock } from "lucide-react";
import { t, type Key } from "../i18n";
import { ITEM_TYPES } from "../game/items";
import { itemName, itemValue, weaponItemId, weaponTypeOfItem } from "../game/itemRules";
import { WEAPON_TYPES } from "../game/weapons";
import { UNLIMITED, type ShopStockEntry } from "../game/shop";
import { commonIdOk } from "../game/sharedContent";
import { getBundledShops, getSharedShops, useShopIds } from "../game/shopCatalog";
import { sharedImage, useSharedImages } from "../render/sharedImages";
import { sharedConfigured, useSharedAuth } from "./sharedAuth";
import { publishShop } from "./sharedCommon";
import { SignInPopover } from "./TexturePanel";
import { deleteShopDraft, renameShopDraft, saveShopDraft, useShopDrafts } from "./shopDrafts";
import {
  draftFromShop, hasErrors, newShopDraft, previewItem, previewRow, shopFromDraft, shopFromJsonText, shopSlug, shopToJson, uniqueShopId,
  validateShop, type ShopContext, type ShopDraft,
} from "./shopEdit";

const button = "rounded-sm border border-neutral-700 bg-neutral-800 px-2 py-1 text-left text-neutral-200 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40";
const field = "min-w-0 rounded-sm border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-xs text-neutral-200 disabled:opacity-60";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// the items a shop can stock: every item type (built in and the editor's pickups) and every weapon, with names and values
const knownItem = (item: string) => {
  const weapon = weaponTypeOfItem(item);
  return weapon !== null ? !!WEAPON_TYPES[weapon] : !!ITEM_TYPES[item];
};
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const allItems = () => ({
  items: Object.keys(ITEM_TYPES).map(id => ({ id, name: itemName(id) })).sort(byName),
  weapons: Object.keys(WEAPON_TYPES).map(type => ({ id: weaponItemId(type), name: itemName(weaponItemId(type)) })).sort(byName),
});

// A number box that keeps what is typed (an empty box is "no value", "1." stays "1." while typing).
function NumInput({ value, onChange, placeholder, disabled, step = 1, min = 0, label, title, className = "" }: {
  value: number | undefined; onChange: (value: number | undefined) => void; placeholder?: string; disabled?: boolean;
  step?: number; min?: number; label: string; title?: string; className?: string;
}) {
  const show = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? "" : String(v));
  const [text, setText] = useState(show(value));
  const parsed = text.trim() === "" ? undefined : Number(text);
  // (an edit from outside - a reload of the draft - shows; what was typed and parses to the same stays as typed)
  const empty = (v: number | undefined) => v === undefined || Number.isNaN(v);
  if (!(empty(parsed) && empty(value)) && parsed !== value) setText(show(value));
  return <input type="number" inputMode="decimal" className={field + " " + className} value={text} min={min} step={step} placeholder={placeholder} disabled={disabled}
    aria-label={label} title={title ?? label}
    onChange={e => { setText(e.target.value); onChange(e.target.value.trim() === "" ? undefined : Number(e.target.value)); }}/>;
}

// The id: edited as text, taken when it is a valid id nobody else has (on leaving the field or Enter), else put back.
function IdField({ id, disabled, others, onRename }: { id: string; disabled: boolean; others: ReadonlySet<string>; onRename: (id: string) => void }) {
  const [text, setText] = useState(id);
  const [seen, setSeen] = useState(id);
  if (seen !== id) { setSeen(id); setText(id); }
  const bad = text !== id && (!commonIdOk(text) || others.has(text));
  function commit() {
    if (text === id) return;
    if (bad) setText(id); else onRename(text);
  }
  return <input className={field + (bad ? " border-red-400" : "")} value={text} maxLength={64} disabled={disabled} spellCheck={false} aria-label={t("shopEditor.id")} title={t("shopEditor.idHint")}
    onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); }}/>;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ShopsPanel({ onError, onNotice }: { onError: (text: string) => void; onNotice: (text: string) => void }) {
  const drafts = useShopDrafts();
  useShopIds(); // (re-rendered when a bundled/shared/draft layer changes)
  const images = useSharedImages();
  const auth = useSharedAuth();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [signIn, setSignIn] = useState(false);

  const bundled = getBundledShops();
  const shared = getSharedShops();
  const rows = [...new Set([...bundled.keys(), ...shared.keys(), ...drafts.map(d => d.id)])].map(id => {
    const draft = drafts.find(d => d.id === id);
    const base = shared.get(id) ?? bundled.get(id);
    const source: "draft" | "shared" | "bundled" = draft ? "draft" : shared.has(id) ? "shared" : "bundled";
    return { id, draft, base, source, name: (draft?.name.trim() || draft?.id) ?? base?.name ?? id };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const term = query.trim().toLocaleLowerCase();
  const shown = rows.filter(r => !term || `${r.name} ${r.id}`.toLocaleLowerCase().includes(term));
  const current = shown.find(r => r.id === selected) ?? shown[0];
  const draft = current?.draft;
  const view: ShopDraft | undefined = draft ?? (current?.base ? draftFromShop(current.base, 0) : undefined);
  const readOnly = !draft;
  const baseSource = shared.has(current?.id ?? "") ? "shared" : "bundled";

  const portraits = images.filter(i => i.type === "portrait" && (i.purpose ?? "portrait") === "portrait");
  const ctx: ShopContext = {
    known: knownItem,
    value: itemValue,
    portraits: new Set(portraits.map(i => i.id)),
    otherDraftIds: new Set(drafts.filter(d => d.id !== current?.id).map(d => d.id)),
    publishedIds: new Set([...bundled.keys(), ...shared.keys()]),
  };
  const problems = view ? validateShop(view, ctx) : [];
  const { items, weapons } = allItems();
  const problemMessage = (p: (typeof problems)[number]) => t(`shopEditor.problem.${p.code}` as Key, { id: view?.id ?? "", item: p.item ?? "" });
  const problemText = (p: (typeof problems)[number]) => (p.row !== undefined ? t("shopEditor.row", { n: p.row + 1 }) + ": " : "") + problemMessage(p);

  // --- edits (autosaved) ---
  function save(next: ShopDraft) {
    void saveShopDraft({ ...next, updated: Date.now() }).then(() => onError(""), e => onError(message(e)));
  }
  const update = (patch: Partial<ShopDraft>) => draft && save({ ...draft, ...patch });
  const setRow = (index: number, patch: Partial<ShopStockEntry>) => draft && update({ stock: draft.stock.map((e, i) => (i === index ? { ...e, ...patch } : e)) });
  function setPrice(index: number, price: number | undefined) {
    if (!draft) return;
    update({ stock: draft.stock.map((e, i) => { if (i !== index) return e; const { price: _old, ...rest } = e; return price === undefined ? rest : { ...rest, price }; }) });
  }
  function moveRow(index: number, by: -1 | 1) {
    if (!draft || index + by < 0 || index + by >= draft.stock.length) return;
    const stock = draft.stock.slice();
    [stock[index], stock[index + by]] = [stock[index + by], stock[index]];
    update({ stock });
  }
  function addRow() {
    if (!draft) return;
    const used = new Set(draft.stock.map(e => e.item));
    const first = [...items, ...weapons].find(i => !used.has(i.id))?.id ?? "";
    update({ stock: [...draft.stock, { item: first, qty: 1 }] });
  }
  async function rename(id: string) {
    if (!draft) return;
    try { await renameShopDraft(draft.id, { ...draft, id, updated: Date.now() }); setSelected(id); onError(""); } catch (e) { onError(message(e)); }
  }

  // --- list actions ---
  async function create() {
    const id = uniqueShopId("new-shop", new Set(rows.map(r => r.id)));
    try { await saveShopDraft(newShopDraft(id, t("shopEditor.newName"))); setSelected(id); setQuery(""); onError(""); } catch (e) { onError(message(e)); }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    let text: string;
    try { text = await file.text(); } catch { onError(t("shopEditor.readError")); return; }
    const shop = shopFromJsonText(text, shopSlug(file.name));
    if (!shop) { onError(t("shopEditor.notShop")); return; }
    const id = commonIdOk(shop.id) ? shop.id : shopSlug(shop.id);
    if (drafts.some(d => d.id === id) && !window.confirm(t("shopEditor.confirmReplace", { id }))) return;
    try { await saveShopDraft(draftFromShop({ ...shop, id })); setSelected(id); setQuery(""); onError(""); } catch (e) { onError(message(e)); }
  }
  async function makeCopy() {
    if (!current?.base) return;
    try { await saveShopDraft(draftFromShop(current.base)); onError(""); } catch (e) { onError(message(e)); }
  }
  async function remove() {
    if (!draft) return;
    const text = current?.base ? t("shopEditor.confirmRevert", { name: draft.name || draft.id, source: t(`shopEditor.source.${baseSource}`) }) : t("shopEditor.confirmDelete", { name: draft.name || draft.id });
    if (!window.confirm(text)) return;
    try { await deleteShopDraft(draft.id); onError(""); } catch (e) { onError(message(e)); }
  }
  function startPublish() {
    if (!draft) return;
    if (hasErrors(problems)) { onError(t("shopEditor.fixFirst")); return; }
    if (!sharedConfigured) { onError(t("assetManager.sharedNotConfigured")); return; }
    if (!auth.token) { setSignIn(true); return; }
    void publish();
  }
  async function publish() {
    if (!draft) return;
    try {
      const rev = await publishShop(shopFromDraft(draft));
      onError("");
      onNotice(t("shopEditor.published", { id: draft.id, rev }));
    } catch (e) { onError(message(e)); }
  }

  const tagText = (source: "draft" | "shared" | "bundled") => t(`shopEditor.tag.${source}` as Key);
  const example = view ? previewItem(view, "example", { value: () => 20 }) : undefined;
  const itemOption = (i: { id: string; name: string }) => <option key={i.id} value={i.id}>{i.name} ({i.id})</option>;
  const cols = "grid grid-cols-[minmax(9rem,1.6fr)_3rem_5rem_8rem_4.5rem_4.5rem_4.5rem] items-center gap-x-2 gap-y-0.5";

  return <div className="flex min-h-0 flex-1 gap-2">
    <aside className="flex w-64 shrink-0 flex-col gap-1 overflow-hidden border-r border-neutral-800 pr-2">
      <strong className="text-sm">{t("assetManager.shops")}</strong>
      <div className="flex items-center gap-1">
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("shopEditor.search")} aria-label={t("shopEditor.search")}
          className="min-w-0 flex-1 rounded-sm border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100"/>
        <button type="button" className={button + " shrink-0"} title={t("shopEditor.new")} onClick={() => void create()}>+ {t("assetManager.new")}</button>
      </div>
      <label className={button + " cursor-pointer text-xs"} title={t("shopEditor.import")}>{t("shopEditor.import")}
        <input type="file" accept=".json,application/json" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; void importFile(f); }}/>
      </label>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto">
        {shown.map(r => <button key={r.id} type="button" aria-pressed={current?.id === r.id} onClick={() => setSelected(r.id)}
          className={"flex w-full items-center gap-2 rounded-sm border px-1 py-1 text-left text-xs " + (current?.id === r.id ? "border-amber-400 bg-amber-400/10 text-amber-100" : "border-transparent text-neutral-200 hover:bg-neutral-900")}>
          <span className="min-w-0 flex-1 truncate">{r.name}</span>
          <span className="shrink-0 text-neutral-500">{r.id}</span>
          {r.source === "draft" && <span role="img" aria-label={t("assetManager.draftTitle")} title={t("assetManager.draftTitle")} className="h-2 w-2 shrink-0 rounded-full bg-yellow-400"/>}
          {r.source === "bundled" && <span title={tagText("bundled")} aria-label={tagText("bundled")} className="shrink-0 text-neutral-500"><Lock size={11}/></span>}
          {r.source === "shared" && <span className="shrink-0 text-[10px] text-sky-300">{tagText("shared")}</span>}
        </button>)}
        {!shown.length && <p className="p-2 text-xs text-neutral-500">{rows.length ? t("assetManager.noAssets") : t("shopEditor.none")}</p>}
      </div>
    </aside>

    <main className="flex min-w-0 flex-1 flex-col gap-2 overflow-auto">
      {!view || !current ? <p className="text-xs text-neutral-500">{t("shopEditor.selectOne")}</p> : <>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <strong>{view.name.trim() || view.id}</strong>
          <span className="text-xs text-neutral-500">{tagText(current.source)}{draft && current.base ? ` - ${t("shopEditor.draftOver", { source: t(`shopEditor.source.${baseSource}`) })}` : ""}</span>
        </div>
        {readOnly
          ? <p className="flex flex-wrap items-center gap-2 rounded-sm border border-neutral-800 p-2 text-xs text-neutral-300">
            <span className="min-w-0 flex-1">{t("shopEditor.readOnly", { source: t(`shopEditor.source.${current.source === "shared" ? "shared" : "bundled"}`) })}</span>
            <button type="button" className={button} onClick={() => void makeCopy()}>{t("shopEditor.makeCopy")}</button>
          </p>
          : <p className="text-[11px] text-neutral-500">{t("shopEditor.draftSaved")}</p>}

        <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-2">
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-neutral-400">{t("shopEditor.name")}</span>
            <input className={field} value={view.name} maxLength={100} aria-label={t("shopEditor.name")} onChange={e => update({ name: e.target.value })}/>
            <span className="text-neutral-400">{t("shopEditor.id")}</span>
            <IdField id={view.id} disabled={readOnly} others={ctx.otherDraftIds} onRename={id => void rename(id)}/>
            <span className="text-neutral-400">{t("shopEditor.portrait")}</span>
            <div className="flex items-center gap-2">
              <select className={field + " flex-1"} value={view.portrait ?? ""} aria-label={t("shopEditor.portrait")} onChange={e => update({ portrait: e.target.value || undefined })}>
                <option value="">{t("shopEditor.portraitNone")}</option>
                {view.portrait && !portraits.some(i => i.id === view.portrait) && <option value={view.portrait}>{t("shopEditor.portraitMissing", { id: view.portrait })}</option>}
                {portraits.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              {view.portrait && sharedImage(view.portrait) && <img src={sharedImage(view.portrait)!.url} alt="" className="h-9 w-9 shrink-0 object-contain"/>}
            </div>
            <span className="text-neutral-400">{t("shopEditor.buyRate")}</span>
            <NumInput label={t("shopEditor.buyRate")} title={t("shopEditor.rateHint")} step={0.05} value={view.buyRate} onChange={v => update({ buyRate: v ?? NaN })}/>
            <span className="text-neutral-400">{t("shopEditor.sellRate")}</span>
            <NumInput label={t("shopEditor.sellRate")} title={t("shopEditor.rateHint")} step={0.05} value={view.sellRate} onChange={v => update({ sellRate: v ?? NaN })}/>
          </div>
          <p className="text-[11px] text-neutral-500">{t("shopEditor.rateHint")}{example && <> {t("shopEditor.example", { value: 20, buy: example.buy, sell: example.sell })}</>}</p>

          <div className="flex items-center gap-2">
            <strong className="text-sm">{t("shopEditor.stock")} ({view.stock.length})</strong>
            <button type="button" className={button} disabled={readOnly} onClick={addRow}>{t("shopEditor.addItem")}</button>
          </div>
          {view.stock.length > 0 && <div className="flex min-w-0 flex-col gap-1 overflow-x-auto">
            <div className={cols + " text-[11px] text-neutral-400"}>
              <span>{t("shopEditor.item")}</span><span>{t("shopEditor.value")}</span><span title={t("shopEditor.priceTitle")}>{t("shopEditor.price")}</span>
              <span>{t("shopEditor.qty")}</span><span>{t("shopEditor.youPay")}</span><span>{t("shopEditor.youGet")}</span><span/>
            </div>
            {view.stock.map((entry, index) => {
              const preview = previewRow(view, index, ctx);
              const rowProblems = problems.filter(p => p.row === index);
              const known = !entry.item || knownItem(entry.item);
              return <div key={index} className="flex flex-col gap-0.5 border-t border-neutral-900 pt-1">
                <div className={cols}>
                  <select className={field} value={entry.item} aria-label={t("shopEditor.item")} onChange={e => setRow(index, { item: e.target.value })}>
                    {!entry.item && <option value="">{t("shopEditor.emptyItem")}</option>}
                    {entry.item && !known && <option value={entry.item}>{t("shopEditor.unknownItem", { id: entry.item })}</option>}
                    <optgroup label={t("shopEditor.itemsGroup")}>{items.map(itemOption)}</optgroup>
                    <optgroup label={t("shopEditor.weaponsGroup")}>{weapons.map(itemOption)}</optgroup>
                  </select>
                  <span className="text-right font-mono text-xs text-neutral-400">{preview ? preview.value : ""}</span>
                  <NumInput label={t("shopEditor.price")} title={t("shopEditor.priceTitle")} value={entry.price} placeholder={preview ? String(preview.auto) : ""} onChange={v => setPrice(index, v)}/>
                  <div className="flex items-center gap-1">
                    <NumInput label={t("shopEditor.qty")} value={entry.qty === UNLIMITED ? undefined : entry.qty} disabled={entry.qty === UNLIMITED} className="w-14"
                      onChange={v => setRow(index, { qty: v ?? NaN })}/>
                    <label className="flex items-center gap-0.5 text-[11px] text-neutral-300" title={t("shopEditor.unlimited")}>
                      <input type="checkbox" checked={entry.qty === UNLIMITED} onChange={e => setRow(index, { qty: e.target.checked ? UNLIMITED : 1 })}/>
                      {"∞"}<span className="sr-only">{t("shopEditor.unlimited")}</span>
                    </label>
                  </div>
                  <span className="font-mono text-xs text-neutral-100">{preview ? t("shopEditor.cr", { n: preview.buy }) : ""}</span>
                  <span className="font-mono text-xs text-neutral-100">{preview ? (preview.sell > 0 ? t("shopEditor.cr", { n: preview.sell }) : t("shopEditor.wontBuy")) : ""}</span>
                  <span className="flex gap-0.5">
                    <button type="button" className={button + " !px-1.5 !py-0"} aria-label={t("shopEditor.up")} title={t("shopEditor.up")} disabled={readOnly || index === 0} onClick={() => moveRow(index, -1)}>{"▲"}</button>
                    <button type="button" className={button + " !px-1.5 !py-0"} aria-label={t("shopEditor.down")} title={t("shopEditor.down")} disabled={readOnly || index === view.stock.length - 1} onClick={() => moveRow(index, 1)}>{"▼"}</button>
                    <button type="button" className={button + " !px-1.5 !py-0"} aria-label={t("shopEditor.remove")} title={t("shopEditor.remove")} disabled={readOnly}
                      onClick={() => update({ stock: view.stock.filter((_, i) => i !== index) })}>{"×"}</button>
                  </span>
                </div>
                {rowProblems.map((p, i) => <p key={i} className={"text-[11px] " + (p.severity === "error" ? "text-red-300" : "text-yellow-300")}>{p.severity === "error" ? "✖" : "▲"} {problemMessage(p)}</p>)}
              </div>;
            })}
          </div>}
          {!view.stock.length && <p className="text-xs text-neutral-500">{t("shopEditor.noStock")}</p>}
        </fieldset>
      </>}
    </main>

    <aside className="flex w-72 shrink-0 flex-col gap-2 overflow-auto border-l border-neutral-800 pl-2">
      <strong className="text-sm">{t("shopEditor.properties")}</strong>
      {view && current && <>
        <div className="flex flex-wrap gap-2">
          {draft && <button type="button" className={button} title={t("shopEditor.publishHint")} disabled={!sharedConfigured} onClick={startPublish}>{t("shopEditor.publish")}</button>}
          <button type="button" className={button} title={t("shopEditor.exportHint")} onClick={() => download(`${view.id}.json`, shopToJson(shopFromDraft(view)))}>{t("shopEditor.export")}</button>
          {draft && <button type="button" className={button} onClick={() => void remove()}>{t(current.base ? "shopEditor.revert" : "shopEditor.delete")}</button>}
        </div>
        <details open className="rounded border border-neutral-800 p-2">
          <summary className="cursor-pointer font-semibold">{t("shopEditor.problems")} ({problems.length})</summary>
          {problems.length ? <ul className="mt-1 flex flex-col gap-1 text-xs">
            {problems.map((p, i) => <li key={i} className={p.severity === "error" ? "text-red-300" : "text-yellow-300"}>{p.severity === "error" ? "✖" : "▲"} {problemText(p)}</li>)}
          </ul> : <p className="mt-1 text-xs text-emerald-300">{t("shopEditor.noProblems")}</p>}
        </details>
      </>}
    </aside>
    {signIn && <SignInPopover className="fixed left-1/2 top-24 z-30 -translate-x-1/2"
      onDone={() => { setSignIn(false); void publish(); }} onCancel={() => setSignIn(false)} onError={onError}/>}
  </div>;
}
