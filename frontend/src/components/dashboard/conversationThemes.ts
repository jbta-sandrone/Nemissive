import type { CSSProperties } from "react";

export const conversationThemeIds = ["default", "midnight", "ocean", "lavender", "emerald", "rose", "sunset"] as const;

export type ConversationThemeId = (typeof conversationThemeIds)[number];

type ConversationThemeTokens = {
  background: string;
  headerBackground: string;
  surface: string;
  surfaceMuted: string;
  outgoingBackground: string;
  outgoingText: string;
  incomingBackground: string;
  incomingText: string;
  composerBackground: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  border: string;
  heading: string;
  body: string;
  mutedText: string;
};

export type ConversationThemeDefinition = {
  id: ConversationThemeId;
  name: string;
  tokens: ConversationThemeTokens;
};

export const conversationThemes: readonly ConversationThemeDefinition[] = [
  {
    id: "default",
    name: "Default",
    tokens: { background: "var(--color-background)", headerBackground: "var(--color-surface)", surface: "var(--color-surface)", surfaceMuted: "var(--color-accent)", outgoingBackground: "var(--color-primary)", outgoingText: "#ffffff", incomingBackground: "var(--color-surface)", incomingText: "var(--color-body)", composerBackground: "var(--color-surface)", accent: "var(--color-primary)", accentHover: "var(--color-primary-hover)", accentSoft: "var(--color-accent)", border: "var(--color-border)", heading: "var(--color-heading)", body: "var(--color-body)", mutedText: "var(--color-muted)" },
  },
  {
    id: "midnight",
    name: "Midnight",
    tokens: { background: "linear-gradient(145deg, #111522 0%, #171a2d 100%)", headerBackground: "#171b2d", surface: "#20253a", surfaceMuted: "#2a3049", outgoingBackground: "#626edc", outgoingText: "#ffffff", incomingBackground: "#252b40", incomingText: "#edf0f8", composerBackground: "#1b2033", accent: "#9aa4ff", accentHover: "#7f8bf2", accentSoft: "rgb(154 164 255 / 0.16)", border: "#353c57", heading: "#f7f8fc", body: "#d7dbea", mutedText: "#a7afc4" },
  },
  {
    id: "ocean",
    name: "Ocean",
    tokens: { background: "linear-gradient(150deg, #edf9fb 0%, #e8f2fb 100%)", headerBackground: "#f7fcfd", surface: "#ffffff", surfaceMuted: "#dff2f6", outgoingBackground: "#247fa3", outgoingText: "#ffffff", incomingBackground: "#f7fcfd", incomingText: "#294f5e", composerBackground: "#f9fdfe", accent: "#19799f", accentHover: "#126887", accentSoft: "#d8eff5", border: "#c9e3e9", heading: "#183f4f", body: "#3b6473", mutedText: "#668592" },
  },
  {
    id: "lavender",
    name: "Lavender",
    tokens: { background: "linear-gradient(150deg, #f7f3fb 0%, #f0ecf8 100%)", headerBackground: "#fcfaff", surface: "#fffefe", surfaceMuted: "#ece4f5", outgoingBackground: "#8064ad", outgoingText: "#ffffff", incomingBackground: "#fbf9fd", incomingText: "#514560", composerBackground: "#fdfbff", accent: "#795aa7", accentHover: "#684994", accentSoft: "#e9e0f3", border: "#ded2ea", heading: "#44354f", body: "#655772", mutedText: "#897b93" },
  },
  {
    id: "emerald",
    name: "Emerald",
    tokens: { background: "linear-gradient(150deg, #edf7f2 0%, #e7f2ed 100%)", headerBackground: "#f7fcf9", surface: "#ffffff", surfaceMuted: "#dceee5", outgoingBackground: "#27795f", outgoingText: "#ffffff", incomingBackground: "#f6fbf8", incomingText: "#315b4d", composerBackground: "#f8fcfa", accent: "#216f59", accentHover: "#195e4b", accentSoft: "#d5eade", border: "#c9e0d5", heading: "#21483b", body: "#466a5e", mutedText: "#708b81" },
  },
  {
    id: "rose",
    name: "Rose",
    tokens: { background: "linear-gradient(150deg, #fcf3f4 0%, #f8edef 100%)", headerBackground: "#fffafa", surface: "#fffefe", surfaceMuted: "#f5e1e5", outgoingBackground: "#a85168", outgoingText: "#ffffff", incomingBackground: "#fff9fa", incomingText: "#674650", composerBackground: "#fffafb", accent: "#9c4961", accentHover: "#893b52", accentSoft: "#f2dce1", border: "#ebd0d6", heading: "#57343f", body: "#765660", mutedText: "#967983" },
  },
  {
    id: "sunset",
    name: "Sunset",
    tokens: { background: "linear-gradient(145deg, #fff4e9 0%, #f8eaf0 58%, #eee9f7 100%)", headerBackground: "#fffaf5", surface: "#fffdfb", surfaceMuted: "#f5e2dc", outgoingBackground: "#bd5f52", outgoingText: "#ffffff", incomingBackground: "#fff9f5", incomingText: "#674a45", composerBackground: "#fffaf6", accent: "#ae554d", accentHover: "#99463f", accentSoft: "#f3ddd6", border: "#e9d3cb", heading: "#593a3c", body: "#765754", mutedText: "#957a75" },
  },
] as const;

const conversationThemeById = new Map(conversationThemes.map((theme) => [theme.id, theme]));

export function normalizeConversationThemeId(value: string | null | undefined): ConversationThemeId {
  return conversationThemeIds.includes(value as ConversationThemeId) ? value as ConversationThemeId : "default";
}

export function getConversationTheme(value: string | null | undefined) {
  return conversationThemeById.get(normalizeConversationThemeId(value)) ?? conversationThemes[0];
}

export function getConversationThemeStyle(value: string | null | undefined): CSSProperties {
  const { tokens } = getConversationTheme(value);
  return {
    "--chat-background": tokens.background,
    "--chat-header-background": tokens.headerBackground,
    "--chat-surface": tokens.surface,
    "--chat-surface-muted": tokens.surfaceMuted,
    "--chat-outgoing-background": tokens.outgoingBackground,
    "--chat-outgoing-text": tokens.outgoingText,
    "--chat-incoming-background": tokens.incomingBackground,
    "--chat-incoming-text": tokens.incomingText,
    "--chat-composer-background": tokens.composerBackground,
    "--chat-accent": tokens.accent,
    "--chat-accent-hover": tokens.accentHover,
    "--chat-accent-soft": tokens.accentSoft,
    "--chat-border": tokens.border,
    "--chat-heading": tokens.heading,
    "--chat-body": tokens.body,
    "--chat-muted-text": tokens.mutedText,
  } as CSSProperties;
}
