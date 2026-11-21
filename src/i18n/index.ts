import { assetTreeEn } from "./en/assetTree";
import { assetTreeHu } from "./hu/assetTree";
import { inspectorEn } from "./en/inspector";
import { inspectorHu } from "./hu/inspector";
import { editorShellEn } from "./en/editorShell";
import { editorShellHu } from "./hu/editorShell";
import { effectsEn } from "./en/effects";
import { effectsHu } from "./hu/effects";
// The interface's language: English or Hungarian (EDITOR_UI_PLAN.md, section
// 15). Strings live in src/i18n/en/<area>.ts and hu/<area>.ts, one pair of
// files per area of the UI; English is the source of the keys, and a key the
// Hungarian side lacks shows its English text.
//
//   t("editorBar.tool.dig")            plain text
//   t("app.edit.filled", { n: 15 })    "... {n} cells" - values filled in
//
// A component that shows t() text must re-render when the language changes:
// the app's root calls useLang(), and everything under it renders again
// (a memoised component calls useLang() itself).

import { useSyncExternalStore } from "react";
import { appEn } from "./en/app";
import { assetManagerEn } from "./en/assetManager";
import { imageAssetsEn } from "./en/imageAssets";
import { dialogueEn } from "./en/dialogue";
import { commonEn } from "./en/common";
import { debugEn } from "./en/debug";
import { editorBarEn } from "./en/editorBar";
import { minimapEn } from "./en/minimap";
import { inventoryEn } from "./en/inventory";
import { inventoryHu } from "./hu/inventory";
import { itemInfoEn } from "./en/itemInfo";
import { itemInfoHu } from "./hu/itemInfo";
import { shopEn } from "./en/shop";
import { shopHu } from "./hu/shop";
import { shopEditorEn } from "./en/shopEditor";
import { shopEditorHu } from "./hu/shopEditor";
import { appHu } from "./hu/app";
import { assetManagerHu } from "./hu/assetManager";
import { imageAssetsHu } from "./hu/imageAssets";
import { dialogueHu } from "./hu/dialogue";
import { commonHu } from "./hu/common";
import { debugHu } from "./hu/debug";
import { editorBarHu } from "./hu/editorBar";
import { minimapHu } from "./hu/minimap";

import { mapDialogEn } from "./en/mapDialog";
import { mapDialogHu } from "./hu/mapDialog";
import { linksEn } from "./en/links";
import { linksHu } from "./hu/links";

const en = { ...linksEn, ...mapDialogEn, ...assetTreeEn, ...inspectorEn, ...editorShellEn, ...effectsEn, ...commonEn, ...editorBarEn, ...debugEn, ...appEn, ...assetManagerEn, ...imageAssetsEn, ...dialogueEn, ...minimapEn, ...inventoryEn, ...itemInfoEn, ...shopEn, ...shopEditorEn };
const hu: Partial<Record<Key, string>> = { ...linksHu, ...mapDialogHu, ...assetTreeHu, ...inspectorHu, ...editorShellHu, ...effectsHu, ...commonHu, ...editorBarHu, ...debugHu, ...appHu, ...assetManagerHu, ...imageAssetsHu, ...dialogueHu, ...minimapHu, ...inventoryHu, ...itemInfoHu, ...shopHu, ...shopEditorHu };

export type Key = keyof typeof en;
// whether a key has a string (for optional, data-driven names)
export const hasKey = (key: string): key is Key => key in en;
export type Lang = "en" | "hu";
export const LANGS: Lang[] = ["hu", "en"];

const STORAGE_KEY = "voidcrew-lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "hu") return saved;
  } catch {
    /* storage blocked: the browser's language decides */
  }
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("hu") ? "hu" : "en";
}

let lang: Lang = initialLang();
const listeners = new Set<() => void>();
if (typeof document !== "undefined") document.documentElement.lang = lang;

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* (not kept) */
  }
  if (typeof document !== "undefined") document.documentElement.lang = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

// the language now; the caller renders again when it changes
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang);
}

// A string in the language now. `{name}` in it is filled from `values`.
export function t(key: Key, values?: Record<string, string | number>): string {
  const text = (lang === "hu" ? hu[key] : undefined) ?? en[key];
  return values ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole)) : text;
}

// the number as the language writes it (a comma for Hungarian): 0,25 / 0.25
export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString(lang === "hu" ? "hu-HU" : "en-US", { maximumFractionDigits: digits });
}
