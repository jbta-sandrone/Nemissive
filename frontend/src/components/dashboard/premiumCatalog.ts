import type { PremiumProductId } from "./premiumAccess";

export type BillingProductId = "theme.obsidian" | "theme.celestial" | "theme.sakura" | "theme.ember" | "theme.glacier" | "elite.monthly";

export type PremiumCatalogEntry = {
  id: BillingProductId;
  name: string;
  amountMinor: number;
  currency: "PHP";
  billingType: "one_time" | "subscription";
  interval?: "month";
};

export type PremiumThemePurchasePresentation = {
  id: PremiumProductId;
  name: string;
  amountMinor: number;
  currency: "PHP";
  checkoutProductId: Exclude<BillingProductId, "elite.monthly"> | null;
};

export const premiumThemePurchaseCatalog: Record<PremiumProductId, PremiumThemePurchasePresentation> = {
  "theme.obsidian": {
    id: "theme.obsidian",
    name: "Obsidian",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: "theme.obsidian",
  },
  "theme.celestial": {
    id: "theme.celestial",
    name: "Celestial",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: "theme.celestial",
  },
  "theme.sakura": {
    id: "theme.sakura",
    name: "Sakura",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: "theme.sakura",
  },
  "theme.ember": {
    id: "theme.ember",
    name: "Ember",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: "theme.ember",
  },
  "theme.glacier": {
    id: "theme.glacier",
    name: "Glacier",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: "theme.glacier",
  },
  "theme.verdant": {
    id: "theme.verdant",
    name: "Verdant",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: null,
  },
};

export const premiumCatalog: Record<BillingProductId, PremiumCatalogEntry> = {
  "theme.obsidian": {
    id: "theme.obsidian",
    name: "Obsidian",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "theme.celestial": {
    id: "theme.celestial",
    name: "Celestial",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "theme.sakura": {
    id: "theme.sakura",
    name: "Sakura",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "theme.ember": {
    id: "theme.ember",
    name: "Ember",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "theme.glacier": {
    id: "theme.glacier",
    name: "Glacier",
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
  return value === "theme.obsidian" || value === "theme.celestial" || value === "theme.sakura" || value === "theme.ember" || value === "theme.glacier" || value === "elite.monthly";
}

export function normalizeBillingProductId(value: unknown): BillingProductId | null {
  if (value === "theme.celestia") return "theme.celestial";
  return isBillingProductId(value) ? value : null;
}

export function formatPremiumPrice(productId: BillingProductId | PremiumProductId) {
  const product = productId === "elite.monthly"
    ? premiumCatalog[productId]
    : premiumThemePurchaseCatalog[productId];
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
