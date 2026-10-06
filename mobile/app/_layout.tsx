import { useCallback, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Redirect, Slot, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
} from '@expo-google-fonts/montserrat';
import { AuthProvider, useAuth } from '../lib/auth-context';
import { PreferencesProvider } from '../lib/preferences-context';
import AccountButton from '../components/AccountButton';
import AppTour from '../components/AppTour';
import { ThemeProvider, useTheme } from '../lib/theme-context';

SplashScreen.preventAutoHideAsync();

// Status bar icons need to flip with the theme (dark icons on the light
// palette, light icons on the dark one).
function ThemedStatusBar() {
    const { isDark } = useTheme();
    return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        Montserrat_400Regular,
        Montserrat_500Medium,
        Montserrat_600SemiBold,
        Montserrat_700Bold,
    });

    const onLayoutRootView = useCallback(async () => {
        if (fontsLoaded) {
            await SplashScreen.hideAsync();
        }
    }, [fontsLoaded]);

    useEffect(() => {
        onLayoutRootView();
    }, [onLayoutRootView]);

    if (!fontsLoaded) {
        return null;
    }

    return (
        <SafeAreaProvider>
            <ThemeProvider>
                <AuthProvider>
                    <PreferencesProvider>
                        <ThemedStatusBar />
                        <AuthGate />
                    </PreferencesProvider>
                </AuthProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}

function AuthGate() {
    const { session, loading } = useAuth();
    const pathname = usePathname();
    const { colors } = useTheme();

    if (loading) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
                <ActivityIndicator />
            </View>
        );
    }

    // No forced sign-in on launch, matching the website (which doesn't
    // require an account just to browse Chords/Draw Mode). Screens that
    // need an account -- saving a chord, unlocking Pro -- prompt sign-in
    // inline via their own auth-gate modal (see app/index.tsx) instead of a
    // global redirect. /sign-in itself stays reachable at any time (it's how
    // that inline prompt gets you there), and only redirects away once
    // there's already a session, so you don't land back on it after signing
    // in from elsewhere.
    if (session && pathname === '/sign-in') {
        return <Redirect href="/" />;
    }

    return (
        <>
            <Slot />
            {/* Mounted globally (like the website's Header) so it's visible
                over every screen -- except sign-in itself, where tapping it
                would just be a no-op link back to the page you're already on. */}
            {pathname !== '/sign-in' && <AccountButton />}
            {pathname !== '/sign-in' && <AppTour />}
        </>
    );
}
