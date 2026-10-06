// Pro checkout against the website's Stripe routes: /api/prices for the
// display prices and /api/checkout for a hosted Stripe Checkout session (the
// same one the website redirects to), opened in the in-app browser. Pro
// status itself still arrives through the Supabase subscriptions row (see
// hooks/useSubscription), which the Stripe webhook updates.
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

export type Plan = 'monthly' | 'yearly';
export type Prices = { monthly: string | null; yearly: string | null };
export type CheckoutOutcome = 'success' | 'cancel';

// /api/app-return redirects here after Stripe's success/cancel, which is
// what closes the in-app browser (scheme is set in app.json). Needs a
// development/production build -- Expo Go doesn't own this scheme.
const CHECKOUT_RETURN_URL = 'shapeshifter://checkout';

function apiUrl(path: string) {
    const base = process.env.EXPO_PUBLIC_SITE_URL;
    if (!base) throw new Error('EXPO_PUBLIC_SITE_URL is not set');
    return `${base.replace(/\/+$/, '')}${path}`;
}

/**
 * Attaches a subscription bought at checkout without an account to the
 * signed-in user (matched by email, server-side). Idempotent; Pro then
 * arrives through the usual subscriptions Realtime row.
 */
export async function claimSubscription(): Promise<void> {
    const { data } = await supabase.auth.getSession();
    if (!data.session || !process.env.EXPO_PUBLIC_SITE_URL) return;
    await fetch(apiUrl('/api/claim-subscription'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
}

export async function fetchPrices(): Promise<Prices> {
    const res = await fetch(apiUrl('/api/prices'));
    const d = await res.json();
    return { monthly: d.monthly ?? null, yearly: d.yearly ?? null };
}

/**
 * Opens Stripe Checkout; resolves once the browser returns to the app.
 * Works signed out too: with no session the server starts an anonymous
 * checkout, the purchase is tied to the email entered at Stripe, and it's
 * claimed by claimSubscription() when they later sign in with that email
 * (the same pattern as The Hair Insider's pending entitlements).
 */
export async function startCheckout(plan: Plan, email?: string | null): Promise<CheckoutOutcome> {
    const { data } = await supabase.auth.getSession();

    const res = await fetch(apiUrl('/api/checkout'), {
        method: 'POST',
        headers: {
            ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, plan, source: 'app' }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Checkout request failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const { url } = await res.json();
    if (!url) throw new Error('Checkout response had no url.');

    const result = await WebBrowser.openAuthSessionAsync(url, CHECKOUT_RETURN_URL);
    return result.type === 'success' && result.url.includes('status=success') ? 'success' : 'cancel';
}
