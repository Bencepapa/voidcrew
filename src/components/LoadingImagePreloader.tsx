import { useEffect } from "react";
import { preloadSharedImages, useSharedImages } from "../render/sharedImages";

// Renders nothing: has the loading pictures of a map and of the maps its links lead
// to (see loadingImagesAhead) fetched as soon as the shared images are known.
export function LoadingImagePreloader({ ids }: { ids: readonly string[] }) {
  const images = useSharedImages();
  const key = ids.join("|");
  useEffect(() => {
    preloadSharedImages(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, key]);
  return null;
}
