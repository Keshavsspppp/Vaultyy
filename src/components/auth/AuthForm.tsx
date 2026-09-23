"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Logo, Wordmark } from "@/components/Logo";

const OAUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That email is already registered. Sign in with your password instead.",
  AccessDenied: "Google sign-in was cancelled or denied.",
  Configuration: "Google sign-in is not configured correctly.",
};

export function AuthForm({ mode, googleEnabled = false }: { mode: "login" | "register"; googleEnabled?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || params.get("callbackUrl") || "/files";
  // Auth.js redirects back here with ?error=... when an OAuth attempt fails.
  const oauthError = params.get("error");
  const [error, setError] = useState<string | null>(
    oauthError ? OAUTH_ERRORS[oauthError] ?? "Google sign-in failed. Please try again." : null,
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.get("name"), email, password }),
        });
        if (!res.ok) {
          setError((await res.json()).error ?? "Could not create account");
          return;
        }
      }
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError(
          googleEnabled
            ? "Incorrect email or password. If you signed up with Google, use the Google button."
            : "Incorrect email or password",
        );
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full">
      {/* Editorial panel */}
      <aside className="paper relative hidden w-[46%] flex-col justify-between border-r border-border p-10 lg:flex">
        <Wordmark />
        <div>
          <Logo className="mb-8 h-16 w-16 text-primary" />
          <h1 className="font-display text-5xl leading-[1.05]">
            Your files,
            <br />
            kept with care.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-muted">
            Upload, organize and share your work. Every version is kept, every file is searchable, and AI is one question away.
          </p>
        </div>
        <p className="text-xs text-muted">© {new Date().getFullYear()} Vaultly</p>
      </aside>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center bg-surface p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          <h2 className="font-display text-3xl">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-2 text-sm text-muted">
            {mode === "login" ? "Sign in to continue to your files." : "It takes less than a minute."}
          </p>

          {googleEnabled && (
            <>
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: next })}
                className="mt-8 flex w-full items-center justify-center gap-3 rounded-md border border-border-strong bg-background py-2.5 text-sm font-medium transition-colors hover:bg-hover"
              >
                <GoogleMark />
                Continue with Google
              </button>
              <div className="my-6 flex items-center gap-3 text-xs text-muted">
                <span className="h-px flex-1 bg-border" />
                or with email
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className={`space-y-4 ${googleEnabled ? "" : "mt-8"}`}>
            {mode === "register" && <Field name="name" label="Name" autoComplete="name" />}
            <Field name="email" label="Email" type="email" autoComplete="email" />
            <Field
              name="password"
              label="Password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 8 : undefined}
            />
            {error && (
              <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-foreground py-2.5 text-sm font-medium text-background transition-colors hover:bg-primary disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-sm text-muted">
            {mode === "login" ? "New here? " : "Already have an account? "}
            <Link href={mode === "login" ? "/register" : "/login"} className="font-medium text-foreground underline underline-offset-4">
              {mode === "login" ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.8l-7.7-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input
        required
        {...props}
        className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-foreground"
      />
    </label>
  );
}
