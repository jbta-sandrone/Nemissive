import type { AccountStatus } from "./premiumAccess";
import { accountStatusLabels } from "./premiumPresentation";

export type { AccountStatus } from "./premiumAccess";

type AccountStatusBadgeProps = {
  status: AccountStatus;
  size?: "compact" | "default";
  className?: string;
};

export function AccountStatusIcon({ status, className }: { status: AccountStatus; className: string }) {
  if (status === "gold") {
    return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" className={className} aria-hidden="true"><path d="M8 1.75c.45 2.2 1.45 3.2 3.65 3.65C9.45 5.85 8.45 6.85 8 9.05 7.55 6.85 6.55 5.85 4.35 5.4 6.55 4.95 7.55 3.95 8 1.75Z" strokeLinejoin="round" /><path d="M12.25 9.1c.25 1.2.8 1.75 2 2-.25 1.2-.8 1.75-2 2-.25-1.2-.8-1.75-2-2 1.2-.25 1.75-.8 2-2ZM3.15 9.45c.18.9.6 1.32 1.5 1.5-.9.18-1.32.6-1.5 1.5-.18-.9-.6-1.32-1.5-1.5.9-.18 1.32-.6 1.5-1.5Z" strokeLinejoin="round" /></svg>;
  }

  if (status === "elite") {
    return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" className={className} aria-hidden="true"><path d="m8 1.5 5.25 3.75-2.05 6.1L8 14.2l-3.2-2.85-2.05-6.1L8 1.5Z" strokeLinejoin="round" /><path d="m2.75 5.25 5.25 2.2 5.25-2.2M8 7.45v6.75" strokeLinejoin="round" /></svg>;
  }

  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" className={className} aria-hidden="true"><path d="M8 1.9 13.1 8 8 14.1 2.9 8 8 1.9Z" strokeLinejoin="round" /><path d="m2.9 8 5.1 2 5.1-2" strokeLinejoin="round" /></svg>;
}

function AccountStatusBadge({ status, size = "default", className = "" }: AccountStatusBadgeProps) {
  const label = accountStatusLabels[status];
  const sizeClasses = size === "compact"
    ? "min-h-5 gap-1 px-1.5 py-0.5 text-[9px]"
    : "min-h-6 gap-1.5 px-2.5 py-1 text-[10px]";
  const iconClass = size === "compact" ? "h-2.5 w-2.5 shrink-0" : "h-3 w-3 shrink-0";

  return <span data-account-status={status} aria-label={`Nemissive ${label} account`} className={`account-status-badge inline-flex items-center justify-center whitespace-nowrap rounded-full border font-bold leading-none tracking-[0.06em] ${sizeClasses} ${className}`}><AccountStatusIcon status={status} className={iconClass} /><span>{label}</span></span>;
}

export default AccountStatusBadge;
