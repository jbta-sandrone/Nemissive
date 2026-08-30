import { AccountStatusIcon } from "./AccountStatusBadge";
import type { AccountStatus } from "./premiumAccess";
import { accountStatusLabels } from "./premiumPresentation";

type AccountStatusEmblemProps = {
  status: AccountStatus;
  className?: string;
  size?: "compact" | "default";
  decorative?: boolean;
};

/** Icon-only account identity for compact avatar compositions. */
function AccountStatusEmblem({ status, className = "", size = "default", decorative = false }: AccountStatusEmblemProps) {
  const label = accountStatusLabels[status];
  const emblemSize = size === "compact" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";
  const iconSize = size === "compact" ? "h-2 w-2" : "h-2.5 w-2.5";

  return <span data-account-status={status} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : `Nemissive ${label} account`} aria-hidden={decorative ? "true" : undefined} className={`account-status-emblem flex ${emblemSize} items-center justify-center rounded-full border ${className}`}><AccountStatusIcon status={status} className={iconSize} /></span>;
}

export default AccountStatusEmblem;
