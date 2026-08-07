import { useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import AnchoredPopover from "./AnchoredPopover";
import ConversationDeleteDialog from "./ConversationDeleteDialog";

type ConversationPinMenuProps = {
  conversationName: string;
  isPinned: boolean;
  isArchived: boolean;
  onPinnedChange: (pinned: boolean) => Promise<string | null>;
  onArchivedChange: (archived: boolean) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
};

function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m9 4 6 0-.5 5 3 3v1H13v6l-1 2-1-2v-6H6.5v-1l3-3L9 4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ArchiveIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M5 8.5h14v10H5v-10Z" strokeLinejoin="round" /><path d="M4 5h16v3.5H4V5Zm5 7h6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function DeleteIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ConversationPinMenu({ conversationName, isPinned, isArchived, onPinnedChange, onArchivedChange, onDelete }: ConversationPinMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function saveChange(change: () => Promise<string | null>) {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    const nextError = await change();
    setIsSaving(false);
    if (nextError) {
      setError(nextError);
      return;
    }
    setIsOpen(false);
  }

  async function confirmDelete() {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError("");
    const nextError = await onDelete();
    setIsDeleting(false);
    if (nextError) {
      setDeleteError(nextError);
      return;
    }
    setIsDeleteDialogOpen(false);
  }

  return (
    <>
      <button ref={triggerRef} type="button" aria-label={`Conversation options for ${conversationName}`} title="Conversation options" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => { setError(""); setIsOpen((open) => !open); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>
      {isOpen && <AnchoredPopover anchorRef={triggerRef} ariaLabel={`Conversation options for ${conversationName}`} placement="bottom" onClose={() => setIsOpen(false)} panelClassName="w-[min(18rem,calc(100vw-1rem))] rounded-2xl border border-border bg-surface p-2 shadow-soft"><div role="menu" className="space-y-1">{!isArchived && <button type="button" role="menuitem" data-autofocus onClick={() => void saveChange(() => onPinnedChange(!isPinned))} disabled={isSaving} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-primary"><PinIcon /></span><span>{isPinned ? "Unpin conversation" : "Pin conversation"}</span></button>}<button type="button" role="menuitem" data-autofocus={isArchived || undefined} onClick={() => void saveChange(() => onArchivedChange(!isArchived))} disabled={isSaving} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-primary"><ArchiveIcon /></span><span>{isArchived ? "Unarchive conversation" : "Archive conversation"}</span></button><div className="my-1 border-t border-border" role="separator" /><button type="button" role="menuitem" aria-label={`Delete chat with ${conversationName}`} onClick={() => { setIsOpen(false); setDeleteError(""); setIsDeleteDialogOpen(true); }} disabled={isSaving} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-primary"><DeleteIcon /></span><span>Delete chat</span></button></div>{isSaving && <p role="status" aria-live="polite" className="px-3 py-2 text-xs text-muted">Saving…</p>}{error && <p role="alert" className="mt-1 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{error}</p>}</AnchoredPopover>}
      <AnimatePresence>{isDeleteDialogOpen && <ConversationDeleteDialog conversationName={conversationName} error={deleteError} isDeleting={isDeleting} returnFocusRef={triggerRef} onCancel={() => { if (!isDeleting) setIsDeleteDialogOpen(false); }} onConfirm={() => void confirmDelete()} />}</AnimatePresence>
    </>
  );
}

export default ConversationPinMenu;
