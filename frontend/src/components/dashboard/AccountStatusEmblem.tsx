import { AccountStatusIcon } from "./AccountStatusBadge";
import type { AccountStatus } from "./premiumAccess";
import { accountStatusLabels } from "./premiumPresentation";

type AccountStatusEmblemProps = {
  status: AccountStatus;
  className?: string;
};

/** Icon-only account identity for compact self-avatar compositions. */
function AccountStatusEmblem({ status, className = "" }: AccountStatusEmblemProps) {
  const label = accountStatusLabels[status];

  return <span data-account-status={status} role="img" aria-label={`Nemissive ${label} account`} className={`account-status-emblem flex h-[18px] w-[18px] items-center justify-center rounded-full border ${className}`}><AccountStatusIcon status={status} className="h-2.5 w-2.5" /></span>;
}

export default AccountStatusEmblem;
