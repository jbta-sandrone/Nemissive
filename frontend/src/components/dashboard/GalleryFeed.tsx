import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";
import ConfirmationDialog from "./ConfirmationDialog";
import GalleryHeartUsersView from "./GalleryHeartUsersView";
import ProfileAvatar from "./ProfileAvatar";
import { formatGalleryDate, galleryCommentPageSize, galleryDescriptionMaxLength, normalizeGalleryError, parseGalleryComment, parseGalleryItem, signGalleryPaths, type GalleryComment, type GalleryItem } from "./gallery";
import { getProfileDisplayName } from "./profileUtils";

export type GalleryFeedPanel = "activity" | "reactions";

type Props = {
  itemId: string;
  profile: ProfileSearchResult;
  previewUrl?: string;
  initialCommentId?: string | null;
  previousItemId: string | null;
  nextItemId: string | null;
  rightPanel: GalleryFeedPanel;
  navigationBlocked?: boolean;
  onRightPanelChange: (panel: GalleryFeedPanel) => void;
  onSelectItem: (itemId: string) => void;
  onItemUnavailable: (itemId: string) => void;
  onBack: () => void;
};

function Icon({ kind }: { kind: "back" | "previous" | "next" | "heart" | "comment" | "edit" | "trash" }) {
  const path = { back: "m15 6-6 6 6 6M9 12h10", previous: "m15 6-6 6 6 6", next: "m9 6 6 6-6 6", heart: "M20.5 8.8c0 5.1-8.5 10.2-8.5 10.2S3.5 13.9 3.5 8.8A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8.5 1.2Z", comment: "M5 5h14v11H9l-4 3V5Z", edit: "m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z", trash: "M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6.5 7l.7 13h9.6l.7-13" }[kind];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d={path} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function GalleryFeed({ itemId, profile, previewUrl, initialCommentId, previousItemId, nextItemId, rightPanel, navigationBlocked = false, onRightPanelChange, onSelectItem, onItemUnavailable, onBack }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const [mediaUrlCache] = useState(() => new Map<string, string>());
  const reduced = useReducedMotion();

  useEffect(() => { const frame = window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true })); return () => window.cancelAnimationFrame(frame); }, []);

  function selectNeighbor(targetId: string | null, control: "previous" | "next") {
    if (!targetId) return;
    onRightPanelChange("activity");
    onSelectItem(targetId);
    window.requestAnimationFrame(() => (control === "previous" ? previousButtonRef.current : nextButtonRef.current)?.focus({ preventScroll: true }));
  }

  return <motion.section initial={reduced ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : 0.16 }} aria-labelledby="gallery-feed-title" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2 sm:px-5"><div className="flex min-w-0 items-center gap-2"><button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><Icon kind="back" />Gallery</button><h2 ref={headingRef} tabIndex={-1} id="gallery-feed-title" className="truncate font-semibold text-heading outline-none">Gallery Feed</h2></div><div className="flex shrink-0 gap-1"><button ref={previousButtonRef} type="button" disabled={!previousItemId} onClick={() => selectNeighbor(previousItemId, "previous")} aria-label="Previous media" className="flex h-10 w-10 items-center justify-center rounded-xl text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-35"><Icon kind="previous" /></button><button ref={nextButtonRef} type="button" disabled={!nextItemId} onClick={() => selectNeighbor(nextItemId, "next")} aria-label="Next media" className="flex h-10 w-10 items-center justify-center rounded-xl text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-35"><Icon kind="next" /></button></div></header>
    <GalleryFeedItem key={itemId} itemId={itemId} profile={profile} previewUrl={previewUrl} initialCommentId={initialCommentId} rightPanel={rightPanel} navigationBlocked={navigationBlocked} mediaUrlCache={mediaUrlCache} onRightPanelChange={onRightPanelChange} onItemUnavailable={onItemUnavailable} onBack={onBack} />
  </motion.section>;
}

type ItemProps = Pick<Props, "itemId" | "profile" | "previewUrl" | "initialCommentId" | "rightPanel" | "navigationBlocked" | "onRightPanelChange" | "onItemUnavailable" | "onBack"> & { mediaUrlCache: Map<string, string> };

function GalleryFeedItem({ itemId, profile, previewUrl, initialCommentId, rightPanel, navigationBlocked = false, mediaUrlCache, onRightPanelChange, onItemUnavailable, onBack }: ItemProps) {
  const likesTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const confirmationOpenRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const unavailableReportedRef = useRef(false);
  const onItemUnavailableRef = useRef(onItemUnavailable);
  const initialCommentFocusedRef = useRef(false);
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const [originalUrl, setOriginalUrl] = useState("");
  const [comments, setComments] = useState<GalleryComment[]>([]);
  const [commentsHaveMore, setCommentsHaveMore] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [commentText, setCommentText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deleteComment, setDeleteComment] = useState<GalleryComment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reactionRefreshKey, setReactionRefreshKey] = useState(0);
  const displayName = getProfileDisplayName(profile);

  useEffect(() => { onItemUnavailableRef.current = onItemUnavailable; }, [onItemUnavailable]);
  useEffect(() => { confirmationOpenRef.current = deleteComment !== null; }, [deleteComment]);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? "")); }, []);

  const loadSelected = useCallback(async () => {
    const requestId = ++requestRef.current;
    const [itemResult, commentResult] = await Promise.all([
      supabase.rpc("get_gallery_item", { target_item_id: itemId }),
      supabase.rpc("list_gallery_comments", { target_item_id: itemId, page_size: galleryCommentPageSize + 1, page_offset: 0 }),
    ]);
    if (requestId !== requestRef.current) return;
    if (itemResult.error) {
      setError(normalizeGalleryError(itemResult.error, "This Gallery item couldn't be loaded.")); setSelected(null); setLoading(false);
      if (!unavailableReportedRef.current) { unavailableReportedRef.current = true; onItemUnavailableRef.current(itemId); }
      return;
    }
    const item = parseGalleryItem(Array.isArray(itemResult.data) ? itemResult.data[0] : itemResult.data);
    if (!item) {
      setError("This Gallery item is no longer available."); setSelected(null); setLoading(false);
      if (!unavailableReportedRef.current) { unavailableReportedRef.current = true; onItemUnavailableRef.current(itemId); }
      return;
    }
    setSelected(item);
    const parsedComments = (Array.isArray(commentResult.data) ? commentResult.data : []).map(parseGalleryComment).filter((comment): comment is GalleryComment => Boolean(comment));
    setComments(parsedComments.slice(0, galleryCommentPageSize)); setCommentsHaveMore(parsedComments.length > galleryCommentPageSize);
    if (commentResult.error) setError(normalizeGalleryError(commentResult.error, "Comments couldn't be loaded.")); else setError("");
    const cachedUrl = mediaUrlCache.get(item.originalPath);
    if (cachedUrl) setOriginalUrl(cachedUrl);
    else {
      const signed = await signGalleryPaths([item.originalPath]);
      if (requestId !== requestRef.current) return;
      const url = signed.urls.get(item.originalPath) ?? "";
      if (url) mediaUrlCache.set(item.originalPath, url);
      setOriginalUrl(url);
      if (signed.error) setError(signed.error);
    }
    setReactionRefreshKey((value) => value + 1); setLoading(false);
  }, [itemId, mediaUrlCache]);

  useEffect(() => { const timer = window.setTimeout(() => void loadSelected(), 0); return () => { window.clearTimeout(timer); requestRef.current += 1; }; }, [loadSelected]);
  useEffect(() => {
    const schedule = () => { if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current); refreshTimerRef.current = window.setTimeout(() => { refreshTimerRef.current = null; void loadSelected(); }, 140); };
    const channel = supabase.channel(`nemissive-gallery-item:${itemId}`).on("postgres_changes", { event: "*", schema: "public", table: "gallery_items", filter: `id=eq.${itemId}` }, schedule).on("postgres_changes", { event: "*", schema: "public", table: "gallery_hearts", filter: `item_id=eq.${itemId}` }, schedule).on("postgres_changes", { event: "*", schema: "public", table: "gallery_comments", filter: `item_id=eq.${itemId}` }, schedule).subscribe();
    const privacyRecheck = window.setInterval(schedule, 30_000);
    const visible = () => { if (document.visibilityState === "visible") schedule(); };
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current); window.clearInterval(privacyRecheck); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); void supabase.removeChannel(channel); };
  }, [itemId, loadSelected]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || confirmationOpenRef.current || navigationBlocked) return;
      event.preventDefault();
      if (rightPanel === "reactions") { onRightPanelChange("activity"); window.requestAnimationFrame(() => likesTriggerRef.current?.focus()); }
      else onBack();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [navigationBlocked, onBack, onRightPanelChange, rightPanel]);

  useEffect(() => {
    if (!initialCommentId || initialCommentFocusedRef.current || comments.length === 0) return;
    const target = document.querySelector<HTMLElement>(`[data-gallery-comment-id="${CSS.escape(initialCommentId)}"]`);
    if (!target) return;
    initialCommentFocusedRef.current = true; target.focus({ preventScroll: true }); target.scrollIntoView({ block: "center" });
  }, [comments, initialCommentId]);

  async function act(rpc: string, args: Record<string, unknown>, fallback: string, after?: () => void) {
    if (busy) return;
    setBusy(true); setError("");
    const { error: actionError } = await supabase.rpc(rpc, args);
    setBusy(false);
    if (actionError) { setError(normalizeGalleryError(actionError, fallback)); return; }
    after?.(); await loadSelected();
  }
  async function loadMoreComments() {
    if (!selected || busy) return;
    setBusy(true);
    const { data, error: loadError } = await supabase.rpc("list_gallery_comments", { target_item_id: selected.id, page_size: galleryCommentPageSize + 1, page_offset: comments.length });
    setBusy(false);
    if (loadError) { setError(normalizeGalleryError(loadError, "More comments couldn't be loaded.")); return; }
    const parsed = (Array.isArray(data) ? data : []).map(parseGalleryComment).filter((comment): comment is GalleryComment => Boolean(comment));
    setComments((current) => [...current, ...parsed.slice(0, galleryCommentPageSize).filter((comment) => !current.some((existing) => existing.id === comment.id))]); setCommentsHaveMore(parsed.length > galleryCommentPageSize);
  }

  return <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
    <section aria-label="Gallery Feed media" className="flex min-h-[17rem] min-w-0 flex-1 items-center justify-center bg-background p-3 sm:p-6 md:min-h-0 md:overflow-auto">{selected && originalUrl ? selected.mediaType === "image" ? <img src={originalUrl} alt={selected.description || `Photo by ${displayName}`} className="max-h-full max-w-full rounded-2xl object-contain shadow-soft" /> : <video src={originalUrl} poster={previewUrl} controls preload="metadata" className="max-h-full max-w-full rounded-2xl bg-heading" aria-label={selected.description || `Video by ${displayName}`} /> : error && !selected ? <div role="alert" className="max-w-sm rounded-2xl border border-primary/25 bg-surface p-5 text-center text-sm text-body">{error}</div> : <p role="status" className="text-sm text-body">{loading ? "Loading media..." : "Media unavailable"}</p>}</section>
    <aside aria-label={rightPanel === "reactions" ? "Liked by" : "Feed details"} className="flex min-h-[18rem] w-full shrink-0 flex-col overflow-hidden border-t border-border bg-surface md:min-h-0 md:w-[25rem] md:border-l md:border-t-0">
      {rightPanel === "reactions" ? <GalleryHeartUsersView itemId={itemId} refreshKey={reactionRefreshKey} onBack={() => { onRightPanelChange("activity"); window.requestAnimationFrame(() => likesTriggerRef.current?.focus()); }} /> : <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 md:px-5">{selected && <><div className="flex items-center gap-3"><ProfileAvatar profile={profile} size="sm" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-heading">{displayName}</p>{profile.username && <p className="truncate text-xs text-body">@{profile.username}</p>}<time dateTime={selected.addedAt} className="text-xs text-muted">Added {formatGalleryDate(selected.addedAt, true)}</time></div></div>{selected.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-body">{selected.description}</p>}<div className="mt-4 flex items-center gap-2 border-y border-border py-3"><button type="button" disabled={busy} aria-pressed={selected.viewerHasHearted} onClick={() => void act("toggle_gallery_heart", { target_item_id: selected.id }, "Your heart couldn't be updated.")} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${selected.viewerHasHearted ? "bg-accent text-primary" : "text-heading hover:bg-accent"}`}><Icon kind="heart" />{selected.viewerHasHearted ? "Hearted" : "Heart"}</button><button ref={likesTriggerRef} type="button" onClick={() => onRightPanelChange("reactions")} aria-label={selected.heartCount === 1 ? "View 1 person who liked this" : `View ${selected.heartCount} people who liked this`} className="min-h-10 rounded-xl px-2 text-sm font-semibold text-body hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">{selected.heartCount} {selected.heartCount === 1 ? "like" : "likes"}</button><span className="ml-2 inline-flex items-center gap-1 text-sm text-body"><Icon kind="comment" />{selected.commentCount}</span></div>
        <form onSubmit={(event) => { event.preventDefault(); if (commentText.trim()) void act("add_gallery_comment", { target_item_id: selected.id, candidate_body: commentText }, "Your comment couldn't be added.", () => setCommentText("")); }} className="mt-4"><label htmlFor={`gallery-comment-${itemId}`} className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Add a comment</label><textarea id={`gallery-comment-${itemId}`} value={commentText} maxLength={galleryDescriptionMaxLength} onChange={(event) => setCommentText(event.target.value)} rows={2} placeholder="Write a comment" className="mt-2 w-full resize-y rounded-2xl border border-border bg-background px-3 py-2 text-sm text-heading outline-none focus:border-primary" /><div className="mt-2 flex justify-end"><button type="submit" disabled={busy || !commentText.trim()} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">Post</button></div></form>
        <section aria-labelledby={`gallery-comments-heading-${itemId}`} className="mt-5"><h3 id={`gallery-comments-heading-${itemId}`} className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Comments</h3>{comments.length === 0 ? <p className="mt-3 text-sm text-body">No comments yet.</p> : <ul className="mt-3 space-y-4">{comments.map((comment) => <li key={comment.id} data-gallery-comment-id={comment.id} tabIndex={-1} className="flex gap-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><ProfileAvatar profile={comment.author} size="sm" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="truncate text-sm font-semibold text-heading">{getProfileDisplayName(comment.author)}</p><time dateTime={comment.createdAt} className="text-[11px] text-muted">{formatGalleryDate(comment.createdAt)}</time></div>{editingId === comment.id ? <div className="mt-2"><textarea aria-label="Edit comment" value={editingText} maxLength={galleryDescriptionMaxLength} onChange={(event) => setEditingText(event.target.value)} rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-heading" /><div className="mt-2 flex gap-2"><button type="button" disabled={busy || !editingText.trim()} onClick={() => void act("update_gallery_comment", { target_comment_id: editingId, candidate_body: editingText }, "Your comment couldn't be updated.", () => setEditingId(null))} className="min-h-9 rounded-xl bg-primary px-3 text-xs font-semibold text-white">Save</button><button type="button" disabled={busy} onClick={() => setEditingId(null)} className="min-h-9 rounded-xl px-3 text-xs font-semibold text-body hover:bg-accent">Cancel</button></div></div> : <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-body">{comment.body}</p>}<div className="mt-1 flex gap-2">{comment.authorId === currentUserId && editingId !== comment.id && <button type="button" onClick={() => { setEditingId(comment.id); setEditingText(comment.body); }} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-muted hover:text-heading"><Icon kind="edit" />Edit</button>}{(comment.authorId === currentUserId || selected.ownerId === currentUserId) && <button type="button" onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setDeleteComment(comment); }} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-primary"><Icon kind="trash" />Delete</button>}</div></div></li>)}</ul>}{commentsHaveMore && <button type="button" disabled={busy} onClick={() => void loadMoreComments()} className="mt-4 min-h-10 w-full rounded-xl border border-border text-sm font-semibold text-heading hover:bg-accent">Load more comments</button>}</section></>}{error && selected && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm text-heading">{error}</p>}</div>}
    </aside>
    {deleteComment && <ConfirmationDialog dialogId="delete-gallery-comment" title="Delete this comment?" description="This comment will be permanently removed. This can't be undone." confirmLabel="Delete comment" pendingLabel="Deleting..." pendingAnnouncement="Deleting Gallery comment." icon={<Icon kind="trash" />} error={error} isPending={busy} returnFocusRef={deleteTriggerRef} onCancel={() => setDeleteComment(null)} onConfirm={() => void act("delete_gallery_comment", { target_comment_id: deleteComment.id }, "The comment couldn't be deleted.", () => setDeleteComment(null))} />}
  </div>;
}

export default GalleryFeed;
