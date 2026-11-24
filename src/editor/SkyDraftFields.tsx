import { useEffect, useState } from "react";
import { formatNumber, t } from "../i18n";
import { useBlobUrl } from "./ChannelControls";
import type { ImageDraft } from "./sharedImages";
import { analyseSky, blendSkySeam, readSkyFile, SKY_FILE_ACCEPT, skyIssueText, type SkyInfo } from "./skyUpload";
import { skyNameFromFile } from "./skyUploadLogic";
import { BUTTON, idle } from "./inspector/parts";

const field = "block w-full min-w-0 rounded-sm border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm text-neutral-100";

// The panorama as a strip (every column, squeezed), and the seam seen from the middle: the right half followed by the
// left half, so a bad join shows as a jump at the line.
export function SkyWrapPreview({ url }: { url: string }) {
  return <div className="flex min-w-0 flex-col gap-1">
    <p className="text-[10px] text-neutral-400">{t("sky.previewStrip")}</p>
    <img src={url} alt="" className="h-14 w-full rounded-sm border border-neutral-700 object-fill"/>
    <p className="text-[10px] text-neutral-400">{t("sky.previewWrap")}</p>
    <div className="relative flex h-14 w-full overflow-hidden rounded-sm border border-neutral-700">
      <div className="h-full w-1/2 overflow-hidden"><img src={url} alt="" className="-ml-[100%] h-full w-[200%] max-w-none object-fill"/></div>
      <div className="h-full w-1/2 overflow-hidden"><img src={url} alt="" className="h-full w-[200%] max-w-none object-fill"/></div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-amber-400/80"/>
    </div>
  </div>;
}

export function useSkyInfo(png: Blob | null | undefined): SkyInfo | undefined {
  const [info, setInfo] = useState<SkyInfo>();
  useEffect(() => {
    setInfo(undefined);
    if (!png) return;
    let live = true;
    void analyseSky(png).then(result => { if (live) setInfo(result); }).catch(() => { if (live) setInfo(undefined); });
    return () => { live = false; };
  }, [png]);
  return info;
}

// The upload part of a sky draft in the Assets manager: the file, its checks, the seam and the way to blend it.
export function SkyDraftFields({ draft, busy, change, run, onStatus }: {
  draft: ImageDraft;
  busy: boolean;
  // saves a change of the draft (the inspector's own saver: it reads the stored copy)
  change: (patch: Partial<ImageDraft>) => Promise<void>;
  run: (action: () => Promise<void>) => Promise<void>;
  onStatus: (text: string) => void;
}) {
  const url = useBlobUrl(draft.png);
  const info = useSkyInfo(draft.png);
  const number = (value: number) => formatNumber(value, 1);

  const choose = (file: File) => run(async () => {
    const { png, width, height } = await readSkyFile(file);
    await change({ png, name: draft.name.trim() || skyNameFromFile(file.name) });
    onStatus(t("sky.uploaded", { width, height }));
  });
  const blend = () => run(async () => {
    if (!draft.png) return;
    await change({ png: await blendSkySeam(draft.png, draft.name || "sky") });
    onStatus(t("sky.seamFixed"));
  });

  return <div className="flex min-w-0 flex-col gap-2">
    <label className="flex min-w-0 flex-col gap-1">{t("sky.file")}
      <input className={field} type="file" accept={SKY_FILE_ACCEPT} disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void choose(file);
      }}/>
    </label>
    <p className="text-xs text-neutral-400">{t("sky.formatHint")}</p>
    {!draft.png || !url ? <p className="text-xs text-neutral-500">{t("sky.noPicture")}</p> : <>
      <SkyWrapPreview url={url}/>
      {info && <>
        <p className="text-xs text-neutral-300">{t("sky.size", { width: info.width, height: info.height })}</p>
        {info.errors.map(issue => <p key={issue.code} className="text-xs text-red-300">{skyIssueText(issue)}</p>)}
        {info.warnings.map(issue => <p key={issue.code} className="text-xs text-amber-300">{skyIssueText(issue)}</p>)}
        <p className={`text-xs ${info.seam.ok ? "text-emerald-300" : "text-amber-300"}`}>
          {t(info.seam.ok ? "sky.seamOk" : "sky.seamBad", { seam: number(info.seam.seam), baseline: number(info.seam.baseline) })}
        </p>
        <button type="button" className={`${BUTTON} ${idle} self-start`} disabled={busy} title={t("sky.seamFixHint")} onClick={() => void blend()}>{t("sky.seamFix")}</button>
        <p className="text-[10px] text-neutral-500">{t("sky.seamFixHint")}</p>
      </>}
    </>}
  </div>;
}
