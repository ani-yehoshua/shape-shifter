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
import { colors } from '../lib/theme';

SplashScreen.preventAutoHideAsync();

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
            <AuthProvider>
                <StatusBar style="dark" />
                <AuthGate />
            </AuthProvider>
        </SafeAreaProvider>
    );
}

function AuthGate() {
    const { session, loading } = useAuth();
    const pathname = usePathname();

    if (loading) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
                <ActivityIndicator />
            </View>
        );
    }

    if (!session && pathname !== '/sign-in') {
        return <Redirect href="/sign-in" />;
    }

    if (session && pathname === '/sign-in') {
        return <Redirect href="/" />;
    }

    return <Slot />;
}
