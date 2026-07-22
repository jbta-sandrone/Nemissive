import { motion, useReducedMotion } from "motion/react";
import type { DashboardSection } from "../../types/dashboard";

type NavigationRailProps = {
  activeSection: DashboardSection;
  pendingRequestCount: number;
  isCompactChatVisible: boolean;
  onSectionChange: (section: DashboardSection) => void;
};

const navigationItems: Array<{ section: DashboardSection; label: string }> = [
  { section: "messages", label: "Messages" },
  { section: "people", label: "People" },
  { section: "requests", label: "Requests" },
];

function SectionIcon({ section }: { section: DashboardSection }) {
  if (section === "messages") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M4 5.5h16v11H8l-4 3v-14Z" strokeLinejoin="round" /><path d="M8 10h8M8 13h5" strokeLinecap="round" /></svg>;
  if (section === "people") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.25" /><path d="M3.5 18c.5-3.2 2.4-4.8 5.5-4.8s5 1.6 5.5 4.8M14.5 14c2.9-.4 4.8.9 5.7 3.8" strokeLinecap="round" /></svg>;
  if (section === "requests") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M4 6.5h16v11H7l-3 2.5V6.5Z" strokeLinejoin="round" /><path d="m7 10 3.5 2.5a2.5 2.5 0 0 0 3 0L17 10" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M9 4v6M8 14v6" strokeLinecap="round" /></svg>;
}

function PendingBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (count <= 0) return null;

  return <span className={`${compact ? "-right-1 -top-1" : "-right-1.5 -top-1.5"} absolute z-20 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-primary px-1 text-[10px] font-bold leading-none text-white shadow-soft`}><span aria-hidden="true">{count > 9 ? "9+" : count}</span><span className="sr-only">{count} pending message {count === 1 ? "request" : "requests"}</span></span>;
}

function NavigationButton({ section, label, activeSection, pendingRequestCount, layoutId, showLabel, onSectionChange }: { section: DashboardSection; label: string; activeSection: DashboardSection; pendingRequestCount: number; layoutId: string; showLabel: boolean; onSectionChange: (section: DashboardSection) => void }) {
  const shouldReduceMotion = useReducedMotion();
  const isActive = activeSection === section;
  const accessibleLabel = section === "requests" && pendingRequestCount > 0 ? `${label}, ${pendingRequestCount} pending message ${pendingRequestCount === 1 ? "request" : "requests"}` : label;

  return (
    <button type="button" aria-label={accessibleLabel} aria-current={isActive ? "page" : undefined} title={label} onClick={() => onSectionChange(section)} className={`${showLabel ? "min-w-0 flex-1 flex-col gap-1 py-2" : "h-12 w-12"} relative flex items-center justify-center rounded-2xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${isActive ? "text-white" : "text-muted hover:bg-accent hover:text-heading"}`}>
      {isActive && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-2xl bg-primary shadow-soft" transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
      <span className="relative z-10 flex items-center justify-center"><SectionIcon section={section} /></span>
      {showLabel && <span className="relative z-10 text-[11px] leading-none">{label}</span>}
      {section === "requests" && <PendingBadge count={pendingRequestCount} compact={showLabel} />}
    </button>
  );
}

function NavigationRail({ activeSection, pendingRequestCount, isCompactChatVisible, onSectionChange }: NavigationRailProps) {
  return (
    <>
      <aside className="hidden h-full w-16 shrink-0 flex-col items-center border-r border-border bg-background py-4 md:flex lg:w-[72px]" aria-label="Dashboard navigation">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface text-lg font-bold text-primary shadow-soft" aria-label="Nemissive">N</div>
        <nav className="mt-7 flex flex-col gap-2" aria-label="Dashboard sections">
          {navigationItems.map((item) => <NavigationButton key={item.section} {...item} activeSection={activeSection} pendingRequestCount={pendingRequestCount} layoutId="desktop-dashboard-section" showLabel={false} onSectionChange={onSectionChange} />)}
        </nav>
        <div className="mt-auto"><NavigationButton section="menu" label="Menu" activeSection={activeSection} pendingRequestCount={pendingRequestCount} layoutId="desktop-dashboard-section" showLabel={false} onSectionChange={onSectionChange} /></div>
      </aside>

      {!isCompactChatVisible && <nav className="order-last flex shrink-0 items-center gap-1 border-t border-border bg-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 md:hidden" aria-label="Dashboard sections">{[...navigationItems, { section: "menu" as const, label: "Menu" }].map((item) => <NavigationButton key={item.section} {...item} activeSection={activeSection} pendingRequestCount={pendingRequestCount} layoutId="mobile-dashboard-section" showLabel onSectionChange={onSectionChange} />)}</nav>}
    </>
  );
}

export default NavigationRail;
