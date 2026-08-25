import type { AccountStatus, PremiumProductAccessSource } from "./premiumAccess";

export const accountStatusLabels: Record<AccountStatus, string> = {
  normal: "Normal",
  gold: "Gold",
  elite: "Elite",
};

export const premiumThemeAccessLabels: Record<PremiumProductAccessSource, string> = {
  locked: "Locked",
  owned: "Owned",
  elite: "Included with Elite",
  preview: "Development Preview",
};
