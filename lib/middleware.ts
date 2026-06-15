import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(req: NextRequest) {
    const supabaseResponse = NextResponse.next({
        request: { headers: req.headers },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return req.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, {
                            ...options,
                            // Ensure auth cookies survive browser close — without
                            // maxAge they become session cookies Safari deletes on exit.
                            maxAge: options?.maxAge ?? 60 * 60 * 24 * 365,
                        }),
                    );
                },
            },
        },
    );

    // Refresh auth token
    await supabase.auth.getUser();

    return supabaseResponse;
}
