import type { AvatarBorderKey } from "../../types/avatarBorders";
import { avatarBorderKeys } from "../../types/avatarBorders";
import { canAccessPremiumProduct, type PremiumAccessState, type PremiumAvatarBorderProductId } from "./premiumAccess";

export type AvatarBorderDefinition = {
  key: AvatarBorderKey;
  name: string;
  access: "free" | "premium";
  color: string | null;
  innerEdge: string | null;
  outerEdge: string | null;
  assetPath: string | null;
  overlayScale: number | null;
  premiumProductId: PremiumAvatarBorderProductId | null;
  amountMinor: number | null;
  currency: "PHP" | null;
};

const borderTokens: Record<AvatarBorderKey, Omit<AvatarBorderDefinition, "key">> = {
  none: { name: "None", access: "free", color: null, innerEdge: null, outerEdge: null, assetPath: null, overlayScale: null, premiumProductId: null, amountMinor: null, currency: null },
  pearl: { name: "Pearl", access: "free", color: "#e5ddd0", innerEdge: "#fffdf8", outerEdge: "#aaa298", assetPath: null, overlayScale: null, premiumProductId: null, amountMinor: null, currency: null },
  graphite: { name: "Graphite", access: "free", color: "#555b64", innerEdge: "#858c96", outerEdge: "#292d33", assetPath: null, overlayScale: null, premiumProductId: null, amountMinor: null, currency: null },
  azure: { name: "Azure", access: "free", color: "#3f82bd", innerEdge: "#76add9", outerEdge: "#255987", assetPath: null, overlayScale: null, premiumProductId: null, amountMinor: null, currency: null },
  emerald: { name: "Emerald", access: "free", color: "#37866a", innerEdge: "#70b49a", outerEdge: "#205a47", assetPath: null, overlayScale: null, premiumProductId: null, amountMinor: null, currency: null },
  violet: { name: "Violet", access: "free", color: "#795fa9", innerEdge: "#a38cca", outerEdge: "#4e3b76", assetPath: null, overlayScale: null, premiumProductId: null, amountMinor: null, currency: null },
  rose: { name: "Rose", access: "free", color: "#b76278", innerEdge: "#d99aaa", outerEdge: "#7d3e50", assetPath: null, overlayScale: null, premiumProductId: null, amountMinor: null, currency: null },
  amber: { name: "Amber", access: "free", color: "#b77a32", innerEdge: "#d8a461", outerEdge: "#7c501f", assetPath: null, overlayScale: null, premiumProductId: null, amountMinor: null, currency: null },
  aurelia: { name: "Aurelia", access: "premium", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/aurelia_elite_border.png", overlayScale: 1.6, premiumProductId: "border.aurelia", amountMinor: 29900, currency: "PHP" },
};

export const avatarBorderCatalog: readonly AvatarBorderDefinition[] = avatarBorderKeys.map((key) => ({ key, ...borderTokens[key] }));
export const freeAvatarBorderCatalog = avatarBorderCatalog.filter((border) => border.access === "free");
export const premiumAvatarBorderCatalog = avatarBorderCatalog.filter((border) => border.access === "premium");

export function getAvatarBorderDefinition(key: AvatarBorderKey) {
  return avatarBorderCatalog.find((border) => border.key === key) ?? avatarBorderCatalog[0];
}

export function canUseAvatarBorder(key: AvatarBorderKey, premiumAccess: PremiumAccessState) {
  const border = getAvatarBorderDefinition(key);
  return border.access === "free" || (border.premiumProductId !== null && canAccessPremiumProduct(premiumAccess, border.premiumProductId));
}
