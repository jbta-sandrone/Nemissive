import { useRef, useState } from "react";
import AnchoredPopover from "./AnchoredPopover";

type ConversationPinMenuProps = {
  conversationName: string;
  isPinned: boolean;
  onChange: (pinned: boolean) => Promise<string | null>;
};

function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="m9 4 6 0-.5 5 3 3v1H13v6l-1 2-1-2v-6H6.5v-1l3-3L9 4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ConversationPinMenu({ conversationName, isPinned, onChange }: ConversationPinMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function updatePinned() {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    const nextError = await onChange(!isPinned);
    setIsSaving(false);
    if (nextError) {
      setError(nextError);
      return;
    }
    setIsOpen(false);
  }

  return (
    <>
      <button ref={triggerRef} type="button" aria-label={`Conversation options for ${conversationName}`} title="Conversation options" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => { setError(""); setIsOpen((open) => !open); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button>
      {isOpen && <AnchoredPopover anchorRef={triggerRef} ariaLabel={`Conversation options for ${conversationName}`} placement="bottom" onClose={() => setIsOpen(false)} panelClassName="w-[min(18rem,calc(100vw-1rem))] rounded-2xl border border-border bg-surface p-2 shadow-soft"><div role="menu"><button type="button" role="menuitem" data-autofocus onClick={() => void updatePinned()} disabled={isSaving} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent text-primary"><PinIcon /></span><span>{isPinned ? "Unpin conversation" : "Pin conversation"}</span></button></div>{isSaving && <p role="status" aria-live="polite" className="px-3 py-2 text-xs text-muted">Saving…</p>}{error && <p role="alert" className="mt-1 rounded-xl bg-accent px-3 py-2 text-xs leading-5 text-body">{error}</p>}</AnchoredPopover>}
    </>
  );
}

export default ConversationPinMenu;
