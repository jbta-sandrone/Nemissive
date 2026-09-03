import type { PremiumThemeProductId } from "./premiumAccess";

export const billingProductIds = [
  "theme.obsidian",
  "theme.celestial",
  "theme.sakura",
  "theme.ember",
  "theme.glacier",
  "theme.verdant",
  "theme.abyss",
  "theme.eclipse",
  "theme.dune",
  "theme.void",
  "theme.shinkai",
  "border.aurelia",
  "border.moonveil",
  "border.prismara",
  "border.solstice",
  "border.scarlet",
  "border.tidal",
  "border.inferno",
  "border.frost",
  "border.orbit",
  "border.chrono",
  "border.zenith",
  "elite.monthly",
] as const;

export type BillingProductId = (typeof billingProductIds)[number];

export type PremiumCatalogEntry = {
  id: BillingProductId;
  name: string;
  amountMinor: number;
  currency: "PHP";
  billingType: "one_time" | "subscription";
  interval?: "month";
};

export type PremiumThemePurchasePresentation = {
  id: PremiumThemeProductId;
  name: string;
  amountMinor: number;
  currency: "PHP";
  checkoutProductId: Exclude<BillingProductId, "elite.monthly"> | null;
};

export const premiumThemePurchaseCatalog: Record<PremiumThemeProductId, PremiumThemePurchasePresentation> = {
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
    checkoutProductId: "theme.verdant",
  },
  "theme.abyss": {
    id: "theme.abyss",
    name: "Abyss",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: "theme.abyss",
  },
  "theme.eclipse": {
    id: "theme.eclipse",
    name: "Eclipse",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: "theme.eclipse",
  },
  "theme.dune": {
    id: "theme.dune",
    name: "Dune",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: "theme.dune",
  },
  "theme.void": {
    id: "theme.void",
    name: "Void",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: "theme.void",
  },
  "theme.shinkai": {
    id: "theme.shinkai",
    name: "Shinkai",
    amountMinor: 29900,
    currency: "PHP",
    checkoutProductId: "theme.shinkai",
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
  "theme.verdant": {
    id: "theme.verdant",
    name: "Verdant",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "theme.abyss": {
    id: "theme.abyss",
    name: "Abyss",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "theme.eclipse": {
    id: "theme.eclipse",
    name: "Eclipse",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "theme.dune": {
    id: "theme.dune",
    name: "Dune",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "theme.void": {
    id: "theme.void",
    name: "Void",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "theme.shinkai": {
    id: "theme.shinkai",
    name: "Shinkai",
    amountMinor: 29900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.aurelia": {
    id: "border.aurelia",
    name: "Aurelia",
    amountMinor: 9900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.moonveil": {
    id: "border.moonveil",
    name: "Moonveil",
    amountMinor: 9900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.prismara": {
    id: "border.prismara",
    name: "Prismara",
    amountMinor: 9900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.solstice": {
    id: "border.solstice",
    name: "Solstice",
    amountMinor: 9900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.scarlet": {
    id: "border.scarlet",
    name: "Scarlet",
    amountMinor: 9900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.tidal": {
    id: "border.tidal",
    name: "Tidal",
    amountMinor: 9900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.inferno": {
    id: "border.inferno",
    name: "Inferno",
    amountMinor: 9900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.frost": {
    id: "border.frost",
    name: "Frost",
    amountMinor: 9900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.orbit": {
    id: "border.orbit",
    name: "Orbit",
    amountMinor: 9900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.chrono": {
    id: "border.chrono",
    name: "Chrono",
    amountMinor: 9900,
    currency: "PHP",
    billingType: "one_time",
  },
  "border.zenith": {
    id: "border.zenith",
    name: "Zenith",
    amountMinor: 9900,
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
  return typeof value === "string" && billingProductIds.includes(value as BillingProductId);
}

export function normalizeBillingProductId(value: unknown): BillingProductId | null {
  if (value === "theme.celestia") return "theme.celestial";
  return isBillingProductId(value) ? value : null;
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
