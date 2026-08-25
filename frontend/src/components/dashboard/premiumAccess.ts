export type AccountPlan = "normal" | "elite";
export type PremiumConversationThemeId = "obsidian";

export type PremiumAccessState = {
  accountPlan: AccountPlan;
  permanentlyOwnedConversationThemeIds: readonly PremiumConversationThemeId[];
};

/** Conservative access until a server-derived entitlement loader exists. */
export const noPremiumAccess: PremiumAccessState = Object.freeze({
  accountPlan: "normal",
  permanentlyOwnedConversationThemeIds: Object.freeze([]),
});

export const isObsidianDevelopmentPreviewEnabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_OBSIDIAN_THEME_PREVIEW === "true";

export function canAccessPremiumConversationTheme(themeId: PremiumConversationThemeId, access: PremiumAccessState) {
  return access.accountPlan === "elite" || access.permanentlyOwnedConversationThemeIds.includes(themeId);
}
