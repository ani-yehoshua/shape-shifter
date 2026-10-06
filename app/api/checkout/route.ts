import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServClient } from '@/lib/supabaseServerClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    return new Stripe(key, { apiVersion: '2025-06-30.basil' as any });
}

const PRICE_MAP: Record<string, string | undefined> = {
    monthly: process.env.MONTHLY_PRICE_ID,
    yearly: process.env.YEARLY_PRICE_ID,
};

export async function POST(req: Request) {
    const stripe = getStripe();
    try {
        const { email, plan, source } = await req.json();
        const priceId = PRICE_MAP[plan];

        if (!priceId) {
            return NextResponse.json(
                { error: 'Invalid price' },
                { status: 400 },
            );
        }

        const supabase = await createServClient();
        // The mobile app authenticates with a Bearer access token (no
        // cookies); the website uses the cookie session.
        const authHeader = req.headers.get('authorization');
        const {
            data: { user },
            error,
        } = authHeader?.startsWith('Bearer ')
            ? await supabase.auth.getUser(authHeader.slice(7))
            : await supabase.auth.getUser();
        // The mobile app lets people buy Pro before they have an account
        // (source === 'app'): Checkout collects their email, the webhook
        // stores the subscription as pending against it, and it's claimed
        // when they sign in with that email. The website still requires a
        // signed-in user.
        const anonymous = (error || !user) && source === 'app';
        if ((error || !user) && !anonymous) {
            return NextResponse.json(
                { error: 'Not signed in' },
                { status: 401 },
            );
        }

        let stripeCustomerId: string | null = null;
        if (user) {
            const { data: existing } = await supabase
                .from('subscriptions')
                .select('stripe_cust_id')
                .eq('user_id', user.id)
                .not('stripe_cust_id', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            stripeCustomerId = existing?.stripe_cust_id ?? null;

            if (!stripeCustomerId) {
                const customer = await stripe.customers.create({
                    email: email || user.email || undefined,
                    metadata: { supabase_user_id: user.id },
                });
                stripeCustomerId = customer.id;
                await supabase
                    .from('subscriptions')
                    .upsert(
                        { user_id: user.id, stripe_cust_id: stripeCustomerId },
                        { onConflict: 'user_id' },
                    );
            }
        }

        const siteUrl =
            process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            ...(user
                ? {
                      customer: stripeCustomerId ?? undefined,
                      subscription_data: {
                          metadata: { supabase_user_id: user.id },
                      },
                      client_reference_id: user.id,
                  }
                : {}),
            // The app's in-app browser session closes when it sees the
            // shapeshifter:// redirect that /api/app-return issues.
            success_url:
                source === 'app'
                    ? `${siteUrl}/api/app-return?status=success`
                    : `${siteUrl}/?subscribed=true`,
            cancel_url:
                source === 'app'
                    ? `${siteUrl}/api/app-return?status=cancel`
                    : `${siteUrl}/`,
        });

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error('Stripe Checkout Error:', err);
        return NextResponse.json(
            { error: 'Stripe session creation failed' },
            { status: 500 },
        );
    }
}
