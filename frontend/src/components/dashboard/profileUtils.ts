import type { ProfileSearchResult } from "../../types/conversations";

export function getProfileDisplayName(profile: ProfileSearchResult) {
  if (profile.account_status === "deleting" || profile.account_status === "deleted") return "Deleted User";
  return profile.display_name?.trim() || profile.username?.trim() || "Nemissive user";
}

export function getConversationDisplayName(profile: ProfileSearchResult, nickname?: string | null) {
  if (profile.account_status === "deleting" || profile.account_status === "deleted") return "Deleted User";
  return nickname?.trim() || getProfileDisplayName(profile);
}

export function isDeletedProfile(profile: ProfileSearchResult) {
  return profile.account_status === "deleting" || profile.account_status === "deleted";
}
