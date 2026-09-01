import type { AvatarBorderKey } from "../../types/avatarBorders";
import { avatarBorderKeys } from "../../types/avatarBorders";
import { canAccessPremiumProduct, type PremiumAccessState, type PremiumAvatarBorderProductId } from "./premiumAccess";

export type AvatarBorderSize = "xs" | "sm" | "md" | "lg" | "xl";

export type AvatarBorderDefinition = {
  key: AvatarBorderKey;
  name: string;
  access: "free" | "premium";
  kind: "css" | "image";
  color: string | null;
  innerEdge: string | null;
  outerEdge: string | null;
  assetPath: string | null;
  imageScale: number | null;
  imageOffsetX: number;
  imageOffsetY: number;
  imageScaleBySize: Partial<Record<AvatarBorderSize, number>> | null;
  premiumProductId: PremiumAvatarBorderProductId | null;
  amountMinor: number | null;
  currency: "PHP" | null;
  collectionPosition: number | null;
};

const borderTokens: Record<AvatarBorderKey, Omit<AvatarBorderDefinition, "key">> = {
  none: { name: "None", access: "free", kind: "css", color: null, innerEdge: null, outerEdge: null, assetPath: null, imageScale: null, imageOffsetX: 0, imageOffsetY: 0, imageScaleBySize: null, premiumProductId: null, amountMinor: null, currency: null, collectionPosition: null },
  pearl: { name: "Pearl", access: "free", kind: "css", color: "#e5ddd0", innerEdge: "#fffdf8", outerEdge: "#aaa298", assetPath: null, imageScale: null, imageOffsetX: 0, imageOffsetY: 0, imageScaleBySize: null, premiumProductId: null, amountMinor: null, currency: null, collectionPosition: null },
  graphite: { name: "Graphite", access: "free", kind: "css", color: "#555b64", innerEdge: "#858c96", outerEdge: "#292d33", assetPath: null, imageScale: null, imageOffsetX: 0, imageOffsetY: 0, imageScaleBySize: null, premiumProductId: null, amountMinor: null, currency: null, collectionPosition: null },
  azure: { name: "Azure", access: "free", kind: "css", color: "#3f82bd", innerEdge: "#76add9", outerEdge: "#255987", assetPath: null, imageScale: null, imageOffsetX: 0, imageOffsetY: 0, imageScaleBySize: null, premiumProductId: null, amountMinor: null, currency: null, collectionPosition: null },
  emerald: { name: "Emerald", access: "free", kind: "css", color: "#37866a", innerEdge: "#70b49a", outerEdge: "#205a47", assetPath: null, imageScale: null, imageOffsetX: 0, imageOffsetY: 0, imageScaleBySize: null, premiumProductId: null, amountMinor: null, currency: null, collectionPosition: null },
  violet: { name: "Violet", access: "free", kind: "css", color: "#795fa9", innerEdge: "#a38cca", outerEdge: "#4e3b76", assetPath: null, imageScale: null, imageOffsetX: 0, imageOffsetY: 0, imageScaleBySize: null, premiumProductId: null, amountMinor: null, currency: null, collectionPosition: null },
  rose: { name: "Rose", access: "free", kind: "css", color: "#b76278", innerEdge: "#d99aaa", outerEdge: "#7d3e50", assetPath: null, imageScale: null, imageOffsetX: 0, imageOffsetY: 0, imageScaleBySize: null, premiumProductId: null, amountMinor: null, currency: null, collectionPosition: null },
  amber: { name: "Amber", access: "free", kind: "css", color: "#b77a32", innerEdge: "#d8a461", outerEdge: "#7c501f", assetPath: null, imageScale: null, imageOffsetX: 0, imageOffsetY: 0, imageScaleBySize: null, premiumProductId: null, amountMinor: null, currency: null, collectionPosition: null },
  aurelia: { name: "Aurelia", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/aurelia_elite_border.png", imageScale: 1.6, imageOffsetX: 0, imageOffsetY: 0, imageScaleBySize: null, premiumProductId: "border.aurelia", amountMinor: 9900, currency: "PHP", collectionPosition: 1 },
  moonveil: { name: "Moonveil", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/moonveil_elite_border.png", imageScale: 1.42, imageOffsetX: -1.5, imageOffsetY: 5, imageScaleBySize: null, premiumProductId: "border.moonveil", amountMinor: 9900, currency: "PHP", collectionPosition: 2 },
  prismara: { name: "Prismara", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/prismara_elite_border.png", imageScale: 1.46, imageOffsetX: 0, imageOffsetY: 1.25, imageScaleBySize: null, premiumProductId: "border.prismara", amountMinor: 9900, currency: "PHP", collectionPosition: 3 },
  solstice: { name: "Solstice", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/solstice_elite_border.png", imageScale: 1.62, imageOffsetX: -1.5, imageOffsetY: 7, imageScaleBySize: null, premiumProductId: "border.solstice", amountMinor: 9900, currency: "PHP", collectionPosition: 4 },
  scarlet: { name: "Scarlet", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/scarlet_elite_border.png", imageScale: 1.56, imageOffsetX: 0, imageOffsetY: 8.1, imageScaleBySize: null, premiumProductId: "border.scarlet", amountMinor: 9900, currency: "PHP", collectionPosition: 5 },
  tidal: { name: "Tidal", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/tidal_elite_border.png", imageScale: 1.42, imageOffsetX: 0, imageOffsetY: 1.1, imageScaleBySize: null, premiumProductId: "border.tidal", amountMinor: 9900, currency: "PHP", collectionPosition: 6 },
  inferno: { name: "Inferno", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/inferno_elite_border.png", imageScale: 1.45, imageOffsetX: 0, imageOffsetY: 2.7, imageScaleBySize: null, premiumProductId: "border.inferno", amountMinor: 9900, currency: "PHP", collectionPosition: 7 },
  frost: { name: "Frost", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/frost_elite_border.png", imageScale: 1.42, imageOffsetX: 0, imageOffsetY: 0, imageScaleBySize: null, premiumProductId: "border.frost", amountMinor: 9900, currency: "PHP", collectionPosition: 8 },
  orbit: { name: "Orbit", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/orbit_elite_border.png", imageScale: 1.52, imageOffsetX: 0, imageOffsetY: 4, imageScaleBySize: null, premiumProductId: "border.orbit", amountMinor: 9900, currency: "PHP", collectionPosition: 9 },
  chrono: { name: "Chrono", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/chrono_elite_border.png", imageScale: 1.44, imageOffsetX: 0, imageOffsetY: 0.7, imageScaleBySize: null, premiumProductId: "border.chrono", amountMinor: 9900, currency: "PHP", collectionPosition: 10 },
  zenith: { name: "Zenith", access: "premium", kind: "image", color: null, innerEdge: null, outerEdge: null, assetPath: "/borders/zenith_elite_border.png", imageScale: 1.45, imageOffsetX: 0, imageOffsetY: 1.3, imageScaleBySize: null, premiumProductId: "border.zenith", amountMinor: 9900, currency: "PHP", collectionPosition: 11 },
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
