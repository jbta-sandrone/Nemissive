import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import type { MessageReaction, ProfileSearchResult } from "../../types/conversations";
import AnchoredPopover from "./AnchoredPopover";
import ProfileAvatar from "./ProfileAvatar";
import { getEmojiLabel } from "./emojiData";
import { getProfileDisplayName } from "./profileUtils";

type ReactionDetailsProps = {
  anchorRef: RefObject<HTMLElement | null>;
  currentUserId: string | null;
  error: string;
  isLoading: boolean;
  isMutationPending: boolean;
  messageLabel: string;
  mutationError: string;
  pendingReactionKeys: ReadonlySet<string>;
  profilesById: ReadonlyMap<string, ProfileSearchResult>;
  reactions: MessageReaction[];
  onClose: () => void;
  onRemoveOwnReaction: (reaction: MessageReaction) => void;
  onRetry: () => void;
};

type ReactionDetailsContentProps = Omit<ReactionDetailsProps, "anchorRef" | "messageLabel" | "onClose"> & {
  isTouchOriented: boolean;
};

function sortReactions(reactions: MessageReaction[]) {
  return [...reactions].sort((first, second) => {
    const firstTime = Date.parse(first.createdAt);
    const secondTime = Date.parse(second.createdAt);
    if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime) && firstTime !== secondTime) return firstTime - secondTime;
    return first.id.localeCompare(second.id);
  });
}

function getReactionMutationKey(reaction: Pick<MessageReaction, "messageId" | "userId" | "emoji">) {
  return `${reaction.messageId}\u0000${reaction.userId}\u0000${reaction.emoji}`;
}

function ReactionDetailsContent({ currentUserId, error, isLoading, isMutationPending, isTouchOriented, mutationError, pendingReactionKeys, profilesById, reactions, onRemoveOwnReaction, onRetry }: ReactionDetailsContentProps) {
  const sortedReactions = useMemo(() => sortReactions(reactions), [reactions]);
  const emojiCounts = useMemo(() => {
    const counts = new Map<string, number>();
    sortedReactions.forEach((reaction) => counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1));
    return [...counts.entries()];
  }, [sortedReactions]);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

  const activeSelectedEmoji = selectedEmoji && emojiCounts.some(([emoji]) => emoji === selectedEmoji) ? selectedEmoji : null;
  const visibleReactions = activeSelectedEmoji ? sortedReactions.filter((reaction) => reaction.emoji === activeSelectedEmoji) : sortedReactions;

  return (
    <>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter reactions">
        <button data-autofocus type="button" onClick={() => setSelectedEmoji(null)} aria-pressed={activeSelectedEmoji === null} className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${activeSelectedEmoji === null ? "bg-primary text-white" : "bg-accent text-heading hover:bg-card"}`}>All <span aria-hidden="true">{sortedReactions.length}</span><span className="sr-only">{sortedReactions.length} total reactions</span></button>
        {emojiCounts.map(([emoji, count]) => <button key={emoji} type="button" onClick={() => setSelectedEmoji(emoji)} aria-pressed={activeSelectedEmoji === emoji} aria-label={`Show ${count} ${getEmojiLabel(emoji).toLowerCase()} ${count === 1 ? "reaction" : "reactions"}`} className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${activeSelectedEmoji === emoji ? "bg-primary text-white" : "bg-accent text-heading hover:bg-card"}`}><span aria-hidden="true" className="text-sm">{emoji}</span><span aria-hidden="true">{count}</span></button>)}
      </div>

      <div className="mt-3 max-h-[min(20rem,50dvh)] space-y-1 overflow-y-auto overscroll-contain pr-1" aria-live="polite">
        {visibleReactions.map((reaction) => {
          const profile = profilesById.get(reaction.userId) ?? { id: reaction.userId, username: null, display_name: null, avatar_url: null };
          const displayName = getProfileDisplayName(profile);
          const isCurrentUser = reaction.userId === currentUserId;
          const isPending = pendingReactionKeys.has(getReactionMutationKey(reaction));
          const rowContent = <><ProfileAvatar profile={profile} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-heading">{displayName}{isCurrentUser && <span className="font-medium text-muted"> · You</span>}</p>{isCurrentUser && <p className="mt-0.5 text-xs text-muted">{isTouchOriented ? "Tap to remove" : "Click to remove"}</p>}</div><span aria-label={`${getEmojiLabel(reaction.emoji)} reaction`} className="shrink-0 text-xl">{reaction.emoji}</span></>;
          if (isCurrentUser) return <button key={reaction.id} type="button" onClick={() => onRemoveOwnReaction(reaction)} disabled={isPending} aria-label={`Remove your ${getEmojiLabel(reaction.emoji).toLowerCase()} reaction`} aria-busy={isPending} className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-accent active:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60">{rowContent}</button>;
          return <div key={reaction.id} className="flex min-h-14 min-w-0 items-center gap-3 rounded-2xl px-2 py-2">{rowContent}</div>;
        })}
        {isMutationPending && visibleReactions.length > 0 && <p role="status" aria-live="polite" className="sr-only">Removing your reaction.</p>}
        {isMutationPending && visibleReactions.length === 0 && <div role="status" aria-live="polite" className="rounded-2xl bg-accent px-3 py-4 text-center text-sm text-body">Removing your reaction…</div>}
        {isLoading && <div role="status" className="space-y-2 px-2 py-1"><p className="sr-only">Loading reaction profiles.</p><div className="h-12 animate-pulse rounded-2xl bg-accent" /><div className="h-12 animate-pulse rounded-2xl bg-accent" /></div>}
        {mutationError && <p role="alert" className="rounded-2xl border border-primary/20 bg-accent px-3 py-3 text-sm leading-5 text-body">{mutationError}</p>}
        {error && <div role="alert" className="rounded-2xl border border-primary/20 bg-accent px-3 py-3 text-sm leading-5 text-body"><p>{error}</p><button type="button" onClick={onRetry} className="mt-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Retry</button></div>}
      </div>
    </>
  );
}

function MobileReactionDetails({ currentUserId, error, isLoading, isMutationPending, isTouchOriented, messageLabel, mutationError, pendingReactionKeys, profilesById, reactions, onClose, onRemoveOwnReaction, onRetry }: Omit<ReactionDetailsProps, "anchorRef"> & { isTouchOriented: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusableElements = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) return;
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    const focusFrame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1, transition: { duration: shouldReduceMotion ? 0 : 0.22 } }} exit={{ opacity: 0, transition: { duration: shouldReduceMotion ? 0.06 : 0.18 } }} className="fixed inset-0 z-[85] flex items-end bg-heading/20 md:hidden" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <motion.div ref={panelRef} initial={shouldReduceMotion ? false : { y: "100%", opacity: 0.98 }} animate={{ y: 0, opacity: 1, transition: { duration: shouldReduceMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] } }} exit={shouldReduceMotion ? { opacity: 1 } : { y: "100%", opacity: 0.98, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }} role="dialog" aria-modal="true" aria-labelledby="reaction-details-mobile-title" aria-label={`Reactions for ${messageLabel}`} className="max-h-[min(82dvh,38rem)] w-full overflow-hidden rounded-t-3xl border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-soft">
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between gap-3"><h2 id="reaction-details-mobile-title" className="text-lg font-semibold text-heading">Reactions</h2><button type="button" onClick={onClose} aria-label="Close reaction details" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div>
        <div className="mt-4 min-h-0 overflow-hidden"><ReactionDetailsContent currentUserId={currentUserId} error={error} isLoading={isLoading} isMutationPending={isMutationPending} isTouchOriented={isTouchOriented} mutationError={mutationError} pendingReactionKeys={pendingReactionKeys} profilesById={profilesById} reactions={reactions} onRemoveOwnReaction={onRemoveOwnReaction} onRetry={onRetry} /></div>
        <button type="button" onClick={onClose} className="mt-4 min-h-11 w-full rounded-2xl bg-accent px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Close</button>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function ReactionDetails(props: ReactionDetailsProps) {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [isTouchOriented, setIsTouchOriented] = useState(() => window.matchMedia("(pointer: coarse)").matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const handleChange = () => setIsDesktop(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const handleChange = () => setIsTouchOriented(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  if (!isDesktop) return <MobileReactionDetails currentUserId={props.currentUserId} error={props.error} isLoading={props.isLoading} isMutationPending={props.isMutationPending} isTouchOriented={isTouchOriented} messageLabel={props.messageLabel} mutationError={props.mutationError} pendingReactionKeys={props.pendingReactionKeys} profilesById={props.profilesById} reactions={props.reactions} onClose={props.onClose} onRemoveOwnReaction={props.onRemoveOwnReaction} onRetry={props.onRetry} />;

  return (
    <AnchoredPopover anchorRef={props.anchorRef} ariaLabel={`Reactions for ${props.messageLabel}`} onClose={props.onClose} placement="top" panelClassName="w-80 max-w-[calc(100vw-1rem)] rounded-3xl border border-border bg-surface p-4 shadow-soft">
      <h2 className="mb-4 text-base font-semibold text-heading">Reactions</h2>
      <ReactionDetailsContent currentUserId={props.currentUserId} error={props.error} isLoading={props.isLoading} isMutationPending={props.isMutationPending} isTouchOriented={isTouchOriented} mutationError={props.mutationError} pendingReactionKeys={props.pendingReactionKeys} profilesById={props.profilesById} reactions={props.reactions} onRemoveOwnReaction={props.onRemoveOwnReaction} onRetry={props.onRetry} />
    </AnchoredPopover>
  );
}

export default ReactionDetails;
