import type { PremiumProductId } from "./premiumAccess";

export type BillingProductId = PremiumProductId | "elite.monthly";

export type PremiumCatalogEntry = {
  id: BillingProductId;
  name: string;
  amountMinor: number;
  currency: "PHP";
  billingType: "one_time" | "subscription";
  interval?: "month";
};

export const premiumCatalog: Record<BillingProductId, PremiumCatalogEntry> = {
  "theme.obsidian": {
    id: "theme.obsidian",
    name: "Obsidian",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "theme.celestia": {
    id: "theme.celestia",
    name: "Celestia",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "elite.monthly": {
    id: "elite.monthly",
    name: "Nemissive Elite",
    amountMinor: 19900,
    currency: "PHP",
    billingType: "subscription",
    interval: "month",
  },
};

export function isBillingProductId(value: unknown): value is BillingProductId {
  return value === "theme.obsidian" || value === "theme.celestia" || value === "elite.monthly";
}

export function formatPremiumPrice(productId: BillingProductId) {
  const product = premiumCatalog[productId];
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: product.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(product.amountMinor / 100);
}

// These values are presentation metadata. The checkout Edge Function never
// accepts a browser amount and always selects the configured provider variant.
export const eliteMonthlyProductId = "elite.monthly" as const;
