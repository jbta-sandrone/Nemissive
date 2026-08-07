import type { ConversationActivityEvent } from "../../types/conversations";

function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m9 4 6 1-1 5 3 3-4 1-2 6-2-6-4-1 3-3 1-6Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ConversationActivityRow({ event, onActivate }: { event: ConversationActivityEvent; onActivate: (event: ConversationActivityEvent) => void }) {
  const text = `${event.actorName} pinned a message`;

  return (
    <div className="flex justify-center py-1">
      <button type="button" onClick={() => onActivate(event)} aria-label={`${text}. Jump to pinned message.`} className="inline-flex min-h-10 max-w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-center text-xs font-medium text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover active:scale-[0.985] motion-reduce:transition-none">
        <span className="shrink-0 text-primary"><PinIcon /></span>
        <span className="truncate">{text}</span>
      </button>
    </div>
  );
}

export default ConversationActivityRow;
