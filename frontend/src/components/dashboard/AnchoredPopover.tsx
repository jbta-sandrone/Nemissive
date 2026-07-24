import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type AnchoredPopoverProps = {
  anchorRef: RefObject<HTMLElement | null>;
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  placement?: "top" | "bottom";
  panelClassName: string;
};

function AnchoredPopover({ anchorRef, ariaLabel, children, onClose, placement = "bottom", panelClassName }: AnchoredPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const shouldRestoreFocusRef = useRef(true);

  useLayoutEffect(() => {
    function updatePosition() {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;

      const margin = 8;
      const gap = 8;
      const anchorBounds = anchor.getBoundingClientRect();
      const panelBounds = panel.getBoundingClientRect();
      const availableAbove = anchorBounds.top - gap - margin;
      const availableBelow = window.innerHeight - anchorBounds.bottom - gap - margin;
      const shouldPlaceAbove = placement === "top" ? availableAbove >= Math.min(panelBounds.height, availableBelow) : availableBelow < panelBounds.height && availableAbove > availableBelow;
      const top = shouldPlaceAbove ? Math.max(margin, anchorBounds.top - panelBounds.height - gap) : Math.min(window.innerHeight - panelBounds.height - margin, anchorBounds.bottom + gap);
      const left = Math.min(Math.max(margin, anchorBounds.left + anchorBounds.width / 2 - panelBounds.width / 2), window.innerWidth - panelBounds.width - margin);

      panel.style.left = `${left}px`;
      panel.style.top = `${Math.max(margin, top)}px`;
      panel.style.opacity = "1";
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, placement]);

  useEffect(() => {
    const anchor = anchorRef.current;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      shouldRestoreFocusRef.current = false;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusableElements = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (focusableElements.length === 0) return;
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }

    const focusFrame = window.requestAnimationFrame(() => {
      const focusTarget = panelRef.current?.querySelector<HTMLElement>("[data-autofocus], button:not([disabled]), input:not([disabled])");
      focusTarget?.focus();
    });
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      if (shouldRestoreFocusRef.current) window.requestAnimationFrame(() => anchor?.focus());
    };
  }, [anchorRef, onClose]);

  return createPortal(<div ref={panelRef} role="dialog" aria-label={ariaLabel} className={`fixed left-2 top-2 z-[70] opacity-0 ${panelClassName}`}>{children}</div>, document.body);
}

export default AnchoredPopover;
