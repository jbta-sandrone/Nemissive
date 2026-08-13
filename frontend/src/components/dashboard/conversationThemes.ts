import type { CSSProperties } from "react";

export const conversationThemeIds = ["default", "midnight", "ocean", "lavender", "emerald", "rose", "sunset"] as const;

export type ConversationThemeId = (typeof conversationThemeIds)[number];

type ConversationThemeTokens = {
  canvas: string;
  canvasSecondary: string;
  header: string;
  headerBorder: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  outgoingBg: string;
  outgoingText: string;
  incomingBg: string;
  incomingText: string;
  composerBg: string;
  composerBorder: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  heading: string;
  body: string;
  muted: string;
  boundary: string;
  scrollbar: string;
  scrollbarTrack: string;
};

export type ConversationThemeDefinition = {
  id: ConversationThemeId;
  name: string;
  light: ConversationThemeTokens;
  dark: ConversationThemeTokens;
};

const defaultTokens: ConversationThemeTokens = {
  canvas: "var(--color-background)", canvasSecondary: "var(--color-background)", header: "var(--color-surface)", headerBorder: "var(--color-border)", surface: "var(--color-surface)", surfaceElevated: "var(--color-surface)", surfaceMuted: "var(--color-accent)", outgoingBg: "var(--color-primary)", outgoingText: "#ffffff", incomingBg: "var(--color-surface)", incomingText: "var(--color-body)", composerBg: "var(--color-surface)", composerBorder: "var(--color-border)", accent: "var(--color-primary)", accentHover: "var(--color-primary-hover)", accentSoft: "var(--color-accent)", heading: "var(--color-heading)", body: "var(--color-body)", muted: "var(--color-muted)", boundary: "var(--color-border)", scrollbar: "color-mix(in srgb, var(--color-muted) 55%, transparent)", scrollbarTrack: "transparent",
};

export const conversationThemes: readonly ConversationThemeDefinition[] = [
  { id: "default", name: "Default", light: defaultTokens, dark: defaultTokens },
  {
    id: "midnight",
    name: "Midnight",
    light: {
      canvas: "linear-gradient(145deg, #101420 0%, #15192a 58%, #191c30 100%)", canvasSecondary: "#141827", header: "#252535", headerBorder: "#3d3d50", surface: "#24293b", surfaceElevated: "#292e42", surfaceMuted: "#30364d", outgoingBg: "#5d68cf", outgoingText: "#ffffff", incomingBg: "#252a3c", incomingText: "#eef0f8", composerBg: "#222332", composerBorder: "#424356", accent: "#a5adff", accentHover: "#bcc2ff", accentSoft: "rgb(165 173 255 / 0.16)", heading: "#f7f7fb", body: "#d6d9e7", muted: "#aeb4c8", boundary: "#625d5a", scrollbar: "#69718e", scrollbarTrack: "rgb(255 255 255 / 0.035)",
    },
    dark: {
      canvas: "linear-gradient(145deg, #0f121c 0%, #131727 58%, #171a2b 100%)", canvasSecondary: "#121624", header: "#1c1e2a", headerBorder: "#343747", surface: "#212638", surfaceElevated: "#272c40", surfaceMuted: "#2d3349", outgoingBg: "#5d68cf", outgoingText: "#ffffff", incomingBg: "#23283a", incomingText: "#eef0f8", composerBg: "#1d202d", composerBorder: "#383b4d", accent: "#a5adff", accentHover: "#bec4ff", accentSoft: "rgb(165 173 255 / 0.16)", heading: "#f7f7fb", body: "#d6d9e7", muted: "#aeb4c8", boundary: "#423e3b", scrollbar: "#68718e", scrollbarTrack: "rgb(255 255 255 / 0.03)",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    light: {
      canvas: "linear-gradient(150deg, #e7f6f8 0%, #e8f1f8 100%)", canvasSecondary: "#eef8fa", header: "#f5faf9", headerBorder: "#cfe1e2", surface: "#f8fcfc", surfaceElevated: "#ffffff", surfaceMuted: "#dceff2", outgoingBg: "#247fa3", outgoingText: "#ffffff", incomingBg: "#f6fbfb", incomingText: "#294f5e", composerBg: "#f5faf9", composerBorder: "#cce0e1", accent: "#19799f", accentHover: "#126887", accentSoft: "#d7edf2", heading: "#183f4f", body: "#3b6473", muted: "#668592", boundary: "#c6d4d4", scrollbar: "#73a7b4", scrollbarTrack: "rgb(25 121 159 / 0.05)",
    },
    dark: {
      canvas: "linear-gradient(150deg, #112429 0%, #142732 100%)", canvasSecondary: "#152a2f", header: "#202a2b", headerBorder: "#344849", surface: "#203338", surfaceElevated: "#263b40", surfaceMuted: "#29454b", outgoingBg: "#247a9c", outgoingText: "#ffffff", incomingBg: "#20353a", incomingText: "#dcedf0", composerBg: "#202a2b", composerBorder: "#3a5052", accent: "#6fc6df", accentHover: "#88d6ea", accentSoft: "rgb(111 198 223 / 0.15)", heading: "#edf8f9", body: "#c4dcdf", muted: "#94b2b7", boundary: "#3f4541", scrollbar: "#4f8996", scrollbarTrack: "rgb(111 198 223 / 0.04)",
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    light: {
      canvas: "linear-gradient(150deg, #f4eff9 0%, #eeebf6 100%)", canvasSecondary: "#f7f3fa", header: "#faf8fb", headerBorder: "#ded6e4", surface: "#fbfafc", surfaceElevated: "#fffefe", surfaceMuted: "#eae2f2", outgoingBg: "#8064ad", outgoingText: "#ffffff", incomingBg: "#faf8fc", incomingText: "#514560", composerBg: "#faf8fb", composerBorder: "#ded4e6", accent: "#795aa7", accentHover: "#684994", accentSoft: "#e8dff1", heading: "#44354f", body: "#655772", muted: "#897b93", boundary: "#d3cbc9", scrollbar: "#a18caf", scrollbarTrack: "rgb(121 90 167 / 0.045)",
    },
    dark: {
      canvas: "linear-gradient(150deg, #231e2b 0%, #292239 100%)", canvasSecondary: "#282230", header: "#292529", headerBorder: "#463e49", surface: "#322b3b", surfaceElevated: "#3a3145", surfaceMuted: "#443751", outgoingBg: "#8064ad", outgoingText: "#ffffff", incomingBg: "#342d3d", incomingText: "#eee7f2", composerBg: "#2a262b", composerBorder: "#4a414c", accent: "#c2a5e8", accentHover: "#d1b7ef", accentSoft: "rgb(194 165 232 / 0.15)", heading: "#f7f1f9", body: "#d8cddd", muted: "#ad9fb4", boundary: "#48413d", scrollbar: "#806f8d", scrollbarTrack: "rgb(194 165 232 / 0.035)",
    },
  },
  {
    id: "emerald",
    name: "Emerald",
    light: {
      canvas: "linear-gradient(150deg, #eaf5ef 0%, #e6f0eb 100%)", canvasSecondary: "#f0f7f3", header: "#f7faf8", headerBorder: "#d0dfd7", surface: "#f9fcfa", surfaceElevated: "#ffffff", surfaceMuted: "#dcece3", outgoingBg: "#27795f", outgoingText: "#ffffff", incomingBg: "#f5faf7", incomingText: "#315b4d", composerBg: "#f6faf8", composerBorder: "#ccded5", accent: "#216f59", accentHover: "#195e4b", accentSoft: "#d6e9df", heading: "#21483b", body: "#466a5e", muted: "#708b81", boundary: "#cbd6d0", scrollbar: "#76a18f", scrollbarTrack: "rgb(33 111 89 / 0.045)",
    },
    dark: {
      canvas: "linear-gradient(150deg, #15251f 0%, #172b24 100%)", canvasSecondary: "#192a24", header: "#232b27", headerBorder: "#3b4a43", surface: "#24382f", surfaceElevated: "#2a4136", surfaceMuted: "#2d4b3e", outgoingBg: "#287d62", outgoingText: "#ffffff", incomingBg: "#263a32", incomingText: "#dcece5", composerBg: "#232b27", composerBorder: "#405147", accent: "#76c9aa", accentHover: "#91d8bd", accentSoft: "rgb(118 201 170 / 0.14)", heading: "#eff8f3", body: "#c7ded4", muted: "#98b4a8", boundary: "#414640", scrollbar: "#568a76", scrollbarTrack: "rgb(118 201 170 / 0.035)",
    },
  },
  {
    id: "rose",
    name: "Rose",
    light: {
      canvas: "linear-gradient(150deg, #faeff1 0%, #f7ebee 100%)", canvasSecondary: "#fbf4f5", header: "#fcf8f7", headerBorder: "#e8d7d9", surface: "#fcfaf9", surfaceElevated: "#fffefe", surfaceMuted: "#f2dfe3", outgoingBg: "#a85168", outgoingText: "#ffffff", incomingBg: "#fcf7f8", incomingText: "#674650", composerBg: "#fcf8f7", composerBorder: "#e6d3d6", accent: "#9c4961", accentHover: "#893b52", accentSoft: "#f0dce1", heading: "#57343f", body: "#765660", muted: "#967983", boundary: "#d9ccca", scrollbar: "#b78692", scrollbarTrack: "rgb(156 73 97 / 0.045)",
    },
    dark: {
      canvas: "linear-gradient(150deg, #2a1d21 0%, #321f28 100%)", canvasSecondary: "#2d2224", header: "#2d2725", headerBorder: "#4c403f", surface: "#3b2b30", surfaceElevated: "#443138", surfaceMuted: "#523641", outgoingBg: "#a95169", outgoingText: "#ffffff", incomingBg: "#3d2d32", incomingText: "#f1e4e7", composerBg: "#2e2826", composerBorder: "#514442", accent: "#e29aae", accentHover: "#edb0c1", accentSoft: "rgb(226 154 174 / 0.15)", heading: "#f9f0f2", body: "#dfcbd0", muted: "#b7a0a6", boundary: "#4a423e", scrollbar: "#8f6873", scrollbarTrack: "rgb(226 154 174 / 0.035)",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    light: {
      canvas: "linear-gradient(145deg, #fff1e5 0%, #f6e8ee 62%, #eeebf5 100%)", canvasSecondary: "#faf1eb", header: "#fcf8f3", headerBorder: "#e7d7ce", surface: "#fcfaf7", surfaceElevated: "#fffdfb", surfaceMuted: "#f2dfd9", outgoingBg: "#ad5146", outgoingText: "#ffffff", incomingBg: "#fcf7f3", incomingText: "#674a45", composerBg: "#fcf8f3", composerBorder: "#e4d3ca", accent: "#ae554d", accentHover: "#99463f", accentSoft: "#f1dcd5", heading: "#593a3c", body: "#765754", muted: "#957a75", boundary: "#d8cec8", scrollbar: "#b5857b", scrollbarTrack: "rgb(174 85 77 / 0.04)",
    },
    dark: {
      canvas: "linear-gradient(145deg, #2b211d 0%, #302127 58%, #292433 100%)", canvasSecondary: "#2c2521", header: "#2d2924", headerBorder: "#4c443c", surface: "#3a302b", surfaceElevated: "#44372f", surfaceMuted: "#513a35", outgoingBg: "#b05247", outgoingText: "#ffffff", incomingBg: "#3c312d", incomingText: "#f0e4df", composerBg: "#2e2924", composerBorder: "#51483f", accent: "#ed9a83", accentHover: "#f3ad98", accentSoft: "rgb(237 154 131 / 0.15)", heading: "#f8f1ed", body: "#ddcec7", muted: "#b5a49c", boundary: "#4a443e", scrollbar: "#8d6e64", scrollbarTrack: "rgb(237 154 131 / 0.035)",
    },
  },
] as const;

const conversationThemeById = new Map(conversationThemes.map((theme) => [theme.id, theme]));

const tokenCssNames: Record<keyof ConversationThemeTokens, string> = {
  canvas: "canvas", canvasSecondary: "canvas-secondary", header: "header", headerBorder: "header-border", surface: "surface", surfaceElevated: "surface-elevated", surfaceMuted: "surface-muted", outgoingBg: "outgoing-bg", outgoingText: "outgoing-text", incomingBg: "incoming-bg", incomingText: "incoming-text", composerBg: "composer-bg", composerBorder: "composer-border", accent: "accent", accentHover: "accent-hover", accentSoft: "accent-soft", heading: "heading", body: "body", muted: "muted", boundary: "boundary", scrollbar: "scrollbar", scrollbarTrack: "scrollbar-track",
};

export function normalizeConversationThemeId(value: string | null | undefined): ConversationThemeId {
  return conversationThemeIds.includes(value as ConversationThemeId) ? value as ConversationThemeId : "default";
}

export function getConversationTheme(value: string | null | undefined) {
  return conversationThemeById.get(normalizeConversationThemeId(value)) ?? conversationThemes[0];
}

export function getConversationThemeStyle(value: string | null | undefined): CSSProperties {
  const theme = getConversationTheme(value);
  const style: Record<string, string> = {};
  (Object.keys(tokenCssNames) as Array<keyof ConversationThemeTokens>).forEach((token) => {
    const cssName = tokenCssNames[token];
    style[`--chat-theme-light-${cssName}`] = theme.light[token];
    style[`--chat-theme-dark-${cssName}`] = theme.dark[token];
  });
  return style as CSSProperties;
}
