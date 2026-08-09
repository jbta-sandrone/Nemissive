import { useState } from "react";
import type { MessageAttachment, OptimisticMessageAttachment } from "../../types/conversations";
import { createSignedMessageAttachmentUrl } from "./useSignedMessageMedia";
import { formatFileSize, getFriendlyFileType } from "./fileAttachments";

function FileMessageCard({ attachments, isOutgoing, isOptimistic = false }: { attachments: Array<MessageAttachment | OptimisticMessageAttachment>; isOutgoing: boolean; isOptimistic?: boolean }) {
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [errorPath, setErrorPath] = useState<string | null>(null);

  if (attachments.length === 0) return <div role="status" className={`min-w-48 rounded-2xl px-3 py-4 text-center text-xs ${isOutgoing ? "bg-white/10 text-white/75" : "bg-background text-muted"}`}>Loading files…</div>;

  async function openAttachment(attachment: MessageAttachment | OptimisticMessageAttachment) {
    if (pendingPath) return;
    setPendingPath(attachment.storagePath);
    setErrorPath(null);
    try {
      const url = isOptimistic && "previewUrl" in attachment ? attachment.previewUrl : await createSignedMessageAttachmentUrl(attachment.storagePath);
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.download = attachment.originalName;
      link.click();
    } catch {
      setErrorPath(attachment.storagePath);
    } finally {
      setPendingPath(null);
    }
  }

  return <div className="space-y-2" aria-label={`${attachments.length} attached ${attachments.length === 1 ? "file" : "files"}`}>{attachments.map((attachment) => <div key={attachment.id} className={`chat-file-card min-w-0 rounded-2xl border p-3 ${isOutgoing ? "border-white/25 bg-background/10" : "border-border bg-background"}`}><div className="flex min-w-0 items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isOutgoing ? "bg-white/15 text-white" : "bg-accent text-primary"}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Z" strokeLinejoin="round" /><path d="M14 3v5h5M9 13h6m-6 3h5" strokeLinecap="round" /></svg></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{attachment.originalName}</span><span className={`block text-xs ${isOutgoing ? "text-white/75" : "text-muted"}`}>{getFriendlyFileType(attachment.originalName, attachment.mimeType)} · {formatFileSize(attachment.size)}</span></span><button type="button" onClick={() => void openAttachment(attachment)} disabled={Boolean(pendingPath)} aria-label={`Download ${attachment.originalName}`} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 ${isOutgoing ? "bg-white/15 text-white hover:bg-white/25" : "bg-accent text-primary hover:bg-card"}`}>{pendingPath === attachment.storagePath ? "Opening…" : "Download"}</button></div>{errorPath === attachment.storagePath && <p role="alert" className={`mt-2 text-xs ${isOutgoing ? "text-white" : "text-primary"}`}>This file couldn’t be opened. Try again.</p>}</div>)}</div>;
}

export default FileMessageCard;
