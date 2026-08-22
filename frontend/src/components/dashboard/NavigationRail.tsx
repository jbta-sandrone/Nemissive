import type { DashboardSection } from "../../types/dashboard";
import type { AcceptedConversationItem, ProfileSearchResult } from "../../types/conversations";
import AccountMenuPopover, { type PersonalSurface } from "./AccountMenuPopover";
import { DashboardDestinationButton, SearchNavigationButton } from "./DashboardNavigationControls";
import { mobileDashboardDestinations, workspaceDestinations } from "./dashboardNavigation";
import MobilePulseDrawer from "./MobilePulseDrawer";
import Pulse from "./Pulse";

type NavigationRailProps = {
  activeSection: DashboardSection;
  pendingRequestCount: number;
  unreadMessageCount: number;
  archivedConversationCount: number;
  isCompactChatVisible: boolean;
  isMobilePulseAvailable: boolean;
  isFocusMode: boolean;
  currentProfile: ProfileSearchResult | null;
  isSigningOut: boolean;
  pulseConversations: AcceptedConversationItem[];
  onPulseConversationSelect: (conversation: AcceptedConversationItem) => void;
  onMobilePulseOpenChange: (isOpen: boolean) => void;
  onOpenPersonalSurface: (surface: PersonalSurface, trigger: HTMLButtonElement) => void;
  onRequestSignOut: (trigger: HTMLButtonElement) => void;
  onSectionChange: (section: DashboardSection) => void;
  onSearch: (trigger: HTMLButtonElement) => void;
};

function NavigationRail({ activeSection, pendingRequestCount, unreadMessageCount, archivedConversationCount, isCompactChatVisible, isMobilePulseAvailable, isFocusMode, currentProfile, isSigningOut, pulseConversations, onPulseConversationSelect, onMobilePulseOpenChange, onOpenPersonalSurface, onRequestSignOut, onSectionChange, onSearch }: NavigationRailProps) {
  const sharedDestinationProps = { activeSection, pendingRequestCount, unreadMessageCount, archivedConversationCount, onSectionChange };

  return (
    <>
      <aside className={`hidden h-full w-16 shrink-0 flex-col overflow-hidden border-r border-border bg-background md:flex lg:w-20 ${isFocusMode ? "lg:hidden" : ""}`} aria-label="Nemissive command rail">
        <div className="flex shrink-0 flex-col items-center px-2 py-4">
          <AccountMenuPopover profile={currentProfile} variant="rail" isSigningOut={isSigningOut} onOpenSurface={onOpenPersonalSurface} onRequestSignOut={onRequestSignOut} />
          <nav className="mt-7 flex flex-col gap-2" aria-label="Nemissive destinations">
            <SearchNavigationButton showLabel={false} onSearch={onSearch} />
            {workspaceDestinations.map((item) => <DashboardDestinationButton key={item.section} {...item} {...sharedDestinationProps} layoutId="desktop-dashboard-section" showLabel={false} />)}
          </nav>
        </div>
        {!isFocusMode && <Pulse conversations={pulseConversations} onConversationSelect={onPulseConversationSelect} />}
      </aside>

      {!isCompactChatVisible && <nav className="order-last flex shrink-0 items-center gap-0.5 border-t border-border bg-surface px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden" aria-label="Dashboard sections"><SearchNavigationButton showLabel onSearch={onSearch} />{mobileDashboardDestinations.map((item) => <DashboardDestinationButton key={item.section} {...item} {...sharedDestinationProps} layoutId="mobile-dashboard-section" showLabel />)}</nav>}
      {isMobilePulseAvailable && <MobilePulseDrawer conversations={pulseConversations} onConversationSelect={onPulseConversationSelect} onOpenChange={onMobilePulseOpenChange} />}
    </>
  );
}

export default NavigationRail;
