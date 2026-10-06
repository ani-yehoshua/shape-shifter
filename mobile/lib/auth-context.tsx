import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { claimSubscription } from './billing';
import { supabase } from './supabase';

type AuthContextValue = {
    session: Session | null;
    loading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setLoading(false);
        });
        const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
            setSession(newSession);
            // Pick up a subscription bought before this account existed
            // (see lib/billing.ts). Fire-and-forget; no-op when nothing's
            // pending. Deferred a tick because supabase-js can deadlock if
            // an auth method is called from inside this callback.
            if (newSession && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
                setTimeout(() => claimSubscription().catch(() => {}), 0);
            }
        });
        return () => sub.subscription.unsubscribe();
    }, []);

    const value = useMemo(() => ({ session, loading }), [session, loading]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used inside an AuthProvider');
    }
    return ctx;
}
