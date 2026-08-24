import { useEffect, useState, type RefObject } from "react";
import AnchoredPopover from "./AnchoredPopover";
import { formatGalleryDate, signGalleryPaths } from "./gallery";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";
import type { GalleryNotification } from "./useGalleryNotifications";

type Props = {
  anchorRef: RefObject<HTMLElement | null>;
  notifications: GalleryNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string;
  onClose: () => void;
  onMarkAllRead: () => Promise<string | null>;
  onRemove: (id: string) => Promise<string | null>;
  onRequestClear: (trigger: HTMLButtonElement) => void;
  onOpen: (notification: GalleryNotification) => void;
};

function notificationCopy(notification: GalleryNotification) {
  const actor = notification.actorAvailable ? getProfileDisplayName(notification.actor) : "An unavailable account";
  return `${actor} ${notification.type === "heart" ? "liked" : "commented on"} your ${notification.mediaType === "image" ? "photo" : "video"}`;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6.5 7l.7 13h9.6l.7-13" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function GalleryNotificationsPopover({ anchorRef, notifications, unreadCount, isLoading, error, onClose, onMarkAllRead, onRemove, onRequestClear, onOpen }: Props) {
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());
  const [actionError, setActionError] = useState("");
  const [isMarking, setIsMarking] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void signGalleryPaths(notifications.map((item) => item.previewPath)).then((result) => {
      if (!cancelled) setThumbnailUrls(result.urls);
    });
    return () => { cancelled = true; };
  }, [notifications]);

  async function markAll() {
    if (isMarking || removingId) return;
    setIsMarking(true); setActionError("");
    const markError = await onMarkAllRead();
    setIsMarking(false);
    if (markError) setActionError(markError);
  }

  async function remove(notification: GalleryNotification) {
    if (removingId || isMarking) return;
    setRemovingId(notification.id); setActionError("");
    const removeError = await onRemove(notification.id);
    setRemovingId(null);
    if (removeError) setActionError(removeError);
  }

  return <AnchoredPopover anchorRef={anchorRef} ariaLabel="Gallery notifications" placement="bottom" onClose={onClose} layerClassName="z-[104]" panelClassName="w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-3xl border border-border bg-surface shadow-soft">
    <div className="border-b border-border px-4 py-3">
      <h2 className="font-bold text-heading">Gallery notifications</h2>
      <p className="mt-0.5 text-xs text-body">Hearts and comments on your public media</p>
      {notifications.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1">
        {unreadCount > 0 && <button type="button" onClick={() => void markAll()} disabled={isMarking || Boolean(removingId)} className="min-h-9 rounded-xl px-2 text-xs font-semibold text-primary hover:bg-accent disabled:opacity-60">{isMarking ? "Marking…" : "Mark all read"}</button>}
        <button type="button" onClick={(event) => onRequestClear(event.currentTarget)} disabled={isMarking || Boolean(removingId)} className="min-h-9 rounded-xl px-2 text-xs font-semibold text-body hover:bg-accent hover:text-heading disabled:opacity-60">Clear notifications</button>
      </div>}
    </div>
    <div className="max-h-[min(32rem,calc(100dvh-8rem))] overflow-y-auto overscroll-contain p-2">
      {isLoading ? <p role="status" className="px-3 py-8 text-center text-sm text-body">Loading Gallery activity…</p>
        : notifications.length === 0 ? <div className="px-4 py-9 text-center"><p className="font-semibold text-heading">No Gallery activity yet</p><p className="mt-1 text-sm text-body">New hearts and comments will appear here.</p></div>
          : <ul className="space-y-1">{notifications.map((notification, index) => {
            const name = notification.actorAvailable ? getProfileDisplayName(notification.actor) : "Unavailable account";
            const thumbnail = thumbnailUrls.get(notification.previewPath);
            const copy = notificationCopy(notification);
            return <li key={notification.id} className={`flex items-center gap-1 rounded-2xl pr-1 hover:bg-accent ${notification.readAt ? "" : "bg-accent/60"}`}>
              <button type="button" data-autofocus={index === 0 ? true : undefined} onClick={() => onOpen(notification)} aria-label={`${notification.readAt ? "Read" : "Unread"}: ${copy}`} className="flex min-h-[4.75rem] min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
                <ProfileAvatar profile={notification.actor} size="sm" accessibleLabel={`${name}'s profile photo`} />
                <span className="min-w-0 flex-1"><span className="block text-sm leading-5 text-heading"><strong>{name}</strong> {notification.type === "heart" ? "liked" : "commented on"} your {notification.mediaType === "image" ? "photo" : "video"}</span>{notification.type === "comment" && notification.commentBody && <span className="mt-0.5 block truncate text-xs text-body">“{notification.commentBody.slice(0, 120)}”</span>}<time dateTime={notification.createdAt} className="mt-0.5 block text-[11px] text-muted">{formatGalleryDate(notification.createdAt, true)}</time></span>
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-accent">{thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs font-bold text-primary">{notification.mediaType === "image" ? "Photo" : "Video"}</span>}{!notification.readAt && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-surface" aria-hidden="true" />}</span>
              </button>
              <button type="button" onClick={() => void remove(notification)} disabled={Boolean(removingId) || isMarking} aria-label={`Remove notification: ${copy}`} title="Remove notification" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><TrashIcon /></button>
            </li>;
          })}</ul>}
      {(error || actionError) && <p role="alert" className="m-2 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{actionError || error}</p>}
    </div>
  </AnchoredPopover>;
}

export default GalleryNotificationsPopover;
