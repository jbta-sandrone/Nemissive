import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AcceptedConversationItem } from "../../types/conversations";
import Pulse from "./Pulse";

type MobilePulseDrawerProps = {
  conversations: AcceptedConversationItem[];
  onConversationSelect: (conversation: AcceptedConversationItem) => void;
  onOpenChange: (isOpen: boolean) => void;
};

type TouchGesture = {
  mode: "opening" | "closing";
  startX: number;
  startY: number;
  lastX: number;
  isHorizontal: boolean;
};

const drawerWidth = 96;
const edgeGestureWidth = 28;
const settleThreshold = 34;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function MobilePulseDrawer({ conversations, onConversationSelect, onOpenChange }: MobilePulseDrawerProps) {
  const shouldReduceMotion = useReducedMotion();
  const drawerRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const gestureRef = useRef<TouchGesture | null>(null);
  const suppressHandleClickRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);

  const settledX = isOpen ? 0 : -drawerWidth;
  const drawerX = dragX ?? settledX;
  const openProgress = clamp((drawerX + drawerWidth) / drawerWidth, 0, 1);
  const transition = shouldReduceMotion || dragX !== null ? "none" : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
  const drawerStyle = useMemo(() => ({
    transform: `translate3d(${drawerX}px, 0, 0)`,
    transition,
    width: `${drawerWidth}px`,
  }) as CSSProperties, [drawerX, transition]);
  const handleStyle = useMemo(() => ({
    transform: `translate3d(${drawerX + drawerWidth}px, -50%, 0)`,
    transition,
  }) as CSSProperties, [drawerX, transition]);

  useEffect(() => {
    onOpenChange(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => () => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !isOpen) return;
      event.preventDefault();
      setDragX(null);
      setIsOpen(false);
      window.requestAnimationFrame(() => handleRef.current?.focus());
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    function detachActiveGestureListeners() {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", finishTouchGesture);
      document.removeEventListener("touchcancel", finishTouchGesture);
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const target = event.target;
      const startsAtEdge = !isOpen && touch.clientX <= edgeGestureWidth;
      const startsInDrawer = isOpen && target instanceof Node && Boolean(drawerRef.current?.contains(target));
      if (!startsAtEdge && !startsInDrawer) return;
      gestureRef.current = {
        mode: startsAtEdge ? "opening" : "closing",
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        isHorizontal: false,
      };
      document.addEventListener("touchmove", handleTouchMove, { passive: false });
      document.addEventListener("touchend", finishTouchGesture, { passive: true });
      document.addEventListener("touchcancel", finishTouchGesture, { passive: true });
    }

    function handleTouchMove(event: TouchEvent) {
      const gesture = gestureRef.current;
      if (!gesture || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      gesture.lastX = touch.clientX;

      if (!gesture.isHorizontal) {
        if (Math.abs(deltaY) > 10 && Math.abs(deltaY) >= Math.abs(deltaX)) {
          gestureRef.current = null;
          return;
        }
        if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY) + 4) return;
        gesture.isHorizontal = true;
      }

      event.preventDefault();
      const nextX = gesture.mode === "opening"
        ? clamp(-drawerWidth + Math.max(0, deltaX), -drawerWidth, 0)
        : clamp(Math.min(0, deltaX), -drawerWidth, 0);
      setDragX(nextX);
    }

    function finishTouchGesture() {
      const gesture = gestureRef.current;
      detachActiveGestureListeners();
      if (!gesture) return;
      const distance = gesture.lastX - gesture.startX;
      if (gesture.isHorizontal) {
        suppressHandleClickRef.current = true;
        window.setTimeout(() => { suppressHandleClickRef.current = false; }, 0);
        if (gesture.mode === "opening") setIsOpen(distance >= settleThreshold);
        else setIsOpen(!(distance <= -settleThreshold));
      }
      setDragX(null);
      gestureRef.current = null;
    }

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      detachActiveGestureListeners();
    };
  }, [isOpen]);

  if (typeof document === "undefined") return null;

  function toggleDrawer() {
    if (suppressHandleClickRef.current) return;
    setDragX(null);
    setIsOpen((current) => !current);
  }

  function openConversation(conversation: AcceptedConversationItem) {
    setDragX(null);
    setIsOpen(false);
    onConversationSelect(conversation);
  }

  return createPortal(
    <div className="md:hidden">
      {(isOpen || dragX !== null) && <div aria-hidden="true" onPointerDown={() => { setDragX(null); setIsOpen(false); window.requestAnimationFrame(() => handleRef.current?.focus()); }} style={{ opacity: openProgress }} className="fixed inset-0 z-[40] bg-heading/10 backdrop-blur-[1px]" />}
      <button
        ref={handleRef}
        type="button"
        onClick={toggleDrawer}
        aria-label={isOpen ? "Close Pulse" : "Open Pulse"}
        aria-controls="mobile-pulse-drawer"
        aria-expanded={isOpen}
        style={handleStyle}
        className="fixed left-0 top-1/2 z-[42] flex h-16 w-8 items-center justify-start focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"
      >
        <span className={`flex h-14 items-center justify-center rounded-r-xl border border-l-0 border-border bg-surface text-primary shadow-soft transition-[width] motion-reduce:transition-none ${isOpen ? "w-7" : "w-2.5"}`} aria-hidden="true">
          {isOpen && <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m12 5-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </span>
      </button>
      <aside
        ref={drawerRef}
        id="mobile-pulse-drawer"
        aria-label="Pulse"
        aria-hidden={!isOpen}
        style={drawerStyle}
        className="fixed inset-y-0 left-0 z-[41] h-dvh touch-pan-y overflow-hidden border-r border-border bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-soft"
      >
        {(isOpen || dragX !== null) && <Pulse variant="mobile" conversations={conversations} onConversationSelect={openConversation} />}
      </aside>
    </div>,
    document.body,
  );
}

export default MobilePulseDrawer;
