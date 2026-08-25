import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { ProfileSearchResult } from "../../types/conversations";
import AccountPlanBadge from "./AccountPlanBadge";
import type { AccountPlan } from "./premiumAccess";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

export type PersonalSurface = "profile" | "notifications" | "quick-reactions" | "settings";

type AccountMenuPopoverProps = {
  profile: ProfileSearchResult | null;
  accountPlan: AccountPlan;
  variant: "rail" | "dock";
  isAvailable: boolean;
  isSigningOut: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenElite: (trigger: HTMLButtonElement) => void;
  onOpenSurface: (surface: PersonalSurface, trigger: HTMLButtonElement) => void;
  onRequestSignOut: (trigger: HTMLButtonElement) => void;
};

const menuItems: Array<{ surface: PersonalSurface; label: string }> = [
  { surface: "profile", label: "Profile" },
  { surface: "notifications", label: "Notifications" },
  { surface: "quick-reactions", label: "Quick reactions" },
  { surface: "settings", label: "Settings" },
];

function AccountIcon({ kind }: { kind: PersonalSurface | "elite" | "signout" }) {
  const iconClass = "h-5 w-5";
  if (kind === "elite") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={iconClass} aria-hidden="true"><path d="m12 3.5 7 5-2.7 8.2L12 20.5l-4.3-3.8L5 8.5l7-5Z" strokeLinejoin="round" /><path d="m5 8.5 7 3 7-3M12 11.5v9" strokeLinejoin="round" /></svg>;
  if (kind === "profile") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" /></svg>;
  if (kind === "notifications") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 5 2 5.5 2 7H4.5c0-1.5 2-2 2-7Z" strokeLinejoin="round" /><path d="M9.5 19a3 3 0 0 0 5 0" strokeLinecap="round" /></svg>;
  if (kind === "quick-reactions") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M8.5 10h.01M15.5 10h.01M8.5 14.5c1.9 1.7 5.1 1.7 7 0" strokeLinecap="round" /></svg>;
  if (kind === "settings") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M9 4v6M8 14v6" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function AccountMenuPopover({ profile, accountPlan, variant, isAvailable, isSigningOut, onOpenChange, onOpenElite, onOpenSurface, onRequestSignOut }: AccountMenuPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const closeMenu = useCallback((restoreFocus = true) => {
    setIsOpen(false);
    onOpenChange?.(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [onOpenChange]);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !menuRef.current) return;
    function updatePosition() {
      if (!triggerRef.current || !menuRef.current) return;
      const gap = 10;
      const edge = 12;
      const triggerBounds = triggerRef.current.getBoundingClientRect();
      const menuBounds = menuRef.current.getBoundingClientRect();
      const preferredLeft = variant === "rail" ? triggerBounds.right + gap : triggerBounds.left + (triggerBounds.width - menuBounds.width) / 2;
      const preferredTop = variant === "rail" ? triggerBounds.top : triggerBounds.top - menuBounds.height - gap;
      setPosition({
        left: Math.max(edge, Math.min(preferredLeft, window.innerWidth - menuBounds.width - edge)),
        top: Math.max(edge, Math.min(preferredTop, window.innerHeight - menuBounds.height - edge)),
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    const focusFrame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, variant]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) closeMenu();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, isOpen]);

  useEffect(() => {
    if (isAvailable || !isOpen) return;
    const frame = window.requestAnimationFrame(() => closeMenu(false));
    return () => window.cancelAnimationFrame(frame);
  }, [closeMenu, isAvailable, isOpen]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])')];
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function openSurface(surface: PersonalSurface) {
    if (!triggerRef.current) return;
    const trigger = triggerRef.current;
    closeMenu(false);
    onOpenSurface(surface, trigger);
  }

  function openElite() {
    if (!triggerRef.current) return;
    const trigger = triggerRef.current;
    closeMenu(false);
    onOpenElite(trigger);
  }

  function requestSignOut() {
    if (!triggerRef.current) return;
    const trigger = triggerRef.current;
    closeMenu(false);
    onRequestSignOut(trigger);
  }

  return (
    <>
      <button ref={triggerRef} type="button" disabled={!profile} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={isOpen} onClick={() => setIsOpen((open) => { const next = !open; onOpenChange?.(next); return next; })} className={`${variant === "rail" ? "h-12 w-12" : "h-11 w-11"} flex items-center justify-center rounded-2xl border border-transparent transition hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60`}>
        {profile ? <span className="relative inline-flex"><ProfileAvatar profile={profile} size="sm" accessibleLabel="Your profile photo" /><AccountPlanBadge plan={accountPlan} size="compact" className="pointer-events-none absolute -bottom-1 -right-4 z-10" /></span> : <span className="h-10 w-10 animate-pulse rounded-full bg-accent" aria-hidden="true" />}
      </button>
      {isAvailable && isOpen && profile && createPortal(
        <div ref={menuRef} role="menu" aria-label="Account menu" onKeyDown={handleMenuKeyDown} style={position ?? { left: 0, top: 0, visibility: "hidden" }} className="fixed z-[90] w-[min(18rem,calc(100vw-1.5rem))] rounded-3xl border border-border bg-surface p-2 shadow-soft">
          <div className="flex min-w-0 items-center gap-3 px-3 py-3"><ProfileAvatar profile={profile} size="sm" accessibleLabel="Your profile photo" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-heading">{getProfileDisplayName(profile)}</p><p className="mt-0.5 truncate text-xs text-body">{profile.username ? `@${profile.username}` : "Nemissive member"}</p></div><AccountPlanBadge plan={accountPlan} size="compact" className="shrink-0" /></div>
          <div className="my-1 border-t border-border" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={openElite} className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-accent/70 px-3 py-2.5 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-hover"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary"><AccountIcon kind="elite" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-heading">Nemissive Elite</span><span className="mt-0.5 block text-xs text-body">Explore what&apos;s coming</span></span></button>
          <div className="my-1 border-t border-border" aria-hidden="true" />
          {menuItems.map((item) => <button key={item.surface} type="button" role="menuitem" onClick={() => openSurface(item.surface)} className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-hover"><span className="text-primary"><AccountIcon kind={item.surface} /></span><span>{item.label}</span></button>)}
          <div className="my-1 border-t border-border" aria-hidden="true" />
          <button type="button" role="menuitem" disabled={isSigningOut} onClick={requestSignOut} className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-body transition hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60"><span className="text-primary"><AccountIcon kind="signout" /></span><span>{isSigningOut ? "Signing out…" : "Sign out"}</span></button>
        </div>,
        document.body,
      )}
    </>
  );
}

export default AccountMenuPopover;
