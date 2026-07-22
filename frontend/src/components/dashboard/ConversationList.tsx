type ConversationListProps = {
  onOpenPeople: () => void;
};

function ConversationList({ onOpenPeople }: ConversationListProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">Conversations</p>
      <div className="rounded-3xl border border-border bg-background px-5 py-8 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M4 5.5h16v11H8l-4 3v-14Z" strokeLinejoin="round" /><path d="M8 10h8M8 13h5" strokeLinecap="round" /></svg></div><h2 className="mt-4 font-semibold text-heading">Conversation history is coming next</h2><p className="mt-2 text-sm leading-6 text-body">Accepted conversations can be reopened from People for now.</p><button type="button" onClick={onOpenPeople} className="mt-4 inline-flex min-h-10 items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover">Open People</button></div>
    </div>
  );
}

export default ConversationList;
