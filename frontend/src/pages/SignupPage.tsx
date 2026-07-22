import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

function SignUp() {
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  function handlePasswordChange(value: string) {
    setPassword(value);
    setPasswordMismatch("");
  }

  function handleConfirmPasswordChange(value: string) {
    setConfirmPassword(value);
    setPasswordMismatch("");
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setIsError(false);

    if (password !== confirmPassword) {
      setPasswordMismatch("Passwords do not match.");
      confirmPasswordRef.current?.focus();
      return;
    }

    setPasswordMismatch("");
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setIsError(true);
        setMessage(error.message);
        return;
      }

      setMessage("Account created! Please check your email to verify your account.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-semibold text-primary">Your conversations, your space</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-heading sm:text-4xl">Create your account</h1>
        <p className="mt-3 text-base leading-7 text-body">Start meaningful conversations in a space that feels personal.</p>
      </div>

      {message && isError && (
        <div role="alert" aria-live="polite" className="mb-6 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">
          <p className="font-semibold text-heading">We couldn’t create your account</p>
          <p className="mt-1">{message}</p>
        </div>
      )}

      {message && !isError && (
        <div role="status" aria-live="polite" className="mb-6 rounded-2xl border border-online/40 bg-background px-4 py-3 text-sm leading-6 text-body">
          <p className="font-semibold text-heading">Check your inbox</p>
          <p className="mt-1">{message}</p>
        </div>
      )}

      <form onSubmit={handleSignUp} aria-busy={isLoading} className="space-y-5">
        <div>
          <label htmlFor="signup-email" className="mb-2 block text-sm font-semibold text-heading">Email address</label>
          <input id="signup-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required disabled={isLoading} className="min-h-12 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-heading outline-none transition placeholder:text-muted focus:border-primary focus:bg-card focus:ring-4 focus:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" />
        </div>

        <div>
          <label htmlFor="signup-password" className="mb-2 block text-sm font-semibold text-heading">Password</label>
          <div className="relative">
            <input id="signup-password" type={isPasswordVisible ? "text" : "password"} autoComplete="new-password" value={password} onChange={(event) => handlePasswordChange(event.target.value)} required disabled={isLoading} className="min-h-12 w-full rounded-2xl border border-border bg-background py-3.5 pl-4 pr-20 text-base text-heading outline-none transition focus:border-primary focus:bg-card focus:ring-4 focus:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" />
            <button type="button" onClick={() => setIsPasswordVisible((isVisible) => !isVisible)} aria-label={isPasswordVisible ? "Hide both password fields" : "Show both password fields"} aria-controls="signup-password signup-confirm-password" className="absolute right-2 top-1/2 min-h-10 -translate-y-1/2 rounded-xl px-3 text-sm font-semibold text-primary outline-none transition hover:bg-accent hover:text-primary-hover focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading}>{isPasswordVisible ? "Hide" : "Show"}</button>
          </div>
        </div>

        <div>
          <label htmlFor="signup-confirm-password" className="mb-2 block text-sm font-semibold text-heading">Confirm password</label>
          <input ref={confirmPasswordRef} id="signup-confirm-password" type={isPasswordVisible ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => handleConfirmPasswordChange(event.target.value)} required disabled={isLoading} aria-invalid={Boolean(passwordMismatch)} aria-describedby={passwordMismatch ? "signup-confirm-password-error" : undefined} className="min-h-12 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-heading outline-none transition focus:border-primary focus:bg-card focus:ring-4 focus:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" />
          {passwordMismatch && <p id="signup-confirm-password-error" role="alert" className="mt-2 text-sm font-medium text-primary">{passwordMismatch}</p>}
        </div>

        <button type="submit" disabled={isLoading} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-white shadow-soft outline-none transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 disabled:shadow-soft">{isLoading ? "Creating account..." : "Create account"}</button>
      </form>

      <p className="mt-8 text-center text-sm text-body">Already have an account? <Link to="/login" className="font-semibold text-primary outline-none transition hover:text-primary-hover hover:underline focus-visible:rounded-md focus-visible:ring-4 focus-visible:ring-accent-hover">Sign in</Link></p>
    </div>
  );
}

export default SignUp;
