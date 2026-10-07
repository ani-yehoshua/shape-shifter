"use client";

// First-visit tour: a short stepped card (icon, title, body, dots,
// Back/Next, Skip). Same five steps as the mobile app's tour
// (mobile/components/AppTour.tsx), which was modeled on the GymPlanner
// app's. Shown once per browser (localStorage flag) on the home page, and
// replayable from the Settings drawer via replayTour().
import * as React from "react";
import { usePathname } from "next/navigation";

const TOUR_DONE_KEY = "shapeshifter:tourDone";
const REPLAY_EVENT = "shapeshifter:replay-tour";

/** Reopen the tour from anywhere (used by the Settings drawer). */
export function replayTour() {
    try {
        localStorage.removeItem(TOUR_DONE_KEY);
    } catch {
        // ignore storage failures
    }
    window.dispatchEvent(new Event(REPLAY_EVENT));
}

type Step = { icon: string; title: string; body: string };

const STEPS: Step[] = [
    {
        icon: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3",
        title: "Chords & Scales",
        body: "Pick a root note, then browse chord voicings or scale patterns across the fretboard. Use the menu to switch between Chords, Scales and Scale Chords and narrow things down.",
    },
    {
        icon: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
        title: "Make it yours",
        body: "Tap a note or strum the whole shape to hear it. Switch between note names and intervals, move the capo, and set your handedness and tuning in Settings.",
    },
    {
        icon: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
        title: "Randomize",
        body: "Not sure what to play? Randomize picks a chord or scale for you. Tune what it can choose from, then hit Random again for another.",
    },
    {
        icon: "M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z",
        title: "Save & build progressions",
        body: "Sign in (free) to bookmark chords you like and find them again under My Chords. Line chords up in the progression builder to hear them one after another.",
    },
    {
        icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
        title: "Pro & Draw Mode",
        body: "Pro unlocks alternate voicings, extra scale patterns, and Draw Mode, where you place notes on the fretboard yourself and we name the chord. Settings has your account, and you can replay this tour there any time.",
    },
];

export default function AppTour() {
    const pathname = usePathname();
    const [open, setOpen] = React.useState(false);
    const [i, setI] = React.useState(0);

    React.useEffect(() => {
        const start = () => {
            setI(0);
            setOpen(true);
        };
        // Auto-start only on the home page, and not on top of the paywall /
        // "Welcome to Pro" screens (they use these query params); those
        // visits leave the tour for next time.
        const busy = /[?&](paywall|subscribed)=/.test(window.location.search);
        if (pathname === "/" && !busy) {
            try {
                if (localStorage.getItem(TOUR_DONE_KEY) !== "1") start();
            } catch {
                // ignore storage failures
            }
        }
        window.addEventListener(REPLAY_EVENT, start);
        return () => window.removeEventListener(REPLAY_EVENT, start);
    }, [pathname]);

    React.useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    const finish = () => {
        try {
            localStorage.setItem(TOUR_DONE_KEY, "1");
        } catch {
            // ignore storage failures
        }
        setOpen(false);
    };

    if (!open) return null;

    const step = STEPS[i];
    const last = i === STEPS.length - 1;

    return (
        <div
            className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4'
            onClick={finish}>
            <div
                className='w-full max-w-sm bg-sand-4 rounded-2xl shadow-2xl p-5'
                onClick={e => e.stopPropagation()}>
                <div className='flex items-start justify-between'>
                    <div className='rounded-xl bg-sand-1/10 p-2.5 text-sand-1'>
                        <svg
                            className='w-6 h-6'
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'>
                            <path
                                strokeLinecap='round'
                                strokeLinejoin='round'
                                strokeWidth={2}
                                d={step.icon}
                            />
                        </svg>
                    </div>
                    <button
                        onClick={finish}
                        className='text-xs text-sand-1/50 hover:text-sand-1 transition-colors'>
                        Skip
                    </button>
                </div>

                <h2 className='mt-3 text-base font-semibold text-sand-1'>
                    {step.title}
                </h2>
                <p className='mt-1 text-sm leading-relaxed text-sand-1/70'>
                    {step.body}
                </p>

                <div className='mt-5 flex items-center justify-between'>
                    <div className='flex items-center gap-1.5'>
                        {STEPS.map((s, n) => (
                            <span
                                key={s.title}
                                className={`h-1.5 rounded-full transition-all ${n === i ? "w-4 bg-sand-1" : "w-1.5 bg-sand-1/20"}`}
                            />
                        ))}
                    </div>
                    <div className='flex gap-2'>
                        {i > 0 && (
                            <button
                                onClick={() => setI(i - 1)}
                                className='rounded-lg border border-sand-1/20 px-3 py-1.5 text-sm font-medium text-sand-1 hover:bg-sand-1/10 transition-colors'>
                                Back
                            </button>
                        )}
                        <button
                            onClick={() => (last ? finish() : setI(i + 1))}
                            className='rounded-lg bg-sand-1 px-3 py-1.5 text-sm font-semibold text-sand-4 hover:opacity-90 transition-opacity'>
                            {last ? "Got it" : "Next"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
