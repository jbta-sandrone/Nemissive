export const avatarBorderKeys = ["none", "pearl", "graphite", "azure", "emerald", "violet", "rose", "amber", "aurelia", "moonveil", "prismara", "solstice", "scarlet", "tidal", "inferno", "frost", "orbit", "chrono", "zenith"] as const;

export type AvatarBorderKey = (typeof avatarBorderKeys)[number];

export function isAvatarBorderKey(value: unknown): value is AvatarBorderKey {
  return typeof value === "string" && avatarBorderKeys.includes(value as AvatarBorderKey);
}

export function normalizeAvatarBorderKey(value: unknown): AvatarBorderKey {
  return isAvatarBorderKey(value) ? value : "none";
}
