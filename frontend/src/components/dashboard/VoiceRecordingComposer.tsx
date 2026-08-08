import { useEffect, useRef } from "react";
import type { VoiceRecorderController } from "./useVoiceRecorder";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import { formatVoiceDuration } from "./voiceUtils";

type VoiceRecordingComposerProps = {
  controller: VoiceRecorderController;
  isSending: boolean;
  shouldReduceMotion: boolean;
  onSend: () => void;
};

function VoiceRecordingComposer({ controller, isSending, shouldReduceMotion, onSend }: VoiceRecordingComposerProps) {
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => primaryActionRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [controller.mode]);

  const isPaused = controller.mode === "paused";
  if (controller.mode === "review" && controller.recording) {
    const recording = controller.recording;
    return (
      <div className="chat-composer-surface rounded-2xl bg-surface p-3 shadow-soft sm:p-4" aria-label="Review voice message">
        <VoiceMessagePlayer src={recording.objectUrl} durationMs={recording.durationMs} isLoading={false} isOutgoing={false} label="voice recording preview" onRetry={() => undefined} />
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => void controller.rerecord()} disabled={isSending} className="chat-accent-control inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60">Re-record</button><button type="button" onClick={controller.clearReview} disabled={isSending} className="chat-accent-control inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60">Remove</button><button ref={primaryActionRef} type="button" onClick={onSend} disabled={isSending} className="chat-primary-action inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60">{isSending ? "Sending…" : "Send voice message"}</button></div>
        {controller.notice && <p role="status" className="mt-2 text-xs leading-5 text-muted">{controller.notice}</p>}
        {controller.error && <p role="alert" className="mt-2 text-xs leading-5 text-body">{controller.error}</p>}
      </div>
    );
  }

  return (
    <div className="chat-composer-surface rounded-2xl bg-surface p-3 shadow-soft sm:p-4" aria-label="Voice recording controls">
      <div className="flex min-w-0 items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full bg-primary" aria-hidden="true" /><div className="min-w-0 flex-1"><p role="status" className="text-sm font-semibold text-heading">{isPaused ? "Recording paused" : "Recording voice message"}</p><p className="mt-0.5 text-xs text-muted">{formatVoiceDuration(controller.elapsedMs)} of 5:00</p></div><div className="flex h-9 shrink-0 items-end gap-1" aria-label={shouldReduceMotion ? "Microphone active" : "Live microphone level"}>{[0.35, 0.55, 0.8, 0.6, 0.4].map((weight, index) => <span key={weight} className="h-7 w-1.5 origin-bottom rounded-full bg-primary/60" style={{ transform: `scaleY(${shouldReduceMotion || isPaused ? 0.25 + weight * 0.15 : Math.max(0.18, Math.min(1, controller.audioLevel * (1.15 + index * 0.13) + weight * 0.18))})`, transition: shouldReduceMotion ? "none" : "transform 90ms linear" }} />)}</div></div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={isPaused ? controller.resumeRecording : controller.pauseRecording} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">{isPaused ? "Resume" : "Pause"}</button><button type="button" onClick={controller.cancelRecording} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Cancel</button><button ref={primaryActionRef} type="button" onClick={controller.stopRecording} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Stop and review</button></div>
      {controller.notice && <p role="status" className="mt-2 text-xs leading-5 text-muted">{controller.notice}</p>}
      {controller.error && <p role="alert" className="mt-2 text-xs leading-5 text-body">{controller.error}</p>}
    </div>
  );
}

export default VoiceRecordingComposer;
