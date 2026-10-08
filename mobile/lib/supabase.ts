import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Same Supabase project the website (../lib/supabaseBrowserClient.ts) talks
// to -- this app is a new client against the same backend, not a separate
// one.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY -- copy .env.example to .env and fill in the values.',
    );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        // React Native has no browser localStorage or cookie jar, so the
        // session has to be persisted explicitly.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // No URL bar here to parse a session out of -- auth completes via
        // the OTP code flow, not a redirect.
        detectSessionInUrl: false,
    },
});

// supabase-js renews the access token on a timer, and React Native pauses
// timers while the app is in the background. Stop the refresher with the app
// and restart it (which also renews an already-expired token straight away)
// when the app comes back -- the pattern Supabase documents for React Native.
AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
});
