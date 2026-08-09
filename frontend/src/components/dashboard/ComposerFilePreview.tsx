import type { ComposerFileSelection } from "../../types/conversations";
import { formatFileSize, getFriendlyFileType } from "./fileAttachments";

function FileIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Z" strokeLinejoin="round" /><path d="M14 3v5h5M9 13h6m-6 3h5" strokeLinecap="round" /></svg>;
}

function ComposerFilePreview({ files, disabled, onRemove, onRemoveAll }: { files: ComposerFileSelection[]; disabled: boolean; onRemove: (localId: string) => void; onRemoveAll: () => void }) {
  if (files.length === 0) return null;
  return <section aria-label="Selected files" className="chat-composer-surface mb-2 rounded-2xl border border-border bg-surface p-3 shadow-soft"><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{files.length} {files.length === 1 ? "file" : "files"} selected</p>{files.length > 1 && <button type="button" onClick={onRemoveAll} disabled={disabled} className="min-h-9 rounded-xl px-3 text-xs font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50">Remove all</button>}</div><div className="max-h-48 space-y-2 overflow-y-auto pr-1">{files.map((file) => <div key={file.localId} className="flex min-w-0 items-center gap-3 rounded-xl bg-background px-3 py-2"><span className="chat-accent-control flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><FileIcon /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-heading">{file.originalName}</span><span className="block text-xs text-muted">{getFriendlyFileType(file.originalName, file.mimeType)} · {formatFileSize(file.size)}</span></span><button type="button" onClick={() => onRemove(file.localId)} disabled={disabled} aria-label={`Remove ${file.originalName}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div>)}</div></section>;
}

export default ComposerFilePreview;
