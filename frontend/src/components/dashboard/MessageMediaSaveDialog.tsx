import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import type { MessageAttachment } from "../../types/conversations";
import { prepareGalleryFile } from "./gallery";
import { sanitizeAttachmentFilename } from "./fileAttachments";

export type SaveableMessageImage = MessageAttachment & { url: string | null };

type Props = {
  messageId: string;
  images: SaveableMessageImage[];
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSavedToGallery: (count: number) => void;
  onSavedToDevice: (count: number) => void;
};

function blobToBase64(blob: Blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  });
}

async function fetchOriginal(image: SaveableMessageImage) {
  if (!image.url) throw new Error("This image is still loading. Try again in a moment.");
  const response = await fetch(image.url);
  if (!response.ok) throw new Error("The original image is no longer available.");
  const blob = await response.blob();
  const mimeType = image.mimeType.split(";", 1)[0].toLowerCase();
  if (!blob.size || blob.size > 10 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new Error("This image isn't compatible with Gallery.");
  }
  return { blob, mimeType };
}

function MessageMediaSaveDialog({ messageId, images, returnFocusRef, onClose, onSavedToGallery, onSavedToDevice }: Props) {
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(images[0] ? [images[0].id] : []));
  const [state, setState] = useState<"" | "preparing" | "saving" | "downloading">("");
  const [error, setError] = useState("");
  const selected = useMemo(() => images.filter((image) => selectedIds.has(image.id)), [images, selectedIds]);
  const busy = Boolean(state);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnTo = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnTo?.isConnected && returnTo.focus());
    };
  }, [returnFocusRef]);

  function toggleImage(id: string) {
    if (busy) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function saveToGallery() {
    if (!selected.length || busy) return;
    setState("preparing"); setError("");
    try {
      const items = [];
      for (const image of selected) {
        const { blob, mimeType } = await fetchOriginal(image);
        const file = new File([blob], sanitizeAttachmentFilename(image.originalName), { type: mimeType });
        const prepared = await prepareGalleryFile(file);
        if (prepared.mediaType !== "image" || prepared.preview.size > 2 * 1024 * 1024) throw new Error("Nemissive couldn't create a safe Gallery preview for this image.");
        items.push({ attachmentId: image.id, previewBase64: await blobToBase64(prepared.preview) });
      }
      setState("saving");
      const { data, error: invokeError } = await supabase.functions.invoke("message-media-delivery", { body: { action: "save_to_gallery", sourceMessageId: messageId, galleryItems: items } });
      if (invokeError || !data || typeof data !== "object" || data.saved !== true) {
        const message = data && typeof data === "object" && typeof data.error === "string" ? data.error : invokeError?.message;
        throw new Error(message || "Nemissive couldn't save this image to Gallery.");
      }
      onSavedToGallery(items.length);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Nemissive couldn't save this image to Gallery.");
      setState("");
    }
  }

  async function saveToDevice() {
    if (!selected.length || busy) return;
    setState("downloading"); setError("");
    try {
      for (const image of selected) {
        const { blob } = await fetchOriginal(image);
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = sanitizeAttachmentFilename(image.originalName) || "nemissive-image";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
      onSavedToDevice(selected.length);
      onClose();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Nemissive couldn't download this image.");
      setState("");
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(<motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-end justify-center bg-heading/20 p-0 md:items-center md:p-5" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><motion.div ref={panelRef} initial={reduced ? false : { opacity: .98, y: 12, scale: .99 }} animate={{ opacity: 1, y: 0, scale: 1 }} role="dialog" aria-modal="true" aria-labelledby="save-message-media-title" className="max-h-[min(88dvh,42rem)] w-full overflow-y-auto rounded-t-3xl border border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-soft md:w-[min(34rem,calc(100vw-2rem))] md:rounded-3xl md:p-5">
    <div className="flex items-start justify-between gap-3"><div><h2 id="save-message-media-title" className="text-lg font-bold text-heading">Save images</h2><p className="mt-1 text-sm text-body">Choose what to save and where it should go.</p></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close Save images" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-accent hover:text-heading disabled:opacity-50"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m5 5 10 10m0-10L5 15" strokeLinecap="round" /></svg></button></div>
    {images.length > 1 && <div className="mt-4 flex items-center justify-between"><p className="text-xs font-semibold text-muted">{selected.length} of {images.length} selected</p><button data-autofocus type="button" onClick={() => setSelectedIds(selected.length === images.length ? new Set() : new Set(images.map((image) => image.id)))} disabled={busy} className="min-h-9 rounded-xl px-2 text-xs font-semibold text-primary hover:bg-accent">{selected.length === images.length ? "Clear selection" : "Select all"}</button></div>}
    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{images.map((image, index) => <li key={image.id}><label className={`relative block cursor-pointer overflow-hidden rounded-2xl border bg-background focus-within:ring-4 focus-within:ring-accent-hover ${selectedIds.has(image.id) ? "border-primary ring-2 ring-primary/15" : "border-border"}`}><input data-autofocus={images.length === 1 && index === 0 ? true : undefined} type="checkbox" checked={selectedIds.has(image.id)} onChange={() => toggleImage(image.id)} disabled={busy} className="sr-only" /><span className="block aspect-square bg-accent">{image.url ? <img src={image.url} alt={image.originalName} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center px-2 text-center text-xs text-body">Preview loading</span>}</span><span className="block truncate px-2 py-2 text-xs font-semibold text-heading">{image.originalName}</span><span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface/95 text-primary shadow-soft" aria-hidden="true">{selectedIds.has(image.id) ? "✓" : ""}</span></label></li>)}</ul>
    <div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void saveToGallery()} disabled={busy || selected.length === 0 || selected.some((image) => !image.url)} className="min-h-14 rounded-2xl bg-primary px-4 py-3 text-left text-sm font-semibold text-white disabled:opacity-50"><span className="block">{state === "preparing" ? "Preparing…" : state === "saving" ? "Saving…" : "Save to Gallery"}</span><span className="mt-0.5 block text-xs font-normal text-white/80">Keep a private independent copy</span></button><button type="button" onClick={() => void saveToDevice()} disabled={busy || selected.length === 0 || selected.some((image) => !image.url)} className="min-h-14 rounded-2xl border border-border bg-background px-4 py-3 text-left text-sm font-semibold text-heading hover:bg-accent disabled:opacity-50"><span className="block">{state === "downloading" ? "Downloading…" : "Save to device"}</span><span className="mt-0.5 block text-xs font-normal text-body">Download the authorized original</span></button></div>
    {error && <p role="alert" className="mt-3 rounded-2xl bg-accent px-4 py-3 text-sm leading-5 text-body">{error}</p>}<p role="status" aria-live="polite" className="sr-only">{state === "preparing" ? "Preparing Gallery previews." : state === "saving" ? "Saving images to Gallery." : state === "downloading" ? "Downloading images." : ""}</p>
  </motion.div></motion.div>, document.body);
}

export default MessageMediaSaveDialog;
