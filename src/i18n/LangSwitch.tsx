import { LANGS, setLang, t, useLang } from "./index";

// The language switch: HU | EN, the one in use lit.
export function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <div className={`inline-flex border border-neutral-600 rounded-sm overflow-hidden font-mono text-[10px] ${className}`} role="group" aria-label={t("common.language")}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          title={t(l === "hu" ? "common.lang.hu" : "common.lang.en")}
          className={`px-1.5 py-0.5 ${lang === l ? "bg-amber-400/25 text-amber-200" : "text-neutral-400 hover:bg-neutral-800"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
