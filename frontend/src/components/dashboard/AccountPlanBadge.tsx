import type { AccountPlan } from "./premiumAccess";

export type { AccountPlan } from "./premiumAccess";

type AccountPlanBadgeProps = {
  plan: AccountPlan;
  size?: "compact" | "default";
  className?: string;
};

const planStyles: Record<AccountPlan, string> = {
  normal: "border-slate-300 bg-linear-to-br from-slate-200 via-white to-slate-100 text-slate-700",
  elite: "border-blue-300 bg-linear-to-br from-blue-200 via-white to-blue-100 text-blue-800",
};

function AccountPlanBadge({ plan, size = "default", className = "" }: AccountPlanBadgeProps) {
  const label = plan === "elite" ? "Elite" : "Normal";
  const sizeClasses = size === "compact" ? "min-h-4 min-w-9 px-1.5 py-0.5 text-[8px]" : "min-h-5 min-w-12 px-2 py-1 text-[9px]";

  return <span aria-label={`Nemissive ${label} plan`} className={`inline-flex items-center justify-center rounded-full border font-bold leading-none tracking-[0.06em] shadow-soft ${sizeClasses} ${planStyles[plan]} ${className}`}>{label}</span>;
}

export default AccountPlanBadge;
