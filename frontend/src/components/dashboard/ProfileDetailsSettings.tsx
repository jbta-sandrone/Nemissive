import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { announceProfileIdentityChanged, avatarFileExtension, isOwnedAvatarPath, normalizeUsername, profileAvatarBucket, validateAvatarFile, validateDisplayName, validateUsername } from "../../lib/profileIdentity";
import { supabase } from "../../lib/supabase";
import type { AccountStatus } from "../../types/account";
import type { AvatarBorderKey } from "../../types/avatarBorders";
import { normalizeAvatarBorderKey } from "../../types/avatarBorders";
import type { BirthdayVisibility, EditableProfileDetails, ProfileSearchResult } from "../../types/conversations";
import AvatarCustomizationWorkspace, { type AvatarCustomizationTab } from "./AvatarCustomizationWorkspace";
import { canUseAvatarBorder } from "./avatarBorders";
import InterestIcon from "./InterestIcon";
import InterestPickerDialog from "./InterestPickerDialog";
import type { PremiumAccessState } from "./premiumAccess";
import UserIdentityAvatar from "./UserIdentityAvatar";
import { getInterestOption, normalizeInterestKeys, type InterestKey } from "./profileInterests";

const emptyDetails: EditableProfileDetails = { bio: "", locationText: "", birthDate: "", birthdayVisibility: "hidden", showAge: false, interests: [] };
const profileSuccessToastDurationMs = 3000;
function characterCount(value: string) {
  return Array.from(value).length;
}

function currentLocalDate() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function hasControlCharacters(value: string) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function parseDetails(value: unknown): EditableProfileDetails {
  if (!value || typeof value !== "object") return emptyDetails;
  const row = value as Record<string, unknown>;
  const visibility = row.birthday_visibility === "month_day" || row.birthday_visibility === "full" ? row.birthday_visibility : "hidden";
  return {
    bio: typeof row.bio === "string" ? row.bio : "",
    locationText: typeof row.location_text === "string" ? row.location_text : "",
    birthDate: typeof row.birth_date === "string" ? row.birth_date : "",
    birthdayVisibility: visibility,
    showAge: row.show_age === true,
    interests: normalizeInterestKeys(row.interests),
  };
}

type Props = {
  profile: ProfileSearchResult;
  accountStatus: AccountStatus;
  premiumAccess: PremiumAccessState;
  onIdentityUpdated: (profile: ProfileSearchResult) => void;
};

type UsernameAvailability = "idle" | "checking" | "available" | "taken" | "invalid";

function parseIdentity(value: unknown, fallback: ProfileSearchResult) {
  if (!value || typeof value !== "object") return fallback;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string") return fallback;
  return {
    ...fallback,
    id: row.id,
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    username: typeof row.username === "string" ? row.username : null,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    avatar_border: normalizeAvatarBorderKey(row.avatar_border ?? fallback.avatar_border),
  };
}

function ProfileDetailsSettings({ profile, accountStatus, premiumAccess, onIdentityUpdated }: Props) {
  const shouldReduceMotion = useReducedMotion();
  const interestPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const changeAvatarTriggerRef = useRef<HTMLButtonElement>(null);
  const avatarWorkspaceRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const successToastTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const successToastSequenceRef = useRef(0);
  const [draft, setDraft] = useState<EditableProfileDetails>(emptyDetails);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailability>("idle");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState("");
  const [isAvatarSaving, setIsAvatarSaving] = useState(false);
  const [isInterestPickerOpen, setIsInterestPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successToastId, setSuccessToastId] = useState<number | null>(null);
  const [successToastMessage, setSuccessToastMessage] = useState("Profile updated successfully");
  const [reloadKey, setReloadKey] = useState(0);
  const [profileView, setProfileView] = useState<"edit" | "avatar">("edit");
  const [avatarTab, setAvatarTab] = useState<AvatarCustomizationTab>("photo");
  const [avatarBorderSelection, setAvatarBorderSelection] = useState<AvatarBorderKey>(() => normalizeAvatarBorderKey(profile.avatar_border));
  const [avatarBorderError, setAvatarBorderError] = useState("");
  const [isAvatarBorderSaving, setIsAvatarBorderSaving] = useState(false);

  const savedAvatarBorder = normalizeAvatarBorderKey(profile.avatar_border);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setHasLoaded(false);
      setError("");
      const { data, error: loadError } = await supabase.rpc("get_my_profile_details");
      if (cancelled) return;
      setIsLoading(false);
      if (loadError) {
        setError("We couldn’t load your profile details. Please try again.");
        if (import.meta.env.DEV) console.warn("Loading profile details failed", { code: loadError.code });
        return;
      }
      setDraft(parseDetails(data));
      setHasLoaded(true);
    }
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => () => {
    if (successToastTimerRef.current !== null) window.clearTimeout(successToastTimerRef.current);
  }, []);

  useEffect(() => () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (profileView !== "avatar") return;
    const frame = window.requestAnimationFrame(() => avatarWorkspaceRef.current?.scrollIntoView({ block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [profileView]);

  useEffect(() => {
    const validation = validateUsername(username);
    if (!username || !validation.valid || validation.normalized === normalizeUsername(profile.username ?? "")) return;

    const abortController = new AbortController();
    const timer = window.setTimeout(() => {
      setUsernameAvailability("checking");
      void supabase.rpc("is_username_available", { candidate_username: validation.normalized }).abortSignal(abortController.signal).then(({ data, error: availabilityError }) => {
        if (abortController.signal.aborted) return;
        if (availabilityError) { setUsernameAvailability("idle"); return; }
        setUsernameAvailability(data === true ? "available" : "taken");
      });
    }, 450);
    return () => { window.clearTimeout(timer); abortController.abort(); };
  }, [profile.username, username]);

  function dismissSuccessToast() {
    if (successToastTimerRef.current !== null) window.clearTimeout(successToastTimerRef.current);
    successToastTimerRef.current = null;
    setSuccessToastId(null);
  }

  function showSuccessToast(message = "Profile updated successfully") {
    if (successToastTimerRef.current !== null) window.clearTimeout(successToastTimerRef.current);
    successToastSequenceRef.current += 1;
    setSuccessToastMessage(message);
    setSuccessToastId(successToastSequenceRef.current);
    successToastTimerRef.current = window.setTimeout(() => {
      setSuccessToastId(null);
      successToastTimerRef.current = null;
    }, profileSuccessToastDurationMs);
  }

  function openAvatarWorkspace() {
    dismissSuccessToast();
    setAvatarTab("photo");
    setAvatarBorderSelection(savedAvatarBorder);
    setAvatarBorderError("");
    setProfileView("avatar");
  }

  function returnToProfileEditor() {
    cancelAvatarDraft();
    setAvatarBorderSelection(savedAvatarBorder);
    setAvatarBorderError("");
    setProfileView("edit");
    window.requestAnimationFrame(() => changeAvatarTriggerRef.current?.focus());
  }

  async function applyAvatarBorder() {
    if (isAvatarBorderSaving) return;
    const border = avatarBorderSelection;
    if (!canUseAvatarBorder(border, premiumAccess)) {
      setAvatarBorderError("Aurelia requires permanent ownership or active Nemissive Elite.");
      return;
    }
    setIsAvatarBorderSaving(true);
    setAvatarBorderError("");
    const { data, error: saveError } = await supabase.rpc("set_my_avatar_border", { candidate_border: border });
    if (saveError) {
      setIsAvatarBorderSaving(false);
      if (import.meta.env.DEV) console.warn("Saving avatar border failed", { code: saveError.code });
      setAvatarBorderError("We couldn’t save your avatar border. Please try again.");
      return;
    }
    const savedBorder = normalizeAvatarBorderKey(data);
    if (savedBorder !== border) {
      setIsAvatarBorderSaving(false);
      setAvatarBorderError("We couldn’t confirm your avatar border. Please try again.");
      return;
    }
    onIdentityUpdated({ ...profile, avatar_border: savedBorder });
    announceProfileIdentityChanged();
    setIsAvatarBorderSaving(false);
    cancelAvatarDraft();
    setProfileView("edit");
    showSuccessToast("Avatar border applied");
    window.requestAnimationFrame(() => changeAvatarTriggerRef.current?.focus());
  }

  async function chooseAvatar(file: File | null) {
    setAvatarError("");
    if (!file) return;
    const validationError = await validateAvatarFile(file);
    if (validationError) {
      setAvatarError(validationError);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
      return;
    }
    setAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  }

  function cancelAvatarDraft() {
    setAvatarFile(null);
    setAvatarPreviewUrl(null);
    setAvatarError("");
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  async function saveAvatar() {
    if (!avatarFile || isAvatarSaving) return;
    setIsAvatarSaving(true);
    setAvatarError("");
    dismissSuccessToast();
    const avatarPath = `${profile.id}/${crypto.randomUUID()}.${avatarFileExtension(avatarFile.type)}`;
    const { error: uploadError } = await supabase.storage.from(profileAvatarBucket).upload(avatarPath, avatarFile, { cacheControl: "31536000", contentType: avatarFile.type, upsert: false });
    if (uploadError) {
      setIsAvatarSaving(false);
      setAvatarError("We couldn’t upload that avatar. Please try again.");
      if (import.meta.env.DEV) console.warn("Uploading profile avatar failed", { message: uploadError.message });
      return;
    }

    const { data, error: saveError } = await supabase.rpc("set_profile_avatar", { candidate_avatar_path: avatarPath });
    if (saveError) {
      await supabase.storage.from(profileAvatarBucket).remove([avatarPath]);
      setIsAvatarSaving(false);
      setAvatarError("We couldn’t save that avatar. Please try again.");
      if (import.meta.env.DEV) console.warn("Saving profile avatar failed", { code: saveError.code });
      return;
    }

    const previousAvatar = profile.avatar_url;
    const savedProfile = parseIdentity(data, { ...profile, avatar_url: avatarPath });
    onIdentityUpdated(savedProfile);
    announceProfileIdentityChanged();
    cancelAvatarDraft();
    setIsAvatarSaving(false);
    showSuccessToast("Avatar updated");
    if (isOwnedAvatarPath(previousAvatar, profile.id) && previousAvatar !== savedProfile.avatar_url) {
      const { error: cleanupError } = await supabase.storage.from(profileAvatarBucket).remove([previousAvatar as string]);
      if (cleanupError && import.meta.env.DEV) console.warn("Removing replaced profile avatar failed", { message: cleanupError.message });
    }
  }

  async function removeAvatar() {
    if (!profile.avatar_url || isAvatarSaving) return;
    setIsAvatarSaving(true);
    setAvatarError("");
    dismissSuccessToast();
    const previousAvatar = profile.avatar_url;
    const { data, error: saveError } = await supabase.rpc("set_profile_avatar", { candidate_avatar_path: null });
    if (saveError) {
      setIsAvatarSaving(false);
      setAvatarError("We couldn’t remove your profile photo. Please try again.");
      if (import.meta.env.DEV) console.warn("Removing profile avatar reference failed", { code: saveError.code });
      return;
    }
    const savedProfile = parseIdentity(data, { ...profile, avatar_url: null });
    onIdentityUpdated(savedProfile);
    announceProfileIdentityChanged();
    setIsAvatarSaving(false);
    showSuccessToast("Avatar removed");
    if (isOwnedAvatarPath(previousAvatar, profile.id)) {
      const { error: cleanupError } = await supabase.storage.from(profileAvatarBucket).remove([previousAvatar]);
      if (cleanupError && import.meta.env.DEV) console.warn("Removing profile avatar object failed", { message: cleanupError.message });
    }
  }

  function applyInterestDraft(interests: InterestKey[]) {
    setDraft((current) => ({ ...current, interests }));
    setError("");
    setIsInterestPickerOpen(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || isLoading) return;
    dismissSuccessToast();
    const bio = draft.bio.trim();
    const location = draft.locationText.trim();
    const displayNameValidation = validateDisplayName(displayName);
    const usernameValidation = validateUsername(username);
    setError("");
    if (!displayNameValidation.valid) { setError(displayNameValidation.message); return; }
    if (!usernameValidation.valid) { setError(usernameValidation.message); return; }
    if (effectiveUsernameAvailability === "taken") { setError("That username is already taken."); return; }
    if (characterCount(bio) > 150 || hasControlCharacters(bio)) { setError("Bio must be plain text containing no more than 150 characters."); return; }
    if (characterCount(location) > 80 || hasControlCharacters(location)) { setError("Location must be plain text containing no more than 80 characters."); return; }
    if (draft.birthDate) {
      const minimum = "1900-01-01";
      const today = currentLocalDate();
      if (draft.birthDate < minimum || draft.birthDate > today) { setError("Choose a birthday between January 1, 1900 and today."); return; }
    }
    setIsSaving(true);
    const { data: identityData, error: identityError } = await supabase.rpc("set_profile_identity", {
      candidate_display_name: displayNameValidation.normalized,
      candidate_username: usernameValidation.normalized,
    });
    if (identityError) {
      setIsSaving(false);
      setError(identityError.code === "23505" ? "That username is already taken." : identityError.code === "22023" ? identityError.message : "We couldn’t save your profile identity. Please try again.");
      if (identityError.code === "23505") setUsernameAvailability("taken");
      if (import.meta.env.DEV) console.warn("Saving profile identity failed", { code: identityError.code });
      return;
    }
    const savedIdentity = parseIdentity(identityData, { ...profile, display_name: displayNameValidation.normalized, username: usernameValidation.normalized });
    onIdentityUpdated(savedIdentity);
    announceProfileIdentityChanged();
    setDisplayName(savedIdentity.display_name ?? "");
    setUsername(savedIdentity.username ?? "");

    const { data, error: saveError } = await supabase.rpc("set_profile_details", {
      candidate_bio: bio || null,
      candidate_location: location || null,
      candidate_birth_date: draft.birthDate || null,
      candidate_birthday_visibility: draft.birthDate ? draft.birthdayVisibility : "hidden",
      candidate_show_age: draft.birthDate ? draft.showAge : false,
      candidate_interests: draft.interests,
    });
    setIsSaving(false);
    if (saveError) {
      setError("Your identity was saved, but we couldn’t save the remaining profile details. Review the fields and try again.");
      if (import.meta.env.DEV) console.warn("Saving profile details failed", { code: saveError.code });
      return;
    }
    setDraft(parseDetails(data));
    showSuccessToast("Profile updated successfully");
  }

  const displayNameValidation = validateDisplayName(displayName);
  const usernameValidation = validateUsername(username);
  const effectiveUsernameAvailability: UsernameAvailability = !username ? "idle" : !usernameValidation.valid ? "invalid" : usernameValidation.normalized === normalizeUsername(profile.username ?? "") ? "available" : usernameAvailability;
  const usernameStatusText = effectiveUsernameAvailability === "checking" ? "Checking availability…" : effectiveUsernameAvailability === "available" ? "Username available" : effectiveUsernameAvailability === "taken" ? "Username already taken" : effectiveUsernameAvailability === "invalid" && username ? usernameValidation.message : "Use 3–30 lowercase letters, numbers, or underscores.";
  const canSave = !isSaving && !isAvatarSaving && displayNameValidation.valid && usernameValidation.valid && effectiveUsernameAvailability !== "checking" && effectiveUsernameAvailability !== "taken";

  const successToast = <div className="pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[120] w-[min(calc(100%-2rem),22rem)] -translate-x-1/2"><AnimatePresence initial={false}>{successToastId !== null && <motion.div key={successToastId} role="status" aria-live="polite" aria-atomic="true" initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={{ duration: shouldReduceMotion ? 0 : 0.16 }} className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold text-heading shadow-soft"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-primary"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>{successToastMessage}</span></motion.div>}</AnimatePresence></div>;

  if (profileView === "avatar") return <><div ref={avatarWorkspaceRef}><AvatarCustomizationWorkspace profile={profile} accountStatus={accountStatus} premiumAccess={premiumAccess} activeTab={avatarTab} savedBorder={savedAvatarBorder} borderSelection={avatarBorderSelection} borderError={avatarBorderError} isBorderSaving={isAvatarBorderSaving} avatarInputRef={avatarInputRef} avatarPreviewUrl={avatarPreviewUrl} hasAvatarDraft={avatarFile !== null} avatarError={avatarError} isAvatarSaving={isAvatarSaving} onTabChange={setAvatarTab} onBorderSelectionChange={(border) => { setAvatarBorderSelection(border); setAvatarBorderError(""); }} onApplyBorder={() => void applyAvatarBorder()} onChooseAvatar={(file) => void chooseAvatar(file)} onSaveAvatar={() => void saveAvatar()} onCancelAvatar={cancelAvatarDraft} onRemoveAvatar={() => void removeAvatar()} onBack={returnToProfileEditor} /></div>{successToast}</>;

  return <section aria-labelledby="profile-details-settings-heading" className="mt-5 rounded-3xl border border-border bg-background p-4 shadow-soft">
    <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg></span><div><h2 id="profile-details-settings-heading" className="font-bold text-heading">Edit profile</h2><p className="mt-1 text-xs leading-5 text-body">Choose the details accepted contacts can see.</p></div></div>
    {isLoading ? <div role="status" aria-live="polite" className="mt-4 rounded-2xl bg-surface px-4 py-5 text-sm text-body">Loading profile details…</div> : !hasLoaded ? <div role="alert" className="mt-4 rounded-2xl border border-border bg-surface px-4 py-4 text-sm leading-6 text-body"><p>{error || "We couldn’t load your profile details."}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-3 min-h-10 rounded-xl px-3 font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">Retry</button></div> : <form onSubmit={(event) => void save(event)} className="mt-5 space-y-5">
      <section aria-labelledby="profile-avatar-heading" className="rounded-2xl border border-border bg-surface p-4"><h3 id="profile-avatar-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Avatar</h3><div className="mt-4 flex flex-col items-center gap-5"><UserIdentityAvatar profile={profile} accountStatus={accountStatus} avatarBorder={savedAvatarBorder} size="xl" /><button ref={changeAvatarTriggerRef} type="button" onClick={openAvatarWorkspace} disabled={isSaving || isAvatarSaving} className="min-h-11 rounded-2xl border border-border bg-background px-5 py-2.5 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50">Change Avatar</button></div></section>
      <section aria-labelledby="profile-identity-heading" className="space-y-4"><h3 id="profile-identity-heading" className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Identity</h3><div><div className="flex items-center justify-between gap-3"><label htmlFor="profile-display-name" className="text-sm font-semibold text-heading">Display name</label><span className="text-xs text-muted" aria-label={`${characterCount(displayName)} of 50 characters`}>{characterCount(displayName)} / 50</span></div><input id="profile-display-name" type="text" autoComplete="name" value={displayName} onChange={(event) => { setDisplayName(event.target.value); setError(""); }} disabled={isSaving} aria-invalid={displayName.length > 0 && !displayNameValidation.valid} className="mt-2 min-h-11 w-full rounded-2xl border border-border bg-surface px-3 text-sm text-heading outline-none focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:opacity-60" /></div><div><label htmlFor="profile-username" className="text-sm font-semibold text-heading">Username</label><div className="mt-2 flex min-w-0 items-center rounded-2xl border border-border bg-surface px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-accent-hover"><span className="shrink-0 text-sm text-muted" aria-hidden="true">@</span><input id="profile-username" type="text" autoComplete="username" value={username} onChange={(event) => { setUsername(event.target.value.toLocaleLowerCase()); setUsernameAvailability("idle"); setError(""); }} disabled={isSaving} aria-invalid={effectiveUsernameAvailability === "taken" || effectiveUsernameAvailability === "invalid"} aria-describedby="profile-username-status" className="min-h-11 min-w-0 flex-1 bg-transparent px-1 text-sm text-heading outline-none disabled:opacity-60" /></div><p id="profile-username-status" role="status" aria-live="polite" className={`mt-2 text-xs leading-5 ${effectiveUsernameAvailability === "available" ? "text-online" : effectiveUsernameAvailability === "taken" || effectiveUsernameAvailability === "invalid" ? "text-primary" : "text-muted"}`}>{usernameStatusText}</p></div></section>
      <h3 className="border-t border-border pt-5 text-xs font-bold uppercase tracking-[0.16em] text-muted">About</h3>
      <div><div className="flex items-center justify-between gap-3"><label htmlFor="profile-bio" className="text-sm font-semibold text-heading">Bio</label><span className="text-xs text-muted" aria-label={`${characterCount(draft.bio)} of 150 characters`}>{characterCount(draft.bio)} / 150</span></div><textarea id="profile-bio" value={draft.bio} onChange={(event) => { setDraft((current) => ({ ...current, bio: event.target.value })); setError(""); }} rows={3} disabled={isSaving} placeholder="A little about you" className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-border bg-surface px-3 py-3 text-sm leading-6 text-heading outline-none placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:opacity-60" /></div>
      <div><div className="flex items-center justify-between gap-3"><label htmlFor="profile-location" className="text-sm font-semibold text-heading">General location</label><span className="text-xs text-muted" aria-label={`${characterCount(draft.locationText)} of 80 characters`}>{characterCount(draft.locationText)} / 80</span></div><input id="profile-location" type="text" value={draft.locationText} onChange={(event) => { setDraft((current) => ({ ...current, locationText: event.target.value })); setError(""); }} disabled={isSaving} placeholder="Vigan City, Philippines" className="mt-2 min-h-11 w-full rounded-2xl border border-border bg-surface px-3 text-sm text-heading outline-none placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:opacity-60" /></div>
      <fieldset className="rounded-2xl border border-border p-3"><legend className="px-1 text-sm font-semibold text-heading">Birthday privacy</legend><label htmlFor="profile-birthday" className="mt-2 block text-xs font-semibold text-body">Birthday</label><input id="profile-birthday" type="date" min="1900-01-01" max={currentLocalDate()} value={draft.birthDate} onChange={(event) => setDraft((current) => ({ ...current, birthDate: event.target.value, birthdayVisibility: event.target.value ? current.birthdayVisibility : "hidden", showAge: event.target.value ? current.showAge : false }))} disabled={isSaving} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-heading outline-none focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:opacity-60" /><label htmlFor="profile-birthday-visibility" className="mt-4 block text-xs font-semibold text-body">Show birthday</label><select id="profile-birthday-visibility" value={draft.birthdayVisibility} onChange={(event) => setDraft((current) => ({ ...current, birthdayVisibility: event.target.value as BirthdayVisibility }))} disabled={isSaving || !draft.birthDate} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-heading outline-none focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:opacity-50"><option value="hidden">Hidden</option><option value="month_day">Month & day</option><option value="full">Full birthday</option></select><div className="mt-3 flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-heading">Show age</p><p className="mt-1 text-xs leading-5 text-body">Age is calculated from your birthday; the date stays hidden unless enabled above.</p></div><button type="button" role="switch" aria-checked={draft.showAge} aria-label="Show age" disabled={isSaving || !draft.birthDate} onClick={() => setDraft((current) => ({ ...current, showAge: !current.showAge }))} className={`relative h-7 w-12 shrink-0 rounded-full border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50 ${draft.showAge ? "border-primary bg-primary" : "border-border bg-card"}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-transform ${draft.showAge ? "translate-x-5" : "translate-x-0"}`} /></button></div></fieldset>
      <section aria-labelledby="profile-interests-settings-heading"><h3 id="profile-interests-settings-heading" className="text-sm font-semibold text-heading">Interests</h3>{draft.interests.length === 0 ? <p className="mt-1 text-xs leading-5 text-body">Tell people what you’re into.</p> : <ul aria-label="Selected interests" className="mt-3 flex flex-wrap gap-2">{draft.interests.map((interestKey) => { const option = getInterestOption(interestKey); if (!option) return null; return <li key={option.key} className="inline-flex max-w-full items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-heading"><InterestIcon icon={option.icon} className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="break-words">{option.label}</span></li>; })}</ul>}<button ref={interestPickerTriggerRef} type="button" onClick={() => setIsInterestPickerOpen(true)} disabled={isSaving} aria-haspopup="dialog" aria-expanded={isInterestPickerOpen} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-heading transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-50"><span>{draft.interests.length === 0 ? "Choose interests" : "Change interests"}</span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-primary" aria-hidden="true"><path d="m7 4 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg></button></section>
      {error && <div role="alert" className="rounded-2xl border border-primary/25 bg-accent px-3 py-2.5 text-xs leading-5 text-body">{error}</div>}
      <button type="submit" disabled={!canSave} className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:opacity-60">{isSaving ? "Saving…" : "Save changes"}</button>
    </form>}
    {isInterestPickerOpen && <InterestPickerDialog initialInterests={draft.interests} returnFocusRef={interestPickerTriggerRef} onClose={() => setIsInterestPickerOpen(false)} onSave={applyInterestDraft} />}
    {successToast}
  </section>;
}

export default ProfileDetailsSettings;
