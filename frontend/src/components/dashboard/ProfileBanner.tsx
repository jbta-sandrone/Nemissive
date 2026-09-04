import type { CSSProperties, ReactNode } from "react";
import type { ProfileBannerKey } from "../../types/profileBanners";
import { normalizeProfileBannerKey } from "../../types/profileBanners";
import { getProfileBannerDefinition } from "./profileBanners";

type ProfileBannerProps = {
  bannerKey?: ProfileBannerKey | null;
  className?: string;
  children?: ReactNode;
};

/** Shared full-profile theme surface. The persisted name remains profile_banner for API compatibility. */
function ProfileBanner({ bannerKey, className = "", children }: ProfileBannerProps) {
  const resolvedKey = normalizeProfileBannerKey(bannerKey);
  const theme = getProfileBannerDefinition(resolvedKey);
  const style = theme.appearance ? {
    "--profile-theme-light-image": `url("${theme.appearance.light.assetPath}")`,
    "--profile-theme-light-base": theme.appearance.light.baseColor,
    "--profile-theme-light-background": theme.appearance.light.background,
    "--profile-theme-light-card": theme.appearance.light.card,
    "--profile-theme-light-primary": theme.appearance.light.primary,
    "--profile-theme-light-accent": theme.appearance.light.accent,
    "--profile-theme-light-accent-hover": theme.appearance.light.accentHover,
    "--profile-theme-light-border": theme.appearance.light.border,
    "--profile-theme-light-heading": theme.appearance.light.heading,
    "--profile-theme-light-body": theme.appearance.light.body,
    "--profile-theme-light-muted": theme.appearance.light.muted,
    "--profile-theme-dark-image": `url("${theme.appearance.dark.assetPath}")`,
    "--profile-theme-dark-base": theme.appearance.dark.baseColor,
    "--profile-theme-dark-background": theme.appearance.dark.background,
    "--profile-theme-dark-card": theme.appearance.dark.card,
    "--profile-theme-dark-primary": theme.appearance.dark.primary,
    "--profile-theme-dark-accent": theme.appearance.dark.accent,
    "--profile-theme-dark-accent-hover": theme.appearance.dark.accentHover,
    "--profile-theme-dark-border": theme.appearance.dark.border,
    "--profile-theme-dark-heading": theme.appearance.dark.heading,
    "--profile-theme-dark-body": theme.appearance.dark.body,
    "--profile-theme-dark-muted": theme.appearance.dark.muted,
  } as CSSProperties : theme.backgroundImage ? { backgroundImage: theme.backgroundImage } satisfies CSSProperties : undefined;

  return <div data-profile-theme={resolvedKey} data-profile-theme-kind={theme.kind} className={`profile-theme-surface relative bg-surface ${className}`} style={style}>{children}</div>;
}

export default ProfileBanner;
