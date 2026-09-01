import { memo } from "react";
import type { AccountStatus } from "../../types/account";
import type { AvatarBorderKey } from "../../types/avatarBorders";
import { normalizeAvatarBorderKey } from "../../types/avatarBorders";
import type { ProfileSearchResult } from "../../types/conversations";
import AccountStatusEmblem from "./AccountStatusEmblem";
import AvatarBorderFrame from "./AvatarBorderFrame";
import ProfileAvatar from "./ProfileAvatar";
import { accountStatusLabels } from "./premiumPresentation";
import { getProfileDisplayName } from "./profileUtils";

type UserIdentityAvatarProps = {
  profile: ProfileSearchResult;
  accountStatus?: AccountStatus | null;
  isOnline?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  avatarBorder?: AvatarBorderKey;
  avatarOverride?: string | null;
  className?: string;
};

/**
 * Shared avatar stack. The image uses z-0, the selected frame uses z-10,
 * and account status plus presence remain visible above it at z-20.
 */
function UserIdentityAvatar({ profile, accountStatus = null, isOnline = false, size = "md", avatarBorder, avatarOverride, className = "" }: UserIdentityAvatarProps) {
  const displayName = getProfileDisplayName(profile);
  const statusDescription = accountStatus ? `, Nemissive ${accountStatusLabels[accountStatus]} account` : "";
  const onlineDescription = isOnline ? ", online" : "";
  const compactEmblem = size === "xs";
  const resolvedBorder = normalizeAvatarBorderKey(avatarBorder ?? profile.avatar_border);

  return (
    <span data-avatar-identity className={`relative isolate inline-flex shrink-0 overflow-visible ${className}`}>
      <span data-avatar-layer="image" className="relative z-0 inline-flex">
        <ProfileAvatar profile={profile} size={size} avatarOverride={avatarOverride} accessibleLabel={`${displayName}${statusDescription}${onlineDescription}`} />
      </span>
      <AvatarBorderFrame borderKey={resolvedBorder} size={size} />
      {accountStatus && <AccountStatusEmblem status={accountStatus} size={compactEmblem ? "compact" : "default"} decorative className="pointer-events-none absolute -bottom-0.5 -left-0.5 z-20 shadow-sm" />}
      {isOnline && <span data-avatar-layer="presence" className={`pointer-events-none absolute -bottom-0.5 -right-0.5 z-20 rounded-full border-2 border-surface bg-online ${compactEmblem ? "h-3 w-3" : "h-3.5 w-3.5"}`} aria-hidden="true" />}
    </span>
  );
}

export default memo(UserIdentityAvatar);
