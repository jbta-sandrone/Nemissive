export type InterestIconName =
  | "gamepad"
  | "code"
  | "music"
  | "film"
  | "sparkles"
  | "book"
  | "plane"
  | "camera"
  | "dumbbell"
  | "trophy"
  | "motorcycle"
  | "car"
  | "palette"
  | "cooking"
  | "coffee"
  | "shirt"
  | "paw"
  | "leaf"
  | "briefcase"
  | "video"
  | "esports"
  | "podcast"
  | "dancing"
  | "heart";

export const INTEREST_OPTIONS = [
  { key: "gaming", label: "Gaming", icon: "gamepad" },
  { key: "coding_tech", label: "Coding & Tech", icon: "code" },
  { key: "music", label: "Music", icon: "music" },
  { key: "movies_tv", label: "Movies & TV", icon: "film" },
  { key: "anime", label: "Anime", icon: "sparkles" },
  { key: "reading", label: "Reading", icon: "book" },
  { key: "travel", label: "Travel", icon: "plane" },
  { key: "photography", label: "Photography", icon: "camera" },
  { key: "fitness", label: "Fitness", icon: "dumbbell" },
  { key: "sports", label: "Sports", icon: "trophy" },
  { key: "motorcycles", label: "Motorcycles", icon: "motorcycle" },
  { key: "cars", label: "Cars", icon: "car" },
  { key: "art_design", label: "Art & Design", icon: "palette" },
  { key: "cooking", label: "Cooking", icon: "cooking" },
  { key: "coffee", label: "Coffee", icon: "coffee" },
  { key: "fashion", label: "Fashion", icon: "shirt" },
  { key: "pets", label: "Pets", icon: "paw" },
  { key: "nature", label: "Nature", icon: "leaf" },
  { key: "business", label: "Business", icon: "briefcase" },
  { key: "content_creation", label: "Content Creation", icon: "video" },
  { key: "esports", label: "Esports", icon: "esports" },
  { key: "podcasts", label: "Podcasts", icon: "podcast" },
  { key: "dancing", label: "Dancing", icon: "dancing" },
  { key: "volunteering", label: "Volunteering", icon: "heart" },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: InterestIconName }>;

export type InterestKey = (typeof INTEREST_OPTIONS)[number]["key"];
export type InterestOption = (typeof INTEREST_OPTIONS)[number];

const interestOptionsByKey = new Map<InterestKey, InterestOption>(INTEREST_OPTIONS.map((option) => [option.key, option]));

export function isInterestKey(value: unknown): value is InterestKey {
  return typeof value === "string" && interestOptionsByKey.has(value as InterestKey);
}

export function getInterestOption(key: string) {
  return interestOptionsByKey.get(key as InterestKey) ?? null;
}

export function normalizeInterestKeys(value: unknown): InterestKey[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<InterestKey>();
  const keys: InterestKey[] = [];
  for (const candidate of value) {
    if (!isInterestKey(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    keys.push(candidate);
    if (keys.length === 5) break;
  }
  return keys;
}
