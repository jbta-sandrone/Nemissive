import type { ProfileSearchResult } from "../../types/conversations";

export function getProfileDisplayName(profile: ProfileSearchResult) {
  return profile.display_name?.trim() || profile.username?.trim() || "Nemissive user";
}

export function getConversationDisplayName(profile: ProfileSearchResult, nickname?: string | null) {
  return nickname?.trim() || getProfileDisplayName(profile);
}
