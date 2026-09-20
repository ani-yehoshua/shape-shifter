// Port of ../../lib/hooks/useSubscription.ts on the website, adapted to use
// this app's shared supabase client (../supabase) instead of creating its
// own via @supabase/ssr's createBrowserClient -- that package is Next.js/
// cookie-based and doesn't apply here; the RN client from ../supabase
// already persists the session via AsyncStorage.
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

export function useSubscription(): boolean {
    const [hasPro, setHasPro] = React.useState(false);

    React.useEffect(() => {
        let channel: ReturnType<typeof supabase.channel> | null = null;
        let authSub: { unsubscribe: () => void } | null = null;

        async function wire(uid: string) {
            if (channel) {
                supabase.removeChannel(channel);
                channel = null;
            }
            const { data } = await supabase
                .from('subscriptions')
                .select('status,current_period_end')
                .eq('user_id', uid)
                .maybeSingle();
            setHasPro(isPro(data));
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
                    (payload: {
                        new: Record<string, unknown>;
                        old: Record<string, unknown>;
                    }) => {
                        setHasPro(isPro(payload.new || payload.old || null));
                    },
                )
                .subscribe();
        }

        // onAuthStateChange fires INITIAL_SESSION immediately with the current
        // user, so we don't need a separate getSession() call -- that caused
        // wire() to be called twice concurrently for the same uid, producing
        // the "cannot add postgres_changes callbacks after subscribe()" error.
        authSub = supabase.auth.onAuthStateChange((_evt, newSession) => {
            const newUid = newSession?.user?.id;
            if (!newUid) {
                setHasPro(false);
                if (channel) supabase.removeChannel(channel);
                return;
            }
            wire(newUid);
        }).data.subscription;

        return () => {
            if (channel) supabase.removeChannel(channel);
            authSub?.unsubscribe();
        };
    }, []);

    return hasPro;
}
