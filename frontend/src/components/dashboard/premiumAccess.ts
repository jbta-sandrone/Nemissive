export type AccountPlan = "normal" | "elite";
export type AccountStatus = "normal" | "gold" | "elite";

export const premiumProductIds = ["theme.obsidian", "theme.celestial", "theme.sakura", "theme.ember", "theme.glacier", "theme.verdant"] as const;
export type PremiumProductId = (typeof premiumProductIds)[number];

export type PremiumAccessState = {
  accountPlan: AccountPlan;
  eliteActive: boolean;
  eliteExpiresAt: string | null;
  ownedProductIds: readonly string[];
  previewProductIds: readonly PremiumProductId[];
};

export type PremiumAccessRpcRow = {
  account_plan?: unknown;
  elite_active?: unknown;
  elite_expires_at?: unknown;
  owned_product_ids?: unknown;
  preview_product_ids?: unknown;
};

/** Fail-closed state used until the caller-owned server state resolves. */
export const noPremiumAccess: PremiumAccessState = Object.freeze({
  accountPlan: "normal",
  eliteActive: false,
  eliteExpiresAt: null,
  ownedProductIds: Object.freeze([]),
  previewProductIds: Object.freeze([]),
});

export const isObsidianDevelopmentPreviewEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_OBSIDIAN_THEME_PREVIEW === "true";
const celestialDevelopmentPreviewValue = import.meta.env.VITE_ENABLE_CELESTIAL_THEME_PREVIEW;
export const isCelestialDevelopmentPreviewEnabled = import.meta.env.DEV && (
  celestialDevelopmentPreviewValue === "true"
  || (celestialDevelopmentPreviewValue === undefined && import.meta.env.VITE_ENABLE_CELESTIA_THEME_PREVIEW === "true")
);
export const isSakuraDevelopmentPreviewEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_SAKURA_THEME_PREVIEW === "true";
export const isEmberDevelopmentPreviewEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_EMBER_THEME_PREVIEW === "true";
export const isGlacierDevelopmentPreviewEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_GLACIER_THEME_PREVIEW === "true";
export const isVerdantDevelopmentPreviewEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_VERDANT_THEME_PREVIEW === "true";

function normalizeLegacyPremiumProductId(value: unknown) {
  return value === "theme.celestia" ? "theme.celestial" : value;
}

export function isPremiumProductId(value: unknown): value is PremiumProductId {
  return typeof value === "string" && premiumProductIds.includes(value as PremiumProductId);
}

export function isPremiumProductDevelopmentPreviewEnabled(productId: PremiumProductId) {
  if (productId === "theme.obsidian") return isObsidianDevelopmentPreviewEnabled;
  if (productId === "theme.celestial") return isCelestialDevelopmentPreviewEnabled;
  if (productId === "theme.sakura") return isSakuraDevelopmentPreviewEnabled;
  if (productId === "theme.ember") return isEmberDevelopmentPreviewEnabled;
  if (productId === "theme.glacier") return isGlacierDevelopmentPreviewEnabled;
  if (productId === "theme.verdant") return isVerdantDevelopmentPreviewEnabled;
  return false;
}

function normalizeKnownProductIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeLegacyPremiumProductId).filter(isPremiumProductId))];
}

function normalizeOwnedProductIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeLegacyPremiumProductId).filter((productId): productId is string => (
    typeof productId === "string"
    && productId.length >= 3
    && productId.length <= 100
    && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_-]*)+$/.test(productId)
  )))];
}

/**
 * Normalizes the caller-derived RPC projection. Server preview products are
 * intersected with private build-time development flags, so production UI
 * remains locked even if a development database flag is accidentally enabled.
 */
export function normalizePremiumAccess(value: PremiumAccessRpcRow | null | undefined): PremiumAccessState {
  if (!value) return noPremiumAccess;
  const eliteActive = value.elite_active === true && value.account_plan === "elite";
  const ownedProductIds = normalizeOwnedProductIds(value.owned_product_ids);
  const previewProductIds = normalizeKnownProductIds(value.preview_product_ids).filter(isPremiumProductDevelopmentPreviewEnabled);
  return {
    accountPlan: eliteActive ? "elite" : "normal",
    eliteActive,
    eliteExpiresAt: typeof value.elite_expires_at === "string" ? value.elite_expires_at : null,
    ownedProductIds,
    previewProductIds,
  };
}

/** Presentation helper only. Every premium mutation remains server-enforced. */
export function canAccessPremiumProduct(access: PremiumAccessState, productId: PremiumProductId, includeDevelopmentPreview = true) {
  return access.eliteActive
    || access.ownedProductIds.includes(productId)
    || (includeDevelopmentPreview && access.previewProductIds.includes(productId));
}

/**
 * Resolves the signed-in user's display identity without changing the
 * authoritative Normal/Elite account-plan model. Development previews are
 * intentionally excluded because they are neither purchases nor plans.
 */
export function resolveAccountStatus(access: PremiumAccessState): AccountStatus {
  if (access.eliteActive) return "elite";
  if (access.ownedProductIds.length > 0) return "gold";
  return "normal";
}

export type PremiumProductAccessSource = "locked" | "owned" | "elite" | "preview";

/** Presentation-only source label; server-side premium checks remain authoritative. */
export function resolvePremiumProductAccessSource(access: PremiumAccessState, productId: PremiumProductId): PremiumProductAccessSource {
  if (access.ownedProductIds.includes(productId)) return "owned";
  if (access.eliteActive) return "elite";
  if (access.previewProductIds.includes(productId)) return "preview";
  return "locked";
}
