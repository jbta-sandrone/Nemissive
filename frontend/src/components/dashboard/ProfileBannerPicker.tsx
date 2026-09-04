import { useState } from "react";
import type { AccountStatus } from "../../types/account";
import type { AvatarBorderKey } from "../../types/avatarBorders";
import type { ProfileSearchResult } from "../../types/conversations";
import type { ProfileBannerKey } from "../../types/profileBanners";
import { beginBillingCheckout } from "./billing";
import type { BillingProductId } from "./premiumCatalog";
import ProfileBanner from "./ProfileBanner";
import { canUseProfileBanner, freeProfileBannerCatalog, getProfileBannerDefinition, premiumProfileBannerCatalog, type ProfileThemeDefinition } from "./profileBanners";
import { resolvePremiumProductAccessSource, type PremiumAccessState } from "./premiumAccess";
import { premiumThemeAccessLabels } from "./premiumPresentation";
import { getProfileDisplayName } from "./profileUtils";
import UserIdentityAvatar from "./UserIdentityAvatar";

type ProfileBannerPickerProps = {
  profile: ProfileSearchResult;
  accountStatus: AccountStatus;
  premiumAccess: PremiumAccessState;
  savedBorder: AvatarBorderKey;
  savedBanner: ProfileBannerKey;
  selection: ProfileBannerKey;
  isSaving: boolean;
  error: string;
  onSelectionChange: (banner: ProfileBannerKey) => void;
  onApply: () => void;
};

function CheckIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3" aria-hidden="true"><rect x="4.5" y="8.5" width="11" height="8" rx="2" /><path d="M7 8.5V6.75a3 3 0 0 1 6 0V8.5" strokeLinecap="round" /></svg>;
}

function formatPrice(amountMinor: number, currency: "PHP") {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

function ProfileBannerPicker({ profile, accountStatus, premiumAccess, savedBorder, savedBanner, selection, isSaving, error, onSelectionChange, onApply }: ProfileBannerPickerProps) {
  const [checkoutProductId, setCheckoutProductId] = useState<BillingProductId | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const selectedDefinition = getProfileBannerDefinition(selection);
  const selectionAvailable = canUseProfileBanner(selection, premiumAccess);
  const selectedProductId = selectedDefinition.premiumProductId;
  const selectedAccessSource = selectedProductId
    ? resolvePremiumProductAccessSource(premiumAccess, selectedProductId)
    : null;
  const selectedPrice = selectedDefinition.amountMinor !== null && selectedDefinition.currency
    ? formatPrice(selectedDefinition.amountMinor, selectedDefinition.currency)
    : null;

  async function startCheckout(productId: BillingProductId) {
    if (checkoutProductId) return;
    setCheckoutProductId(productId);
    setCheckoutError("");
    const nextError = await beginBillingCheckout(productId);
    if (nextError) setCheckoutError(nextError);
    setCheckoutProductId(null);
  }

  function renderThemeOption(theme: ProfileThemeDefinition) {
    const selected = theme.key === selection;
    const equipped = theme.key === savedBanner;
    const accessSource = theme.premiumProductId
      ? resolvePremiumProductAccessSource(premiumAccess, theme.premiumProductId)
      : null;
    const stateLabel = accessSource ? premiumThemeAccessLabels[accessSource] : "Free";

    return (
      <button key={theme.key} type="button" aria-pressed={selected} aria-label={`${theme.name}, ${theme.access === "premium" ? "Elite profile theme" : "free profile theme"}, ${stateLabel}${selected ? ", selected" : ""}${equipped ? ", currently equipped" : ""}`} disabled={isSaving || Boolean(checkoutProductId)} onClick={() => { setCheckoutError(""); onSelectionChange(theme.key); }} className={`group relative min-w-0 rounded-2xl border p-2 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50 ${selected ? "border-primary bg-accent shadow-sm" : "border-border bg-surface hover:bg-accent/70"}`}>
        <ProfileBanner bannerKey={theme.key} className="h-24 w-full overflow-hidden rounded-xl border border-border p-2"><div aria-hidden="true" className="flex h-full flex-col"><span className="mx-auto mt-1 h-5 w-5 rounded-full border border-border bg-surface/80" /><span className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-heading/20" /><span className="mt-auto block h-1.5 w-full rounded-full bg-heading/10" /><span className="mt-1 block h-1.5 w-2/3 rounded-full bg-heading/10" /></div></ProfileBanner>
        <span className="mt-2 flex min-w-0 items-center justify-between gap-1.5 px-1"><span className="truncate text-xs font-semibold text-heading">{theme.name}</span><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${selected ? "bg-primary text-white" : "border border-border text-transparent"}`} aria-hidden="true"><CheckIcon /></span></span>
        <span className={`mt-1 block min-h-4 px-1 text-[0.65rem] font-semibold uppercase tracking-wide ${equipped ? "text-primary" : theme.access === "premium" ? "text-muted" : "text-transparent"}`} aria-hidden="true">{equipped ? "Equipped" : theme.access === "premium" ? "Elite" : "Free"}</span>
        {accessSource === "locked" && <span className="absolute left-4 top-4 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface/90 text-muted shadow-sm" aria-hidden="true"><LockIcon /></span>}
      </button>
    );
  }

  return (
    <div>
      <ProfileBanner bannerKey={selection} className="overflow-visible rounded-3xl border border-border p-5 shadow-soft sm:p-6">
        <div className="flex justify-center overflow-visible py-2"><UserIdentityAvatar profile={profile} accountStatus={accountStatus} avatarBorder={savedBorder} size="xl" /></div>
        <div className="mt-4 text-center"><p className="break-words text-base font-bold text-heading">{getProfileDisplayName(profile)}</p><p className="mt-1 break-all text-xs text-body">{profile.username ? `@${profile.username}` : "Nemissive member"}</p></div>
        <div aria-hidden="true" className="mt-5 space-y-3 border-t border-border/70 pt-4"><span className="block h-2.5 w-16 rounded-full bg-heading/15" /><span className="block h-2 w-full rounded-full bg-heading/10" /><span className="block h-2 w-3/4 rounded-full bg-heading/10" /></div>
        <p className="mt-5 text-center text-sm font-semibold text-heading">{selectedDefinition.name} Profile Theme</p>
      </ProfileBanner>

      {selectedDefinition.access === "premium" && selectedAccessSource && (
        <div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold text-heading">{selectedDefinition.name}</p><p className="mt-1 text-xs text-body">Elite Profile Theme · {selectedDefinition.collectionPosition} of {premiumProfileBannerCatalog.length}</p></div><span className="rounded-full bg-accent px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-primary">{premiumThemeAccessLabels[selectedAccessSource]}</span></div>
          {selectedPrice && <p className="mt-3 text-sm font-semibold text-heading">{selectedPrice} <span className="font-normal text-body">one-time · Own forever</span></p>}
          {selectedAccessSource === "locked" && selectedProductId && <><p className="mt-2 text-xs leading-5 text-body">Included with active Nemissive Elite.</p><button type="button" onClick={() => void startCheckout(selectedProductId)} disabled={Boolean(checkoutProductId) || isSaving} aria-label={`Buy ${selectedDefinition.name} for ${selectedPrice ?? "the listed price"}`} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60">{checkoutProductId === selectedProductId ? "Preparing secure checkout…" : `Buy ${selectedDefinition.name}`}</button></>}
        </div>
      )}

      <fieldset className="mt-6"><legend className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Free profile themes</legend><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{freeProfileBannerCatalog.map(renderThemeOption)}</div></fieldset>
      <fieldset className="mt-6"><legend className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Elite profile themes</legend><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{premiumProfileBannerCatalog.map(renderThemeOption)}</div></fieldset>

      {(checkoutError || error) && <p role="alert" className="mt-4 rounded-2xl border border-primary/25 bg-accent px-3 py-2.5 text-xs leading-5 text-body">{checkoutError || error}</p>}
      <p className="sr-only" role="status" aria-live="polite">{checkoutProductId ? "Preparing secure checkout." : ""}</p>
      <div className="mt-6 flex justify-end"><button type="button" onClick={onApply} disabled={isSaving || Boolean(checkoutProductId) || !selectionAvailable} className="min-h-11 w-full rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">{isSaving ? "Applying…" : selectedAccessSource === "preview" ? "Apply development preview" : "Apply Theme"}</button></div>
    </div>
  );
}

export default ProfileBannerPicker;
