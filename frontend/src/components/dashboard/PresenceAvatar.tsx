import type { ProfileSearchResult } from "../../types/conversations";
import ProfileAvatar from "./ProfileAvatar";
import { getProfileDisplayName } from "./profileUtils";

type PresenceAvatarProps = {
  profile: ProfileSearchResult;
  isOnline: boolean;
  size?: "sm" | "md" | "lg";
};

function PresenceAvatar({ profile, isOnline, size = "md" }: PresenceAvatarProps) {
  return (
    <div className="relative shrink-0">
      <ProfileAvatar profile={profile} size={size} />
      {isOnline && <><span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-online" aria-hidden="true" /><span className="sr-only">{getProfileDisplayName(profile)} is online</span></>}
    </div>
  );
}

export default PresenceAvatar;
