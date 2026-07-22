import { useCallback, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoginTransition from "../components/auth/LoginTransition";
import { supabase } from "../lib/supabase";

function LoginPage() {
  const navigate = useNavigate();
  const isSubmittingRef = useRef(false);
  const hasNavigatedRef = useRef(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const handleTransitionComplete = useCallback(() => {
    if (hasNavigatedRef.current) return;

    hasNavigatedRef.current = true;
    navigate("/dashboard", { replace: true });
  }, [navigate]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    let loginSucceeded = false;

    setMessage("");
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      loginSucceeded = true;
      setIsTransitioning(true);
    } finally {
      setIsLoading(false);

      if (!loginSucceeded) {
        isSubmittingRef.current = false;
      }
    }
  }

  if (isTransitioning) {
    return <LoginTransition onComplete={handleTransitionComplete} />;
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-semibold text-primary">Good to see you again</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-heading sm:text-4xl">Welcome back</h1>
        <p className="mt-3 text-base leading-7 text-body">Sign in to continue your conversations.</p>
      </div>

      {message && (
        <div role="alert" aria-live="polite" className="mb-6 rounded-2xl border border-primary/25 bg-accent px-4 py-3 text-sm leading-6 text-body">
          <p className="font-semibold text-heading">We couldn’t sign you in</p>
          <p className="mt-1">{message}</p>
        </div>
      )}

      <form onSubmit={handleLogin} aria-busy={isLoading} className="space-y-5">
        <div>
          <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-heading">Email address</label>
          <input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required disabled={isLoading} className="min-h-12 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-heading outline-none transition placeholder:text-muted focus:border-primary focus:bg-card focus:ring-4 focus:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" />
        </div>

        <div>
          <label htmlFor="login-password" className="mb-2 block text-sm font-semibold text-heading">Password</label>
          <div className="relative">
            <input id="login-password" type={isPasswordVisible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={isLoading} className="min-h-12 w-full rounded-2xl border border-border bg-background py-3.5 pl-4 pr-20 text-base text-heading outline-none transition focus:border-primary focus:bg-card focus:ring-4 focus:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" />
            <button type="button" onClick={() => setIsPasswordVisible((isVisible) => !isVisible)} aria-label={isPasswordVisible ? "Hide password" : "Show password"} aria-controls="login-password" className="absolute right-2 top-1/2 min-h-10 -translate-y-1/2 rounded-xl px-3 text-sm font-semibold text-primary outline-none transition hover:bg-accent hover:text-primary-hover focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:opacity-60" disabled={isLoading}>{isPasswordVisible ? "Hide" : "Show"}</button>
          </div>
        </div>

        <button type="submit" disabled={isLoading} className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-white shadow-soft outline-none transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg focus-visible:ring-4 focus-visible:ring-accent-hover disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60 disabled:shadow-soft">{isLoading ? "Signing in..." : "Sign in"}</button>
      </form>

      <p className="mt-8 text-center text-sm text-body">Don’t have an account? <Link to="/signup" className="font-semibold text-primary outline-none transition hover:text-primary-hover hover:underline focus-visible:rounded-md focus-visible:ring-4 focus-visible:ring-accent-hover">Create one</Link></p>
    </div>
  );
}

export default LoginPage;
