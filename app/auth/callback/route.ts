import { NextResponse } from 'next/server';
import { createServClient } from '@/lib/supabaseServerClient';
import { claimPendingSubscription } from '@/lib/claimSubscription';

export const runtime = 'nodejs';

// GET: handles email confirmation/magic-link redirect from Supabase
export async function GET(req: Request) {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const next = url.searchParams.get('next');

    if (code) {
        const supabase = await createServClient();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        // Cross-device PKCE mismatch is expected — continue regardless
        if (error) {
            console.error('Code exchange failed:', error.message);
        } else {
            // Signing in by email link: pick up a subscription bought
            // before this account existed (see lib/claimSubscription.ts).
            const u = data.user;
            if (u?.email) {
                await claimPendingSubscription(u.id, u.email).catch(e =>
                    console.error('Claim subscription failed:', e),
                );
            }
        }
        if (!error && next) {
            // Same-device confirmation actually has a session now, so send
            // them straight to whatever they were doing instead of the
            // generic "you're confirmed" page.
            return NextResponse.redirect(new URL(next, url.origin));
        }
    }

    const confirmedUrl = new URL('/auth/confirmed', url.origin);
    if (next) confirmedUrl.searchParams.set('next', next);
    return NextResponse.redirect(confirmedUrl);
}

// POST: session sync called by SupabaseProvider on auth state changes
export async function POST(req: Request) {
    const supabase = await createServClient();
    const { event, session } = await req.json();

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await supabase.auth.setSession(session);
    } else if (event === 'SIGNED_OUT') {
        await supabase.auth.signOut();
    }

    return NextResponse.json({ ok: true });
}
