import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import type { ProfileSearchResult } from "../../types/conversations";
import GalleryFeed, { type GalleryFeedPanel } from "./GalleryFeed";
import GalleryItemDetails from "./GalleryItemDetails";
import ProfileAvatar from "./ProfileAvatar";
import { formatGalleryDate, galleryDateGroup, galleryPageSize, normalizeGalleryError, parseGalleryItem, signGalleryPaths, type GalleryItem } from "./gallery";
import { getProfileDisplayName } from "./profileUtils";

type SectionProps = { profile: ProfileSearchResult; onOverlayOpenChange: (open: boolean) => void };
type DialogProps = { profile: ProfileSearchResult; initialItemId: string | null; initialCommentId?: string | null; returnFocusRef: RefObject<HTMLElement | null>; onClose: () => void };
type PublicGalleryView = { type: "browser"; selectedItemId: string | null } | { type: "feed"; selectedItemId: string; rightPanel: GalleryFeedPanel; commentId: string | null };

function Icon({ kind }: { kind: "close" | "play" | "gallery" }) {
  if (kind === "gallery") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.2-4.2 3.1 3 2.2-2.1 3.5 3.3" /></svg>;
  const path = kind === "close" ? "m7 7 10 10M17 7 7 17" : "m9 7 8 5-8 5V7Z";
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
    const signed = await signGalleryPaths(parsed.map((item) => item.previewPath)); setUrls(signed.urls); if (signed.error) setError(signed.error);
  }, [profile.id]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { onOverlayOpenChange(dialogItemId !== undefined); return () => onOverlayOpenChange(false); }, [dialogItemId, onOverlayOpenChange]);
  const close = useCallback(() => { setDialogItemId(undefined); void load(); }, [load]);
  function open(itemId: string | null, trigger: HTMLElement) { triggerRef.current = trigger; setDialogItemId(itemId); }
  return <><section aria-labelledby="profile-gallery-heading" className="mt-7 border-t border-border pt-5"><div className="flex items-center justify-between gap-3"><h3 id="profile-gallery-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Gallery</h3>{items.length > 0 && <button type="button" onClick={(event) => open(null, event.currentTarget)} className="min-h-9 rounded-xl px-2 text-xs font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">View all</button>}</div>{isLoading ? <p role="status" className="mt-3 rounded-2xl bg-background p-4 text-center text-sm text-body">Loading public media...</p> : error ? <div role="alert" className="mt-3 rounded-2xl border border-border bg-background p-4 text-sm text-body"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 font-semibold text-primary">Try again</button></div> : items.length === 0 ? <div className="mt-3 rounded-2xl bg-background p-4 text-center"><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-primary"><Icon kind="gallery" /></span><p className="mt-3 text-sm text-body">No public media yet.</p></div> : <ul className="mt-3 grid grid-cols-3 gap-2">{items.slice(0, 6).map((item) => <li key={item.id}><button type="button" onClick={(event) => open(item.id, event.currentTarget)} aria-label={`Open ${item.mediaType} added ${formatGalleryDate(item.addedAt)}`} className="relative block aspect-square w-full overflow-hidden rounded-xl bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">{urls.get(item.previewPath) ? <img src={urls.get(item.previewPath)} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-primary"><Icon kind="gallery" /></span>}{item.mediaType === "video" && <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-heading/70"><Icon kind="play" /></span></span>}</button></li>)}</ul>}</section><AnimatePresence>{dialogItemId !== undefined && <PublicGalleryDialog profile={profile} initialItemId={dialogItemId} initialCommentId={null} returnFocusRef={triggerRef} onClose={close} />}</AnimatePresence></>;
}

export function PublicGalleryDialog({ profile, initialItemId, initialCommentId, returnFocusRef, onClose }: DialogProps) {
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const rootScrollRef = useRef<HTMLDivElement>(null);
  const rootScrollPositionRef = useRef(0);
  const thumbnailRefs = useRef(new Map<string, HTMLButtonElement>());
  const viewRef = useRef<PublicGalleryView>({ type: "browser", selectedItemId: initialItemId });
  const itemsRef = useRef<GalleryItem[]>([]);
  const [view, setView] = useState<PublicGalleryView>({ type: "browser", selectedItemId: initialItemId });
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const displayName = getProfileDisplayName(profile);
  const selectedItem = view.type === "browser" ? items.find((item) => item.id === view.selectedItemId) ?? null : null;
  const feedIndex = view.type === "feed" ? items.findIndex((item) => item.id === view.selectedItemId) : -1;
  const previousItemId = feedIndex > 0 ? items[feedIndex - 1].id : null;
  const nextItemId = feedIndex >= 0 && feedIndex < items.length - 1 ? items[feedIndex + 1].id : null;
  const groups = useMemo(() => { const result = new Map<string, GalleryItem[]>(); for (const item of items) { const label = galleryDateGroup(item.addedAt); result.set(label, [...(result.get(label) ?? []), item]); } return result; }, [items]);

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow; const returnTo = returnFocusRef.current; document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-public-gallery-close]")?.focus());
    function handleKey(event: KeyboardEvent) {
      if (viewRef.current.type !== "browser") return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (viewRef.current.selectedItemId && window.matchMedia("(max-width: 767px)").matches) { const selectedId = viewRef.current.selectedItemId; setView({ type: "browser", selectedItemId: null }); window.requestAnimationFrame(() => { if (rootScrollRef.current) rootScrollRef.current.scrollTop = rootScrollPositionRef.current; thumbnailRefs.current.get(selectedId)?.focus({ preventScroll: true }); }); }
        else onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),textarea:not([disabled]),video[controls],[tabindex]:not([tabindex="-1"])')];
      const first = controls[0]; const last = controls.at(-1); if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); window.requestAnimationFrame(() => returnTo?.focus()); };
  }, [onClose, returnFocusRef]);

  const loadItems = useCallback(async (append = false) => {
    if (!append) setIsLoading(true); else setBusy(true); setError("");
    const offset = append ? itemsRef.current.length : 0;
    const { data, error: loadError } = await supabase.rpc("list_public_gallery", { target_owner_id: profile.id, page_size: galleryPageSize + 1, page_offset: offset });
    setIsLoading(false); setBusy(false);
    if (loadError) { setError(normalizeGalleryError(loadError, "This Gallery couldn't be loaded.")); return; }
    const parsed = (Array.isArray(data) ? data : []).map(parseGalleryItem).filter((item): item is GalleryItem => Boolean(item)); const page = parsed.slice(0, galleryPageSize); setHasMore(parsed.length > galleryPageSize);
    setItems((current) => append ? [...current, ...page.filter((item) => !current.some((existing) => existing.id === item.id))] : page);
    const signed = await signGalleryPaths(page.map((item) => item.previewPath)); setPreviewUrls((current) => append ? new Map([...current, ...signed.urls]) : signed.urls); if (signed.error) setError(signed.error);
  }, [profile.id]);
  useEffect(() => { const timer = window.setTimeout(() => void loadItems(false), 0); return () => window.clearTimeout(timer); }, [loadItems]);
  useEffect(() => { if (view.type !== "browser" || !view.selectedItemId || isLoading || selectedItem) return; const timer = window.setTimeout(() => setView({ type: "browser", selectedItemId: null }), 0); return () => window.clearTimeout(timer); }, [isLoading, selectedItem, view]);

  function selectItem(itemId: string, trigger: HTMLButtonElement) { rootScrollPositionRef.current = rootScrollRef.current?.scrollTop ?? rootScrollPositionRef.current; thumbnailRefs.current.set(itemId, trigger); setView({ type: "browser", selectedItemId: itemId }); }
  function openFeed(itemId: string) { rootScrollPositionRef.current = rootScrollRef.current?.scrollTop ?? rootScrollPositionRef.current; setView({ type: "feed", selectedItemId: itemId, rightPanel: "activity", commentId: initialCommentId ?? null }); }
  function backToBrowser(itemId: string) { const selectedItemId = items.some((item) => item.id === itemId) ? itemId : null; setView({ type: "browser", selectedItemId }); window.requestAnimationFrame(() => { if (rootScrollRef.current) rootScrollRef.current.scrollTop = rootScrollPositionRef.current; if (selectedItemId) thumbnailRefs.current.get(selectedItemId)?.focus({ preventScroll: true }); else titleRef.current?.focus({ preventScroll: true }); }); }

  if (typeof document === "undefined") return null;
  return createPortal(<motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[105] flex items-stretch justify-center bg-heading/25 md:items-center md:p-5"><motion.div ref={panelRef} initial={reduced ? false : { opacity: 0, y: 10, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} role="dialog" aria-modal="true" aria-labelledby="public-gallery-title" className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-surface md:h-[min(90dvh,58rem)] md:max-w-6xl md:rounded-[2rem] md:border md:border-border md:shadow-soft">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6"><div className="flex min-w-0 items-center gap-3"><ProfileAvatar profile={profile} size="sm" /><div className="min-w-0"><h2 ref={titleRef} tabIndex={-1} id="public-gallery-title" className="truncate text-lg font-bold text-heading outline-none">{displayName}'s Gallery</h2><p className="truncate text-xs text-body">Public photos and videos</p></div></div><button data-public-gallery-close type="button" onClick={onClose} aria-label="Close Gallery" className="flex h-11 w-11 items-center justify-center rounded-2xl text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><Icon kind="close" /></button></header>
    {view.type === "feed" ? <GalleryFeed itemId={view.selectedItemId} profile={profile} previewUrl={items.find((item) => item.id === view.selectedItemId) ? previewUrls.get(items.find((item) => item.id === view.selectedItemId)!.previewPath) : undefined} initialCommentId={view.commentId} previousItemId={previousItemId} nextItemId={nextItemId} rightPanel={view.rightPanel} onRightPanelChange={(rightPanel) => setView((current) => current.type === "feed" ? { ...current, rightPanel } : current)} onSelectItem={(selectedItemId) => setView({ type: "feed", selectedItemId, rightPanel: "activity", commentId: null })} onItemUnavailable={() => { setView({ type: "browser", selectedItemId: null }); void loadItems(false); }} onBack={() => backToBrowser(view.selectedItemId)} /> : <div className="flex min-h-0 flex-1 overflow-hidden"><div className={`${selectedItem ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col overflow-hidden bg-background`}><div ref={rootScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-6">{isLoading ? <p role="status" className="p-12 text-center text-sm text-body">Loading Gallery...</p> : error ? <div role="alert" className="p-12 text-center text-sm text-body"><p>{error}</p><button type="button" onClick={() => void loadItems(false)} className="mt-4 font-semibold text-primary">Try again</button></div> : items.length === 0 ? <div className="mx-auto max-w-sm py-20 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-primary"><Icon kind="gallery" /></span><h3 className="mt-5 text-xl font-bold text-heading">No public media yet</h3><p className="mt-2 text-sm text-body">Public photos and videos will appear here.</p></div> : <>{[...groups.entries()].map(([label, entries]) => <section key={label} className="mx-auto mb-7 max-w-5xl"><h3 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted">{label}</h3><ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{entries.map((item) => <li key={item.id}><button ref={(node) => { if (node) thumbnailRefs.current.set(item.id, node); else thumbnailRefs.current.delete(item.id); }} type="button" onClick={(event) => selectItem(item.id, event.currentTarget)} aria-current={selectedItem?.id === item.id ? "true" : undefined} aria-label={`Select ${item.mediaType} added ${formatGalleryDate(item.addedAt)}`} className={`group relative block aspect-square w-full overflow-hidden rounded-2xl border bg-accent shadow-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${selectedItem?.id === item.id ? "border-primary/50 ring-2 ring-primary/15" : "border-transparent"}`}>{previewUrls.get(item.previewPath) ? <img src={previewUrls.get(item.previewPath)} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.015]" /> : <span className="flex h-full items-center justify-center text-primary"><Icon kind="gallery" /></span>}{item.mediaType === "video" && <span className="absolute inset-0 flex items-center justify-center text-white"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-heading/70"><Icon kind="play" /></span></span>}<span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-heading/70 to-transparent px-3 pb-2 pt-6 text-left text-xs font-semibold text-white">{formatGalleryDate(item.addedAt)}</span></button></li>)}</ul></section>)}{hasMore && <div className="pt-1 text-center"><button type="button" disabled={busy} onClick={() => void loadItems(true)} className="min-h-11 rounded-2xl border border-border bg-surface px-5 text-sm font-semibold text-heading hover:bg-accent disabled:opacity-60">{busy ? "Loading..." : "Load more"}</button></div>}</>}</div></div><GalleryItemDetails key={selectedItem?.id ?? "empty"} item={selectedItem} previewUrl={selectedItem ? previewUrls.get(selectedItem.previewPath) : undefined} profile={profile} onMobileBack={() => { const selectedId = selectedItem?.id; setView({ type: "browser", selectedItemId: null }); window.requestAnimationFrame(() => { if (rootScrollRef.current) rootScrollRef.current.scrollTop = rootScrollPositionRef.current; if (selectedId) thumbnailRefs.current.get(selectedId)?.focus({ preventScroll: true }); }); }} onViewActivity={() => { if (selectedItem) openFeed(selectedItem.id); }} /></div>}
  </motion.div></motion.div>, document.body);
}

export default PublicGallerySection;
