import { motion, useReducedMotion } from "motion/react";
import type { DashboardSection } from "../../types/dashboard";
import { getDestinationCount, getDestinationCountDescription } from "./dashboardNavigation";

export function DashboardSectionIcon({ section }: { section: DashboardSection }) {
  if (section === "messages") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M4 5.5h16v11H8l-4 3v-14Z" strokeLinejoin="round" /><path d="M8 10h8M8 13h5" strokeLinecap="round" /></svg>;
  if (section === "archived") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M5 8.5h14v10H5v-10Z" strokeLinejoin="round" /><path d="M4 5h16v3.5H4V5Zm5 7h6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (section === "people") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.25" /><path d="M3.5 18c.5-3.2 2.4-4.8 5.5-4.8s5 1.6 5.5 4.8M14.5 14c2.9-.4 4.8.9 5.7 3.8" strokeLinecap="round" /></svg>;
  if (section === "requests") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M4 6.5h16v11H7l-3 2.5V6.5Z" strokeLinejoin="round" /><path d="m7 10 3.5 2.5a2.5 2.5 0 0 0 3 0L17 10" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M9 4v6M8 14v6" strokeLinecap="round" /></svg>;
}

export function DestinationCountBadge({ count, label, compact = false }: { count: number; label: string; compact?: boolean }) {
  if (count <= 0) return null;
  return <span className={`${compact ? "-right-1 -top-1" : "-right-1.5 -top-1.5"} absolute z-20 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-primary px-1 text-[10px] font-bold leading-none text-white shadow-soft`}><span aria-hidden="true">{count > 9 ? "9+" : count}</span><span className="sr-only">{label}</span></span>;
}

export function SearchNavigationButton({ showLabel, onSearch }: { showLabel: boolean; onSearch: (trigger: HTMLButtonElement) => void }) {
  return <button type="button" aria-label="Search Nemissive" title="Search (Ctrl or Command K)" onClick={(event) => onSearch(event.currentTarget)} className={`${showLabel ? "min-w-0 flex-1 flex-col gap-1 py-2" : "h-12 w-12"} relative flex items-center justify-center rounded-2xl text-sm font-medium text-muted transition-colors hover:bg-accent hover:text-heading focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" strokeLinecap="round" /></svg>{showLabel && <span className="text-[11px] leading-none">Search</span>}</button>;
}

export function DashboardDestinationButton({ section, label, activeSection, pendingRequestCount, unreadMessageCount, archivedConversationCount, layoutId, showLabel, onSectionChange }: { section: DashboardSection; label: string; activeSection: DashboardSection; pendingRequestCount: number; unreadMessageCount: number; archivedConversationCount: number; layoutId: string; showLabel: boolean; onSectionChange: (section: DashboardSection) => void }) {
  const shouldReduceMotion = useReducedMotion();
  const isActive = activeSection === section;
  const badgeCount = getDestinationCount(section, pendingRequestCount, unreadMessageCount, archivedConversationCount);
  const badgeDescription = getDestinationCountDescription(section, badgeCount);
  const accessibleLabel = badgeCount > 0 ? `${label}, ${badgeDescription}` : label;
  return (
    <button type="button" data-dashboard-section={section} aria-label={accessibleLabel} aria-current={isActive ? "page" : undefined} title={label} onClick={() => onSectionChange(section)} className={`${showLabel ? "min-w-0 flex-1 flex-col gap-1 py-2" : "h-12 w-12"} relative flex items-center justify-center rounded-2xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${isActive ? "text-white" : "text-muted hover:bg-accent hover:text-heading"}`}>
      {isActive && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-2xl bg-primary shadow-soft" transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />}
      <span className="relative z-10 flex items-center justify-center"><DashboardSectionIcon section={section} /></span>
      {showLabel && <span className="relative z-10 text-[11px] leading-none">{label}</span>}
      {(section === "requests" || section === "messages" || section === "archived") && <DestinationCountBadge count={badgeCount} label={badgeDescription} compact={showLabel} />}
    </button>
  );
}
