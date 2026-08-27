import type { CSSProperties } from "react";
import { canAccessPremiumProduct, type PremiumAccessState, type PremiumProductId } from "./premiumAccess";

export const conversationThemeIds = ["default", "midnight", "ocean", "lavender", "emerald", "rose", "sunset", "obsidian", "celestial", "sakura"] as const;

export type ConversationThemeId = (typeof conversationThemeIds)[number];
export type ConversationThemeAccess = "free" | "premium";

type BaseConversationThemeTokens = {
  canvas: string; canvasSecondary: string; header: string; headerBorder: string; surface: string; surfaceElevated: string; surfaceMuted: string; outgoingBg: string; outgoingText: string; incomingBg: string; incomingText: string; composerBg: string; composerBorder: string; accent: string; accentHover: string; accentSoft: string; heading: string; body: string; muted: string; boundary: string; scrollbar: string; scrollbarTrack: string;
};

type ConversationThemeTokens = BaseConversationThemeTokens & {
  replyBg: string; reactionBg: string; activityBg: string; mediaBg: string; controlBg: string; controlHover: string; focus: string; outgoingBorder: string; incomingBorder: string; outgoingShadow: string; incomingShadow: string; composerShadow: string; chromeBackdrop: string; artworkImage: string; artworkMobileImage: string; previewArtworkImage: string; artworkOpacity: string; artworkPosition: string; artworkTabletPosition: string; artworkMobilePosition: string; artworkSize: string; artworkFilter: string;
};

export type ConversationThemeDefinition = {
  id: ConversationThemeId;
  name: string;
  description: string;
  access: ConversationThemeAccess;
  premiumProductId?: PremiumProductId;
  light: ConversationThemeTokens;
  dark: ConversationThemeTokens;
};

function withPresentationTokens(base: BaseConversationThemeTokens, overrides: Partial<Omit<ConversationThemeTokens, keyof BaseConversationThemeTokens>> = {}): ConversationThemeTokens {
  return { ...base, replyBg: base.surfaceMuted, reactionBg: base.surface, activityBg: "transparent", mediaBg: base.surfaceMuted, controlBg: base.surface, controlHover: base.accentSoft, focus: `color-mix(in srgb, ${base.accent} 38%, transparent)`, outgoingBorder: "transparent", incomingBorder: base.headerBorder, outgoingShadow: "none", incomingShadow: "none", composerShadow: "none", chromeBackdrop: "none", artworkImage: "none", artworkMobileImage: "none", previewArtworkImage: "none", artworkOpacity: "0", artworkPosition: "center", artworkTabletPosition: "center", artworkMobilePosition: "center", artworkSize: "cover", artworkFilter: "none", ...overrides };
}

const defaultBaseTokens: BaseConversationThemeTokens = {
  canvas: "var(--color-background)", canvasSecondary: "var(--color-background)", header: "var(--color-surface)", headerBorder: "var(--color-border)", surface: "var(--color-surface)", surfaceElevated: "var(--color-surface)", surfaceMuted: "var(--color-accent)", outgoingBg: "var(--color-primary)", outgoingText: "#ffffff", incomingBg: "var(--color-surface)", incomingText: "var(--color-body)", composerBg: "var(--color-surface)", composerBorder: "var(--color-border)", accent: "var(--color-primary)", accentHover: "var(--color-primary-hover)", accentSoft: "var(--color-accent)", heading: "var(--color-heading)", body: "var(--color-body)", muted: "var(--color-muted)", boundary: "var(--color-border)", scrollbar: "color-mix(in srgb, var(--color-muted) 55%, transparent)", scrollbarTrack: "transparent",
};

const obsidianLightTokens = withPresentationTokens({
  canvas: "radial-gradient(ellipse 58% 74% at 50% 43%, oklch(0.985 0.008 245 / 0.38) 0%, oklch(0.95 0.014 250 / 0.2) 56%, oklch(0.9 0.022 250 / 0.06) 100%)", canvasSecondary: "oklch(0.93 0.014 250)", header: "oklch(0.985 0.008 245 / 0.82)", headerBorder: "oklch(0.65 0.025 250 / 0.46)", surface: "oklch(0.97 0.011 248 / 0.92)", surfaceElevated: "oklch(0.99 0.006 245 / 0.95)", surfaceMuted: "oklch(0.87 0.025 250 / 0.76)", outgoingBg: "linear-gradient(145deg, oklch(0.34 0.045 245) 0%, oklch(0.255 0.034 258) 56%, oklch(0.22 0.025 265) 100%)", outgoingText: "oklch(0.98 0.006 245)", incomingBg: "linear-gradient(145deg, oklch(0.98 0.01 245 / 0.96) 0%, oklch(0.9 0.022 250 / 0.94) 100%)", incomingText: "oklch(0.25 0.02 255)", composerBg: "oklch(0.975 0.009 245 / 0.82)", composerBorder: "oklch(0.61 0.03 250 / 0.44)", accent: "oklch(0.43 0.075 243)", accentHover: "oklch(0.35 0.065 245)", accentSoft: "oklch(0.62 0.07 242 / 0.16)", heading: "oklch(0.2 0.018 258)", body: "oklch(0.32 0.02 255)", muted: "oklch(0.49 0.025 252)", boundary: "oklch(0.64 0.022 250 / 0.48)", scrollbar: "oklch(0.49 0.04 248 / 0.62)", scrollbarTrack: "oklch(0.84 0.018 250 / 0.2)",
}, { replyBg: "oklch(0.84 0.03 248 / 0.62)", reactionBg: "oklch(0.975 0.01 245 / 0.94)", activityBg: "oklch(0.98 0.008 245 / 0.72)", mediaBg: "oklch(0.86 0.024 250 / 0.82)", controlBg: "oklch(0.96 0.012 248 / 0.88)", controlHover: "oklch(0.83 0.035 246 / 0.72)", focus: "oklch(0.45 0.08 242 / 0.36)", outgoingBorder: "oklch(0.62 0.06 242 / 0.54)", outgoingShadow: "inset 0 1px 0 oklch(0.88 0.04 235 / 0.2), 0 10px 24px oklch(0.2 0.02 255 / 0.18)", incomingShadow: "inset 0 1px 0 oklch(1 0 0 / 0.72), 0 8px 20px oklch(0.32 0.02 255 / 0.14)", composerShadow: "inset 0 1px 0 oklch(1 0 0 / 0.7), 0 12px 30px oklch(0.28 0.02 255 / 0.16)", chromeBackdrop: "blur(10px)", artworkImage: "url('/themes/obsidian_elite_theme_light.png')", artworkMobileImage: "url('/themes/obsidian_elite_theme_light.png')", previewArtworkImage: "url('/themes/obsidian-environment-light.svg')", artworkOpacity: "0.98", artworkPosition: "center bottom", artworkTabletPosition: "22% bottom", artworkMobilePosition: "18% bottom", artworkSize: "cover", artworkFilter: "saturate(0.98) contrast(1.01)" });

const obsidianDarkTokens = withPresentationTokens({
  canvas: "radial-gradient(ellipse 58% 74% at 50% 43%, oklch(0.055 0.012 262 / 0.82) 0%, oklch(0.075 0.014 260 / 0.62) 54%, oklch(0.05 0.012 265 / 0.28) 100%)", canvasSecondary: "oklch(0.085 0.012 262)", header: "oklch(0.145 0.014 258 / 0.8)", headerBorder: "oklch(0.41 0.038 245 / 0.56)", surface: "oklch(0.19 0.018 255 / 0.92)", surfaceElevated: "oklch(0.225 0.022 253 / 0.94)", surfaceMuted: "oklch(0.285 0.032 250 / 0.76)", outgoingBg: "linear-gradient(145deg, oklch(0.3 0.052 242) 0%, oklch(0.225 0.04 255) 54%, oklch(0.165 0.026 265) 100%)", outgoingText: "oklch(0.98 0.006 245)", incomingBg: "linear-gradient(145deg, oklch(0.405 0.026 248 / 0.97) 0%, oklch(0.335 0.022 258 / 0.97) 100%)", incomingText: "oklch(0.96 0.01 245)", composerBg: "oklch(0.135 0.014 260 / 0.8)", composerBorder: "oklch(0.43 0.042 245 / 0.58)", accent: "oklch(0.78 0.09 235)", accentHover: "oklch(0.86 0.07 232)", accentSoft: "oklch(0.63 0.09 238 / 0.18)", heading: "oklch(0.98 0.006 245)", body: "oklch(0.88 0.014 248)", muted: "oklch(0.75 0.025 248)", boundary: "oklch(0.4 0.035 248 / 0.62)", scrollbar: "oklch(0.57 0.055 240 / 0.68)", scrollbarTrack: "oklch(0.1 0.012 260 / 0.28)",
}, { replyBg: "oklch(0.31 0.04 247 / 0.7)", reactionBg: "oklch(0.22 0.024 253 / 0.94)", activityBg: "oklch(0.16 0.018 258 / 0.64)", mediaBg: "oklch(0.17 0.016 260 / 0.88)", controlBg: "oklch(0.205 0.022 253 / 0.9)", controlHover: "oklch(0.32 0.045 245 / 0.84)", focus: "oklch(0.78 0.095 235 / 0.42)", outgoingBorder: "oklch(0.58 0.085 238 / 0.58)", incomingBorder: "oklch(0.57 0.035 246 / 0.64)", outgoingShadow: "inset 0 1px 0 oklch(0.8 0.055 235 / 0.16), 0 12px 28px oklch(0.02 0.01 260 / 0.46)", incomingShadow: "inset 0 1px 0 oklch(0.88 0.025 245 / 0.14), 0 10px 24px oklch(0.02 0.01 260 / 0.32)", composerShadow: "inset 0 1px 0 oklch(0.82 0.025 245 / 0.1), 0 14px 34px oklch(0.02 0.01 260 / 0.48)", chromeBackdrop: "blur(10px)", artworkImage: "url('/themes/obsidian_elite_theme_dark.png')", artworkMobileImage: "url('/themes/obsidian_elite_theme_dark.png')", previewArtworkImage: "url('/themes/obsidian-environment-dark.svg')", artworkOpacity: "0.98", artworkPosition: "center bottom", artworkTabletPosition: "22% bottom", artworkMobilePosition: "18% bottom", artworkSize: "cover", artworkFilter: "saturate(0.96) contrast(1.03) brightness(1.08)" });

const celestialLightTokens = withPresentationTokens({
  canvas: "radial-gradient(ellipse 58% 74% at 50% 46%, oklch(0.99 0.012 275 / 0.42) 0%, oklch(0.94 0.035 275 / 0.22) 56%, oklch(0.9 0.04 250 / 0.08) 100%)",
  canvasSecondary: "oklch(0.93 0.035 260)",
  header: "oklch(0.985 0.012 275 / 0.76)",
  headerBorder: "oklch(0.69 0.055 276 / 0.42)",
  surface: "oklch(0.975 0.018 278 / 0.84)",
  surfaceElevated: "oklch(0.995 0.008 275 / 0.9)",
  surfaceMuted: "oklch(0.9 0.045 275 / 0.78)",
  outgoingBg: "linear-gradient(145deg, oklch(0.51 0.13 255) 0%, oklch(0.49 0.14 282) 55%, oklch(0.43 0.12 300) 100%)",
  outgoingText: "oklch(0.99 0.006 270)",
  incomingBg: "linear-gradient(145deg, oklch(0.995 0.008 270 / 0.94) 0%, oklch(0.94 0.035 285 / 0.9) 100%)",
  incomingText: "oklch(0.25 0.045 275)",
  composerBg: "oklch(0.985 0.012 275 / 0.8)",
  composerBorder: "oklch(0.66 0.06 275 / 0.44)",
  accent: "oklch(0.5 0.15 276)",
  accentHover: "oklch(0.43 0.15 280)",
  accentSoft: "oklch(0.68 0.12 278 / 0.17)",
  heading: "oklch(0.22 0.05 277)",
  body: "oklch(0.34 0.045 274)",
  muted: "oklch(0.51 0.04 272)",
  boundary: "oklch(0.69 0.045 270 / 0.46)",
  scrollbar: "oklch(0.55 0.09 275 / 0.58)",
  scrollbarTrack: "oklch(0.86 0.04 270 / 0.18)",
}, {
  replyBg: "oklch(0.89 0.055 278 / 0.7)",
  reactionBg: "oklch(0.985 0.012 275 / 0.9)",
  activityBg: "oklch(0.985 0.012 275 / 0.62)",
  mediaBg: "oklch(0.91 0.045 272 / 0.82)",
  controlBg: "oklch(0.98 0.014 275 / 0.84)",
  controlHover: "oklch(0.87 0.065 278 / 0.72)",
  focus: "oklch(0.5 0.15 276 / 0.36)",
  outgoingBorder: "oklch(0.7 0.12 260 / 0.46)",
  incomingBorder: "oklch(0.73 0.055 278 / 0.56)",
  outgoingShadow: "inset 0 1px 0 oklch(0.9 0.08 245 / 0.22), 0 12px 28px oklch(0.31 0.08 278 / 0.2)",
  incomingShadow: "inset 0 1px 0 oklch(1 0 0 / 0.76), 0 10px 24px oklch(0.42 0.07 278 / 0.14)",
  composerShadow: "inset 0 1px 0 oklch(1 0 0 / 0.76), 0 14px 34px oklch(0.36 0.07 275 / 0.18)",
  chromeBackdrop: "blur(14px) saturate(1.12)",
  artworkImage: "url('/themes/celestial_elite_theme_light.png')",
  artworkMobileImage: "url('/themes/celestial_elite_theme_light.png')",
  previewArtworkImage: "url('/themes/celestial_elite_theme_light.png')",
  artworkOpacity: "0.98",
  artworkPosition: "center bottom",
  artworkTabletPosition: "24% bottom",
  artworkMobilePosition: "18% bottom",
  artworkSize: "cover",
  artworkFilter: "saturate(0.98) contrast(1.02)",
});

const celestialDarkTokens = withPresentationTokens({
  canvas: "radial-gradient(ellipse 58% 76% at 50% 45%, oklch(0.12 0.045 275 / 0.42) 0%, oklch(0.095 0.04 278 / 0.28) 56%, oklch(0.06 0.025 270 / 0.12) 100%)",
  canvasSecondary: "oklch(0.075 0.032 275)",
  header: "oklch(0.14 0.048 278 / 0.74)",
  headerBorder: "oklch(0.51 0.11 272 / 0.5)",
  surface: "oklch(0.18 0.055 278 / 0.86)",
  surfaceElevated: "oklch(0.21 0.06 276 / 0.9)",
  surfaceMuted: "oklch(0.27 0.075 278 / 0.78)",
  outgoingBg: "linear-gradient(145deg, oklch(0.34 0.12 255) 0%, oklch(0.29 0.115 278) 54%, oklch(0.235 0.09 295) 100%)",
  outgoingText: "oklch(0.985 0.01 270)",
  incomingBg: "linear-gradient(145deg, oklch(0.36 0.075 270 / 0.94) 0%, oklch(0.31 0.075 290 / 0.94) 100%)",
  incomingText: "oklch(0.96 0.02 270)",
  composerBg: "oklch(0.13 0.045 278 / 0.76)",
  composerBorder: "oklch(0.5 0.11 272 / 0.5)",
  accent: "oklch(0.78 0.14 262)",
  accentHover: "oklch(0.85 0.105 258)",
  accentSoft: "oklch(0.67 0.14 270 / 0.2)",
  heading: "oklch(0.98 0.012 270)",
  body: "oklch(0.89 0.025 272)",
  muted: "oklch(0.74 0.045 275)",
  boundary: "oklch(0.46 0.09 274 / 0.58)",
  scrollbar: "oklch(0.62 0.13 266 / 0.7)",
  scrollbarTrack: "oklch(0.11 0.04 278 / 0.25)",
}, {
  replyBg: "oklch(0.29 0.08 278 / 0.76)",
  reactionBg: "oklch(0.19 0.055 278 / 0.9)",
  activityBg: "oklch(0.14 0.045 278 / 0.62)",
  mediaBg: "oklch(0.17 0.05 278 / 0.88)",
  controlBg: "oklch(0.18 0.055 278 / 0.86)",
  controlHover: "oklch(0.29 0.095 274 / 0.82)",
  focus: "oklch(0.78 0.14 262 / 0.44)",
  outgoingBorder: "oklch(0.64 0.14 260 / 0.54)",
  incomingBorder: "oklch(0.6 0.105 282 / 0.56)",
  outgoingShadow: "inset 0 1px 0 oklch(0.82 0.14 250 / 0.17), 0 14px 30px oklch(0.025 0.02 280 / 0.48)",
  incomingShadow: "inset 0 1px 0 oklch(0.9 0.08 270 / 0.14), 0 12px 26px oklch(0.025 0.02 280 / 0.38)",
  composerShadow: "inset 0 1px 0 oklch(0.84 0.08 270 / 0.12), 0 16px 38px oklch(0.02 0.018 280 / 0.5)",
  chromeBackdrop: "blur(14px) saturate(1.18)",
  artworkImage: "url('/themes/celestial_elite_theme_dark.png')",
  artworkMobileImage: "url('/themes/celestial_elite_theme_dark.png')",
  previewArtworkImage: "url('/themes/celestial_elite_theme_dark.png')",
  artworkOpacity: "0.98",
  artworkPosition: "center bottom",
  artworkTabletPosition: "24% bottom",
  artworkMobilePosition: "18% bottom",
  artworkSize: "cover",
  artworkFilter: "saturate(1.04) contrast(1.03)",
});

const sakuraLightTokens = withPresentationTokens({
  canvas: "radial-gradient(ellipse 58% 74% at 50% 44%, oklch(0.99 0.014 350 / 0.38) 0%, oklch(0.96 0.035 345 / 0.2) 56%, oklch(0.92 0.045 320 / 0.07) 100%)",
  canvasSecondary: "oklch(0.96 0.025 345)",
  header: "oklch(0.99 0.012 350 / 0.78)",
  headerBorder: "oklch(0.75 0.07 350 / 0.46)",
  surface: "oklch(0.985 0.017 350 / 0.88)",
  surfaceElevated: "oklch(0.995 0.008 350 / 0.93)",
  surfaceMuted: "oklch(0.92 0.05 345 / 0.8)",
  outgoingBg: "linear-gradient(145deg, oklch(0.79 0.12 355) 0%, oklch(0.73 0.14 345) 55%, oklch(0.67 0.13 330) 100%)",
  outgoingText: "oklch(0.25 0.07 342)",
  incomingBg: "linear-gradient(145deg, oklch(0.998 0.006 350 / 0.96) 0%, oklch(0.95 0.035 345 / 0.92) 100%)",
  incomingText: "oklch(0.29 0.05 338)",
  composerBg: "oklch(0.99 0.012 350 / 0.8)",
  composerBorder: "oklch(0.72 0.08 348 / 0.48)",
  accent: "oklch(0.57 0.18 348)",
  accentHover: "oklch(0.49 0.18 345)",
  accentSoft: "oklch(0.72 0.14 350 / 0.18)",
  heading: "oklch(0.24 0.06 340)",
  body: "oklch(0.36 0.05 340)",
  muted: "oklch(0.52 0.045 340)",
  boundary: "oklch(0.75 0.06 345 / 0.5)",
  scrollbar: "oklch(0.61 0.11 348 / 0.62)",
  scrollbarTrack: "oklch(0.88 0.04 345 / 0.2)",
}, {
  replyBg: "oklch(0.92 0.055 347 / 0.76)",
  reactionBg: "oklch(0.99 0.014 350 / 0.92)",
  activityBg: "oklch(0.99 0.012 350 / 0.68)",
  mediaBg: "oklch(0.92 0.05 345 / 0.84)",
  controlBg: "oklch(0.985 0.016 350 / 0.88)",
  controlHover: "oklch(0.89 0.075 347 / 0.76)",
  focus: "oklch(0.57 0.18 348 / 0.38)",
  outgoingBorder: "oklch(0.64 0.15 345 / 0.48)",
  incomingBorder: "oklch(0.77 0.07 348 / 0.6)",
  outgoingShadow: "inset 0 1px 0 oklch(0.96 0.06 350 / 0.34), 0 12px 28px oklch(0.42 0.1 345 / 0.2)",
  incomingShadow: "inset 0 1px 0 oklch(1 0 0 / 0.8), 0 10px 24px oklch(0.48 0.07 345 / 0.14)",
  composerShadow: "inset 0 1px 0 oklch(1 0 0 / 0.8), 0 14px 34px oklch(0.43 0.08 345 / 0.18)",
  chromeBackdrop: "blur(14px) saturate(1.12)",
  artworkImage: "url('/themes/sakura_elite_theme_light.png')",
  artworkMobileImage: "url('/themes/sakura_elite_theme_light.png')",
  previewArtworkImage: "url('/themes/sakura_elite_theme_light.png')",
  artworkOpacity: "0.98",
  artworkPosition: "center bottom",
  artworkTabletPosition: "48% bottom",
  artworkMobilePosition: "50% bottom",
  artworkSize: "cover",
  artworkFilter: "saturate(0.98) contrast(1.01)",
});

const sakuraDarkTokens = withPresentationTokens({
  canvas: "radial-gradient(ellipse 58% 76% at 50% 44%, oklch(0.11 0.055 335 / 0.4) 0%, oklch(0.085 0.045 330 / 0.28) 56%, oklch(0.045 0.025 320 / 0.12) 100%)",
  canvasSecondary: "oklch(0.07 0.035 325)",
  header: "oklch(0.13 0.055 330 / 0.76)",
  headerBorder: "oklch(0.5 0.14 340 / 0.52)",
  surface: "oklch(0.17 0.065 330 / 0.88)",
  surfaceElevated: "oklch(0.2 0.07 332 / 0.92)",
  surfaceMuted: "oklch(0.26 0.09 338 / 0.8)",
  outgoingBg: "linear-gradient(145deg, oklch(0.43 0.19 350) 0%, oklch(0.36 0.18 338) 54%, oklch(0.29 0.14 325) 100%)",
  outgoingText: "oklch(0.99 0.012 350)",
  incomingBg: "linear-gradient(145deg, oklch(0.31 0.095 330 / 0.95) 0%, oklch(0.25 0.085 320 / 0.95) 100%)",
  incomingText: "oklch(0.96 0.02 350)",
  composerBg: "oklch(0.115 0.05 328 / 0.78)",
  composerBorder: "oklch(0.48 0.14 340 / 0.54)",
  accent: "oklch(0.75 0.19 350)",
  accentHover: "oklch(0.82 0.15 355)",
  accentSoft: "oklch(0.66 0.19 348 / 0.2)",
  heading: "oklch(0.985 0.014 350)",
  body: "oklch(0.89 0.03 350)",
  muted: "oklch(0.74 0.055 345)",
  boundary: "oklch(0.44 0.11 335 / 0.62)",
  scrollbar: "oklch(0.61 0.16 345 / 0.72)",
  scrollbarTrack: "oklch(0.095 0.04 328 / 0.28)",
}, {
  replyBg: "oklch(0.26 0.095 335 / 0.78)",
  reactionBg: "oklch(0.18 0.065 330 / 0.92)",
  activityBg: "oklch(0.12 0.05 328 / 0.66)",
  mediaBg: "oklch(0.16 0.06 328 / 0.9)",
  controlBg: "oklch(0.17 0.065 330 / 0.88)",
  controlHover: "oklch(0.29 0.12 340 / 0.84)",
  focus: "oklch(0.75 0.19 350 / 0.46)",
  outgoingBorder: "oklch(0.65 0.2 350 / 0.58)",
  incomingBorder: "oklch(0.55 0.14 338 / 0.58)",
  outgoingShadow: "inset 0 1px 0 oklch(0.88 0.15 355 / 0.18), 0 14px 30px oklch(0.025 0.02 325 / 0.5)",
  incomingShadow: "inset 0 1px 0 oklch(0.9 0.08 350 / 0.14), 0 12px 26px oklch(0.02 0.018 325 / 0.4)",
  composerShadow: "inset 0 1px 0 oklch(0.86 0.08 350 / 0.12), 0 16px 38px oklch(0.015 0.015 325 / 0.52)",
  chromeBackdrop: "blur(14px) saturate(1.18)",
  artworkImage: "url('/themes/sakura_elite_theme_dark.png')",
  artworkMobileImage: "url('/themes/sakura_elite_theme_dark.png')",
  previewArtworkImage: "url('/themes/sakura_elite_theme_dark.png')",
  artworkOpacity: "0.98",
  artworkPosition: "center bottom",
  artworkTabletPosition: "48% bottom",
  artworkMobilePosition: "50% bottom",
  artworkSize: "cover",
  artworkFilter: "saturate(1.02) contrast(1.03)",
});

export const conversationThemes: readonly ConversationThemeDefinition[] = [
  { id: "default", name: "Default", description: "Standard Nemissive appearance", access: "free", light: withPresentationTokens(defaultBaseTokens), dark: withPresentationTokens(defaultBaseTokens) },
  { id: "midnight", name: "Midnight", description: "A calm late-night palette", access: "free", light: withPresentationTokens({ canvas: "linear-gradient(145deg, #101420 0%, #15192a 58%, #191c30 100%)", canvasSecondary: "#141827", header: "#252535", headerBorder: "#3d3d50", surface: "#24293b", surfaceElevated: "#292e42", surfaceMuted: "#30364d", outgoingBg: "#5d68cf", outgoingText: "#ffffff", incomingBg: "#252a3c", incomingText: "#eef0f8", composerBg: "#222332", composerBorder: "#424356", accent: "#a5adff", accentHover: "#bcc2ff", accentSoft: "rgb(165 173 255 / 0.16)", heading: "#f7f7fb", body: "#d6d9e7", muted: "#aeb4c8", boundary: "#625d5a", scrollbar: "#69718e", scrollbarTrack: "rgb(255 255 255 / 0.035)" }), dark: withPresentationTokens({ canvas: "linear-gradient(145deg, #0f121c 0%, #131727 58%, #171a2b 100%)", canvasSecondary: "#121624", header: "#1c1e2a", headerBorder: "#343747", surface: "#212638", surfaceElevated: "#272c40", surfaceMuted: "#2d3349", outgoingBg: "#5d68cf", outgoingText: "#ffffff", incomingBg: "#23283a", incomingText: "#eef0f8", composerBg: "#1d202d", composerBorder: "#383b4d", accent: "#a5adff", accentHover: "#bec4ff", accentSoft: "rgb(165 173 255 / 0.16)", heading: "#f7f7fb", body: "#d6d9e7", muted: "#aeb4c8", boundary: "#423e3b", scrollbar: "#68718e", scrollbarTrack: "rgb(255 255 255 / 0.03)" }) },
  { id: "ocean", name: "Ocean", description: "Cool coastal blues", access: "free", light: withPresentationTokens({ canvas: "linear-gradient(150deg, #e7f6f8 0%, #e8f1f8 100%)", canvasSecondary: "#eef8fa", header: "#f5faf9", headerBorder: "#cfe1e2", surface: "#f8fcfc", surfaceElevated: "#ffffff", surfaceMuted: "#dceff2", outgoingBg: "#247fa3", outgoingText: "#ffffff", incomingBg: "#f6fbfb", incomingText: "#294f5e", composerBg: "#f5faf9", composerBorder: "#cce0e1", accent: "#19799f", accentHover: "#126887", accentSoft: "#d7edf2", heading: "#183f4f", body: "#3b6473", muted: "#668592", boundary: "#c6d4d4", scrollbar: "#73a7b4", scrollbarTrack: "rgb(25 121 159 / 0.05)" }), dark: withPresentationTokens({ canvas: "linear-gradient(150deg, #112429 0%, #142732 100%)", canvasSecondary: "#152a2f", header: "#202a2b", headerBorder: "#344849", surface: "#203338", surfaceElevated: "#263b40", surfaceMuted: "#29454b", outgoingBg: "#247a9c", outgoingText: "#ffffff", incomingBg: "#20353a", incomingText: "#dcedf0", composerBg: "#202a2b", composerBorder: "#3a5052", accent: "#6fc6df", accentHover: "#88d6ea", accentSoft: "rgb(111 198 223 / 0.15)", heading: "#edf8f9", body: "#c4dcdf", muted: "#94b2b7", boundary: "#3f4541", scrollbar: "#4f8996", scrollbarTrack: "rgb(111 198 223 / 0.04)" }) },
  { id: "lavender", name: "Lavender", description: "Soft violet warmth", access: "free", light: withPresentationTokens({ canvas: "linear-gradient(150deg, #f4eff9 0%, #eeebf6 100%)", canvasSecondary: "#f7f3fa", header: "#faf8fb", headerBorder: "#ded6e4", surface: "#fbfafc", surfaceElevated: "#fffefe", surfaceMuted: "#eae2f2", outgoingBg: "#8064ad", outgoingText: "#ffffff", incomingBg: "#faf8fc", incomingText: "#514560", composerBg: "#faf8fb", composerBorder: "#ded4e6", accent: "#795aa7", accentHover: "#684994", accentSoft: "#e8dff1", heading: "#44354f", body: "#655772", muted: "#897b93", boundary: "#d3cbc9", scrollbar: "#a18caf", scrollbarTrack: "rgb(121 90 167 / 0.045)" }), dark: withPresentationTokens({ canvas: "linear-gradient(150deg, #231e2b 0%, #292239 100%)", canvasSecondary: "#282230", header: "#292529", headerBorder: "#463e49", surface: "#322b3b", surfaceElevated: "#3a3145", surfaceMuted: "#443751", outgoingBg: "#8064ad", outgoingText: "#ffffff", incomingBg: "#342d3d", incomingText: "#eee7f2", composerBg: "#2a262b", composerBorder: "#4a414c", accent: "#c2a5e8", accentHover: "#d1b7ef", accentSoft: "rgb(194 165 232 / 0.15)", heading: "#f7f1f9", body: "#d8cddd", muted: "#ad9fb4", boundary: "#48413d", scrollbar: "#806f8d", scrollbarTrack: "rgb(194 165 232 / 0.035)" }) },
  { id: "emerald", name: "Emerald", description: "Grounded botanical greens", access: "free", light: withPresentationTokens({ canvas: "linear-gradient(150deg, #eaf5ef 0%, #e6f0eb 100%)", canvasSecondary: "#f0f7f3", header: "#f7faf8", headerBorder: "#d0dfd7", surface: "#f9fcfa", surfaceElevated: "#ffffff", surfaceMuted: "#dcece3", outgoingBg: "#27795f", outgoingText: "#ffffff", incomingBg: "#f5faf7", incomingText: "#315b4d", composerBg: "#f6faf8", composerBorder: "#ccded5", accent: "#216f59", accentHover: "#195e4b", accentSoft: "#d6e9df", heading: "#21483b", body: "#466a5e", muted: "#708b81", boundary: "#cbd6d0", scrollbar: "#76a18f", scrollbarTrack: "rgb(33 111 89 / 0.045)" }), dark: withPresentationTokens({ canvas: "linear-gradient(150deg, #15251f 0%, #172b24 100%)", canvasSecondary: "#192a24", header: "#232b27", headerBorder: "#3b4a43", surface: "#24382f", surfaceElevated: "#2a4136", surfaceMuted: "#2d4b3e", outgoingBg: "#287d62", outgoingText: "#ffffff", incomingBg: "#263a32", incomingText: "#dcece5", composerBg: "#232b27", composerBorder: "#405147", accent: "#76c9aa", accentHover: "#91d8bd", accentSoft: "rgb(118 201 170 / 0.14)", heading: "#eff8f3", body: "#c7ded4", muted: "#98b4a8", boundary: "#414640", scrollbar: "#568a76", scrollbarTrack: "rgb(118 201 170 / 0.035)" }) },
  { id: "rose", name: "Rose", description: "Muted rose and berry tones", access: "free", light: withPresentationTokens({ canvas: "linear-gradient(150deg, #faeff1 0%, #f7ebee 100%)", canvasSecondary: "#fbf4f5", header: "#fcf8f7", headerBorder: "#e8d7d9", surface: "#fcfaf9", surfaceElevated: "#fffefe", surfaceMuted: "#f2dfe3", outgoingBg: "#a85168", outgoingText: "#ffffff", incomingBg: "#fcf7f8", incomingText: "#674650", composerBg: "#fcf8f7", composerBorder: "#e6d3d6", accent: "#9c4961", accentHover: "#893b52", accentSoft: "#f0dce1", heading: "#57343f", body: "#765660", muted: "#967983", boundary: "#d9ccca", scrollbar: "#b78692", scrollbarTrack: "rgb(156 73 97 / 0.045)" }), dark: withPresentationTokens({ canvas: "linear-gradient(150deg, #2a1d21 0%, #321f28 100%)", canvasSecondary: "#2d2224", header: "#2d2725", headerBorder: "#4c403f", surface: "#3b2b30", surfaceElevated: "#443138", surfaceMuted: "#523641", outgoingBg: "#a95169", outgoingText: "#ffffff", incomingBg: "#3d2d32", incomingText: "#f1e4e7", composerBg: "#2e2826", composerBorder: "#514442", accent: "#e29aae", accentHover: "#edb0c1", accentSoft: "rgb(226 154 174 / 0.15)", heading: "#f9f0f2", body: "#dfcbd0", muted: "#b7a0a6", boundary: "#4a423e", scrollbar: "#8f6873", scrollbarTrack: "rgb(226 154 174 / 0.035)" }) },
  { id: "sunset", name: "Sunset", description: "Warm dusk-inspired color", access: "free", light: withPresentationTokens({ canvas: "linear-gradient(145deg, #fff1e5 0%, #f6e8ee 62%, #eeebf5 100%)", canvasSecondary: "#faf1eb", header: "#fcf8f3", headerBorder: "#e7d7ce", surface: "#fcfaf7", surfaceElevated: "#fffdfb", surfaceMuted: "#f2dfd9", outgoingBg: "#ad5146", outgoingText: "#ffffff", incomingBg: "#fcf7f3", incomingText: "#674a45", composerBg: "#fcf8f3", composerBorder: "#e4d3ca", accent: "#ae554d", accentHover: "#99463f", accentSoft: "#f1dcd5", heading: "#593a3c", body: "#765754", muted: "#957a75", boundary: "#d8cec8", scrollbar: "#b5857b", scrollbarTrack: "rgb(174 85 77 / 0.04)" }), dark: withPresentationTokens({ canvas: "linear-gradient(145deg, #2b211d 0%, #302127 58%, #292433 100%)", canvasSecondary: "#2c2521", header: "#2d2924", headerBorder: "#4c443c", surface: "#3a302b", surfaceElevated: "#44372f", surfaceMuted: "#513a35", outgoingBg: "#b05247", outgoingText: "#ffffff", incomingBg: "#3c312d", incomingText: "#f0e4df", composerBg: "#2e2924", composerBorder: "#51483f", accent: "#ed9a83", accentHover: "#f3ad98", accentSoft: "rgb(237 154 131 / 0.15)", heading: "#f8f1ed", body: "#ddcec7", muted: "#b5a49c", boundary: "#4a443e", scrollbar: "#8d6e64", scrollbarTrack: "rgb(237 154 131 / 0.035)" }) },
  { id: "obsidian", name: "Obsidian", description: "A volcanic-glass conversation environment", access: "premium", premiumProductId: "theme.obsidian", light: obsidianLightTokens, dark: obsidianDarkTokens },
  { id: "celestial", name: "Celestial", description: "A luminous celestial conversation environment", access: "premium", premiumProductId: "theme.celestial", light: celestialLightTokens, dark: celestialDarkTokens },
  { id: "sakura", name: "Sakura", description: "A cherry-blossom conversation environment", access: "premium", premiumProductId: "theme.sakura", light: sakuraLightTokens, dark: sakuraDarkTokens },
] as const;

const conversationThemeById = new Map(conversationThemes.map((theme) => [theme.id, theme]));
const tokenCssNames: Record<keyof ConversationThemeTokens, string> = {
  canvas: "canvas", canvasSecondary: "canvas-secondary", header: "header", headerBorder: "header-border", surface: "surface", surfaceElevated: "surface-elevated", surfaceMuted: "surface-muted", outgoingBg: "outgoing-bg", outgoingText: "outgoing-text", incomingBg: "incoming-bg", incomingText: "incoming-text", composerBg: "composer-bg", composerBorder: "composer-border", accent: "accent", accentHover: "accent-hover", accentSoft: "accent-soft", heading: "heading", body: "body", muted: "muted", boundary: "boundary", scrollbar: "scrollbar", scrollbarTrack: "scrollbar-track", replyBg: "reply-bg", reactionBg: "reaction-bg", activityBg: "activity-bg", mediaBg: "media-bg", controlBg: "control-bg", controlHover: "control-hover", focus: "focus", outgoingBorder: "outgoing-border", incomingBorder: "incoming-border", outgoingShadow: "outgoing-shadow", incomingShadow: "incoming-shadow", composerShadow: "composer-shadow", chromeBackdrop: "chrome-backdrop", artworkImage: "artwork-image", artworkMobileImage: "artwork-mobile-image", previewArtworkImage: "preview-artwork-image", artworkOpacity: "artwork-opacity", artworkPosition: "artwork-position", artworkTabletPosition: "artwork-tablet-position", artworkMobilePosition: "artwork-mobile-position", artworkSize: "artwork-size", artworkFilter: "artwork-filter",
};

export function normalizeConversationThemeId(value: string | null | undefined): ConversationThemeId {
  if (value === "celestia") return "celestial";
  return conversationThemeIds.includes(value as ConversationThemeId) ? value as ConversationThemeId : "default";
}

export function getConversationTheme(value: string | null | undefined) {
  return conversationThemeById.get(normalizeConversationThemeId(value)) ?? conversationThemes[0];
}

export function canUseConversationTheme(themeId: ConversationThemeId, access: PremiumAccessState, includeDevelopmentPreview = true) {
  const theme = getConversationTheme(themeId);
  if (theme.access === "free") return true;
  return theme.premiumProductId ? canAccessPremiumProduct(access, theme.premiumProductId, includeDevelopmentPreview) : false;
}

export function resolveConversationTheme(value: string | null | undefined, access: PremiumAccessState) {
  const themeId = normalizeConversationThemeId(value);
  return canUseConversationTheme(themeId, access) ? themeId : "default";
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
