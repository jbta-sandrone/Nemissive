import type { ProfileBannerKey } from "../../types/profileBanners";
import { profileBannerKeys } from "../../types/profileBanners";
import { canAccessPremiumProduct, type PremiumAccessState, type PremiumProfileThemeProductId } from "./premiumAccess";

export type ProfileThemeAppearance = {
  assetPath: string;
  baseColor: string;
  background: string;
  card: string;
  primary: string;
  accent: string;
  accentHover: string;
  border: string;
  heading: string;
  body: string;
  muted: string;
};

export type ProfileThemeDefinition = {
  key: ProfileBannerKey;
  name: string;
  access: "free" | "premium";
  kind: "none" | "gradient" | "image";
  backgroundImage: string | null;
  appearance: { light: ProfileThemeAppearance; dark: ProfileThemeAppearance } | null;
  premiumProductId: PremiumProfileThemeProductId | null;
  amountMinor: number | null;
  currency: "PHP" | null;
  collectionPosition: number | null;
};

function profileThemeGradient(dark: string, mid: string, highlight: string) {
  return `linear-gradient(180deg, color-mix(in srgb, ${dark} 46%, var(--color-surface)) 0%, color-mix(in srgb, ${mid} 36%, var(--color-surface)) 15%, color-mix(in srgb, ${highlight} 22%, var(--color-surface)) 35%, color-mix(in srgb, ${mid} 12%, var(--color-surface)) 60%, color-mix(in srgb, ${dark} 5%, var(--color-surface)) 80%, var(--color-surface) 100%)`;
}

const freeTheme = (name: string, backgroundImage: string | null): Omit<ProfileThemeDefinition, "key"> => ({
  name,
  access: "free",
  kind: backgroundImage ? "gradient" : "none",
  backgroundImage,
  appearance: null,
  premiumProductId: null,
  amountMinor: null,
  currency: null,
  collectionPosition: null,
});

const bannerTokens: Record<ProfileBannerKey, Omit<ProfileThemeDefinition, "key">> = {
  none: freeTheme("None", null),
  azure: freeTheme("Azure", profileThemeGradient("#173b68", "#2f6fa8", "#70b8df")),
  emerald: freeTheme("Emerald", profileThemeGradient("#173f35", "#2d765c", "#72b995")),
  violet: freeTheme("Violet", profileThemeGradient("#38245f", "#68509a", "#aa86ca")),
  rose: freeTheme("Rose", profileThemeGradient("#6f2e45", "#a9556c", "#dfa0ad")),
  amber: freeTheme("Amber", profileThemeGradient("#6a411d", "#a96d2b", "#dfaa58")),
  ocean: freeTheme("Ocean", profileThemeGradient("#102f50", "#1f6b73", "#58abc1")),
  twilight: freeTheme("Twilight", profileThemeGradient("#283257", "#62517f", "#b07a8e")),
  astralis: {
    name: "Astralis",
    access: "premium",
    kind: "image",
    backgroundImage: null,
    appearance: {
      light: {
        assetPath: "/profile%20themes/astralis_light.png",
        baseColor: "#ece8fa",
        background: "#f6f3fc",
        card: "#f8f6ff",
        primary: "#6651b6",
        accent: "#e1daf4",
        accentHover: "#d3c9ee",
        border: "#c8bee2",
        heading: "#2d2841",
        body: "#5c5671",
        muted: "#7c7590",
      },
      dark: {
        assetPath: "/profile%20themes/astralis_dark.png",
        baseColor: "#06070e",
        background: "#0a0b16",
        card: "#101225",
        primary: "#bea7ff",
        accent: "#1d1938",
        accentHover: "#2a224c",
        border: "#302858",
        heading: "#f6f2ff",
        body: "#d4cceb",
        muted: "#a59bbc",
      },
    },
    premiumProductId: "profile-theme.astralis",
    amountMinor: 29900,
    currency: "PHP",
    collectionPosition: 1,
  },
};

export const profileBannerCatalog: readonly ProfileThemeDefinition[] = profileBannerKeys.map((key) => ({ key, ...bannerTokens[key] }));
export const freeProfileBannerCatalog = profileBannerCatalog.filter((theme) => theme.access === "free");
export const premiumProfileBannerCatalog = profileBannerCatalog.filter((theme) => theme.access === "premium");

export function getProfileBannerDefinition(key: ProfileBannerKey) {
  return profileBannerCatalog.find((theme) => theme.key === key) ?? profileBannerCatalog[0];
}

export function canUseProfileBanner(key: ProfileBannerKey, premiumAccess: PremiumAccessState) {
  const theme = getProfileBannerDefinition(key);
  return theme.access === "free" || (theme.premiumProductId !== null && canAccessPremiumProduct(premiumAccess, theme.premiumProductId));
}
