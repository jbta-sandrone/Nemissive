type MessageActionsToolbarProps = {
  canDelete: boolean;
  canEdit: boolean;
  canPin: boolean;
  disabled: boolean;
  isPinned: boolean;
  isPinPending: boolean;
  isOutgoing: boolean;
  replyLabel: string;
  onDelete: (button: HTMLButtonElement) => void;
  onEdit: (button: HTMLButtonElement) => void;
  onPin: () => void;
  onReact: (button: HTMLButtonElement) => void;
  onReply: () => void;
};

function ReplyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m10 8-5 4 5 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 12h6.5c3.6 0 5.5 1.8 5.5 5" strokeLinecap="round" /></svg>;
}

function ReactionIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M9 10h.01M15 10h.01M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function EditIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m5 15.5-.8 4.3 4.3-.8L18 9.5 14.5 6 5 15.5Z" strokeLinecap="round" strokeLinejoin="round" /><path d="m12.8 7.7 3.5 3.5" strokeLinecap="round" /></svg>;
}

function DeleteIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PinIcon({ filled }: { filled: boolean }) {
  return <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m8 4 8 0-1 5 3 3v2H6v-2l3-3-1-5Z" strokeLinejoin="round" /><path d="M12 14v6" strokeLinecap="round" /></svg>;
}

function MessageActionsToolbar({ canDelete, canEdit, canPin, disabled, isOutgoing, isPinned, isPinPending, replyLabel, onDelete, onEdit, onPin, onReact, onReply }: MessageActionsToolbarProps) {
  return (
    <div className={`absolute top-1/2 z-20 hidden -translate-y-1/2 items-center gap-0.5 rounded-2xl border border-border bg-surface p-1 shadow-soft transition-opacity duration-150 motion-reduce:transition-none md:flex md:opacity-0 md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100 ${isOutgoing ? "right-full mr-2" : "left-full ml-2"}`}>
      <button type="button" onClick={(event) => { event.stopPropagation(); onReply(); }} aria-label={replyLabel} title="Reply" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><ReplyIcon /></button>
      <button type="button" onClick={(event) => { event.stopPropagation(); onReact(event.currentTarget); }} aria-label="React to this message" title="React" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><ReactionIcon /></button>
      {canPin && <button type="button" onClick={(event) => { event.stopPropagation(); onPin(); }} disabled={isPinPending} aria-label={isPinned ? "Unpin this message" : "Pin this message"} title={isPinned ? "Unpin" : "Pin"} aria-pressed={isPinned} className={`flex h-9 w-9 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-50 ${isPinned ? "bg-accent text-primary" : "text-muted hover:bg-accent hover:text-heading"}`}><PinIcon filled={isPinned} /></button>}
      {canEdit && <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(event.currentTarget); }} disabled={disabled} aria-label="Edit your message" title="Edit" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-50"><EditIcon /></button>}
      {canDelete && <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(event.currentTarget); }} disabled={disabled} aria-label="Delete your message" title="Delete" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-50"><DeleteIcon /></button>}
    </div>
  );
}

export default MessageActionsToolbar;
