// Port of ../../lib/hooks/useSubscription.ts on the website, adapted to use
// this app's shared supabase client (../supabase) instead of creating its
// own via @supabase/ssr's createBrowserClient -- that package is Next.js/
// cookie-based and doesn't apply here; the RN client from ../supabase
// already persists the session via AsyncStorage.
//
// Unlike the website's version, this wires the Supabase auth listener and
// Realtime channel exactly once at module scope instead of per-hook-call.
// This hook is called from several components at once here (the Chords
// screen, AccountButton, ProgressionPanel), and each one wiring its own
// channel named `subs-${uid}` -- the same topic, since it's the same
// signed-in user -- caused two or three simultaneous subscriptions to the
// identical Realtime topic, which throws "cannot add postgres_changes
// callbacks for realtime:subs-<uid> after subscribe()". Making the
// subscription a shared singleton that every hook instance just listens to
// (via a small pub/sub) fixes that regardless of how many components use
// the hook at once, and also guards against onAuthStateChange re-firing
// for a uid that's already wired (token refreshes, etc.), which was the
// other way to trigger the same conflict.
import * as React from 'react';
import { supabase } from '../supabase';

function isPro(sub: unknown): boolean {
    if (!sub || typeof sub !== 'object') return false;
    const s = sub as { status?: string; current_period_end?: string };
    const active = new Set(['active', 'trialing', 'past_due']);
    return (
        active.has(s.status ?? '') &&
        new Date(s.current_period_end ?? '') > new Date()
    );
}

// `loaded` is false until the first subscriptions lookup for the current
// auth state has finished, so callers can tell "not Pro" from "don't know
// yet" (e.g. to avoid flashing the paywall at a Pro user while it loads).
type Status = { hasPro: boolean; loaded: boolean };
const INITIAL_STATUS: Status = { hasPro: false, loaded: false };

let status: Status = INITIAL_STATUS;
let currentUid: string | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
let authSub: { unsubscribe: () => void } | null = null;
let listenerCount = 0;
const listeners = new Set<(s: Status) => void>();

function setStatus(s: Status) {
    status = s;
    listeners.forEach((fn) => fn(s));
}

function notify(v: boolean) {
    setStatus({ hasPro: v, loaded: true });
}

async function wire(uid: string) {
    // New signed-in user: their status is unknown until the select below.
    setStatus(INITIAL_STATUS);
    if (channel) {
        supabase.removeChannel(channel);
        channel = null;
    }
    const { data } = await supabase
        .from('subscriptions')
        .select('status,current_period_end')
        .eq('user_id', uid)
        .maybeSingle();
    notify(isPro(data));
    channel = supabase
        .channel(`subs-${uid}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'subscriptions',
                filter: `user_id=eq.${uid}`,
            },
            (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
                notify(isPro(payload.new || payload.old || null));
            },
        )
        .subscribe();
}

function ensureWired() {
    if (authSub) return;
    // onAuthStateChange fires INITIAL_SESSION immediately with the current
    // user, so no separate getSession() call is needed. It also refires
    // for events like TOKEN_REFRESHED with the same uid -- the `newUid ===
    // currentUid && channel` guard skips re-wiring (and re-subscribing to
    // the same Realtime topic) when nothing about the signed-in user
    // actually changed.
    authSub = supabase.auth.onAuthStateChange((_evt, newSession) => {
        const newUid = newSession?.user?.id ?? null;
        if (newUid === currentUid && channel) return;
        currentUid = newUid;
        if (!newUid) {
            if (channel) {
                supabase.removeChannel(channel);
                channel = null;
            }
            notify(false);
            return;
        }
        wire(newUid);
    }).data.subscription;
}

function teardown() {
    if (channel) {
        supabase.removeChannel(channel);
        channel = null;
    }
    authSub?.unsubscribe();
    authSub = null;
    currentUid = null;
    status = INITIAL_STATUS;
}

export function useSubscriptionStatus(): Status {
    const [s, setS] = React.useState(status);

    React.useEffect(() => {
        listenerCount += 1;
        listeners.add(setS);
        ensureWired();
        return () => {
            listeners.delete(setS);
            listenerCount -= 1;
            if (listenerCount === 0) teardown();
        };
    }, []);

    return s;
}

export function useSubscription(): boolean {
    return useSubscriptionStatus().hasPro;
}
