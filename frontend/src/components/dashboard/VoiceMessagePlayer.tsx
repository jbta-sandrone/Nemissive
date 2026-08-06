import { useEffect, useId, useRef, useState } from "react";
import { formatVoiceDuration } from "./voiceUtils";

type VoiceMessagePlayerProps = {
  src: string | null;
  durationMs: number;
  isLoading: boolean;
  isOutgoing: boolean;
  label: string;
  onRetry: () => void;
};

let activeVoiceAudio: HTMLAudioElement | null = null;
const playbackSpeeds = [1, 1.5, 2] as const;

function VoiceMessagePlayer({ src, durationMs, isLoading, isOutgoing, label, onRetry }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressId = useId();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [resolvedDurationMs, setResolvedDurationMs] = useState(durationMs);
  const [playbackSpeed, setPlaybackSpeed] = useState<(typeof playbackSpeeds)[number]>(1);
  const [hasError, setHasError] = useState(false);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (activeVoiceAudio === audio) activeVoiceAudio = null;
    audio?.pause();
  }, []);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (activeVoiceAudio && activeVoiceAudio !== audio) activeVoiceAudio.pause();
    activeVoiceAudio = audio;
    audio.playbackRate = playbackSpeed;
    try {
      await audio.play();
    } catch {
      setHasError(true);
      if (activeVoiceAudio === audio) activeVoiceAudio = null;
    }
  }

  function seek(nextTimeSeconds: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTimeSeconds)) return;
    audio.currentTime = nextTimeSeconds;
    setCurrentTimeMs(nextTimeSeconds * 1000);
  }

  function cyclePlaybackSpeed() {
    const currentIndex = playbackSpeeds.indexOf(playbackSpeed);
    const nextSpeed = playbackSpeeds[(currentIndex + 1) % playbackSpeeds.length];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  }

  const durationSeconds = Math.max(0.5, resolvedDurationMs / 1000);
  const textClassName = isOutgoing ? "text-white" : "text-heading";
  const mutedTextClassName = isOutgoing ? "text-white/75" : "text-muted";

  if (!src) {
    return <div className="flex min-h-20 min-w-52 items-center justify-center rounded-2xl bg-background/10 px-4 text-center"><button type="button" onClick={(event) => { event.stopPropagation(); onRetry(); }} className={`min-h-11 rounded-xl px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${mutedTextClassName}`}>{isLoading ? "Loading voice message…" : "Voice message unavailable · Retry"}</button></div>;
  }

  return (
    <div className="min-w-52 max-w-full" onClick={(event) => event.stopPropagation()}>
      <audio ref={audioRef} src={src} preload="metadata" onLoadStart={() => { setCurrentTimeMs(0); setResolvedDurationMs(durationMs); setIsPlaying(false); setHasError(false); }} onLoadedMetadata={(event) => { const duration = event.currentTarget.duration; if (Number.isFinite(duration) && duration > 0) setResolvedDurationMs(Math.round(duration * 1000)); }} onTimeUpdate={(event) => setCurrentTimeMs(event.currentTarget.currentTime * 1000)} onPlay={() => { setHasError(false); setIsPlaying(true); }} onPause={() => setIsPlaying(false)} onEnded={() => { setIsPlaying(false); setCurrentTimeMs(0); if (activeVoiceAudio === audioRef.current) activeVoiceAudio = null; }} onError={() => { setHasError(true); setIsPlaying(false); if (activeVoiceAudio === audioRef.current) activeVoiceAudio = null; }} />
      <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => void togglePlayback()} aria-label={`${isPlaying ? "Pause" : "Play"} ${label}`} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${isOutgoing ? "bg-white/15 text-white hover:bg-white/25" : "bg-accent text-primary hover:bg-card"}`}>{isPlaying ? <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></svg> : <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>}</button><div className="min-w-0 flex-1"><label className="sr-only" htmlFor={progressId}>Seek {label}</label><input id={progressId} type="range" min="0" max={durationSeconds} step="0.1" value={Math.min(durationSeconds, currentTimeMs / 1000)} onChange={(event) => seek(event.currentTarget.valueAsNumber)} aria-valuetext={`${formatVoiceDuration(currentTimeMs)} of ${formatVoiceDuration(resolvedDurationMs)}`} className="h-2 w-full cursor-pointer accent-current" /><div className={`mt-1 flex items-center justify-between gap-3 text-[11px] font-medium ${mutedTextClassName}`}><span>{formatVoiceDuration(currentTimeMs)}</span><span>{formatVoiceDuration(resolvedDurationMs)}</span></div></div><button type="button" onClick={cyclePlaybackSpeed} aria-label={`Playback speed ${playbackSpeed} times. Activate to change.`} className={`min-h-10 min-w-10 shrink-0 rounded-xl px-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${textClassName}`}>{playbackSpeed}x</button></div>
      {hasError && <div role="alert" className={`mt-2 flex items-center justify-between gap-3 text-xs ${mutedTextClassName}`}><span>Playback unavailable.</span><button type="button" onClick={() => { setHasError(false); onRetry(); }} className="min-h-9 rounded-xl px-2 font-semibold underline">Retry</button></div>}
    </div>
  );
}

export default VoiceMessagePlayer;
