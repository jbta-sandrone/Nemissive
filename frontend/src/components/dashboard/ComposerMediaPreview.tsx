import type { ComposerImageSelection } from "../../types/conversations";

type ComposerMediaPreviewProps = {
  images: ComposerImageSelection[];
  disabled: boolean;
  onRemove: (localId: string) => void;
  onRemoveAll: () => void;
};

function formatFileSize(sizeInBytes: number) {
  if (sizeInBytes < 1024) return `${sizeInBytes} B`;
  if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(sizeInBytes >= 100 * 1024 ? 0 : 1)} KB`;
  return `${(sizeInBytes / (1024 * 1024)).toFixed(sizeInBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function ComposerMediaPreview({ images, disabled, onRemove, onRemoveAll }: ComposerMediaPreviewProps) {
  if (images.length === 0) return null;

  return (
    <section aria-label={`${images.length} selected ${images.length === 1 ? "image" : "images"}`} className="chat-composer-surface mb-2 max-h-[min(42dvh,24rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-3 shadow-soft">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3"><p className="min-w-0 truncate text-sm font-semibold text-heading">{images.length} {images.length === 1 ? "image" : "images"} selected</p>{images.length > 1 && <button type="button" onClick={onRemoveAll} disabled={disabled} className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-50">Remove all</button>}</div>
      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">{images.map((image) => <article key={image.localId} className="chat-media-review-card relative min-w-0 overflow-hidden rounded-2xl bg-card"><img src={image.objectUrl} alt={`Local preview of ${image.originalName}`} className="aspect-square w-full object-cover" /><button type="button" onClick={() => onRemove(image.localId)} disabled={disabled} aria-label={`Remove selected image ${image.originalName}`} className="chat-media-review-action absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-heading shadow-soft transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button><div className="min-w-0 px-3 py-2"><p className="truncate text-xs font-semibold text-heading" title={image.originalName}>{image.originalName}</p><p className="mt-0.5 text-xs text-muted">{formatFileSize(image.size)}</p></div></article>)}</div>
    </section>
  );
}

export default ComposerMediaPreview;
