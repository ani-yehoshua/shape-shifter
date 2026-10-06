// Called by the mobile app and the website's sign-in page right after
// sign-in with a Bearer access token; see lib/claimSubscription.ts.
import { NextResponse } from 'next/server';
import {
    claimPendingSubscription,
    getSupabaseAdmin,
} from '@/lib/claimSubscription';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization') || '';
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : null;
        if (!token) {
            return NextResponse.json(
                { error: 'Not authenticated' },
                { status: 401 },
            );
        }

        const { data, error } = await getSupabaseAdmin().auth.getUser(token);
        const user = data?.user;
        if (error || !user?.email) {
            return NextResponse.json(
                { error: 'Invalid session' },
                { status: 401 },
            );
        }

        const claimed = await claimPendingSubscription(user.id, user.email);
        return NextResponse.json({ claimed });
    } catch (err: any) {
        console.error('Claim subscription error:', err);
        return NextResponse.json(
            { error: 'Failed to claim subscription', details: err.message },
            { status: 500 },
        );
    }
}
