import * as React from 'react';
import { createBrowserClient } from '@supabase/ssr';

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
    const supabase = React.useMemo(
        () =>
            createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            ),
        [],
    );
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

        (async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            const uid = session?.user?.id;
            if (uid) await wire(uid);
            authSub = supabase.auth.onAuthStateChange((_evt, newSession) => {
                const newUid = newSession?.user?.id;
                if (!newUid) {
                    setHasPro(false);
                    if (channel) supabase.removeChannel(channel);
                    return;
                }
                if (channel) supabase.removeChannel(channel);
                wire(newUid);
            }).data.subscription;
        })();

        return () => {
            if (channel) supabase.removeChannel(channel);
            authSub?.unsubscribe();
        };
    }, [supabase]);

    return hasPro;
}
