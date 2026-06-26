"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { usePreferences } from "@/lib/contexts/PreferencesContext";
import { TUNINGS } from "@/lib/tunings";
import FormFields from "@/components/FormFields";
import SubmitFeedback from "@/components/SubmitFeedback";
import { deleteAccount, updateEmail, emailRegex } from "@/lib/API";

export default function Header() {
    const { user, signOut, isLoading: authIsLoading } = useAuth();
    const hasPro = useSubscription();
    const { handedness, setHandedness, tuningName, setTuningName } =
        usePreferences();
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : "U";

    const [drawerOpen, setDrawerOpen] = React.useState(false);
    const [paywallOpen, setPaywallOpen] = React.useState(
        () =>
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("paywall") === "1",
    );

    const panelRef = React.useRef<HTMLDivElement>(null);
    const touchStartX = React.useRef(0);
    const touchStartY = React.useRef(0);
    const isSwiping = React.useRef(false);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        isSwiping.current = false;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        const deltaX = e.touches[0].clientX - touchStartX.current;
        const deltaY = e.touches[0].clientY - touchStartY.current;
        if (
            !isSwiping.current &&
            (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)
        ) {
            isSwiping.current = Math.abs(deltaX) > Math.abs(deltaY);
        }
        if (isSwiping.current && deltaX > 0 && panelRef.current) {
            panelRef.current.style.transition = "none";
            panelRef.current.style.transform = `translateX(${deltaX}px)`;
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        const deltaX = e.changedTouches[0].clientX - touchStartX.current;
        if (panelRef.current) {
            panelRef.current.style.transition = "";
            panelRef.current.style.transform = "";
        }
        if (isSwiping.current && deltaX > 80) {
            setDrawerOpen(false);
        }
    };

    // Open paywall when ?paywall=1 appears in the URL (runtime trigger from page.tsx)
    React.useEffect(() => {
        if (searchParams.get("paywall") === "1") {
            setPaywallOpen(true);
            const params = new URLSearchParams(searchParams.toString());
            params.delete("paywall");
            const newUrl = pathname + (params.size ? `?${params}` : "");
            router.replace(newUrl, { scroll: false });
        }
    }, [searchParams, pathname, router]);

    const [plan, setPlan] = React.useState<"monthly" | "yearly">("monthly");
    const [signoutLoading, setSignoutLoading] = React.useState(false);
    const [paywallLoading, setPaywallLoading] = React.useState(false);
    const [paywallAlert, setPaywallAlert] = React.useState("");
    const [prices, setPrices] = React.useState<{
        monthly: string | null;
        yearly: string | null;
    }>({ monthly: null, yearly: null });

    React.useEffect(() => {
        fetch("/api/prices")
            .then(r => r.json())
            .then(d => {
                if (d.monthly || d.yearly) setPrices(d);
            })
            .catch(() => {});
    }, []);

    const [email, setEmail] = React.useState("");
    const [updateEmailLoading, setUpdateEmailLoading] = React.useState(false);
    const [updateEmailAlert, setUpdateEmailAlert] = React.useState<{
        msg: string;
        ok: boolean;
    } | null>(null);

    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [deleteLoading, setDeleteLoading] = React.useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = React.useState("");
    const [deleteAlert, setDeleteAlert] = React.useState<{
        msg: string;
        ok: boolean;
    } | null>(null);

    React.useEffect(() => {
        if (user) setEmail(user.email ?? "");
    }, [user]);

    const handleSubscribe = async () => {
        setPaywallLoading(true);
        setPaywallAlert("");
        try {
            const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: user?.email, plan }),
            });
            if (!res.ok) {
                setPaywallAlert("Failed to create checkout session.");
                return;
            }
            const { url } = await res.json();
            router.push(url);
        } catch {
            setPaywallAlert("Unable to start checkout. Please try again.");
        } finally {
            setPaywallLoading(false);
        }
    };

    const handleUpdateEmail = async () => {
        setUpdateEmailLoading(true);
        try {
            if (!email || !emailRegex.test(email))
                throw new Error("Invalid email format");
            if (email === user?.email)
                throw new Error(
                    "New email must be different from current email",
                );
            await updateEmail(email);
            setUpdateEmailAlert({ msg: "Email updated!", ok: true });
            await new Promise(r => setTimeout(r, 3000));
            setUpdateEmailAlert(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            setUpdateEmailAlert({
                msg: msg.includes("Invalid email")
                    ? "Enter a valid email"
                    : msg.includes("different")
                      ? "Must be a new email address"
                      : "Could not update email.",
                ok: false,
            });
        } finally {
            setUpdateEmailLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        setDeleteLoading(true);
        try {
            await deleteAccount();
            await signOut();
            setDeleteAlert({ msg: "Account deleted.", ok: true });
            await new Promise(r => setTimeout(r, 2000));
            setDeleteOpen(false);
            setDrawerOpen(false);
        } catch {
            setDeleteAlert({
                msg: "Could not delete account. Try again.",
                ok: false,
            });
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleDrawerSignout = async () => {
        setSignoutLoading(true);
        setDrawerOpen(false);
        await signOut();
        setSignoutLoading(false);
    };

    const alertClass = (ok: boolean) =>
        `rounded-lg px-3 py-2 text-xs font-semibold ${ok ? "bg-green-100 text-green-800 border border-green-300" : "bg-red-100 text-red-700 border border-red-300"}`;

    if (authIsLoading && !user) {
        return (
            <div className='fixed inset-0 flex items-center justify-center bg-sand-1 z-50'>
                <div className='w-8 h-8 border-4 border-ink border-t-transparent rounded-full animate-spin' />
            </div>
        );
    }

    return (
        <>
            {/* ── Fixed user avatar — top-right ─────────────────── */}
            <div className='fixed top-3 inset-x-0 z-40 flex justify-end pr-4 pointer-events-none'>
                <div className='pointer-events-auto'>
                    {authIsLoading ? (
                        <div className='w-10 h-10 flex items-center justify-center'>
                            <div className='w-6 h-6 border-2 border-ink border-t-transparent rounded-full animate-spin' />
                        </div>
                    ) : user ? (
                        <div className='flex flex-col items-end gap-1'>
                            <button
                                onClick={() => setDrawerOpen(true)}
                                title='Open settings'
                                className='w-10 h-10 rounded-full bg-ink text-sand-1 text-sm font-bold flex items-center justify-center hover:opacity-90 transition-opacity'>
                                {userInitial}
                            </button>
                            {!hasPro && (
                                <button
                                    onClick={() =>
                                        router.replace("?paywall=1", {
                                            scroll: false,
                                        })
                                    }
                                    className='flex items-center gap-1 px-2 py-0.5 rounded-full bg-olive text-sand-1 text-[10px] font-bold leading-tight hover:opacity-90 transition-opacity'>
                                    ★ Pro
                                </button>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={() => router.push("/signin")}
                            title='Sign in'
                            className='w-10 h-10 rounded-full border-2 border-ink/40 text-sand-4 flex items-center justify-center hover:border-ink transition-colors'>
                            <svg
                                className='w-5 h-5'
                                fill='currentColor'
                                viewBox='0 0 24 24'>
                                <path d='M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-7 9a7 7 0 1 1 14 0H5z' />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Settings Drawer ───────────────────────────────── */}
            {user && (
                <>
                    <div
                        className={`fixed inset-0 z-50 bg-black/40 transition-opacity duration-300 ${drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                        onClick={() => setDrawerOpen(false)}
                    />
                    <div
                        ref={panelRef}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className={`fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-sand-4 flex flex-col overflow-y-auto shadow-2xl transition-transform duration-300 ease-in-out ${drawerOpen ? "translate-x-0" : "translate-x-full"}`}>
                        <div className='flex items-center justify-between px-5 py-3 border-b border-ink/20'>
                            <h2 className='text-lg font-bold text-sand-1'>
                                Settings
                            </h2>
                            <button
                                onClick={() => setDrawerOpen(false)}
                                className='text-sand-1/70 hover:text-sand-1 transition-colors'>
                                <svg
                                    className='w-5 h-5'
                                    fill='none'
                                    stroke='currentColor'
                                    viewBox='0 0 24 24'>
                                    <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        strokeWidth={2}
                                        d='M6 18L18 6M6 6l12 12'
                                    />
                                </svg>
                            </button>
                        </div>

                        <div className='flex-1 flex flex-col gap-6 px-5'>
                            <SubmitFeedback className='text-sand-1' />

                            {/* Preferences */}
                            <div className='flex flex-col gap-4'>
                                <h3 className='text-xs font-bold text-sand-1/70 uppercase tracking-wider'>
                                    Preferences
                                </h3>

                                {/* Handedness */}
                                <div className='flex flex-col gap-1.5'>
                                    <p className='text-[10px] font-bold text-sand-1/50 uppercase tracking-widest'>
                                        Handedness
                                    </p>
                                    <div className='flex rounded-xl overflow-hidden border border-sand-1/20'>
                                        {(
                                            [
                                                ["right", "Right-handed"],
                                                ["left", "Left-handed"],
                                            ] as const
                                        ).map(([val, label]) => (
                                            <button
                                                key={val}
                                                onClick={() =>
                                                    setHandedness(val)
                                                }
                                                className={`flex-1 py-2.5 text-sm font-medium transition-colors first:border-r first:border-sand-1/20 ${
                                                    handedness === val
                                                        ? "bg-sand-1 text-sand-4 font-semibold"
                                                        : "text-sand-1/60 hover:text-sand-1/80"
                                                }`}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Default tuning */}
                                <div className='flex flex-col gap-1.5'>
                                    <p className='text-[10px] font-bold text-sand-1/50 uppercase tracking-widest'>
                                        Default Tuning
                                    </p>
                                    <div className='flex flex-wrap gap-1.5'>
                                        {TUNINGS.map(t => (
                                            <button
                                                key={t.name}
                                                onClick={() =>
                                                    setTuningName(t.name)
                                                }
                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                                    tuningName === t.name
                                                        ? "bg-sand-1 text-sand-4 border-sand-1"
                                                        : "text-sand-1/70 border-sand-1/20 hover:border-sand-1/60 hover:text-sand-1"
                                                }`}>
                                                {t.name}
                                            </button>
                                        ))}
                                    </div>
                                    {tuningName !== "Standard" && (
                                        <p className='text-[10px] text-sand-1/40 font-mono'>
                                            {[
                                                ...(TUNINGS.find(
                                                    t => t.name === tuningName,
                                                )?.notes ?? []),
                                            ]
                                                .reverse()
                                                .join(" · ")}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className='flex flex-col gap-2'>
                                <h3 className='text-xs font-bold text-sand-1/70 uppercase tracking-wider'>
                                    Email
                                </h3>
                                <div className='flex items-end gap-2'>
                                    <div className='flex-1'>
                                        <FormFields
                                            autoComplete='email'
                                            label='Change email'
                                            onBlur={() => {
                                                const trimmed = email.trim();
                                                if (
                                                    !trimmed ||
                                                    !emailRegex.test(trimmed)
                                                )
                                                    setEmail(user?.email ?? "");
                                            }}
                                            onChange={e => {
                                                setEmail(e.target.value);
                                                setUpdateEmailAlert(null);
                                            }}
                                            type='email'
                                            value={email}
                                        />
                                    </div>
                                    <button
                                        disabled={
                                            updateEmailLoading ||
                                            email === user?.email
                                        }
                                        onClick={handleUpdateEmail}
                                        className={`px-3 py-1.5 rounded-full bg-sand-1 text-sand-4 text-xs font-semibold transition-all shrink-0 ${
                                            email === user?.email
                                                ? "opacity-0 pointer-events-none"
                                                : "opacity-100 hover:opacity-90"
                                        } disabled:opacity-50`}>
                                        {updateEmailLoading ? "…" : "Save"}
                                    </button>
                                </div>
                                {updateEmailAlert && (
                                    <p
                                        className={alertClass(
                                            updateEmailAlert.ok,
                                        )}>
                                        {updateEmailAlert.msg}
                                    </p>
                                )}
                            </div>

                            {hasPro && (
                                <a
                                    href='https://billing.stripe.com/p/login/fZu3cu1XQeGWcxs1lhgUM00'
                                    target='_blank'
                                    rel='noreferrer'
                                    className='flex items-center gap-2 px-4 py-2.5 rounded-full bg-sand-1 text-sand-4 text-sm font-semibold hover:opacity-90 transition-opacity w-fit'>
                                    <svg
                                        className='w-4 h-4'
                                        fill='none'
                                        stroke='currentColor'
                                        viewBox='0 0 24 24'>
                                        <path
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                            strokeWidth={2}
                                            d='M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
                                        />
                                    </svg>
                                    Manage Subscription
                                </a>
                            )}
                        </div>

                        <div className='px-5 py-4 border-t border-ink/20 flex items-center justify-between'>
                            <button
                                disabled={signoutLoading}
                                onClick={handleDrawerSignout}
                                className='flex items-center gap-2 px-4 py-2 rounded-full bg-sand-1 text-sand-4 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all'>
                                <svg
                                    className='w-4 h-4'
                                    fill='none'
                                    stroke='currentColor'
                                    viewBox='0 0 24 24'>
                                    <path
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        strokeWidth={2}
                                        d='M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'
                                    />
                                </svg>
                                {signoutLoading ? "Signing out…" : "Sign out"}
                            </button>
                            <button
                                onClick={() => setDeleteOpen(true)}
                                className='text-xs text-red-600/70 hover:text-red-700 font-semibold transition-colors underline underline-offset-2'>
                                Delete account
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* ── Paywall Modal ─────────────────────────────────── */}
            {paywallOpen && (
                <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4'>
                    <div className='w-full max-w-sm bg-sand-4 rounded-3xl shadow-2xl overflow-hidden'>
                        <div className='px-6 pt-7 pb-5 flex flex-col items-center gap-2 border-b border-sand-1/10'>
                            <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-olive/20 border border-olive/40 text-olive text-xs font-bold tracking-wide uppercase'>
                                <svg
                                    className='w-3 h-3'
                                    viewBox='0 0 24 24'
                                    fill='currentColor'>
                                    <path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
                                </svg>
                                Pro
                            </span>
                            <h2 className='text-2xl font-bold text-sand-1 text-center leading-tight'>
                                Unlock your full
                                <br />
                                fretboard
                            </h2>
                            <p className='text-sm text-sand-1/60 text-center'>
                                For the curious and the committed
                            </p>
                        </div>

                        <ul className='px-6 py-4 flex flex-col gap-2.5'>
                            {[
                                "Alternate chord voicings & shapes",
                                "All scale patterns & variants",
                                "Draw Mode — build custom chord shapes",
                                "Save & manage chord progressions",
                            ].map(f => (
                                <li
                                    key={f}
                                    className='flex items-center gap-3'>
                                    <span className='shrink-0 w-5 h-5 rounded-full bg-olive/20 border border-olive/40 flex items-center justify-center'>
                                        <svg
                                            className='w-3 h-3 text-olive'
                                            viewBox='0 0 24 24'
                                            fill='none'
                                            stroke='currentColor'
                                            strokeWidth={3}>
                                            <path
                                                strokeLinecap='round'
                                                strokeLinejoin='round'
                                                d='M5 13l4 4L19 7'
                                            />
                                        </svg>
                                    </span>
                                    <span className='text-sm text-sand-1/80 font-medium'>
                                        {f}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <div className='px-6 pb-4 flex flex-col gap-3'>
                            <div className='flex'>
                                <div className='flex-1' />
                                <div className='flex-1 flex justify-center'>
                                    <span className='px-2 py-0.5 rounded-full bg-olive text-sand-1 text-[10px] font-bold leading-tight whitespace-nowrap'>
                                        SAVE 50%
                                    </span>
                                </div>
                            </div>
                            <div className='flex rounded-xl overflow-hidden border border-sand-1/20 bg-sand-1/5'>
                                <button
                                    onClick={() => setPlan("monthly")}
                                    className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-lg font-semibold transition-colors rounded-l-xl ${plan === "monthly" ? "bg-sand-1 text-sand-4" : "text-sand-1/50 hover:text-sand-1/80"}`}>
                                    {prices.monthly && (
                                        <span>{prices.monthly}</span>
                                    )}
                                    <span
                                        className={`text-xs font-medium ${plan === "monthly" ? "text-sand-4/60" : "text-sand-1/30"}`}>
                                        Monthly
                                    </span>
                                </button>
                                <button
                                    onClick={() => setPlan("yearly")}
                                    className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-lg font-semibold transition-colors rounded-r-xl ${plan === "yearly" ? "bg-sand-1 text-sand-4" : "text-sand-1/50 hover:text-sand-1/80"}`}>
                                    {prices.yearly && (
                                        <span>{prices.yearly}</span>
                                    )}
                                    <span
                                        className={`text-xs font-medium ${plan === "yearly" ? "text-sand-4/60" : "text-sand-1/30"}`}>
                                        Yearly
                                    </span>
                                </button>
                            </div>

                            {paywallAlert && (
                                <p className='rounded-lg px-3 py-2 text-xs font-semibold bg-red-900/40 text-red-300 border border-red-600/30'>
                                    {paywallAlert}
                                </p>
                            )}

                            <button
                                disabled={paywallLoading}
                                onClick={
                                    user
                                        ? handleSubscribe
                                        : () => {
                                              setPaywallOpen(false);
                                              router.push(
                                                  "/signin?redirect=paywall",
                                              );
                                          }
                                }
                                className='w-full py-3.5 rounded-full bg-sand-1 text-sand-4 text-sm font-bold tracking-wide hover:opacity-90 disabled:opacity-40 transition-all active:scale-95'>
                                {!user
                                    ? "Sign in to continue"
                                    : paywallLoading
                                      ? "Loading…"
                                      : plan === "yearly"
                                        ? "Start yearly plan"
                                        : "Start monthly plan"}
                            </button>

                            <button
                                onClick={() => setPaywallOpen(false)}
                                className='w-full text-center text-xs text-sand-1/40 hover:text-sand-1/70 transition-colors py-1'>
                                Maybe later
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Account Confirmation ───────────────────── */}
            {deleteOpen && (
                <div className='fixed inset-0 z-60 flex items-center justify-center bg-black/60 px-4'>
                    <div className='w-full max-w-sm bg-sand-4 rounded-2xl shadow-2xl overflow-hidden'>
                        <div className='px-6 py-5 border-b border-red-600/30'>
                            <h2 className='text-lg font-bold text-sand-1 text-center'>
                                Delete Account
                            </h2>
                            <p className='text-sm text-sand-1/70 text-center mt-1'>
                                This cannot be undone.
                            </p>
                        </div>
                        <div className='px-6 py-4 flex flex-col gap-3'>
                            {deleteAlert && (
                                <p className={alertClass(deleteAlert.ok)}>
                                    {deleteAlert.msg}
                                </p>
                            )}
                            <label className='text-xs text-sand-1/60 text-center'>
                                Type{" "}
                                <span className='font-bold tracking-widest text-sand-1/80'>
                                    DELETE
                                </span>{" "}
                                to confirm
                            </label>
                            <input
                                value={deleteConfirmText}
                                onChange={e =>
                                    setDeleteConfirmText(e.target.value)
                                }
                                placeholder='DELETE'
                                className='w-full bg-sand-1/10 border border-sand-1/30 rounded-lg px-3 py-2 text-sm text-sand-1 placeholder-sand-1/20 outline-none focus:border-red-500 text-center font-bold tracking-widest transition-colors'
                            />
                        </div>
                        <div className='flex gap-3 px-6 pb-5'>
                            <button
                                onClick={() => {
                                    setDeleteOpen(false);
                                    setDeleteAlert(null);
                                    setDeleteConfirmText("");
                                }}
                                className='flex-1 py-2.5 rounded-full bg-sand-2 text-ink text-sm font-semibold hover:bg-sand-3 transition-colors'>
                                Cancel
                            </button>
                            <button
                                disabled={
                                    deleteLoading ||
                                    deleteConfirmText !== "DELETE"
                                }
                                onClick={handleDeleteAccount}
                                className='flex-1 py-2.5 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-all'>
                                {deleteLoading ? "Deleting…" : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
