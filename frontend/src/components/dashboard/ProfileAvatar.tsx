import { useState } from "react";
import { getProfileAvatarUrl } from "../../lib/profileIdentity";
import type { ProfileSearchResult } from "../../types/conversations";
import { getProfileDisplayName } from "./profileUtils";

type ProfileAvatarProps = {
  profile: ProfileSearchResult;
  size?: "sm" | "md" | "lg" | "xl";
  accessibleLabel?: string;
  avatarOverride?: string | null;
};

const sizeClasses = {
  sm: "h-10 w-10 rounded-full text-sm",
  md: "h-12 w-12 rounded-full text-base",
  lg: "h-16 w-16 rounded-full text-xl",
  xl: "h-28 w-28 rounded-full text-3xl",
};

function AvatarImage({ source, accessibleLabel, classes, eager, fallback }: { source: string; accessibleLabel?: string; classes: string; eager: boolean; fallback: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) return <div className={`flex items-center justify-center ${classes}`} role={accessibleLabel ? "img" : undefined} aria-label={accessibleLabel} aria-hidden={accessibleLabel ? undefined : "true"}>{fallback}</div>;
  return <img src={source} alt={accessibleLabel ?? ""} loading={eager ? "eager" : "lazy"} onError={() => setImageFailed(true)} className={classes} />;
}

function ProfileAvatar({ profile, size = "md", accessibleLabel, avatarOverride }: ProfileAvatarProps) {
  const displayName = getProfileDisplayName(profile);
  const source = avatarOverride === undefined ? getProfileAvatarUrl(profile.avatar_url) : avatarOverride;
  const classes = `${sizeClasses[size]} shrink-0 bg-accent object-cover object-center font-bold text-primary`;

  if (source) {
    return <AvatarImage key={source} source={source} accessibleLabel={accessibleLabel} classes={classes} eager={size === "xl"} fallback={displayName.charAt(0).toUpperCase()} />;
  }

  return <div className={`flex items-center justify-center ${classes}`} role={accessibleLabel ? "img" : undefined} aria-label={accessibleLabel} aria-hidden={accessibleLabel ? undefined : "true"}>{displayName.charAt(0).toUpperCase()}</div>;
}

export default ProfileAvatar;
