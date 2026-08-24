import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

type MessageMoreMenuProps = {
  anchorRef: RefObject<HTMLElement | null>;
  canCopy: boolean;
  canDelete: boolean;
  canEdit: boolean;
  canForward: boolean;
  canSave: boolean;
  canPin: boolean;
  disabled: boolean;
  forwardUnavailableReason?: string;
  isPinned: boolean;
  isPinPending: boolean;
  messageLabel: string;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onForward: () => void;
  onSave: () => void;
  onPin: () => void;
};

type IconKind = "copy" | "forward" | "save" | "pin" | "edit" | "delete";

function ActionIcon({ kind, filled = false }: { kind: IconKind; filled?: boolean }) {
  const paths: Record<IconKind, string> = {
    copy: "M9 8h10v11H9V8Zm-4 8V5h10",
    forward: "m14 7 5 5-5 5M19 12H9a5 5 0 0 0-5 5",
    save: "M12 4v11m0 0-4-4m4 4 4-4M5 18v2h14v-2",
    pin: "m8 4 8 0-1 5 3 3v2H6v-2l3-3-1-5ZM12 14v6",
    edit: "m5 15.5-.8 4.3 4.3-.8L18 9.5 14.5 6 5 15.5Zm7.8-7.8 3.5 3.5",
    delete: "M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5",
  };
  return <svg viewBox="0 0 24 24" fill={kind === "pin" && filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d={paths[kind]} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function MessageMoreMenu({ anchorRef, canCopy, canDelete, canEdit, canForward, canSave, canPin, disabled, forwardUnavailableReason, isPinned, isPinPending, messageLabel, onClose, onCopy, onDelete, onEdit, onForward, onSave, onPin }: MessageMoreMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const shouldRestoreFocusRef = useRef(true);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    function positionMenu() {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const margin = 10;
      const gap = 8;
      const anchorBounds = anchor.getBoundingClientRect();
      const menuBounds = menu.getBoundingClientRect();
      const roomBelow = window.innerHeight - anchorBounds.bottom - gap - margin;
      const roomAbove = anchorBounds.top - gap - margin;
      const opensAbove = roomBelow < menuBounds.height && roomAbove > roomBelow;
      const top = opensAbove ? anchorBounds.top - menuBounds.height - gap : anchorBounds.bottom + gap;
      const preferredLeft = anchorBounds.left + anchorBounds.width / 2 - menuBounds.width / 2;
      menu.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - menuBounds.height - margin))}px`;
      menu.style.left = `${Math.max(margin, Math.min(preferredLeft, window.innerWidth - menuBounds.width - margin))}px`;
      menu.style.opacity = "1";
    }
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const items = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
    function closeWithoutRestoring() { shouldRestoreFocusRef.current = false; onCloseRef.current(); }
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      closeWithoutRestoring();
    }
    function handleKeyDown(event: KeyboardEvent) {
      const available = items();
      const currentIndex = available.findIndex((item) => item === document.activeElement);
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key === "Tab") { closeWithoutRestoring(); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || available.length === 0) return;
      event.preventDefault();
      if (event.key === "Home") available[0]?.focus();
      else if (event.key === "End") available.at(-1)?.focus();
      else if (event.key === "ArrowDown") available[(currentIndex + 1 + available.length) % available.length]?.focus();
      else available[(currentIndex - 1 + available.length) % available.length]?.focus();
    }
    const frame = window.requestAnimationFrame(() => items()[0]?.focus());
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      if (shouldRestoreFocusRef.current) window.requestAnimationFrame(() => anchor?.isConnected && anchor.focus());
    };
  }, [anchorRef]);

  function run(action: () => void, restoreFocus = false) {
    shouldRestoreFocusRef.current = restoreFocus;
    onClose();
    action();
  }

  const itemClass = "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";
  return createPortal(
    <div ref={menuRef} role="menu" aria-label={`More actions for ${messageLabel}`} className="fixed left-2 top-2 z-[70] min-w-52 rounded-2xl border border-border bg-surface p-1.5 opacity-0 shadow-soft">
      {canCopy && <button type="button" role="menuitem" onClick={() => run(onCopy, true)} className={itemClass}><span className="text-muted"><ActionIcon kind="copy" /></span>Copy</button>}
      <button type="button" role="menuitem" onClick={() => run(onForward)} disabled={!canForward || disabled} aria-describedby={!canForward && forwardUnavailableReason ? "forward-unavailable-reason" : undefined} className={itemClass}><span className="text-muted"><ActionIcon kind="forward" /></span><span><span className="block">Forward</span>{!canForward && forwardUnavailableReason && <span id="forward-unavailable-reason" className="block text-[11px] font-medium text-muted">{forwardUnavailableReason}</span>}</span></button>
      {canSave && <button type="button" role="menuitem" onClick={() => run(onSave)} disabled={disabled} className={itemClass}><span className="text-muted"><ActionIcon kind="save" /></span>Save</button>}
      {canPin && <button type="button" role="menuitem" onClick={() => run(onPin, true)} disabled={isPinPending} aria-pressed={isPinned} className={itemClass}><span className="text-muted"><ActionIcon kind="pin" filled={isPinned} /></span>{isPinned ? "Unpin message" : "Pin message"}</button>}
      {canEdit && <button type="button" role="menuitem" onClick={() => run(onEdit)} disabled={disabled} className={itemClass}><span className="text-muted"><ActionIcon kind="edit" /></span>Edit</button>}
      {canDelete && <button type="button" role="menuitem" onClick={() => run(onDelete)} disabled={disabled} className={`${itemClass} text-primary`}><span><ActionIcon kind="delete" /></span>Delete</button>}
    </div>,
    document.body,
  );
}

export default MessageMoreMenu;
