import type { AvatarBorderKey } from "../../types/avatarBorders";
import { avatarBorderKeys } from "../../types/avatarBorders";

export type AvatarBorderDefinition = {
  key: AvatarBorderKey;
  name: string;
  access: "free";
  color: string | null;
  innerEdge: string | null;
  outerEdge: string | null;
};

const borderTokens: Record<AvatarBorderKey, Omit<AvatarBorderDefinition, "key">> = {
  none: { name: "None", access: "free", color: null, innerEdge: null, outerEdge: null },
  pearl: { name: "Pearl", access: "free", color: "#e5ddd0", innerEdge: "#fffdf8", outerEdge: "#aaa298" },
  graphite: { name: "Graphite", access: "free", color: "#555b64", innerEdge: "#858c96", outerEdge: "#292d33" },
  azure: { name: "Azure", access: "free", color: "#3f82bd", innerEdge: "#76add9", outerEdge: "#255987" },
  emerald: { name: "Emerald", access: "free", color: "#37866a", innerEdge: "#70b49a", outerEdge: "#205a47" },
  violet: { name: "Violet", access: "free", color: "#795fa9", innerEdge: "#a38cca", outerEdge: "#4e3b76" },
  rose: { name: "Rose", access: "free", color: "#b76278", innerEdge: "#d99aaa", outerEdge: "#7d3e50" },
  amber: { name: "Amber", access: "free", color: "#b77a32", innerEdge: "#d8a461", outerEdge: "#7c501f" },
};

export const avatarBorderCatalog: readonly AvatarBorderDefinition[] = avatarBorderKeys.map((key) => ({ key, ...borderTokens[key] }));

export function getAvatarBorderDefinition(key: AvatarBorderKey) {
  return avatarBorderCatalog.find((border) => border.key === key) ?? avatarBorderCatalog[0];
}
