import type { ProfileBannerKey } from "../../types/profileBanners";
import { profileBannerKeys } from "../../types/profileBanners";
import { canAccessPremiumProduct, type PremiumAccessState, type PremiumProfileThemeProductId } from "./premiumAccess";

export type ProfileThemeAppearance = {
  assetPath: string;
  baseColor: string;
  continuationBackground: string;
  background: string;
  card: string;
  primary: string;
  accent: string;
  accentHover: string;
  border: string;
  heading: string;
  body: string;
  muted: string;
  controlAccent?: string;
};

export type ProfileThemeDefinition = {
  key: ProfileBannerKey;
  name: string;
  access: "free" | "premium";
  kind: "none" | "gradient" | "image";
  backgroundImage: string | null;
  appearance: { light: ProfileThemeAppearance; dark: ProfileThemeAppearance } | null;
  imageAspectRatio: number | null;
  imageFadeStartPercent: number | null;
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
  imageAspectRatio: null,
  imageFadeStartPercent: null,
  premiumProductId: null,
  amountMinor: null,
  currency: null,
  collectionPosition: null,
});

type ImageThemePalette = Omit<ProfileThemeAppearance, "assetPath" | "continuationBackground">;

function eliteImageTheme(
  name: string,
  assetSlug: string,
  premiumProductId: PremiumProfileThemeProductId,
  collectionPosition: number,
  light: ImageThemePalette,
  dark: ImageThemePalette,
): Omit<ProfileThemeDefinition, "key"> {
  return {
    name,
    access: "premium",
    kind: "image",
    backgroundImage: null,
    appearance: {
      light: { assetPath: `/profile%20themes/${assetSlug}_light.png`, continuationBackground: "none", ...light },
      dark: { assetPath: `/profile%20themes/${assetSlug}_dark.png`, continuationBackground: "none", ...dark },
    },
    imageAspectRatio: 1024 / 1536,
    imageFadeStartPercent: 78,
    premiumProductId,
    amountMinor: 29900,
    currency: "PHP",
    collectionPosition,
  };
}

const bannerTokens: Record<ProfileBannerKey, Omit<ProfileThemeDefinition, "key">> = {
  none: freeTheme("None", null),
  azure: freeTheme("Azure", profileThemeGradient("#173b68", "#2f6fa8", "#70b8df")),
  emerald: freeTheme("Emerald", profileThemeGradient("#173f35", "#2d765c", "#72b995")),
  violet: freeTheme("Violet", profileThemeGradient("#38245f", "#68509a", "#aa86ca")),
  rose: freeTheme("Rose", profileThemeGradient("#6f2e45", "#a9556c", "#dfa0ad")),
  amber: freeTheme("Amber", profileThemeGradient("#6a411d", "#a96d2b", "#dfaa58")),
  ocean: freeTheme("Ocean", profileThemeGradient("#102f50", "#1f6b73", "#58abc1")),
  twilight: freeTheme("Twilight", profileThemeGradient("#283257", "#62517f", "#b07a8e")),
  astralis: eliteImageTheme("Astralis", "astralis", "profile-theme.astralis", 1, {
    baseColor: "#cdd3f3", background: "#f6f3fc", card: "#f8f6ff", primary: "#6651b6", accent: "#e1daf4", accentHover: "#d3c9ee", border: "#c8bee2", heading: "#2d2841", body: "#5c5671", muted: "#7c7590", controlAccent: "#7862bd",
  }, {
    baseColor: "#03010d", background: "#0a0b16", card: "#101225", primary: "#bea7ff", accent: "#1d1938", accentHover: "#2a224c", border: "#302858", heading: "#f6f2ff", body: "#d4cceb", muted: "#a59bbc",
  }),
  hanami: eliteImageTheme("Hanami", "hanami", "profile-theme.hanami", 2, {
    baseColor: "#d7d9f6", background: "#faf3f8", card: "#fff8fc", primary: "#a44266", accent: "#f0dbe6", accentHover: "#e8cbdc", border: "#d9bfd0", heading: "#3f2935", body: "#675160", muted: "#8a7180", controlAccent: "#b85e7d",
  }, {
    baseColor: "#0d0205", background: "#16060b", card: "#210b12", primary: "#f1a3b8", accent: "#35101b", accentHover: "#4a1725", border: "#5a1e2d", heading: "#fff2f5", body: "#e8c8d0", muted: "#b48f9a",
  }),
  coralline: eliteImageTheme("Coralline", "coralline", "profile-theme.coralline", 3, {
    baseColor: "#a1cdf7", background: "#eaf6fc", card: "#f2faff", primary: "#126c8c", accent: "#d4ecf6", accentHover: "#c2e3f0", border: "#afd8e8", heading: "#173746", body: "#456576", muted: "#6b8794", controlAccent: "#2a91aa",
  }, {
    baseColor: "#01050c", background: "#04121b", card: "#071c27", primary: "#75dbef", accent: "#0a2a38", accentHover: "#103b4b", border: "#17485a", heading: "#effcff", body: "#c7e8ee", muted: "#8fb5bf",
  }),
  regalia: eliteImageTheme("Regalia", "regalia", "profile-theme.regalia", 4, {
    baseColor: "#ede7e3", background: "#faf5ec", card: "#fffaf2", primary: "#8b2d39", accent: "#f2e3d1", accentHover: "#ead4ba", border: "#dbc6ac", heading: "#3f2926", body: "#68534d", muted: "#8b746c", controlAccent: "#b28a4b",
  }, {
    baseColor: "#0a0001", background: "#170506", card: "#22090b", primary: "#e6bd73", accent: "#351014", accentHover: "#4a171d", border: "#603025", heading: "#fff5e9", body: "#e8d3c0", muted: "#b69c88",
  }),
  tempest: eliteImageTheme("Tempest", "tempest", "profile-theme.tempest", 5, {
    baseColor: "#c6d5ea", background: "#edf5fc", card: "#f4f9ff", primary: "#2f66b0", accent: "#d9e7f5", accentHover: "#c8daf0", border: "#b5cbe3", heading: "#1c324d", body: "#4a617a", muted: "#71859b", controlAccent: "#447cc3",
  }, {
    baseColor: "#01040a", background: "#040e1a", card: "#081727", primary: "#8dbdff", accent: "#102b49", accentHover: "#183d62", border: "#214d78", heading: "#f2f8ff", body: "#c8dbef", muted: "#91aac3",
  }),
  bladeworn: eliteImageTheme("Bladeworn", "bladeworn", "profile-theme.bladeworn", 6, {
    baseColor: "#dde7f8", background: "#eff6fb", card: "#f7fbff", primary: "#0c737c", accent: "#d8eaed", accentHover: "#c6e0e4", border: "#aeced3", heading: "#18373b", body: "#49676b", muted: "#718a8c", controlAccent: "#2c858b",
  }, {
    baseColor: "#04080a", background: "#071315", card: "#0b1d20", primary: "#6bd6d7", accent: "#103032", accentHover: "#184447", border: "#20565a", heading: "#f0ffff", body: "#c2dcdd", muted: "#8da8aa",
  }),
  shadow: eliteImageTheme("Shadow", "shadow", "profile-theme.shadow", 7, {
    baseColor: "#cacace", background: "#f1f1f2", card: "#f7f7f8", primary: "#4d4d55", accent: "#dedee1", accentHover: "#d1d1d5", border: "#bfc0c5", heading: "#242428", body: "#55555c", muted: "#77777f", controlAccent: "#676773",
  }, {
    baseColor: "#040403", background: "#0d0d0d", card: "#171717", primary: "#d7d7da", accent: "#242426", accentHover: "#333337", border: "#444449", heading: "#fafafa", body: "#d2d2d4", muted: "#9c9ca2",
  }),
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
