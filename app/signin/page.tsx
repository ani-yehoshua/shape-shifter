"use client";

import * as React from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import createClient from "@/lib/supabaseBrowserClient";
import FormFields from "@/components/FormFields";

type Step = "email" | "code";
type Status = "idle" | "sending" | "success" | "error";

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function PersonIcon() {
    return (
        <svg
            className='w-4 h-4'
            fill='none'
            stroke='#f7f7f5'
            viewBox='0 0 24 24'>
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
            />
        </svg>
    );
}

function SignInForm() {
    const searchParams = useSearchParams();
    const supabase = React.useMemo(() => createClient(), []);

    const [step, setStep] = React.useState<Step>("email");
    const [email, setEmail] = React.useState(
        () =>
            typeof window !== "undefined"
                ? (localStorage.getItem("ss_last_email") ?? "")
                : "",
    );
    const [digits, setDigits] = React.useState<string[]>(Array(6).fill(""));
    const [status, setStatus] = React.useState<Status>("idle");
    const [message, setMessage] = React.useState("");
    const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);

    const destination = React.useMemo(() => {
        // `next` is a literal resolved path -- used when this page itself
        // sends someone off to confirm their email and needs them routed
        // straight back here on return (see /auth/confirmed). `redirect`
        // is the older, single-purpose param used by in-app links.
        const next = searchParams.get("next");
        if (next) return next;
        const redirect = searchParams.get("redirect");
        return redirect === "paywall" ? "/?paywall=1" : "/";
    }, [searchParams]);

    async function sendCode(e: FormEvent) {
        e.preventDefault();
        if (!isValidEmail(email)) {
            setStatus("error");
            setMessage("Please enter a valid email address.");
            return;
        }
        setStatus("sending");
        setMessage("");
        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: {
                shouldCreateUser: true,
                emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
            },
        });
        if (error) {
            setStatus("error");
            setMessage(error.message);
            return;
        }
        setStatus("idle");
        setStep("code");
        setDigits(Array(6).fill(""));
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }

    async function verifyCode(fullCode: string) {
        if (fullCode.length !== 6) {
            setStatus("error");
            setMessage("Please enter the 6-digit code from your email.");
            return;
        }
        setStatus("sending");
        setMessage("");
        const { error } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: fullCode,
            type: "email",
        });
        if (error) {
            setStatus("error");
            setMessage("Code is invalid or expired — request a new one.");
            setDigits(Array(6).fill(""));
            inputRefs.current[0]?.focus();
            return;
        }
        localStorage.setItem("ss_last_email", email.trim());
        // Pick up a subscription bought before this account existed (see
        // lib/claimSubscription.ts). Awaited so Pro is already in place
        // when the redirect lands; a failure here must not block sign-in.
        try {
            const { data } = await supabase.auth.getSession();
            if (data.session) {
                await fetch("/api/claim-subscription", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${data.session.access_token}`,
                    },
                });
            }
        } catch {
            // ignore
        }
        setStatus("success");
        setMessage("Signed in. Redirecting…");
        window.location.href = destination;
    }

    async function resendCode() {
        setStatus("sending");
        setMessage("");
        const { error } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: {
                shouldCreateUser: true,
                emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
            },
        });
        if (error) {
            setStatus("error");
            setMessage(error.message);
        } else {
            setStatus("idle");
            setMessage("New code sent — check your inbox.");
            setDigits(Array(6).fill(""));
            inputRefs.current[0]?.focus();
        }
    }

    function handleDigitChange(i: number, value: string) {
        const v = value.replace(/\D/g, "");
        if (!v) {
            const next = [...digits];
            next[i] = "";
            setDigits(next);
            return;
        }
        // Paste-to-fill: if more than one digit landed in one box, spread it.
        if (v.length > 1) {
            const next = [...digits];
            for (let j = 0; j < v.length && i + j < 6; j++) next[i + j] = v[j];
            setDigits(next);
            const lastIdx = Math.min(i + v.length, 5);
            inputRefs.current[lastIdx]?.focus();
            if (next.every(d => d)) verifyCode(next.join(""));
            return;
        }
        const next = [...digits];
        next[i] = v;
        setDigits(next);
        if (i < 5) inputRefs.current[i + 1]?.focus();
        if (next.every(d => d)) verifyCode(next.join(""));
    }

    function handleDigitKeyDown(i: number, e: React.KeyboardEvent) {
        if (e.key === "Backspace" && !digits[i] && i > 0) {
            inputRefs.current[i - 1]?.focus();
        }
    }

    const alertClass =
        status === "error"
            ? "bg-red-100 text-red-700 border border-red-300 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800/60"
            : status === "success"
              ? "bg-green/20 text-green border border-green/40"
              : "bg-sand-3 text-sand-1 border border-sand-1/20";

    return (
        <div className='flex-1 grid place-items-center px-4 py-8'>
            <div className='w-full max-w-sm flex flex-col gap-4'>
                <div className='bg-sand-4 rounded-2xl shadow-xl p-6 sm:p-8 flex flex-col gap-5'>
                    {searchParams.get("purchased") === "1" && (
                        <p className='rounded-lg px-3 py-2 text-sm font-semibold text-center bg-green/20 text-green border border-green/40'>
                            Payment received. Sign in with the email you used
                            at checkout to unlock Pro.
                        </p>
                    )}
                    <div className='text-center'>
                        <h1 className='text-2xl font-bold text-sand-1'>
                            {step === "email" ? "Sign in" : "Check your email"}
                        </h1>
                        <p className='text-sm text-sand-1/60 mt-1'>
                            {step === "email"
                                ? "Enter your email and we'll send you a sign-in code. No password needed."
                                : `We sent a 6-digit code to ${email}. It expires in 15 minutes.`}
                        </p>
                    </div>

                    {step === "email" ? (
                        <form
                            onSubmit={sendCode}
                            className='flex flex-col gap-4'>
                            <FormFields
                                autoComplete='email'
                                label='Email'
                                name='email'
                                onChange={e => {
                                    setEmail(e.target.value);
                                    setMessage("");
                                    setStatus("idle");
                                }}
                                required
                                startAdornment={<PersonIcon />}
                                type='email'
                                value={email}
                            />
                            <button
                                type='submit'
                                disabled={
                                    status === "sending" || !isValidEmail(email)
                                }
                                className='self-center px-8 py-2 bg-sand-1 text-ink font-bold rounded-full hover:opacity-90 disabled:opacity-50 transition-all'>
                                {status === "sending" ? (
                                    <span className='flex items-center gap-2'>
                                        <span className='w-4 h-4 rounded-full border-2 border-ink border-t-transparent animate-spin' />
                                        Sending…
                                    </span>
                                ) : (
                                    "Send code"
                                )}
                            </button>
                        </form>
                    ) : (
                        <div className='flex flex-col gap-4'>
                            <div className='flex flex-col gap-2'>
                                <label className='text-xs font-semibold text-sand-1/80 text-center'>
                                    6-digit code
                                </label>
                                <div className='flex justify-center gap-2'>
                                    {digits.map((d, i) => (
                                        <input
                                            key={i}
                                            ref={el => {
                                                inputRefs.current[i] = el;
                                            }}
                                            value={d}
                                            onChange={e =>
                                                handleDigitChange(
                                                    i,
                                                    e.target.value,
                                                )
                                            }
                                            onKeyDown={e =>
                                                handleDigitKeyDown(i, e)
                                            }
                                            inputMode='numeric'
                                            autoComplete='one-time-code'
                                            maxLength={6}
                                            disabled={status === "sending"}
                                            className='w-11 h-12 text-center text-2xl bg-transparent border-b-2 border-sand-1/40 focus:border-sand-1 outline-none text-sand-1 transition-colors'
                                        />
                                    ))}
                                </div>
                            </div>

                            {status === "sending" && (
                                <span className='self-center flex items-center gap-2 text-sm text-sand-1/70'>
                                    <span className='w-4 h-4 rounded-full border-2 border-sand-1/40 border-t-transparent animate-spin' />
                                    Verifying…
                                </span>
                            )}

                            <div className='flex items-center justify-between text-sm'>
                                <button
                                    type='button'
                                    className='text-sand-1/70 underline underline-offset-4 hover:text-sand-1 transition-colors'
                                    onClick={() => {
                                        setStep("email");
                                        setDigits(Array(6).fill(""));
                                        setStatus("idle");
                                        setMessage("");
                                    }}>
                                    Wrong email?
                                </button>
                                <button
                                    type='button'
                                    className='text-sand-1/70 underline underline-offset-4 hover:text-sand-1 transition-colors'
                                    onClick={resendCode}
                                    disabled={status === "sending"}>
                                    Resend code
                                </button>
                            </div>

                            <p className='text-xs text-sand-1/50 leading-5 border-t border-sand-1/20 pt-3'>
                                New here? You may have received a confirmation
                                link instead of a code. Click it to verify your
                                email, then{" "}
                                <button
                                    type='button'
                                    className='underline underline-offset-2 hover:text-sand-1/80 transition-colors'
                                    onClick={() => {
                                        setStep("email");
                                        setDigits(Array(6).fill(""));
                                        setStatus("idle");
                                        setMessage("");
                                    }}>
                                    come back and sign in
                                </button>
                                .
                            </p>
                        </div>
                    )}

                    {message && (
                        <div
                            className={`rounded-lg px-3 py-2 text-sm font-semibold ${alertClass}`}>
                            {message}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function SignInPage() {
    return (
        <React.Suspense>
            <SignInForm />
        </React.Suspense>
    );
}
