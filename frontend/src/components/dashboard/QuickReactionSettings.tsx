import { useRef, useState } from "react";
import EmojiPicker from "./EmojiPicker";
import { defaultQuickReactions } from "./emojiData";

type QuickReactionSettingsProps = {
  quickReactions: string[];
  onSave: (reactions: string[]) => Promise<boolean>;
};

function MoveIcon({ direction }: { direction: "left" | "right" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d={direction === "left" ? "m15 18-6-6 6-6" : "m9 6 6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function QuickReactionSettings({ quickReactions, onSave }: QuickReactionSettingsProps) {
  const [draftReactions, setDraftReactions] = useState(() => [...quickReactions]);
  const [savedReactions, setSavedReactions] = useState(() => [...quickReactions]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const pickerAnchorRef = useRef<HTMLElement | null>(null);
  const hasChanges = draftReactions.join("\u0000") !== savedReactions.join("\u0000");

  function openReplacement(index: number, trigger: HTMLButtonElement) {
    pickerAnchorRef.current = trigger;
    setSelectedIndex(index);
    setErrorMessage("");
    setStatusMessage("");
  }

  function replaceReaction(emoji: string) {
    if (selectedIndex === null) return;
    if (draftReactions.some((reaction, index) => reaction === emoji && index !== selectedIndex)) {
      setErrorMessage("Choose an emoji that is not already in your quick reactions.");
      return;
    }
    setDraftReactions((current) => current.map((reaction, index) => index === selectedIndex ? emoji : reaction));
    setSelectedIndex(null);
  }

  function moveReaction(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draftReactions.length) return;
    setDraftReactions((current) => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
    setErrorMessage("");
    setStatusMessage("");
  }

  async function saveChanges() {
    if (!hasChanges || isSaving) return;
    setIsSaving(true);
    setErrorMessage("");
    setStatusMessage("");
    const didSave = await onSave(draftReactions);
    setIsSaving(false);
    if (didSave) {
      setSavedReactions([...draftReactions]);
      setStatusMessage("Quick reactions saved.");
    }
    else setErrorMessage("We couldn’t save your quick reactions. Please try again.");
  }

  return (
    <section aria-labelledby="quick-reactions-heading" className="mt-5 rounded-3xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 id="quick-reactions-heading" className="font-semibold text-heading">Quick reactions</h2><p className="mt-1 text-xs leading-5 text-body">Choose the emojis shown beside messages.</p></div><button type="button" onClick={() => { setDraftReactions([...defaultQuickReactions]); setErrorMessage(""); setStatusMessage(""); }} disabled={isSaving} className="shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60">Reset</button></div>
      <ol className="mt-4 space-y-2">{draftReactions.map((emoji, index) => <li key={`${index}-${emoji}`} className="flex min-w-0 items-center gap-2"><span className="w-5 shrink-0 text-center text-xs font-medium text-muted">{index + 1}</span><button type="button" onClick={(event) => openReplacement(index, event.currentTarget)} disabled={isSaving} aria-label={`Replace quick reaction ${index + 1}, ${emoji}`} className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-2xl border border-border bg-surface text-xl transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60">{emoji}</button><button type="button" onClick={() => moveReaction(index, -1)} disabled={index === 0 || isSaving} aria-label={`Move ${emoji} left`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-30"><MoveIcon direction="left" /></button><button type="button" onClick={() => moveReaction(index, 1)} disabled={index === draftReactions.length - 1 || isSaving} aria-label={`Move ${emoji} right`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-30"><MoveIcon direction="right" /></button></li>)}</ol>
      {errorMessage && <p role="alert" className="mt-3 text-xs leading-5 text-primary">{errorMessage}</p>}
      {statusMessage && <p role="status" className="mt-3 text-xs leading-5 text-body">{statusMessage}</p>}
      <button type="button" onClick={() => void saveChanges()} disabled={!hasChanges || isSaving} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Saving..." : "Save quick reactions"}</button>
      {selectedIndex !== null && <EmojiPicker anchorRef={pickerAnchorRef} ariaLabel={`Replace quick reaction ${selectedIndex + 1}`} onSelect={replaceReaction} onClose={() => setSelectedIndex(null)} placement="bottom" />}
    </section>
  );
}

export default QuickReactionSettings;
