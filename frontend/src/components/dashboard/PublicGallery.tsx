import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";
import ConfirmationDialog from "./ConfirmationDialog";
import ProfileAvatar from "./ProfileAvatar";
import {
  formatGalleryDate,
  galleryDateGroup,
  galleryCommentPageSize,
  galleryDescriptionMaxLength,
  galleryPageSize,
  normalizeGalleryError,
  parseGalleryComment,
  parseGalleryItem,
  signGalleryPaths,
  type GalleryComment,
  type GalleryItem,
} from "./gallery";
import { getProfileDisplayName } from "./profileUtils";

type SectionProps = { profile: ProfileSearchResult; onOverlayOpenChange: (open: boolean) => void };
type DialogProps = { profile: ProfileSearchResult; initialItemId: string | null; returnFocusRef: RefObject<HTMLElement | null>; onClose: () => void };

function Icon({ kind }: { kind: "close" | "back" | "heart" | "comment" | "play" | "edit" | "trash" | "gallery" }) {
  if (kind === "heart") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M20.5 8.8c0 5.1-8.5 10.2-8.5 10.2S3.5 13.9 3.5 8.8A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8.5 1.2Z" strokeLinejoin="round" /></svg>;
  if (kind === "gallery") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.2-4.2 3.1 3 2.2-2.1 3.5 3.3" /></svg>;
  const path = { close: "m7 7 10 10M17 7 7 17", back: "m15 6-6 6 6 6M9 12h10", comment: "M5 5h14v11H9l-4 3V5Z", play: "m9 7 8 5-8 5V7Z", edit: "m4 20 4.5-1 10-10-3.5-3.5-10 10L4 20Z", trash: "M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6.5 7l.7 13h9.6l.7-13" }[kind];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d={path} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PublicGallerySection({ profile, onOverlayOpenChange }: SectionProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogItemId, setDialogItemId] = useState<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    setIsLoading(true); setError("");
    const { data, error: loadError } = await supabase.rpc("list_public_gallery", { target_owner_id: profile.id, page_size: 9, page_offset: 0 });
    if (loadError) { setIsLoading(false); setError(normalizeGalleryError(loadError, "This Gallery couldn't be loaded.")); return; }
    const parsed = (Array.isArray(data) ? data : []).map(parseGalleryItem).filter((item): item is GalleryItem => Boolean(item)).slice(0, 8);
    setItems(parsed); setIsLoading(false);
    const signed = await signGalleryPaths(parsed.map((item) => item.previewPath));
    setUrls(signed.urls); if (signed.error) setError(signed.error);
  }, [profile.id]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { onOverlayOpenChange(dialogItemId !== undefined); return () => onOverlayOpenChange(false); }, [dialogItemId, onOverlayOpenChange]);

  const close = useCallback(() => { setDialogItemId(undefined); void load(); }, [load]);
  function open(itemId: string | null, trigger: HTMLElement) { triggerRef.current = trigger; setDialogItemId(itemId); }

  return <>
    <section aria-labelledby="profile-gallery-heading" className="mt-7 border-t border-border pt-5"><div className="flex items-center justify-between gap-3"><h3 id="profile-gallery-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Gallery</h3>{items.length > 0 && <button type="button" onClick={(event) => open(null, event.currentTarget)} className="min-h-9 rounded-xl px-2 text-xs font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">View all</button>}</div>
      {isLoading ? <p role="status" className="mt-3 rounded-2xl bg-background p-4 text-center text-sm text-body">Loading public media…</p> : error ? <div role="alert" className="mt-3 rounded-2xl border border-border bg-background p-4 text-sm text-body"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 font-semibold text-primary">Try again</button></div> : items.length === 0 ? <div className="mt-3 rounded-2xl bg-background p-4 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary"><Icon kind="gallery" /></span><p className="mt-3 text-sm text-body">No public media yet.</p></div> : <ul className="mt-3 grid grid-cols-3 gap-2">{items.slice(0, 6).map((item) => <li key={item.id}><button type="button" onClick={(event) => open(item.id, event.currentTarget)} aria-label={`Open ${item.mediaType} added ${formatGalleryDate(item.addedAt)}`} className="relative block aspect-square w-full overflow-hidden rounded-xl bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">{urls.get(item.previewPath) ? <img src={urls.get(item.previewPath)} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-primary"><Icon kind="gallery" /></span>}{item.mediaType === "video" && <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-heading/70"><Icon kind="play" /></span></span>}</button></li>)}</ul>}
    </section>
    <AnimatePresence>{dialogItemId !== undefined && <PublicGalleryDialog profile={profile} initialItemId={dialogItemId} returnFocusRef={triggerRef} onClose={close} />}</AnimatePresence>
  </>;
}

export function PublicGalleryDialog({ profile, initialItemId, returnFocusRef, onClose }: DialogProps) {
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const confirmationOpenRef = useRef(false);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Map<string, string>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(initialItemId);
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const [originalUrl, setOriginalUrl] = useState("");
  const [comments, setComments] = useState<GalleryComment[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [commentText, setCommentText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deleteComment, setDeleteComment] = useState<GalleryComment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [commentsHaveMore, setCommentsHaveMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refreshTimerRef = useRef<number | null>(null);
  const selectedIdRef = useRef<string | null>(initialItemId);
  const itemsRef = useRef<GalleryItem[]>([]);
  const displayName = getProfileDisplayName(profile);
  const itemGroups = new Map<string, GalleryItem[]>();
  for (const item of items) { const label = galleryDateGroup(item.addedAt); itemGroups.set(label, [...(itemGroups.get(label) ?? []), item]); }

  useEffect(() => { confirmationOpenRef.current = deleteComment !== null; }, [deleteComment]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? "")); }, []);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnTo = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-public-gallery-close]")?.focus());
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !confirmationOpenRef.current) { event.preventDefault(); if (selectedIdRef.current) setSelectedId(null); else onClose(); return; }
      if (event.key !== "Tab" || confirmationOpenRef.current || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),video[controls],[tabindex]:not([tabindex="-1"])')];
      const first = controls[0]; const last = controls.at(-1); if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); window.requestAnimationFrame(() => returnTo?.focus()); };
  }, [onClose, returnFocusRef]);

  const loadItems = useCallback(async (append = false) => {
    if (!append) setIsLoading(true); setError("");
    const offset = append ? itemsRef.current.length : 0;
    const { data, error: loadError } = await supabase.rpc("list_public_gallery", { target_owner_id: profile.id, page_size: galleryPageSize + 1, page_offset: offset });
    if (loadError) { setIsLoading(false); setError(normalizeGalleryError(loadError, "This Gallery couldn't be loaded.")); return; }
    const parsed = (Array.isArray(data) ? data : []).map(parseGalleryItem).filter((item): item is GalleryItem => Boolean(item));
    const page = parsed.slice(0, galleryPageSize); setHasMore(parsed.length > galleryPageSize);
    setItems((current) => append ? [...current, ...page.filter((item) => !current.some((existing) => existing.id === item.id))] : page); setIsLoading(false);
    const signed = await signGalleryPaths(page.map((item) => item.previewPath));
    setPreviewUrls((current) => append ? new Map([...current, ...signed.urls]) : signed.urls); if (signed.error) setError(signed.error);
  }, [profile.id]);

  const loadSelected = useCallback(async () => {
    if (!selectedId) { setSelected(null); setOriginalUrl(""); setComments([]); return; }
    setError("");
    const [itemResult, commentResult] = await Promise.all([
      supabase.rpc("get_gallery_item", { target_item_id: selectedId }),
      supabase.rpc("list_gallery_comments", { target_item_id: selectedId, page_size: galleryCommentPageSize + 1, page_offset: 0 }),
    ]);
    if (itemResult.error) { setError(normalizeGalleryError(itemResult.error, "This Gallery item couldn't be loaded.")); setSelected(null); return; }
    const item = parseGalleryItem(Array.isArray(itemResult.data) ? itemResult.data[0] : itemResult.data);
    if (!item) { setError("This Gallery item is no longer available."); setSelected(null); return; }
    setSelected(item);
    const parsedComments = (Array.isArray(commentResult.data) ? commentResult.data : []).map(parseGalleryComment).filter((comment): comment is GalleryComment => Boolean(comment));
    setComments(parsedComments.slice(0, galleryCommentPageSize)); setCommentsHaveMore(parsedComments.length > galleryCommentPageSize);
    if (commentResult.error) setError(normalizeGalleryError(commentResult.error, "Comments couldn't be loaded."));
    const signed = await signGalleryPaths([item.originalPath]); setOriginalUrl(signed.urls.get(item.originalPath) ?? ""); if (signed.error) setError(signed.error);
  }, [selectedId]);

  useEffect(() => { const timer = window.setTimeout(() => void loadItems(false), 0); return () => window.clearTimeout(timer); }, [loadItems]);
  useEffect(() => { const timer = window.setTimeout(() => void loadSelected(), 0); return () => window.clearTimeout(timer); }, [loadSelected]);

  useEffect(() => {
    if (!selectedId) return;
    const schedule = () => {
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => { refreshTimerRef.current = null; void loadSelected(); }, 140);
    };
    const channel = supabase.channel(`nemissive-gallery-item:${selectedId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gallery_items", filter: `id=eq.${selectedId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "gallery_hearts", filter: `item_id=eq.${selectedId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "gallery_comments", filter: `item_id=eq.${selectedId}` }, schedule)
      .subscribe();
    const privacyRecheck = window.setInterval(schedule, 30_000);
    const visible = () => { if (document.visibilityState === "visible") schedule(); };
    window.addEventListener("focus", visible); document.addEventListener("visibilitychange", visible);
    return () => { if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current); window.clearInterval(privacyRecheck); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); void supabase.removeChannel(channel); };
  }, [loadSelected, selectedId]);

  async function toggleHeart() {
    if (!selected || busy) return;
    setBusy(true); setError("");
    const { error: actionError } = await supabase.rpc("toggle_gallery_heart", { target_item_id: selected.id });
    setBusy(false); if (actionError) { setError(normalizeGalleryError(actionError, "Your heart couldn't be updated.")); return; } await loadSelected();
  }
  async function addComment() {
    if (!selected || busy || !commentText.trim()) return;
    setBusy(true); setError("");
    const { error: actionError } = await supabase.rpc("add_gallery_comment", { target_item_id: selected.id, candidate_body: commentText });
    setBusy(false); if (actionError) { setError(normalizeGalleryError(actionError, "Your comment couldn't be added.")); return; } setCommentText(""); await loadSelected();
  }
  async function saveComment() {
    if (!editingId || busy || !editingText.trim()) return;
    setBusy(true); setError("");
    const { error: actionError } = await supabase.rpc("update_gallery_comment", { target_comment_id: editingId, candidate_body: editingText });
    setBusy(false); if (actionError) { setError(normalizeGalleryError(actionError, "Your comment couldn't be updated.")); return; } setEditingId(null); await loadSelected();
  }
  async function confirmDeleteComment() {
    if (!deleteComment || busy) return;
    setBusy(true); setError("");
    const { error: actionError } = await supabase.rpc("delete_gallery_comment", { target_comment_id: deleteComment.id });
    setBusy(false); if (actionError) { setError(normalizeGalleryError(actionError, "The comment couldn't be deleted.")); return; } setDeleteComment(null); await loadSelected();
  }
  async function loadMoreComments() {
    if (!selected || busy) return;
    setBusy(true);
    const { data, error: loadError } = await supabase.rpc("list_gallery_comments", { target_item_id: selected.id, page_size: galleryCommentPageSize + 1, page_offset: comments.length });
    setBusy(false); if (loadError) { setError(normalizeGalleryError(loadError, "More comments couldn't be loaded.")); return; }
    const parsed = (Array.isArray(data) ? data : []).map(parseGalleryComment).filter((comment): comment is GalleryComment => Boolean(comment));
    setComments((current) => [...current, ...parsed.slice(0, galleryCommentPageSize).filter((comment) => !current.some((existing) => existing.id === comment.id))]); setCommentsHaveMore(parsed.length > galleryCommentPageSize);
  }

  if (typeof document === "undefined") return null;
  return createPortal(<motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[105] flex items-stretch justify-center bg-heading/25 md:items-center md:p-5"><motion.div ref={panelRef} initial={reduced ? false : { opacity: 0, y: 10, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} role="dialog" aria-modal="true" aria-labelledby="public-gallery-title" className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-surface md:h-[min(90dvh,58rem)] md:max-w-6xl md:rounded-[2rem] md:border md:border-border md:shadow-soft">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6"><div className="flex min-w-0 items-center gap-3"><ProfileAvatar profile={profile} size="sm" /><div className="min-w-0"><h2 id="public-gallery-title" className="truncate text-lg font-bold text-heading">{displayName}'s Gallery</h2><p className="truncate text-xs text-body">Public photos and videos</p></div></div><button data-public-gallery-close type="button" onClick={onClose} aria-label="Close Gallery" className="flex h-11 w-11 items-center justify-center rounded-2xl text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><Icon kind="close" /></button></header>
    {selectedId ? <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"><section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"><div className="flex shrink-0 items-center border-b border-border px-3 py-2"><button type="button" onClick={() => setSelectedId(null)} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-primary hover:bg-accent"><Icon kind="back" />Back to Gallery</button></div><div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-6">{selected && originalUrl ? selected.mediaType === "image" ? <img src={originalUrl} alt={selected.description || `Photo by ${displayName}`} className="max-h-full max-w-full rounded-2xl object-contain shadow-soft" /> : <video src={originalUrl} poster={previewUrls.get(selected.previewPath)} controls preload="metadata" className="max-h-full max-w-full rounded-2xl bg-heading" aria-label={selected.description || `Video by ${displayName}`} /> : <p role="status" className="text-sm text-body">Loading media…</p>}</div></section><aside className="min-h-0 w-full shrink-0 overflow-y-auto border-t border-border bg-surface px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 lg:w-[23rem] lg:border-l lg:border-t-0 lg:px-5">{selected && <><div className="flex items-center gap-3"><ProfileAvatar profile={profile} size="sm" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-heading">{displayName}</p>{profile.username && <p className="truncate text-xs text-body">@{profile.username}</p>}<time dateTime={selected.addedAt} className="text-xs text-muted">Added {formatGalleryDate(selected.addedAt, true)}</time></div></div>{selected.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-body">{selected.description}</p>}<div className="mt-4 flex items-center gap-2 border-y border-border py-3"><button type="button" disabled={busy} aria-pressed={selected.viewerHasHearted} onClick={() => void toggleHeart()} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${selected.viewerHasHearted ? "bg-accent text-primary" : "text-heading hover:bg-accent"}`}><Icon kind="heart" />{selected.viewerHasHearted ? "Hearted" : "Heart"}</button><span className="text-sm text-body">{selected.heartCount}</span><span className="ml-2 inline-flex items-center gap-1 text-sm text-body"><Icon kind="comment" />{selected.commentCount}</span></div><form onSubmit={(event) => { event.preventDefault(); void addComment(); }} className="mt-4"><label htmlFor="gallery-comment" className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Add a comment</label><textarea id="gallery-comment" value={commentText} maxLength={galleryDescriptionMaxLength} onChange={(event) => setCommentText(event.target.value)} rows={2} placeholder="Write a comment" className="mt-2 w-full resize-y rounded-2xl border border-border bg-background px-3 py-2 text-sm text-heading outline-none focus:border-primary" /><div className="mt-2 flex justify-end"><button type="submit" disabled={busy || !commentText.trim()} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">Post</button></div></form><section aria-labelledby="gallery-comments-heading" className="mt-5"><h3 id="gallery-comments-heading" className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Comments</h3>{comments.length === 0 ? <p className="mt-3 text-sm text-body">No comments yet.</p> : <ul className="mt-3 space-y-4">{comments.map((comment) => <li key={comment.id} className="flex gap-3"><ProfileAvatar profile={comment.author} size="sm" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="truncate text-sm font-semibold text-heading">{getProfileDisplayName(comment.author)}</p><time dateTime={comment.createdAt} className="text-[11px] text-muted">{formatGalleryDate(comment.createdAt)}</time></div>{editingId === comment.id ? <div className="mt-2"><textarea aria-label="Edit comment" value={editingText} maxLength={galleryDescriptionMaxLength} onChange={(event) => setEditingText(event.target.value)} rows={2} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-heading" /><div className="mt-2 flex gap-2"><button type="button" disabled={busy || !editingText.trim()} onClick={() => void saveComment()} className="min-h-9 rounded-xl bg-primary px-3 text-xs font-semibold text-white">Save</button><button type="button" disabled={busy} onClick={() => setEditingId(null)} className="min-h-9 rounded-xl px-3 text-xs font-semibold text-body hover:bg-accent">Cancel</button></div></div> : <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-body">{comment.body}</p>}<div className="mt-1 flex gap-2">{comment.authorId === currentUserId && editingId !== comment.id && <button type="button" onClick={() => { setEditingId(comment.id); setEditingText(comment.body); }} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-muted hover:text-heading"><Icon kind="edit" />Edit</button>}{(comment.authorId === currentUserId || selected.ownerId === currentUserId) && <button type="button" onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setDeleteComment(comment); }} className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-primary"><Icon kind="trash" />Delete</button>}</div></div></li>)}</ul>}{commentsHaveMore && <button type="button" disabled={busy} onClick={() => void loadMoreComments()} className="mt-4 min-h-10 w-full rounded-xl border border-border text-sm font-semibold text-heading hover:bg-accent">Load more comments</button>}</section></>}{error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm text-heading">{error}</p>}</aside></div> : <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-6">{isLoading ? <p role="status" className="p-12 text-center text-sm text-body">Loading Gallery…</p> : error ? <div role="alert" className="p-12 text-center text-sm text-body"><p>{error}</p><button type="button" onClick={() => void loadItems(false)} className="mt-4 font-semibold text-primary">Try again</button></div> : items.length === 0 ? <div className="mx-auto max-w-sm py-20 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-primary"><Icon kind="gallery" /></span><h3 className="mt-5 text-xl font-bold text-heading">No public media yet</h3><p className="mt-2 text-sm text-body">Public photos and videos will appear here.</p></div> : <>{[...itemGroups.entries()].map(([label, entries]) => <section key={label} className="mx-auto mb-7 max-w-5xl"><h3 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted">{label}</h3><ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{entries.map((item) => <li key={item.id}><button type="button" onClick={() => setSelectedId(item.id)} aria-label={`Open ${item.mediaType} added ${formatGalleryDate(item.addedAt)}`} className="group relative block aspect-square w-full overflow-hidden rounded-2xl bg-accent shadow-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">{previewUrls.get(item.previewPath) ? <img src={previewUrls.get(item.previewPath)} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.015]" /> : <span className="flex h-full items-center justify-center text-primary"><Icon kind="gallery" /></span>}{item.mediaType === "video" && <span className="absolute inset-0 flex items-center justify-center text-white"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-heading/70"><Icon kind="play" /></span></span>}<span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-heading/70 to-transparent px-3 pb-2 pt-6 text-left text-xs font-semibold text-white">{formatGalleryDate(item.addedAt)}</span></button></li>)}</ul></section>)}{hasMore && <div className="pt-1 text-center"><button type="button" disabled={busy} onClick={() => void loadItems(true)} className="min-h-11 rounded-2xl border border-border bg-surface px-5 text-sm font-semibold text-heading hover:bg-accent">Load more</button></div>}</>}</div>}
    <AnimatePresence>{deleteComment && <ConfirmationDialog dialogId="delete-gallery-comment" title="Delete this comment?" description="This comment will be permanently removed from the Gallery item." confirmLabel="Delete comment" pendingLabel="Deleting…" pendingAnnouncement="Deleting Gallery comment." icon={<Icon kind="trash" />} error={error} isPending={busy} returnFocusRef={deleteTriggerRef} onCancel={() => { if (!busy) setDeleteComment(null); }} onConfirm={() => void confirmDeleteComment()} />}</AnimatePresence>
  </motion.div></motion.div>, document.body);
}

export default PublicGallerySection;
