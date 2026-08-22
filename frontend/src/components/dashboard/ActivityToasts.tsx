import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ActivityToastItem } from "./useActivityToasts";
import ProfileAvatar from "./ProfileAvatar";
import { getConversationDisplayName } from "./profileUtils";

type ActivityToastViewportProps = {
  toasts: ActivityToastItem[];
  offsetForPulse: boolean;
  embedded?: boolean;
  onActivate: (toast: ActivityToastItem) => void;
  onDismiss: (toastId: string) => void;
  onPause: (toastId: string) => void;
  onResume: (toastId: string) => void;
};


function getToastCopy(toast: ActivityToastItem) {
  const name = getConversationDisplayName(toast.profile, "otherNickname" in toast ? toast.otherNickname : null);
  if (toast.kind === "message_received") return { name, message: toast.count > 1 ? `${toast.count} new messages` : `${name} sent you a message`, detail: toast.preview, action: `Open conversation with ${name}` };
  if (toast.kind === "connection_request_received") return { name, message: `${name} wants to connect with you`, detail: "View request", action: `View connection request from ${name}` };
  if (toast.kind === "connection_request_accepted") return { name, message: `${name} accepted your request`, detail: "You're now connected", action: `Open conversation with ${name}` };
  return { name, message: `${name} reacted ${toast.emoji} to your message`, detail: "View message", action: `Open ${name}'s reaction to your message` };
}

function ActivityToastViewport({ toasts, offsetForPulse, embedded = false, onActivate, onDismiss, onPause, onResume }: ActivityToastViewportProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <section aria-label="Recent activity" aria-live="polite" aria-relevant="additions text" className={embedded ? "pointer-events-none w-full" : `pointer-events-none absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(4.75rem,calc(env(safe-area-inset-top)+4rem))] w-[min(calc(100vw-1.5rem),22rem)] md:right-[max(1rem,env(safe-area-inset-right))] ${offsetForPulse ? "xl:right-32" : ""}`}>
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const copy = getToastCopy(toast);
          return (
            <motion.article
              key={toast.id}
              layout={!shouldReduceMotion}
              initial={shouldReduceMotion ? false : { opacity: 0, x: 12, y: -4 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 10, scale: 0.98 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
              onPointerEnter={() => onPause(toast.id)}
              onPointerLeave={() => onResume(toast.id)}
              onFocusCapture={() => onPause(toast.id)}
              onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onResume(toast.id); }}
              className="pointer-events-auto relative mb-2 overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-soft backdrop-blur-md"
            >
              <button type="button" onClick={() => onActivate(toast)} aria-label={copy.action} className="flex min-h-[5.25rem] w-full items-center gap-3 px-3 py-3 pr-11 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-accent-hover">
                <ProfileAvatar profile={toast.profile} size="sm" accessibleLabel={`${copy.name}'s profile photo`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-heading">{copy.name}</span>
                  <span className="mt-0.5 block text-sm font-medium leading-5 text-body">{copy.message}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{copy.detail}</span>
                </span>
              </button>
              <button type="button" onClick={() => onDismiss(toast.id)} aria-label={`Dismiss activity from ${copy.name}`} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-hover"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m5.5 5.5 9 9m0-9-9 9" strokeLinecap="round" /></svg></button>
            </motion.article>
          );
        })}
      </AnimatePresence>
    </section>
  );
}

export default ActivityToastViewport;
