import type { DashboardSection } from "../../types/dashboard";
import type { ProfileSearchResult } from "../../types/conversations";
import AccountMenuPopover, { type PersonalSurface } from "./AccountMenuPopover";
import { DashboardDestinationButton, SearchNavigationButton } from "./DashboardNavigationControls";
import { mobileDashboardDestinations, workspaceDestinations } from "./dashboardNavigation";

type NavigationRailProps = {
  activeSection: DashboardSection;
  pendingRequestCount: number;
  unreadMessageCount: number;
  archivedConversationCount: number;
  isCompactChatVisible: boolean;
  isFocusMode: boolean;
  currentProfile: ProfileSearchResult | null;
  isSigningOut: boolean;
  pulseVisible: boolean;
  onPulseVisibilityChange: (visible: boolean) => void;
  onOpenPersonalSurface: (surface: PersonalSurface, trigger: HTMLButtonElement) => void;
  onRequestSignOut: (trigger: HTMLButtonElement) => void;
  onSectionChange: (section: DashboardSection) => void;
  onSearch: (trigger: HTMLButtonElement) => void;
};

function PulseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function NavigationRail({ activeSection, pendingRequestCount, unreadMessageCount, archivedConversationCount, isCompactChatVisible, isFocusMode, currentProfile, isSigningOut, pulseVisible, onPulseVisibilityChange, onOpenPersonalSurface, onRequestSignOut, onSectionChange, onSearch }: NavigationRailProps) {
  const sharedDestinationProps = { activeSection, pendingRequestCount, unreadMessageCount, archivedConversationCount, onSectionChange };

  return (
    <>
      <aside className={`hidden h-full w-16 shrink-0 flex-col items-center border-r border-border bg-background py-4 md:flex lg:w-[72px] ${isFocusMode ? "lg:hidden" : ""}`} aria-label="Nemissive command rail">
        <AccountMenuPopover profile={currentProfile} variant="rail" isSigningOut={isSigningOut} onOpenSurface={onOpenPersonalSurface} onRequestSignOut={onRequestSignOut} />
        <nav className="mt-7 flex flex-col gap-2" aria-label="Nemissive destinations">
          <SearchNavigationButton showLabel={false} onSearch={onSearch} />
          {workspaceDestinations.map((item) => <DashboardDestinationButton key={item.section} {...item} {...sharedDestinationProps} layoutId="desktop-dashboard-section" showLabel={false} />)}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <button type="button" data-pulse-visibility-control="true" onClick={() => onPulseVisibilityChange(!pulseVisible)} aria-label={pulseVisible ? "Hide Pulse" : "Show Pulse"} aria-pressed={pulseVisible} title={pulseVisible ? "Hide Pulse" : "Show Pulse"} className={`relative hidden h-12 w-12 items-center justify-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover xl:flex ${pulseVisible ? "bg-accent text-primary" : "text-muted hover:bg-accent hover:text-heading"}`}><PulseIcon /></button>
        </div>
      </aside>

      {!isCompactChatVisible && <nav className="order-last flex shrink-0 items-center gap-0.5 border-t border-border bg-surface px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden" aria-label="Dashboard sections"><SearchNavigationButton showLabel onSearch={onSearch} />{mobileDashboardDestinations.map((item) => <DashboardDestinationButton key={item.section} {...item} {...sharedDestinationProps} layoutId="mobile-dashboard-section" showLabel />)}</nav>}
    </>
  );
}

export default NavigationRail;
