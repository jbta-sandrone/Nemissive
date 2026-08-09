import type { ProfileSearchResult } from "../../types/conversations";
import { getProfileDisplayName } from "./profileUtils";

type ProfileAvatarProps = {
  profile: ProfileSearchResult;
  size?: "sm" | "md" | "lg" | "xl";
  accessibleLabel?: string;
};

const sizeClasses = {
  sm: "h-10 w-10 rounded-2xl text-sm",
  md: "h-12 w-12 rounded-full text-base",
  lg: "h-16 w-16 rounded-3xl text-xl",
  xl: "h-28 w-28 rounded-[2rem] text-3xl",
};

function ProfileAvatar({ profile, size = "md", accessibleLabel }: ProfileAvatarProps) {
  const displayName = getProfileDisplayName(profile);
  const classes = `${sizeClasses[size]} shrink-0 bg-accent object-cover font-bold text-primary`;

  if (profile.avatar_url) {
    return <img src={profile.avatar_url} alt={accessibleLabel ?? ""} className={classes} />;
  }

  return <div className={`flex items-center justify-center ${classes}`} role={accessibleLabel ? "img" : undefined} aria-label={accessibleLabel} aria-hidden={accessibleLabel ? undefined : "true"}>{displayName.charAt(0).toUpperCase()}</div>;
}

export default ProfileAvatar;
