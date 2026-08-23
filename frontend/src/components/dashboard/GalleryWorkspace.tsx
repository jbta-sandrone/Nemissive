import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { ProfileSearchResult } from "../../types/conversations";
import ConfirmationDialog from "./ConfirmationDialog";
import { PublicGalleryDialog } from "./PublicGallery";
import {
  formatGalleryDate,
  formatGalleryFileSize,
  galleryDateGroup,
  galleryDescriptionMaxLength,
  signGalleryPaths,
  validateGalleryFile,
  type GalleryFilters,
  type GalleryItem,
  type GalleryVisibility,
} from "./gallery";
import useGallery from "./useGallery";

type Props = { currentUserId: string; currentProfile: ProfileSearchResult; returnFocusRef: RefObject<HTMLElement | null>; onClose: () => void };

function Icon({ kind }: { kind: "close" | "back" | "upload" | "image" | "video" | "trash" | "lock" | "globe" }) {
  if (kind === "image") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.2-4.2 3.1 3 2.2-2.1 3.5 3.3" /></svg>;
  if (kind === "video") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="m10 9 5 3-5 3V9Z" /></svg>;
  const path = { close: "m7 7 10 10M17 7 7 17", back: "m15 6-6 6 6 6M9 12h10", upload: "M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5", trash: "M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6.5 7l.7 13h9.6l.7-13", lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11Z", globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.2 2.4 3.3 5.4 3.3 9S14.2 18.6 12 21m0-18C9.8 5.4 8.7 8.4 8.7 12s1.1 6.6 3.3 9M3 12h18" }[kind];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d={path} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function GalleryCard({ item, url, selected, onSelect }: { item: GalleryItem; url?: string; selected: boolean; onSelect: () => void }) {
  return <li><button type="button" onClick={onSelect} aria-current={selected ? "true" : undefined} className={`group w-full overflow-hidden rounded-2xl border bg-surface text-left shadow-soft transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${selected ? "border-primary/50 ring-2 ring-primary/15" : "border-border hover:border-primary/30"}`}>
    <span className="relative block aspect-square overflow-hidden bg-accent">{url ? <img src={url} alt="" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.015]" /> : <span className="flex h-full items-center justify-center text-primary"><Icon kind={item.mediaType} /></span>}{item.mediaType === "video" && <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-heading/75 text-white"><Icon kind="video" /></span>}<span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 text-heading" aria-label={item.visibility === "public" ? "Public" : "Private"}><Icon kind={item.visibility === "public" ? "globe" : "lock"} /></span></span>
    <span className="block min-w-0 px-3 py-3"><span className="block truncate text-sm font-semibold text-heading">{item.description.trim() || (item.mediaType === "image" ? "Photo" : "Video")}</span><span className="mt-1 block text-xs text-muted">{formatGalleryDate(item.addedAt)}</span></span>
  </button></li>;
}

function GalleryWorkspace({ currentUserId, currentProfile, returnFocusRef, onClose }: Props) {
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const confirmationOpenRef = useRef(false);
  const viewerTriggerRef = useRef<HTMLElement | null>(null);
  const viewerOpenRef = useRef(false);
  const [visibilityFilter, setVisibilityFilter] = useState<GalleryFilters["visibility"]>("all");
  const [mediaFilter, setMediaFilter] = useState<GalleryFilters["mediaType"]>("all");
  const [datePreset, setDatePreset] = useState<GalleryFilters["datePreset"]>("any");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<GalleryFilters["sort"]>("newest");
  const filters = useMemo(() => ({ visibility: visibilityFilter, mediaType: mediaFilter, datePreset, dateFrom, dateTo, sort }), [dateFrom, datePreset, dateTo, mediaFilter, sort, visibilityFilter]);
  const gallery = useGallery(currentUserId, filters);
  const refreshGallery = gallery.refresh;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOriginalUrl, setSelectedOriginalUrl] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadVisibility, setUploadVisibility] = useState<GalleryVisibility>("private");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [editVisibility, setEditVisibility] = useState<GalleryVisibility>("private");
  const [editDescription, setEditDescription] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const selected = gallery.items.find((item) => item.id === selectedId) ?? null;
  const uploadPreviewUrl = useMemo(() => uploadFile ? URL.createObjectURL(uploadFile) : "", [uploadFile]);

  useEffect(() => () => { if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl); }, [uploadPreviewUrl]);

  useEffect(() => { confirmationOpenRef.current = deleteOpen; }, [deleteOpen]);
  useEffect(() => { viewerOpenRef.current = viewerOpen; }, [viewerOpen]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnTo = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-gallery-close]")?.focus());
    function handleKey(event: KeyboardEvent) {
      if (viewerOpenRef.current) return;
      if (event.key === "Escape" && !confirmationOpenRef.current) { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || confirmationOpenRef.current || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      const first = controls[0]; const last = controls.at(-1); if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => { window.cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); window.requestAnimationFrame(() => returnTo?.focus()); };
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!selected) { setSelectedOriginalUrl(""); return; }
      setEditVisibility(selected.visibility); setEditDescription(selected.description); setActionError("");
      void signGalleryPaths([selected.originalPath]).then((result) => { if (!cancelled) { setSelectedOriginalUrl(result.urls.get(selected.originalPath) ?? ""); if (result.error) setActionError(result.error); } });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [selected]);

  useEffect(() => {
    if (!selectedId || gallery.items.some((item) => item.id === selectedId)) return;
    const timer = window.setTimeout(() => setSelectedId(null), 0);
    return () => window.clearTimeout(timer);
  }, [gallery.items, selectedId]);

  const groups = useMemo(() => {
    const result = new Map<string, GalleryItem[]>();
    for (const item of gallery.items) { const label = galleryDateGroup(item.addedAt); result.set(label, [...(result.get(label) ?? []), item]); }
    return [...result.entries()];
  }, [gallery.items]);

  async function submitUpload() {
    if (!uploadFile || busy) return;
    setBusy(true); setUploadError("");
    const error = await gallery.upload(uploadFile, uploadVisibility, uploadDescription);
    setBusy(false);
    if (error) { setUploadError(error); return; }
    setUploadFile(null); setUploadDescription(""); setUploadVisibility("private");
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  async function saveSelected() {
    if (!selected || busy) return;
    setBusy(true); setActionError("");
    const error = await gallery.update(selected.id, editVisibility, editDescription);
    setBusy(false); if (error) setActionError(error);
  }

  async function deleteSelected() {
    if (!selected || busy) return;
    setBusy(true); setActionError("");
    const error = await gallery.remove(selected);
    setBusy(false);
    if (error) { setActionError(error); return; }
    setDeleteOpen(false); setSelectedId(null);
  }

  const closeViewer = useCallback(() => { viewerOpenRef.current = false; setViewerOpen(false); void refreshGallery(); }, [refreshGallery]);

  if (typeof document === "undefined") return null;
  return createPortal(<motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-stretch justify-center bg-heading/20 md:items-center md:p-5"><motion.div ref={panelRef} initial={reduced ? false : { opacity: 0, y: 12, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} role="dialog" aria-modal="true" aria-labelledby="gallery-workspace-title" className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-surface md:h-[min(90dvh,58rem)] md:max-w-7xl md:rounded-[2rem] md:border md:border-border md:shadow-soft">
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-6"><div className="min-w-0"><h1 id="gallery-workspace-title" className="text-xl font-bold text-heading">Gallery</h1><p className="truncate text-sm text-body">Your personal media space.</p></div><button data-gallery-close type="button" onClick={onClose} aria-label="Close Gallery" className="flex h-11 w-11 items-center justify-center rounded-2xl text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><Icon kind="close" /></button></header>
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <section className={`${selected ? "hidden lg:flex" : "flex"} min-w-0 flex-1 flex-col overflow-hidden bg-background`} aria-label="Your Gallery">
        <div className="shrink-0 border-b border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => uploadInputRef.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white shadow-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><Icon kind="upload" />Add media</button><input ref={uploadInputRef} aria-label="Choose Gallery photos or videos" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" className="sr-only" onChange={(event) => { const file = event.target.files?.[0] ?? null; setUploadError(file ? validateGalleryFile(file) ?? "" : ""); setUploadFile(file); }} /><select aria-label="Filter by visibility" value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as GalleryFilters["visibility"])} className="min-h-11 rounded-2xl border border-border bg-surface px-3 text-sm text-heading"><option value="all">All visibility</option><option value="private">Private</option><option value="public">Public</option></select><select aria-label="Filter by media type" value={mediaFilter} onChange={(event) => setMediaFilter(event.target.value as GalleryFilters["mediaType"])} className="min-h-11 rounded-2xl border border-border bg-surface px-3 text-sm text-heading"><option value="all">Photos &amp; videos</option><option value="image">Photos</option><option value="video">Videos</option></select><select aria-label="Filter by date" value={datePreset} onChange={(event) => setDatePreset(event.target.value as GalleryFilters["datePreset"])} className="min-h-11 rounded-2xl border border-border bg-surface px-3 text-sm text-heading"><option value="any">Any date</option><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom range</option></select><select aria-label="Sort Gallery" value={sort} onChange={(event) => setSort(event.target.value as GalleryFilters["sort"])} className="min-h-11 rounded-2xl border border-border bg-surface px-3 text-sm text-heading"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div>
          {datePreset === "custom" && <div className="mt-3 flex flex-wrap gap-2"><label className="text-xs font-semibold text-body">From<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="ml-2 min-h-10 rounded-xl border border-border bg-surface px-2 text-sm text-heading" /></label><label className="text-xs font-semibold text-body">Through<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="ml-2 min-h-10 rounded-xl border border-border bg-surface px-2 text-sm text-heading" /></label>{(dateFrom || dateTo) && <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="min-h-10 rounded-xl px-3 text-xs font-semibold text-primary hover:bg-accent">Clear dates</button>}</div>}
        </div>
        {uploadFile && <div className="shrink-0 border-b border-border bg-surface px-4 py-4 sm:px-5"><div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-end"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-accent">{uploadFile.type.startsWith("image/") ? <img src={uploadPreviewUrl} alt="Selected upload preview" className="h-full w-full object-cover" /> : <video src={uploadPreviewUrl} muted preload="metadata" className="h-full w-full object-cover" aria-label="Selected video preview" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-heading">{uploadFile.name}</p><p className="mt-1 text-xs text-muted">{formatGalleryFileSize(uploadFile.size)}</p><label className="mt-3 block text-xs font-semibold text-body">Description<textarea value={uploadDescription} maxLength={galleryDescriptionMaxLength} onChange={(event) => setUploadDescription(event.target.value)} rows={2} placeholder="Add a description (optional)" className="mt-1 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm text-heading outline-none focus:border-primary" /></label></div><label className="text-xs font-semibold text-body">Visibility<select value={uploadVisibility} onChange={(event) => setUploadVisibility(event.target.value as GalleryVisibility)} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-heading"><option value="private">Private</option><option value="public">Public to connections</option></select></label><div className="flex gap-2"><button type="button" disabled={busy || Boolean(uploadError)} onClick={() => void submitUpload()} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{gallery.uploadState || (busy ? "Adding…" : "Add")}</button><button type="button" disabled={busy} onClick={() => { setUploadFile(null); setUploadError(""); if (uploadInputRef.current) uploadInputRef.current.value = ""; }} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-body hover:bg-accent">Cancel</button></div></div>{uploadError && <p role="alert" className="mx-auto mt-2 max-w-4xl text-sm text-primary">{uploadError}</p>}<p role="status" aria-live="polite" className="sr-only">{gallery.uploadState}</p></div>}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-6">{gallery.isLoading ? <p role="status" className="p-10 text-center text-sm text-body">Loading your Gallery…</p> : gallery.loadError ? <div role="alert" className="p-10 text-center text-sm text-body"><p>{gallery.loadError}</p><button type="button" onClick={gallery.refresh} className="mt-4 font-semibold text-primary">Try again</button></div> : groups.length === 0 ? <div className="mx-auto max-w-sm py-16 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent text-primary"><Icon kind="image" /></span><h2 className="mt-5 text-xl font-bold text-heading">Your Gallery is ready</h2><p className="mt-2 text-sm leading-6 text-body">Add a photo or short video. New media starts private unless you choose otherwise.</p></div> : <div className="space-y-8">{groups.map(([label, entries]) => <section key={label}><h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-muted">{label}</h2><ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{entries.map((item) => <GalleryCard key={item.id} item={item} url={gallery.previewUrls.get(item.previewPath)} selected={selectedId === item.id} onSelect={() => setSelectedId(item.id)} />)}</ul></section>)}{gallery.hasMore && <div className="pb-3 text-center"><button type="button" disabled={gallery.isLoadingMore} onClick={gallery.loadMore} className="min-h-11 rounded-2xl border border-border bg-surface px-5 text-sm font-semibold text-heading hover:bg-accent disabled:opacity-60">{gallery.isLoadingMore ? "Loading…" : "Load more"}</button></div>}</div>}</div>
      </section>
      <aside className={`${selected ? "flex" : "hidden lg:flex"} min-w-0 w-full flex-col overflow-hidden bg-surface lg:w-[25rem] lg:border-l lg:border-border`} aria-label="Gallery item details">{selected ? <><div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 lg:px-5"><button type="button" onClick={() => setSelectedId(null)} aria-label="Back to Gallery" className="flex h-10 w-10 items-center justify-center rounded-xl text-heading hover:bg-accent"><Icon kind="back" /></button><div className="min-w-0"><h2 className="truncate font-semibold text-heading">Media details</h2><p className="text-xs text-muted">Added {formatGalleryDate(selected.addedAt, true)}</p></div></div><div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 lg:px-5"><div className="overflow-hidden rounded-2xl bg-background">{selectedOriginalUrl ? selected.mediaType === "image" ? <img src={selectedOriginalUrl} alt={selected.description || "Gallery photo"} className="max-h-[45dvh] w-full object-contain" /> : <video src={selectedOriginalUrl} poster={gallery.previewUrls.get(selected.previewPath)} controls preload="metadata" className="max-h-[45dvh] w-full" aria-label={selected.description || "Gallery video"} /> : <div role="status" className="flex aspect-square items-center justify-center text-sm text-body">Loading media…</div>}</div><label className="mt-5 block text-sm font-semibold text-heading">Description<textarea value={editDescription} maxLength={galleryDescriptionMaxLength} onChange={(event) => setEditDescription(event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6 text-heading outline-none focus:border-primary" /></label><label className="mt-4 block text-sm font-semibold text-heading">Visibility<select value={editVisibility} onChange={(event) => setEditVisibility(event.target.value as GalleryVisibility)} className="mt-2 min-h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm text-heading"><option value="private">Private</option><option value="public">Public to connections</option></select></label><p className="mt-3 text-xs leading-5 text-body">Public media appears on your profile only to authenticated, eligible Nemissive connections. Private media remains visible only to you.</p>{actionError && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm text-heading">{actionError}</p>}<div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={busy || (editVisibility === selected.visibility && editDescription === selected.description)} onClick={() => void saveSelected()} className="min-h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save changes"}</button>{selected.visibility === "public" && <button type="button" onClick={(event) => { viewerTriggerRef.current = event.currentTarget; viewerOpenRef.current = true; setViewerOpen(true); }} className="min-h-11 rounded-2xl border border-border px-4 text-sm font-semibold text-heading hover:bg-accent">View activity</button>}<button type="button" disabled={busy} onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setDeleteOpen(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/25 px-4 text-sm font-semibold text-primary hover:bg-accent"><Icon kind="trash" />Delete</button></div><div className="mt-6 border-t border-border pt-4 text-xs text-muted"><p>{selected.heartCount} {selected.heartCount === 1 ? "heart" : "hearts"} · {selected.commentCount} {selected.commentCount === 1 ? "comment" : "comments"}</p><p className="mt-1">{selected.width} × {selected.height}{selected.durationMs ? ` · ${Math.ceil(selected.durationMs / 1000)} sec` : ""}</p></div></div></> : <div className="m-auto p-8 text-center text-sm text-body">Choose media to edit its description or visibility.</div>}</aside>
    </div>
    <AnimatePresence>{deleteOpen && selected && <ConfirmationDialog dialogId="delete-gallery-item" title="Delete this Gallery item?" description="The private media, hearts, and comments will be permanently deleted. This can't be undone." confirmLabel="Delete item" pendingLabel="Deleting…" pendingAnnouncement="Deleting Gallery item." icon={<Icon kind="trash" />} error={actionError} isPending={busy} returnFocusRef={deleteTriggerRef} onCancel={() => { if (!busy) setDeleteOpen(false); }} onConfirm={() => void deleteSelected()} />}</AnimatePresence>
    <AnimatePresence>{viewerOpen && selected && <PublicGalleryDialog profile={currentProfile} initialItemId={selected.id} returnFocusRef={viewerTriggerRef} onClose={closeViewer} />}</AnimatePresence>
  </motion.div></motion.div>, document.body);
}

export default GalleryWorkspace;
