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
        const { email, plan } = await req.json();
        const priceId = PRICE_MAP[plan];

        if (!priceId) {
            return NextResponse.json(
                { error: 'Invalid price' },
                { status: 400 },
            );
        }

        const supabase = await createServClient();
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser();
        if (error || !user) {
            return NextResponse.json(
                { error: 'Not signed in' },
                { status: 401 },
            );
        }

        let stripeCustomerId: string | null = null;
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

        const siteUrl =
            process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            customer: stripeCustomerId,
            subscription_data: {
                metadata: { supabase_user_id: user.id },
            },
            client_reference_id: user.id,
            success_url: `${siteUrl}/?subscribed=true`,
            cancel_url: `${siteUrl}/`,
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
