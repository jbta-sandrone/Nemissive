export const profileBannerKeys = [
  "none",
  "azure",
  "emerald",
  "violet",
  "rose",
  "amber",
  "ocean",
  "twilight",
  "astralis",
  "hanami",
  "coralline",
  "regalia",
  "tempest",
  "bladeworn",
  "shadow",
] as const;

export type ProfileBannerKey = (typeof profileBannerKeys)[number];

const profileBannerKeySet = new Set<string>(profileBannerKeys);

export function normalizeProfileBannerKey(value: unknown): ProfileBannerKey {
  return typeof value === "string" && profileBannerKeySet.has(value) ? value as ProfileBannerKey : "none";
}
