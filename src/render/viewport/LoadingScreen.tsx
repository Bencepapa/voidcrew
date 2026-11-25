import { useEffect, useState } from "react";
import { useSharedImages } from "../sharedImages";

// Shown over the view while a map's scene loads: the deck's name and a
// progress bar, fading out once it's all built. `image`: a shared still
// image's id (see MapFile.loadingImage, MapLinkTarget.loadingImage) shown
// behind the text, dimmed so the text stays readable - none: the plain screen.
export function LoadingScreen({ loading, inLift, title, image }: { loading: { title: string; progress: number } | null; inLift: boolean; title: string; image?: string }) {
  const images = useSharedImages();
  // keep the last title and picture while fading out
  const [shown, setShown] = useState(loading);
  const [shownImage, setShownImage] = useState(image);
  useEffect(() => {
    if (loading) {
      setShown(loading);
      setShownImage(image);
    }
  }, [loading, image]);
  const url = shownImage ? images.find((i) => i.id === shownImage)?.url : undefined;
  return (
    <div
      className={`absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 font-mono transition-opacity duration-500 ${loading ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      {url && <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />}
      {url && <div className="absolute inset-0 bg-black/55" />}
      <div className="relative flex flex-col items-center gap-3" style={url ? { textShadow: "0 1px 6px #000, 0 0 2px #000" } : undefined}>
        <div className="text-[10px] tracking-[0.3em] text-green-700">{inLift ? "LIFT IN TRANSIT" : title}</div>
        <div className="text-sm tracking-[0.2em] text-green-400 uppercase">{shown?.title}</div>
        <div className="w-48 h-1 bg-green-950 overflow-hidden">
          <div className="h-full bg-green-500 transition-[width] duration-200" style={{ width: `${Math.round((shown?.progress ?? 1) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
