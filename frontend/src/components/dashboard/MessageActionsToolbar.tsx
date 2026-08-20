type MessageActionsToolbarProps = {
  canInteract: boolean;
  isMoreOpen: boolean;
  isOutgoing: boolean;
  replyLabel: string;
  onMore: (button: HTMLButtonElement) => void;
  onReact: (button: HTMLButtonElement) => void;
  onReply: () => void;
};

function ReplyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m10 8-5 4 5 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 12h6.5c3.6 0 5.5 1.8 5.5 5" strokeLinecap="round" /></svg>;
}

function ReactionIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M9 10h.01M15 10h.01M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

function MessageActionsToolbar({ canInteract, isMoreOpen, isOutgoing, replyLabel, onMore, onReact, onReply }: MessageActionsToolbarProps) {
  const buttonClass = "chat-accent-control flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";
  return (
    <div className={`chat-message-actions absolute top-1/2 z-20 hidden -translate-y-1/2 items-center gap-0.5 rounded-2xl border border-border bg-surface p-1 shadow-soft transition-opacity duration-150 motion-reduce:transition-none md:flex md:opacity-0 md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100 ${isOutgoing ? "right-full mr-2" : "left-full ml-2"}`}>
      {canInteract && <button type="button" onClick={(event) => { event.stopPropagation(); onReact(event.currentTarget); }} aria-label="React to this message" title="React" className={buttonClass}><ReactionIcon /></button>}
      {canInteract && <button type="button" onClick={(event) => { event.stopPropagation(); onReply(); }} aria-label={replyLabel} title="Reply" className={buttonClass}><ReplyIcon /></button>}
      <button type="button" onClick={(event) => { event.stopPropagation(); onMore(event.currentTarget); }} aria-label="More message actions" title="More" aria-haspopup="menu" aria-expanded={isMoreOpen} className={buttonClass}><MoreIcon /></button>
    </div>
  );
}

export default MessageActionsToolbar;
