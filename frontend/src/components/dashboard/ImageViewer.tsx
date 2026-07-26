import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import type { GalleryMediaItem } from "./MessageMediaGallery";

type ImageViewerProps = {
  images: GalleryMediaItem[];
  initialIndex: number;
  isLoading: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onRetry: () => void;
};

function ImageViewer({ images, initialIndex, isLoading, returnFocusRef, onClose, onRetry }: ImageViewerProps) {
  const shouldReduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [activeIndex, setActiveIndex] = useState(() => Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0)));
  const [failedImageKey, setFailedImageKey] = useState<string | null>(null);
  const activeImage = images[activeIndex] ?? null;
  const activeImageKey = activeImage ? `${activeImage.id}:${activeImage.url ?? ""}` : "";
  const hasImageError = failedImageKey === activeImageKey;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === "ArrowLeft" && images.length > 1) {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + images.length) % images.length);
      } else if (event.key === "ArrowRight" && images.length > 1) {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % images.length);
      } else if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first && last && event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (first && last && !event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    const focusFrame = window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>("[data-autofocus]")?.focus());
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => returnFocusElement?.focus());
    };
  }, [images.length, returnFocusRef]);

  if (!activeImage) return null;

  return createPortal(
    <motion.div initial={shouldReduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.18 }} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 z-[100] flex items-center justify-center bg-heading/80 p-3 sm:p-6">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Image viewer, image ${activeIndex + 1} of ${images.length}`} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }} className="relative flex h-full w-full max-w-6xl flex-col items-center justify-center">
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3"><p className="min-w-0 truncate rounded-xl bg-surface px-3 py-2 text-xs font-medium text-heading">{activeImage.originalName} · {activeIndex + 1} of {images.length}</p><button data-autofocus type="button" onClick={onClose} aria-label="Close image viewer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-heading shadow-soft transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div>
        <div onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }} className="flex min-h-0 w-full flex-1 items-center justify-center px-0 py-16 sm:px-14">{activeImage.url && !hasImageError ? <img src={activeImage.url} alt={activeImage.originalName} onError={() => setFailedImageKey(activeImageKey)} className="max-h-full max-w-full object-contain" /> : isLoading && !hasImageError ? <div role="status" className="rounded-2xl bg-surface p-5 text-center text-sm text-body">Loading image…</div> : <div role="alert" className="rounded-2xl bg-surface p-5 text-center text-sm text-body"><p>This image couldn’t be loaded.</p><button type="button" onClick={() => { setFailedImageKey(null); onRetry(); }} className="mt-3 rounded-xl bg-primary px-4 py-2 font-semibold text-white transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Retry</button></div>}</div>
        {images.length > 1 && <><button type="button" onClick={() => setActiveIndex((index) => (index - 1 + images.length) % images.length)} aria-label="Previous image" className="absolute bottom-2 left-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-heading shadow-soft transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg></button><button type="button" onClick={() => setActiveIndex((index) => (index + 1) % images.length)} aria-label="Next image" className="absolute bottom-2 right-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-heading shadow-soft transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true"><path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg></button></>}
      </div>
    </motion.div>,
    document.body,
  );
}

export default ImageViewer;
