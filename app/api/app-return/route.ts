// Stripe Checkout's success/cancel landing for the mobile app: bounces the
// in-app browser back into the app via its custom URL scheme (see "scheme"
// in mobile/app.json), which closes the browser session.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const status =
        new URL(req.url).searchParams.get('status') === 'success'
            ? 'success'
            : 'cancel';
    return new Response(null, {
        status: 302,
        headers: { Location: `shapeshifter://checkout?status=${status}` },
    });
}
