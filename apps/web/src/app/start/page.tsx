"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { hasStoredSession, setStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

export default function StartAuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (hasStoredSession()) {
      router.replace("/app");
    }
  }, [router]);

  const handleModeToggle = () => {
    setIsSignUp((current) => !current);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}${isSignUp ? "/auth/signup" : "/auth/login"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            isSignUp
              ? { firstName, lastName, email, password }
              : { email, password }
          ),
        }
      );

      const payload = (await response.json().catch(() => null)) as {
        accessToken?: string | null;
        refreshToken?: string | null;
        user?: unknown;
        message?: string;
        details?: Array<{ path?: string; message?: string }>;
      } | null;

      if (!response.ok || !payload?.user) {
        const validationMessage = payload?.details?.[0]?.message;
        throw new Error(payload?.message || validationMessage || "Request failed");
      }

      setStoredAuth({
        accessToken: payload.accessToken ?? null,
        refreshToken: payload.refreshToken ?? null,
        user: payload.user,
      });

      router.push("/app");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-white text-Color-Scheme-1-Text">
      <div className="relative flex h-full w-full flex-col">
        <header className="absolute left-0 right-0 top-0 z-10 flex h-20 items-center bg-transparent px-8 md:px-12">
          <Link href="/" aria-label="DARCi home">
            <Image
              src="/icons/navbar/darci_black.svg"
              alt="DARCi"
              width={91}
              height={20}
              className="h-5 w-auto"
            />
          </Link>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <section className="relative flex min-h-0 items-center justify-center bg-white px-8 pb-10 pt-24 md:px-12 md:pb-16 md:pt-28">
            <div className="w-full max-w-md">
              <div>
                <h1 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
                  {isSignUp ? "Join DARCi" : "Access DARCi"}
                </h1>
                <p className="mt-3 text-sm leading-6 text-Color-Neutral">
                  {isSignUp
                    ? "Create your account to start notarizing documents."
                    : "Enter your credentials to begin notarizing documents."}
                </p>
              </div>

              <form className="mt-10 space-y-4" onSubmit={handleSubmit}>
                {isSignUp ? (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium">Name</label>
                      <input
                        className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                        placeholder="Avery"
                        type="text"
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        required={isSignUp}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium">Last name</label>
                      <input
                        className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                        placeholder="Stone"
                        type="text"
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        required={isSignUp}
                      />
                    </div>
                  </>
                ) : null}

                <div>
                  <label className="mb-2 block text-sm font-medium">Email</label>
                  <input
                    className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                    placeholder="you@company.com"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium">Password</label>
                  <input
                    className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                    placeholder="Enter your password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                  />
                </div>

                {!isSignUp ? (
                  <button
                    type="button"
                    className="text-xs text-Color-Neutral underline underline-offset-4"
                  >
                    Reset your password
                  </button>
                ) : null}

                {errorMessage ? (
                  <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                  </div>
                ) : null}

                <div className="space-y-3 pt-2">
                  <button
                    className="w-full bg-Green px-4 py-3 text-sm font-medium text-Color-Neutral-Darkest"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? isSignUp
                        ? "Creating account..."
                        : "Signing in..."
                      : isSignUp
                      ? "Create account"
                      : "Sign in"}
                  </button>
                  <button
                    className="flex w-full items-center justify-center gap-3 border border-Color-Scheme-1-Border bg-black/5 px-4 py-3 text-sm font-medium text-Color-Scheme-1-Text"
                    type="button"
                    disabled
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                    >
                      <path
                        fill="currentColor"
                        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.14 3.57-8.64Z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3c-1.07.72-2.44 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.96H1.25v3.09A12 12 0 0 0 12 24Z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.25 14.28A7.2 7.2 0 0 1 4.87 12c0-.79.14-1.56.38-2.28V6.63H1.25A12 12 0 0 0 0 12c0 1.94.46 3.78 1.25 5.37l4-3.09Z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.96 1.2 15.24 0 12 0A12 12 0 0 0 1.25 6.63l4 3.09c.95-2.84 3.61-4.95 6.75-4.95Z"
                      />
                    </svg>
                    {isSignUp ? "Sign up with Google" : "Continue with Google"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-Color-Neutral underline underline-offset-4"
                    onClick={handleModeToggle}
                  >
                    {isSignUp
                      ? "Already have an account? Log in"
                      : "Don't have an account? Sign up here."}
                  </button>
                </div>
              </form>
            </div>

            <div className="absolute bottom-10 left-8 text-xs text-Color-Neutral md:bottom-16 md:left-12">
              © 2024 DARCi
            </div>
          </section>

          <section className="relative hidden min-h-0 md:block">
            <Image
              src="/images/hero/hero.webp"
              alt="DARCi hero"
              fill
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/60" />
          </section>
        </div>
      </div>
    </div>
  );
}
