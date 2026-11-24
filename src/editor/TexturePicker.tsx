import { useContext, useEffect, useId, useRef, useState } from "react";
import { hasKey, t, type Key } from "../i18n";
import { TEXTURE_SETS } from "../render/textureSets";
import { BUTTON, CommitContext, idle } from "./inspector/parts";

// A texture choice with the picture on it: the button shows the selected texture's face (its diffuse map, as the
// asset tree's thumbnails do) and its name; a click opens a list below it with a thumbnail and a name for every
// texture, and picking one closes it. One component for every texture field of the inspector that has more
// textures than a row of buttons can hold.

export interface TextureOption {
  // the texture set id ("" for "no texture of its own")
  value: string;
  label: string;
  // its thumbnail (undefined: none - the "its own" row)
  image?: string;
}

// (a shared texture has no translated name: its own name shows)
const nameOf = (label: string) => (hasKey("assetTree.name." + label) ? t(("assetTree.name." + label) as Key) : label);

// The options for a list of texture set ids; `first` rows (the "its own" / "none" ones) go in front of them
export function textureOptions(ids: readonly string[], first: TextureOption[] = []): TextureOption[] {
  const sets = TEXTURE_SETS as Record<string, { label: string; diffuse: string } | undefined>;
  return [...first, ...ids.flatMap((id) => (sets[id] ? [{ value: id, label: nameOf(sets[id]!.label), image: sets[id]!.diffuse }] : []))];
}

export function TexturePicker({ label, title, value, options, onChange }: {
  label?: string;
  title?: string;
  value: string;
  options: TextureOption[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const commit = useContext(CommitContext);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  // (the selected one may be a texture that isn't listed - a shared one still loading: its id stands in)
  const selected = options.find((o) => o.value === value) ?? { value, label: value, image: (TEXTURE_SETS as Record<string, { diffuse: string } | undefined>)[value]?.diffuse };

  useEffect(() => {
    if (!open) return;
    // (heard before anything else does: the panel stops the pointer's events from reaching the page)
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  const term = query.trim().toLocaleLowerCase();
  const shown = term ? options.filter((o) => `${o.label} ${o.value}`.toLocaleLowerCase().includes(term)) : options;
  const thumb = (o: TextureOption, size: string) =>
    o.image ? (
      <img src={o.image} alt="" loading="lazy" className={`${size} shrink-0 bg-neutral-950 object-contain`} />
    ) : (
      <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center border border-dashed border-neutral-600 text-neutral-500`}>–</span>
    );

  return (
    <div ref={root} className="relative flex min-w-0 flex-wrap items-center gap-1" title={title}>
      {label && <span id={id}>{label}</span>}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? id : undefined}
        aria-label={label ? undefined : t("texturePicker.choose")}
        className={`${BUTTON} ${idle} flex min-w-0 flex-1 items-center gap-2 text-left`}
        onClick={() => setOpen((o) => !o)}
      >
        {thumb(selected, "h-8 w-8")}
        <span className="min-w-0 flex-1 truncate">{selected.label || t("texturePicker.choose")}</span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 flex max-h-72 flex-col border border-neutral-600 bg-neutral-900 shadow-lg">
          {options.length > 8 && (
            <input
              type="search"
              autoFocus
              value={query}
              placeholder={t("texturePicker.search")}
              aria-label={t("texturePicker.search")}
              className="m-1 min-w-0 border border-neutral-600 bg-neutral-950 p-1"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // (not a shortcut of the editor)
                e.stopPropagation();
                if (e.key === "Enter" && shown.length === 1) {
                  onChange(shown[0].value);
                  commit();
                  setOpen(false);
                }
              }}
            />
          )}
          <div role="listbox" aria-label={label ?? t("texturePicker.choose")} className="min-h-0 flex-1 overflow-y-auto">
            {shown.map((o) => (
              <button
                key={o.value || "(none)"}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className="flex w-full items-center gap-2 border border-transparent p-1 text-left hover:bg-neutral-800 aria-selected:border-amber-400"
                onClick={() => {
                  if (o.value !== value) {
                    onChange(o.value);
                    commit();
                  }
                  setOpen(false);
                }}
              >
                {thumb(o, "h-10 w-10")}
                <span className="min-w-0 break-words">{o.label}</span>
              </button>
            ))}
            {!shown.length && <p className="p-1 text-neutral-500">{t("texturePicker.empty")}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
