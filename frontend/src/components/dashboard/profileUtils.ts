import type { ProfileSearchResult } from "../../types/conversations";

export function getProfileDisplayName(profile: ProfileSearchResult) {
  return profile.display_name?.trim() || profile.username?.trim() || "Nemissive user";
}
