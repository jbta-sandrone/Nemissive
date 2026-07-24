export type EmojiItem = {
  emoji: string;
  label: string;
  category: string;
  keywords: string;
};

export const defaultQuickReactions = ["❤️", "😂", "👍", "😮", "😢", "🙏"] as const;

export const emojiItems: EmojiItem[] = [
  { emoji: "😀", label: "Grinning face", category: "Smileys", keywords: "happy smile" },
  { emoji: "😂", label: "Face with tears of joy", category: "Smileys", keywords: "laugh funny" },
  { emoji: "🥰", label: "Smiling face with hearts", category: "Smileys", keywords: "love affection" },
  { emoji: "😍", label: "Heart eyes", category: "Smileys", keywords: "love excited" },
  { emoji: "😊", label: "Smiling face", category: "Smileys", keywords: "happy warm" },
  { emoji: "😮", label: "Surprised face", category: "Smileys", keywords: "wow surprise" },
  { emoji: "😢", label: "Crying face", category: "Smileys", keywords: "sad tear" },
  { emoji: "🤔", label: "Thinking face", category: "Smileys", keywords: "think curious" },
  { emoji: "👍", label: "Thumbs up", category: "People", keywords: "yes approve good" },
  { emoji: "👎", label: "Thumbs down", category: "People", keywords: "no disagree" },
  { emoji: "👏", label: "Clapping hands", category: "People", keywords: "applause congratulations" },
  { emoji: "🙏", label: "Folded hands", category: "People", keywords: "thanks please prayer" },
  { emoji: "🤝", label: "Handshake", category: "People", keywords: "agreement welcome" },
  { emoji: "💪", label: "Flexed biceps", category: "People", keywords: "strong support" },
  { emoji: "👋", label: "Waving hand", category: "People", keywords: "hello goodbye" },
  { emoji: "🙌", label: "Raising hands", category: "People", keywords: "celebrate hooray" },
  { emoji: "🐶", label: "Dog face", category: "Animals", keywords: "pet puppy" },
  { emoji: "🐱", label: "Cat face", category: "Animals", keywords: "pet kitten" },
  { emoji: "🐻", label: "Bear", category: "Animals", keywords: "animal" },
  { emoji: "🦊", label: "Fox", category: "Animals", keywords: "animal" },
  { emoji: "🐼", label: "Panda", category: "Animals", keywords: "animal" },
  { emoji: "🦋", label: "Butterfly", category: "Animals", keywords: "nature" },
  { emoji: "🌻", label: "Sunflower", category: "Animals", keywords: "flower nature" },
  { emoji: "🌿", label: "Herb", category: "Animals", keywords: "leaf nature" },
  { emoji: "☕", label: "Hot beverage", category: "Food", keywords: "coffee tea drink" },
  { emoji: "🍕", label: "Pizza", category: "Food", keywords: "food meal" },
  { emoji: "🍜", label: "Steaming bowl", category: "Food", keywords: "noodles meal" },
  { emoji: "🍰", label: "Shortcake", category: "Food", keywords: "cake dessert birthday" },
  { emoji: "🍓", label: "Strawberry", category: "Food", keywords: "fruit" },
  { emoji: "🥑", label: "Avocado", category: "Food", keywords: "food" },
  { emoji: "🍿", label: "Popcorn", category: "Food", keywords: "movie snack" },
  { emoji: "🥂", label: "Clinking glasses", category: "Food", keywords: "cheers celebrate" },
  { emoji: "⚽", label: "Soccer ball", category: "Activities", keywords: "sport football" },
  { emoji: "🏀", label: "Basketball", category: "Activities", keywords: "sport" },
  { emoji: "🎨", label: "Artist palette", category: "Activities", keywords: "art paint" },
  { emoji: "🎵", label: "Musical note", category: "Activities", keywords: "music song" },
  { emoji: "🎉", label: "Party popper", category: "Activities", keywords: "celebrate party" },
  { emoji: "🏆", label: "Trophy", category: "Activities", keywords: "winner achievement" },
  { emoji: "📚", label: "Books", category: "Activities", keywords: "read study" },
  { emoji: "🎮", label: "Video game", category: "Activities", keywords: "game play" },
  { emoji: "✈️", label: "Airplane", category: "Travel", keywords: "flight trip" },
  { emoji: "🚗", label: "Car", category: "Travel", keywords: "drive vehicle" },
  { emoji: "🚲", label: "Bicycle", category: "Travel", keywords: "bike ride" },
  { emoji: "🏡", label: "House with garden", category: "Travel", keywords: "home" },
  { emoji: "🌅", label: "Sunrise", category: "Travel", keywords: "morning view" },
  { emoji: "🌍", label: "Globe", category: "Travel", keywords: "earth world" },
  { emoji: "🗺️", label: "World map", category: "Travel", keywords: "map trip" },
  { emoji: "🏖️", label: "Beach", category: "Travel", keywords: "vacation sea" },
  { emoji: "💡", label: "Light bulb", category: "Objects", keywords: "idea" },
  { emoji: "📌", label: "Pushpin", category: "Objects", keywords: "pin remember" },
  { emoji: "🎁", label: "Wrapped gift", category: "Objects", keywords: "present" },
  { emoji: "📷", label: "Camera", category: "Objects", keywords: "photo" },
  { emoji: "💻", label: "Laptop", category: "Objects", keywords: "computer work" },
  { emoji: "📱", label: "Mobile phone", category: "Objects", keywords: "device call" },
  { emoji: "🔑", label: "Key", category: "Objects", keywords: "unlock" },
  { emoji: "📝", label: "Memo", category: "Objects", keywords: "write note" },
  { emoji: "❤️", label: "Red heart", category: "Symbols", keywords: "love heart" },
  { emoji: "🧡", label: "Orange heart", category: "Symbols", keywords: "love heart" },
  { emoji: "💛", label: "Yellow heart", category: "Symbols", keywords: "love heart" },
  { emoji: "💚", label: "Green heart", category: "Symbols", keywords: "love heart" },
  { emoji: "💙", label: "Blue heart", category: "Symbols", keywords: "love heart" },
  { emoji: "✨", label: "Sparkles", category: "Symbols", keywords: "shine magic" },
  { emoji: "✅", label: "Check mark", category: "Symbols", keywords: "yes done" },
  { emoji: "💯", label: "Hundred points", category: "Symbols", keywords: "perfect agree" },
  { emoji: "🇵🇭", label: "Flag of the Philippines", category: "Flags", keywords: "philippines flag" },
  { emoji: "🇺🇸", label: "Flag of the United States", category: "Flags", keywords: "united states america flag" },
  { emoji: "🇬🇧", label: "Flag of the United Kingdom", category: "Flags", keywords: "united kingdom britain flag" },
  { emoji: "🇯🇵", label: "Flag of Japan", category: "Flags", keywords: "japan flag" },
  { emoji: "🇰🇷", label: "Flag of South Korea", category: "Flags", keywords: "korea flag" },
  { emoji: "🇨🇦", label: "Flag of Canada", category: "Flags", keywords: "canada flag" },
  { emoji: "🇦🇺", label: "Flag of Australia", category: "Flags", keywords: "australia flag" },
  { emoji: "🏳️‍🌈", label: "Rainbow flag", category: "Flags", keywords: "pride rainbow flag" },
];

const emojiLabelByValue = new Map(emojiItems.map((item) => [item.emoji, item.label]));

export function getEmojiLabel(emoji: string) {
  return emojiLabelByValue.get(emoji) ?? "Emoji";
}

export function normalizeQuickReactions(value: string[] | null | undefined) {
  if (!value || value.length < 4 || value.length > 8 || new Set(value).size !== value.length) return [...defaultQuickReactions];
  return [...value];
}
