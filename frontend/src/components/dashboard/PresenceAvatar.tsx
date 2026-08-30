import type { AccountStatus } from "../../types/account";
import type { ProfileSearchResult } from "../../types/conversations";
import UserIdentityAvatar from "./UserIdentityAvatar";

type PresenceAvatarProps = {
  profile: ProfileSearchResult;
  isOnline: boolean;
  size?: "sm" | "md" | "lg";
  accountStatus?: AccountStatus | null;
};

function PresenceAvatar({ profile, isOnline, size = "md", accountStatus = null }: PresenceAvatarProps) {
  return <UserIdentityAvatar profile={profile} accountStatus={accountStatus} isOnline={isOnline} size={size} />;
}

export default PresenceAvatar;
