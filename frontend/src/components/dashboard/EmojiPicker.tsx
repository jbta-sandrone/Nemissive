import { useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import AnchoredPopover from "./AnchoredPopover";
import { emojiItems } from "./emojiData";

type EmojiPickerProps = {
  anchorRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  placement?: "top" | "bottom";
};

function EmojiPicker({ anchorRef, ariaLabel, onClose, onSelect, placement = "bottom" }: EmojiPickerProps) {
  const [query, setQuery] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredItems = useMemo(() => normalizedQuery ? emojiItems.filter((item) => `${item.label} ${item.keywords} ${item.category}`.toLocaleLowerCase().includes(normalizedQuery)) : emojiItems, [normalizedQuery]);
  const categories = useMemo(() => {
    const categoryMap = new Map<string, typeof filteredItems>();
    filteredItems.forEach((item) => categoryMap.set(item.category, [...(categoryMap.get(item.category) ?? []), item]));
    return [...categoryMap.entries()];
  }, [filteredItems]);

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const buttons = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>("[data-emoji-button]") ?? [])];
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0 || buttons.length === 0) return;

    event.preventDefault();
    const columns = 6;
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowLeft" ? Math.max(0, currentIndex - 1) : event.key === "ArrowRight" ? Math.min(buttons.length - 1, currentIndex + 1) : event.key === "ArrowUp" ? Math.max(0, currentIndex - columns) : Math.min(buttons.length - 1, currentIndex + columns);
    buttons[nextIndex]?.focus();
  }

  return (
    <AnchoredPopover anchorRef={anchorRef} ariaLabel={ariaLabel} onClose={onClose} placement={placement} panelClassName="w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-3xl border border-border bg-surface shadow-soft">
      <div className="border-b border-border p-3"><label htmlFor={searchId} className="sr-only">Search emojis</label><div className="flex items-center gap-2 rounded-2xl bg-background px-3 focus-within:ring-2 focus-within:ring-primary/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-muted" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" strokeLinecap="round" /></svg><input id={searchId} data-autofocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search emojis" className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-heading outline-none placeholder:text-muted" /><button type="button" onClick={onClose} aria-label="Close emoji picker" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" strokeLinecap="round" /></svg></button></div></div>
      <div ref={gridRef} onKeyDown={handleGridKeyDown} className="max-h-[min(21rem,calc(100vh-8rem))] overflow-y-auto overflow-x-hidden p-3">
        {categories.length > 0 ? categories.map(([category, items]) => <section key={category} className="mb-3 last:mb-0"><h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{category}</h2><div className="grid grid-cols-6 justify-items-center gap-1">{items.map((item) => <button key={`${category}-${item.emoji}`} data-emoji-button type="button" onClick={() => { onSelect(item.emoji); onClose(); }} aria-label={item.label} title={item.label} className="flex h-10 w-10 items-center justify-center rounded-xl text-xl transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">{item.emoji}</button>)}</div></section>) : <p className="px-3 py-8 text-center text-sm text-muted">No matching emojis.</p>}
      </div>
    </AnchoredPopover>
  );
}

export default EmojiPicker;
