import { useState } from "react";
import type { MessageAttachment } from "../../types/conversations";

type GalleryMediaItem = Omit<MessageAttachment, "width" | "height"> & {
  width: number;
  height: number;
  url: string | null;
};

type MessageMediaGalleryProps = {
  attachments: GalleryMediaItem[];
  isLoading: boolean;
  onOpen: (index: number, trigger: HTMLButtonElement) => void;
  onRetry: () => void;
};

function MessageMediaGallery({ attachments, isLoading, onOpen, onRetry }: MessageMediaGalleryProps) {
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set());

  if (attachments.length === 0) {
    return isLoading ? <div role="status" className="flex min-h-28 min-w-48 items-center justify-center rounded-2xl bg-card px-4 text-center text-xs text-muted">Loading images…</div> : <button type="button" onClick={(event) => { event.stopPropagation(); onRetry(); }} className="flex min-h-28 min-w-48 items-center justify-center rounded-2xl bg-card px-4 text-center text-xs text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Images unavailable · Retry</button>;
  }

  const gridClassName = attachments.length === 1 ? "grid-cols-1" : "grid-cols-2";

  return (
    <div className={`grid max-w-full gap-1 overflow-hidden rounded-2xl ${gridClassName}`}>
      {attachments.map((attachment, index) => {
        const isLeadOfThree = attachments.length === 3 && index === 0;
        const itemClassName = attachments.length === 1 ? "max-h-[28rem] min-h-48" : isLeadOfThree ? "row-span-2 min-h-52" : "aspect-square min-h-24";
        return attachment.url && !failedImageIds.has(attachment.id) ? <button key={attachment.id} type="button" onClick={(event) => { event.stopPropagation(); onOpen(index, event.currentTarget); }} aria-label={`Open image ${index + 1} of ${attachments.length}: ${attachment.originalName}`} className={`relative min-w-0 overflow-hidden bg-card focus-visible:z-10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${itemClassName}`}><img src={attachment.url} alt={attachment.originalName} width={attachment.width} height={attachment.height} loading="lazy" onError={() => setFailedImageIds((current) => new Set(current).add(attachment.id))} className="h-full w-full object-cover" /></button> : <button key={attachment.id} type="button" onClick={(event) => { event.stopPropagation(); setFailedImageIds((current) => { const next = new Set(current); next.delete(attachment.id); return next; }); onRetry(); }} aria-label={`Retry loading ${attachment.originalName}`} className={`flex min-w-0 items-center justify-center bg-card px-3 text-center text-xs text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${itemClassName}`}>{isLoading ? "Loading…" : "Image unavailable · Retry"}</button>;
      })}
    </div>
  );
}

export type { GalleryMediaItem };
export default MessageMediaGallery;
