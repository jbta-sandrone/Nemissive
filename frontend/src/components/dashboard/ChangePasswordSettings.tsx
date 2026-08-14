import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { PASSWORD_REQUIREMENTS, validatePassword } from "../../lib/passwordPolicy";
import { supabase } from "../../lib/supabase";

type CredentialState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "provider-only"; provider: string }
  | { status: "password"; email: string; userId: string };

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  disabled: boolean;
  describedBy?: string;
  invalid?: boolean;
  onChange: (value: string) => void;
};

const successToastDurationMs = 3000;

function providerLabel(provider: string) {
  const labels: Record<string, string> = { apple: "Apple", azure: "Microsoft", bitbucket: "Bitbucket", discord: "Discord", facebook: "Facebook", github: "GitHub", gitlab: "GitLab", google: "Google", keycloak: "Keycloak", linkedin: "LinkedIn", notion: "Notion", slack: "Slack", spotify: "Spotify", twitch: "Twitch", twitter: "Twitter", workos: "WorkOS", zoom: "Zoom" };
  return labels[provider] ?? provider.charAt(0).toLocaleUpperCase() + provider.slice(1);
}

function PasswordField({ id, label, value, autoComplete, disabled, describedBy, invalid, onChange }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return <div><label htmlFor={id} className="mb-2 block text-sm font-semibold text-heading">{label}</label><div className="relative"><input id={id} type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy} className="min-h-12 w-full rounded-2xl border border-border bg-surface py-3 pl-4 pr-16 text-base text-heading outline-none transition focus:border-primary focus:ring-4 focus:ring-accent-hover disabled:cursor-wait disabled:opacity-60" /><button type="button" onClick={() => setVisible((current) => !current)} disabled={disabled} aria-label={`${visible ? "Hide" : "Show"} ${label.toLocaleLowerCase()}`} aria-controls={id} className="absolute right-2 top-1/2 inline-flex min-h-10 min-w-11 -translate-y-1/2 items-center justify-center rounded-xl text-primary transition hover:bg-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-wait disabled:opacity-60"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true">{visible ? <><path d="M3 3 21 21" strokeLinecap="round" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.4 10.4 0 0 1 12 5c5.5 0 8.5 5.2 8.5 5.2a12 12 0 0 1-2.3 2.9M6.2 6.2C4.4 7.4 3.5 9 3.5 9s3 5.2 8.5 5.2c.8 0 1.5-.1 2.2-.3" strokeLinecap="round" /></> : <><path d="M3.5 12S6.5 6.8 12 6.8 20.5 12 20.5 12 17.5 17.2 12 17.2 3.5 12 3.5 12Z" /><circle cx="12" cy="12" r="2.4" /></>}</svg></button></div></div>;
}

function normalizeAuthError(error: { code?: string; message?: string }, stage: "reauthenticate" | "update") {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLocaleLowerCase();
  if (stage === "reauthenticate" && (code === "invalid_credentials" || message.includes("invalid login credentials"))) return "Current password is incorrect.";
  if (code.includes("rate_limit") || message.includes("rate limit") || message.includes("too many requests")) return "Too many attempts. Wait a moment and try again.";
  if (code === "session_not_found" || code === "refresh_token_not_found" || message.includes("session")) return "Your session has expired. Sign in again before changing your password.";
  if (stage === "update" && (code === "weak_password" || message.includes("password should") || message.includes("weak password"))) return "Supabase rejected this password as too weak. Choose a stronger password.";
  if (stage === "update" && (code === "same_password" || message.includes("different from the old password") || message.includes("same password"))) return "New password must be different from your current password.";
  if (message.includes("fetch") || message.includes("network") || !navigator.onLine) return "We couldn’t reach Nemissive. Check your connection and try again.";
  return stage === "reauthenticate" ? "We couldn’t verify your current password. Please try again." : "We couldn’t update your password. Please try again.";
}

function ChangePasswordSettings() {
  const shouldReduceMotion = useReducedMotion();
  const toastTimerRef = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const [credential, setCredential] = useState<CredentialState>({ status: "loading" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      const user = data.user;
      if (error || !user) { setCredential({ status: "error" }); return; }
      const identityProviders = (user.identities ?? []).map((identity) => identity.provider);
      const configuredProviders = Array.isArray(user.app_metadata.providers) ? user.app_metadata.providers.filter((provider): provider is string => typeof provider === "string") : [];
      const providers = [...new Set([...identityProviders, ...configuredProviders, typeof user.app_metadata.provider === "string" ? user.app_metadata.provider : ""].filter(Boolean))];
      const hasPasswordIdentity = providers.includes("email");
      if (!hasPasswordIdentity || !user.email) {
        const externalProvider = providers.find((provider) => provider !== "email") ?? "provider";
        setCredential({ status: "provider-only", provider: providerLabel(externalProvider) });
        return;
      }
      setCredential({ status: "password", email: user.email, userId: user.id });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current); }, []);

  const policy = validatePassword(newPassword);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const matchesCurrent = currentPassword.length > 0 && newPassword.length > 0 && currentPassword === newPassword;
  const canSubmit = credential.status === "password" && currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0 && policy.valid && passwordsMatch && !matchesCurrent && !isUpdating;
  const requirements = PASSWORD_REQUIREMENTS.map((requirement) => ({ ...requirement, met: policy.rules[requirement.key] }));

  function showSuccessToast() {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast("Password updated successfully");
    toastTimerRef.current = window.setTimeout(() => { setToast(""); toastTimerRef.current = null; }, successToastDurationMs);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || credential.status !== "password" || submittingRef.current) return;
    submittingRef.current = true;
    setIsUpdating(true);
    setFormError("");

    const { data: reauthenticated, error: reauthenticationError } = await supabase.auth.signInWithPassword({ email: credential.email, password: currentPassword });
    if (reauthenticationError || reauthenticated.user?.id !== credential.userId) {
      submittingRef.current = false;
      setIsUpdating(false);
      setFormError(reauthenticationError ? normalizeAuthError(reauthenticationError, "reauthenticate") : "We couldn’t verify your current account. Sign in again and retry.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    submittingRef.current = false;
    setIsUpdating(false);
    if (updateError) {
      setFormError(normalizeAuthError(updateError, "update"));
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setFormError("");
    showSuccessToast();
  }

  if (credential.status === "loading") return <div role="status" aria-live="polite" className="rounded-3xl border border-border bg-background px-4 py-6 text-sm text-body shadow-soft">Checking your sign-in method…</div>;
  if (credential.status === "error") return <div role="alert" className="rounded-3xl border border-border bg-background px-4 py-6 text-sm leading-6 text-body shadow-soft">We couldn’t verify your account’s sign-in method. Refresh and try again.</div>;
  if (credential.status === "provider-only") return <div className="rounded-3xl border border-border bg-background p-4 shadow-soft"><h2 className="font-semibold text-heading">Password unavailable</h2><p className="mt-2 text-sm leading-6 text-body">This account uses {credential.provider} sign-in. Setting a separate Nemissive password isn’t available yet.</p></div>;

  const mismatch = confirmPassword.length > 0 && !passwordsMatch;
  return <>
    <form onSubmit={handleSubmit} aria-busy={isUpdating} className="space-y-5"><div className="rounded-3xl border border-border bg-background p-4 shadow-soft"><div className="space-y-4"><PasswordField id="current-password" label="Current password" value={currentPassword} autoComplete="current-password" disabled={isUpdating} describedBy={formError ? "change-password-error" : undefined} invalid={formError === "Current password is incorrect."} onChange={(value) => { setCurrentPassword(value); setFormError(""); }} /><PasswordField id="new-password" label="New password" value={newPassword} autoComplete="new-password" disabled={isUpdating} describedBy="password-requirements password-strength" invalid={newPassword.length > 0 && (!policy.valid || matchesCurrent)} onChange={(value) => { setNewPassword(value); setFormError(""); }} /><div id="password-strength" role="status" aria-live="polite" aria-atomic="true" className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-3 py-2.5"><span className="text-xs font-semibold text-body">Password strength</span><span className="text-xs font-bold text-heading">{newPassword ? policy.strength : "Not entered"}</span></div><div id="password-requirements"><p className="text-xs font-semibold text-heading">Password must include:</p><ul className="mt-2 grid gap-2 sm:grid-cols-2">{requirements.map((requirement) => <li key={requirement.key} className="flex min-w-0 items-center gap-2 text-xs leading-5 text-body"><span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${requirement.met ? "border-primary bg-accent text-primary" : "border-border text-muted"}`} aria-hidden="true">{requirement.met ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3"><path d="m3 8 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span><span><span className="sr-only">{requirement.met ? "Requirement met: " : "Requirement not met: "}</span>{requirement.label}</span></li>)}</ul></div>{matchesCurrent && <p role="alert" className="text-sm font-medium text-primary">New password must be different from your current password.</p>}<PasswordField id="confirm-new-password" label="Confirm new password" value={confirmPassword} autoComplete="new-password" disabled={isUpdating} describedBy={mismatch ? "confirm-new-password-error" : undefined} invalid={mismatch} onChange={(value) => { setConfirmPassword(value); setFormError(""); }} />{mismatch && <p id="confirm-new-password-error" role="alert" className="text-sm font-medium text-primary">New passwords do not match.</p>}{formError && <p id="change-password-error" role="alert" aria-live="assertive" className="rounded-2xl border border-primary/25 bg-accent px-3 py-2.5 text-sm leading-6 text-heading">{formError}</p>}</div></div><button type="submit" disabled={!canSubmit} className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-50">{isUpdating ? "Updating password…" : "Update password"}</button><p className="text-xs leading-5 text-muted">Your current session stays signed in. Other active sessions aren’t revoked by this action.</p></form>
    <div className="pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[120] w-[min(calc(100%-2rem),22rem)] -translate-x-1/2"><AnimatePresence initial={false}>{toast && <motion.div role="status" aria-live="polite" aria-atomic="true" initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }} transition={{ duration: shouldReduceMotion ? 0 : 0.16 }} className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold text-heading shadow-soft"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-primary"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span>{toast}</span></motion.div>}</AnimatePresence></div>
  </>;
}

export default ChangePasswordSettings;
