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
    const [code, setCode] = React.useState("");
    const [status, setStatus] = React.useState<Status>("idle");
    const [message, setMessage] = React.useState("");

    const destination = React.useMemo(() => {
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
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) {
            setStatus("error");
            setMessage(error.message);
            return;
        }
        setStatus("idle");
        setStep("code");
    }

    async function verifyCode(e: FormEvent) {
        e.preventDefault();
        if (code.trim().length !== 6) {
            setStatus("error");
            setMessage("Please enter the 6-digit code from your email.");
            return;
        }
        setStatus("sending");
        setMessage("");
        const { error } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: code.trim(),
            type: "email",
        });
        if (error) {
            setStatus("error");
            setMessage("Code is invalid or expired — request a new one.");
            return;
        }
        localStorage.setItem("ss_last_email", email.trim());
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
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        });
        if (error) {
            setStatus("error");
            setMessage(error.message);
        } else {
            setStatus("idle");
            setMessage("New code sent — check your inbox.");
        }
    }

    const alertClass =
        status === "error"
            ? "bg-red-100 text-red-700 border border-red-300"
            : status === "success"
              ? "bg-green/20 text-green border border-green/40"
              : "bg-sand-3 text-sand-1 border border-sand-1/20";

    return (
        <div className='flex-1 grid place-items-center px-4 py-8'>
            <div className='w-full max-w-sm flex flex-col gap-4'>
                <div className='bg-sand-4 rounded-2xl shadow-xl p-6 sm:p-8 flex flex-col gap-5'>
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
                        <form
                            onSubmit={verifyCode}
                            className='flex flex-col gap-4'>
                            <div className='flex flex-col gap-1'>
                                <label className='text-xs font-semibold text-sand-1/80'>
                                    6-digit code
                                </label>
                                <input
                                    type='text'
                                    inputMode='numeric'
                                    autoComplete='one-time-code'
                                    placeholder='XXXXXX'
                                    maxLength={6}
                                    value={code}
                                    onChange={e =>
                                        setCode(
                                            e.target.value.replace(/\D/g, ""),
                                        )
                                    }
                                    disabled={status === "sending"}
                                    className='bg-transparent border-b-2 border-sand-1/40 focus:border-sand-1 outline-none text-sand-1 text-center text-2xl tracking-[0.5em] py-2 transition-colors w-full'
                                />
                            </div>

                            <button
                                type='submit'
                                disabled={
                                    status === "sending" ||
                                    code.trim().length !== 6
                                }
                                className='self-center px-8 py-2 bg-sand-1 text-ink font-bold rounded-full hover:opacity-90 disabled:opacity-50 transition-all'>
                                {status === "sending" ? (
                                    <span className='flex items-center gap-2'>
                                        <span className='w-4 h-4 rounded-full border-2 border-ink border-t-transparent animate-spin' />
                                        Verifying…
                                    </span>
                                ) : (
                                    "Sign in"
                                )}
                            </button>

                            <div className='flex items-center justify-between text-sm'>
                                <button
                                    type='button'
                                    className='text-sand-1/70 underline underline-offset-4 hover:text-sand-1 transition-colors'
                                    onClick={() => {
                                        setStep("email");
                                        setCode("");
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
                                        setCode("");
                                        setStatus("idle");
                                        setMessage("");
                                    }}>
                                    come back and sign in
                                </button>
                                .
                            </p>
                        </form>
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
