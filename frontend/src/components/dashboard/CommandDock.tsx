import { useEffect, useRef, useState } from "react";
import type { DashboardSection } from "../../types/dashboard";
import type { ProfileSearchResult } from "../../types/conversations";
import AccountMenuPopover, { type PersonalSurface } from "./AccountMenuPopover";
import type { AccountPlan } from "./premiumAccess";
import { DashboardDestinationButton, SearchNavigationButton } from "./DashboardNavigationControls";
import { workspaceDestinations } from "./dashboardNavigation";
import { UtilityShelfIcon } from "./UtilityShelf";

type CommandDockProps = {
  activeSection: DashboardSection;
  pendingRequestCount: number;
  unreadMessageCount: number;
  archivedConversationCount: number;
  currentProfile: ProfileSearchResult | null;
  accountPlan: AccountPlan;
  isAccountMenuAvailable: boolean;
  isSigningOut: boolean;
  isUtilityShelfOpen: boolean;
  hasGalleryUnread: boolean;
  onDestinationChange: (section: DashboardSection) => void;
  onOpenElite: (trigger: HTMLButtonElement) => void;
  onOpenPersonalSurface: (surface: PersonalSurface, trigger: HTMLButtonElement) => void;
  onRequestSignOut: (trigger: HTMLButtonElement) => void;
  onExitFocus: () => void;
  onSearch: (trigger: HTMLButtonElement) => void;
  onUtilityShelfToggle: (trigger: HTMLButtonElement) => void;
};

const dockIdleDelayMs = 3200;

function WorkspaceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /></svg>;
}

function CommandDock({ activeSection, pendingRequestCount, unreadMessageCount, archivedConversationCount, currentProfile, accountPlan, isAccountMenuAvailable, isSigningOut, isUtilityShelfOpen, hasGalleryUnread, onDestinationChange, onOpenElite, onOpenPersonalSurface, onRequestSignOut, onExitFocus, onSearch, onUtilityShelfToggle }: CommandDockProps) {
  const [expanded, setExpanded] = useState(true);
  const dockRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const isAccountMenuOpenRef = useRef(false);

  function clearIdleTimer() {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }

  function scheduleMinimize() {
    clearIdleTimer();
    if (isUtilityShelfOpen) return;
    idleTimerRef.current = window.setTimeout(() => {
      if (!isUtilityShelfOpen && !isAccountMenuOpenRef.current && !dockRef.current?.contains(document.activeElement) && !dockRef.current?.matches(":hover")) setExpanded(false);
    }, dockIdleDelayMs);
  }

  function reveal() {
    setExpanded(true);
    scheduleMinimize();
  }

  function revealFromKeyboard() {
    reveal();
    window.requestAnimationFrame(() => dockRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }

  useEffect(() => {
    idleTimerRef.current = window.setTimeout(() => {
      if (!isUtilityShelfOpen && !isAccountMenuOpenRef.current && !dockRef.current?.contains(document.activeElement) && !dockRef.current?.matches(":hover")) setExpanded(false);
    }, dockIdleDelayMs);
    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    };
  }, [isUtilityShelfOpen]);

  const sharedDestinationProps = { activeSection, pendingRequestCount, unreadMessageCount, archivedConversationCount, onSectionChange: onDestinationChange };

  function handleAccountMenuOpenChange(open: boolean) {
    isAccountMenuOpenRef.current = open;
    if (open) {
      clearIdleTimer();
      setExpanded(true);
    } else {
      scheduleMinimize();
    }
  }

  return (
    <div ref={dockRef} className="command-dock pointer-events-auto fixed left-1/2 z-[46] hidden -translate-x-1/2 lg:flex" onPointerEnter={reveal} onPointerMove={scheduleMinimize} onPointerLeave={scheduleMinimize} onFocusCapture={() => { clearIdleTimer(); setExpanded(true); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleMinimize(); }}>
      {expanded ? (
        <nav aria-label="Focus mode command dock" className="flex items-center gap-1 rounded-[1.4rem] border border-border bg-surface/95 p-1.5 shadow-soft backdrop-blur-md transition motion-reduce:transition-none">
          <AccountMenuPopover profile={currentProfile} accountPlan={accountPlan} variant="dock" isAvailable={isAccountMenuAvailable} isSigningOut={isSigningOut} onOpenChange={handleAccountMenuOpenChange} onOpenElite={onOpenElite} onOpenSurface={onOpenPersonalSurface} onRequestSignOut={onRequestSignOut} />
          <span className="mx-1 h-7 w-px bg-border" aria-hidden="true" />
          <SearchNavigationButton showLabel={false} onSearch={onSearch} />
          {workspaceDestinations.map((item) => <DashboardDestinationButton key={item.section} {...item} {...sharedDestinationProps} layoutId="focus-dashboard-section" showLabel={false} />)}
          <span className="mx-1 h-7 w-px bg-border" aria-hidden="true" />
          <button type="button" data-utility-shelf-trigger="focus-dock" onClick={(event) => onUtilityShelfToggle(event.currentTarget)} aria-label={`${isUtilityShelfOpen ? "Close utilities" : "Open utilities"}${hasGalleryUnread ? ", new Gallery activity" : ""}`} aria-haspopup="menu" aria-controls="nemissive-utility-menu" aria-expanded={isUtilityShelfOpen} title={isUtilityShelfOpen ? "Close utilities" : "Open utilities"} className={`relative flex h-12 w-12 items-center justify-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${isUtilityShelfOpen ? "bg-accent text-primary" : "text-muted hover:bg-accent hover:text-heading"}`}><UtilityShelfIcon />{!isUtilityShelfOpen && hasGalleryUnread && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface" aria-hidden="true" />}</button>
          <button type="button" data-focus-mode-control="exit" onClick={onExitFocus} aria-label="Exit focus mode" title="Exit focus mode" className="flex h-12 w-12 items-center justify-center rounded-2xl text-muted transition-colors hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover"><WorkspaceIcon /></button>
        </nav>
      ) : (
        <button type="button" onClick={revealFromKeyboard} onFocus={reveal} aria-label="Show command dock" title="Show command dock" className="group flex h-9 min-w-20 items-center justify-center gap-2 rounded-full border border-border bg-surface/90 px-3 text-primary shadow-soft backdrop-blur-md transition hover:bg-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover motion-reduce:transition-none"><span className="text-xs font-bold" aria-hidden="true">N</span><span className="h-0.5 w-8 rounded-full bg-primary/45 transition-colors group-hover:bg-primary motion-reduce:transition-none" aria-hidden="true" /></button>
      )}
    </div>
  );
}

export default CommandDock;
