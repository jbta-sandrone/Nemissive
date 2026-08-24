import { useEffect, useRef, useState } from "react";
import type { ProfileSearchResult } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { formatGalleryDate, galleryDescriptionMaxLength, type GalleryItem, type GalleryVisibility } from "./gallery";
import { getProfileDisplayName } from "./profileUtils";

type Props = {
  item: GalleryItem | null;
  previewUrl?: string;
  profile: ProfileSearchResult;
  ownerMode?: boolean;
  onMobileBack: () => void;
  onViewActivity: (trigger: HTMLButtonElement) => void;
  onOwnerUpdate?: (itemId: string, visibility: GalleryVisibility, description: string) => Promise<string | null>;
  onOwnerDelete?: (item: GalleryItem, trigger: HTMLElement) => void;
};

function Icon({ kind }: { kind: "back" | "image" | "video" | "trash" }) {
  if (kind === "image") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.2-4.2 3.1 3 2.2-2.1 3.5 3.3" /></svg>;
  if (kind === "video") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="3" /><path d="m10 9 5 3-5 3V9Z" /></svg>;
  const path = kind === "back" ? "m15 6-6 6 6 6M9 12h10" : "M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6.5 7l.7 13h9.6l.7-13";
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d={path} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function GalleryItemDetails({ item, previewUrl, profile, ownerMode = false, onMobileBack, onViewActivity, onOwnerUpdate, onOwnerDelete }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectedRevisionRef = useRef("");
  const [visibility, setVisibility] = useState<GalleryVisibility>(item?.visibility ?? "private");
  const [description, setDescription] = useState(item?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedItemId = item?.id ?? null;

  useEffect(() => {
    if (!item || selectedRevisionRef.current === `${item.id}:${item.updatedAt}`) return;
    selectedRevisionRef.current = `${item.id}:${item.updatedAt}`;
    const timer = window.setTimeout(() => {
      setVisibility(item.visibility);
      setDescription(item.description);
      setError("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [item]);

  useEffect(() => {
    if (!selectedItemId || !window.matchMedia("(max-width: 767px)").matches) return;
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedItemId]);

  async function save() {
    if (!item || !onOwnerUpdate || busy) return;
    setBusy(true); setError("");
    const updateError = await onOwnerUpdate(item.id, visibility, description);
    setBusy(false);
    if (updateError) setError(updateError);
  }

  if (!item) return <aside aria-label="Gallery details" className="hidden min-h-0 w-[22rem] shrink-0 items-center justify-center border-l border-border bg-surface p-8 text-center md:flex"><div><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary"><Icon kind="image" /></span><h2 className="mt-4 font-semibold text-heading">Gallery details</h2><p className="mt-2 text-sm text-body">Select an item to view its details.</p></div></aside>;

  const displayName = getProfileDisplayName(profile);
  const activityAvailable = item.visibility === "public";
  return <aside aria-label="Gallery details" className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden border-border bg-surface md:w-[22rem] md:border-l">
    <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-3 md:px-5"><button type="button" onClick={onMobileBack} aria-label="Back to Gallery media" className="flex h-10 w-10 items-center justify-center rounded-xl text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover md:hidden"><Icon kind="back" /></button><div className="min-w-0"><h2 ref={headingRef} tabIndex={-1} className="truncate font-semibold text-heading outline-none">Gallery details</h2><p className="text-xs text-muted">Added {formatGalleryDate(item.addedAt, true)}</p></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 md:px-5">
      <div className="overflow-hidden rounded-2xl bg-background">{previewUrl ? <img src={previewUrl} alt={item.description || `${item.mediaType === "image" ? "Photo" : "Video"} preview`} className="max-h-[34dvh] w-full object-contain" /> : <span className="flex aspect-square items-center justify-center text-primary"><Icon kind={item.mediaType} /></span>}</div>
      {!ownerMode && <div className="mt-4 flex items-center gap-3"><ProfileAvatar profile={profile} size="sm" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-heading">{displayName}</p>{profile.username && <p className="truncate text-xs text-body">@{profile.username}</p>}</div></div>}
      {ownerMode ? <>
        <label className="mt-5 block text-sm font-semibold text-heading">Description<textarea value={description} maxLength={galleryDescriptionMaxLength} onChange={(event) => setDescription(event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-6 text-heading outline-none focus:border-primary" /></label>
        <label className="mt-4 block text-sm font-semibold text-heading">Visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value as GalleryVisibility)} className="mt-2 min-h-11 w-full rounded-2xl border border-border bg-background px-3 text-sm text-heading"><option value="private">Private</option><option value="public">Public to connections</option></select></label>
        <p className="mt-3 text-xs leading-5 text-body">Public media appears on your profile only to authenticated, eligible Nemissive connections. Private media remains visible only to you.</p>
        <div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={busy || !onOwnerUpdate || (visibility === item.visibility && description === item.description)} onClick={() => void save()} className="min-h-11 rounded-2xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving..." : "Save changes"}</button>{onOwnerDelete && <button type="button" disabled={busy} onClick={(event) => onOwnerDelete(item, event.currentTarget)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/25 px-4 text-sm font-semibold text-primary hover:bg-accent"><Icon kind="trash" />Delete</button>}</div>
      </> : item.description ? <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-body">{item.description}</p> : <p className="mt-4 text-sm text-muted">No description.</p>}
      {error && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm text-heading">{error}</p>}
      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-background p-3 text-xs"><div><dt className="text-muted">Type</dt><dd className="mt-1 font-semibold capitalize text-heading">{item.mediaType}</dd></div><div><dt className="text-muted">Visibility</dt><dd className="mt-1 font-semibold capitalize text-heading">{item.visibility}</dd></div><div><dt className="text-muted">Dimensions</dt><dd className="mt-1 font-semibold text-heading">{item.width} × {item.height}</dd></div>{item.durationMs !== null && <div><dt className="text-muted">Duration</dt><dd className="mt-1 font-semibold text-heading">{Math.ceil(item.durationMs / 1000)} sec</dd></div>}</dl>
      {activityAvailable ? <button type="button" onClick={(event) => onViewActivity(event.currentTarget)} className="mt-5 min-h-11 w-full rounded-2xl border border-border bg-surface px-4 text-sm font-semibold text-heading hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">View Activity</button> : <p className="mt-5 rounded-2xl bg-background px-4 py-3 text-xs leading-5 text-body">Activity becomes available when this item is public.</p>}
    </div>
  </aside>;
}

export default GalleryItemDetails;
