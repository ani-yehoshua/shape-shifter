import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getStripe() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    return new Stripe(key, { apiVersion: '2025-06-30.basil' as any });
}

function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Supabase admin envs not set');
    return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function toRow(sub: Stripe.Subscription, userId: string | null) {
    const firstItem = sub.items?.data?.[0] ?? null;
    const priceId = firstItem?.price?.id ?? null;
    return {
        user_id: userId ?? null,
        stripe_cust_id: (sub.customer as string) ?? null,
        stripe_sub_id: sub.id ?? null,
        tier: priceId,
        status: sub.status,
        current_period_end: firstItem
            ? new Date(
                  (firstItem as any).current_period_end * 1000,
              ).toISOString()
            : null,
        updated_at: new Date().toISOString(),
    };
}

export async function POST(req: Request) {
    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    const sig = req.headers.get('stripe-signature');
    const raw = Buffer.from(await req.arrayBuffer());

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(
            raw,
            sig!,
            process.env.STRIPE_WEBHOOK_SECRET!,
        );
    } catch (err: any) {
        console.error('Signature verify failed:', err.message);
        return new NextResponse(`Webhook Error: ${err.message}`, {
            status: 400,
        });
    }

    console.log('Stripe event:', event.type, event.id);

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const s = event.data.object as Stripe.Checkout.Session;
                if (!s.subscription) break;
                const sub = await stripe.subscriptions.retrieve(
                    s.subscription as string,
                );
                const userId =
                    s.metadata?.supabase_user_id ||
                    s.client_reference_id ||
                    null;
                const row = toRow(sub, userId);
                if (!row.user_id) {
                    // Bought without an account (mobile paywall): hold it
                    // against the checkout email until they sign in with
                    // that email -- see /api/claim-subscription.
                    const email = (
                        s.customer_details?.email ??
                        s.customer_email ??
                        ''
                    ).toLowerCase();
                    if (!email || !row.stripe_sub_id) {
                        console.warn('No user_id or email → skipping');
                        break;
                    }
                    const { user_id: _omit, ...pending } = row;
                    const { error } = await supabaseAdmin
                        .from('pending_subscriptions')
                        .upsert(
                            { ...pending, email },
                            { onConflict: 'stripe_sub_id' },
                        );
                    if (error) console.error('DB error (pending):', error);
                    break;
                }
                const { error } = await supabaseAdmin
                    .from('subscriptions')
                    .upsert(row, { onConflict: 'user_id' });
                if (error) console.error('DB error (checkout):', error);
                break;
            }

            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                // Use `let` so we can reassign when fetching a fresher object
                let sub = event.data.object as Stripe.Subscription;

                if (!(sub as any).current_period_end) {
                    try {
                        const fresh = await stripe.subscriptions.retrieve(
                            sub.id,
                        );
                        if (fresh) sub = fresh;
                    } catch (e: any) {
                        console.warn('Retrieve fallback failed:', e.message);
                    }
                }

                let userId: string | null =
                    sub.metadata?.supabase_user_id ?? null;
                if (!userId && sub.customer) {
                    const { data: existing, error } = await supabaseAdmin
                        .from('subscriptions')
                        .select('user_id')
                        .eq('stripe_cust_id', sub.customer as string)
                        .maybeSingle();
                    if (error)
                        console.error('Lookup by customer error:', error);
                    userId = existing?.user_id ?? null;
                }

                const row = toRow(sub, userId);
                if (!row.user_id) {
                    // Possibly an unclaimed anonymous purchase: keep its
                    // pending row current. (No-op if checkout.session.
                    // completed hasn't stored one yet -- that handler
                    // fetches the fresh subscription itself.)
                    const { user_id: _omit, ...pending } = row;
                    const { error } = await supabaseAdmin
                        .from('pending_subscriptions')
                        .update(pending)
                        .eq('stripe_sub_id', sub.id);
                    if (error) console.error('DB error (pending update):', error);
                    break;
                }
                const { error } = await supabaseAdmin
                    .from('subscriptions')
                    .upsert(row, { onConflict: 'user_id' });
                if (error) console.error('DB error (sub.*):', error);
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object as Stripe.Subscription;
                const { error } = await supabaseAdmin
                    .from('subscriptions')
                    .update({
                        status: sub.status,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('stripe_sub_id', sub.id);
                if (error) console.error('DB error (deleted):', error);
                const { error: pendingErr } = await supabaseAdmin
                    .from('pending_subscriptions')
                    .update({
                        status: sub.status,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('stripe_sub_id', sub.id);
                if (pendingErr)
                    console.error('DB error (pending deleted):', pendingErr);
                break;
            }

            default:
                console.log('Ignoring event:', event.type);
        }
    } catch (err) {
        console.error('Webhook handler crash:', err);
        return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ received: true }, { status: 200 });
}
