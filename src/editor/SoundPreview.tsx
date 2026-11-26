import { useEffect, useRef, type SyntheticEvent } from "react";

export function SoundPreview({ src, volume, rate, label, onDuration }: {
  src: string; volume: number; rate: number; label: string; onDuration?: (seconds: number) => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const applyDefaults = () => {
    if (!ref.current) return;
    ref.current.volume = volume;
    ref.current.playbackRate = rate;
    ref.current.preservesPitch = false;
  };
  useEffect(applyDefaults, [src, volume, rate]);
  const onMetadata = (event: SyntheticEvent<HTMLAudioElement>) => {
    applyDefaults();
    onDuration?.(event.currentTarget.duration);
  };
  return <audio key={src} ref={ref} src={src} controls preload="metadata" aria-label={label}
    className="max-w-full w-full" onLoadedMetadata={onMetadata} onKeyDown={event => event.stopPropagation()} />;
}
