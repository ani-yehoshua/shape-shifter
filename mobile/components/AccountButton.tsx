// Port of the fixed top-right avatar from ../../components/Header.tsx on
// the website: a sign-in icon when signed out, an initial-letter avatar
// when signed in that opens the slide-in settings drawer (see
// ./SettingsDrawer for what's in it and what's still deferred).
//
// Rendered globally from app/_layout.tsx (like the website's Header, which
// is mounted once in app/layout.tsx) rather than per-screen, so it's
// visible no matter which mode/screen is showing underneath it.
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import SettingsDrawer from './SettingsDrawer';
import { useAuth } from '../lib/auth-context';
import { useSubscription } from '../lib/hooks/useSubscription';
import { colors, fonts, spacing } from '../lib/theme';

function PersonIcon() {
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill={colors.ink}>
            <Path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-7 9a7 7 0 1 1 14 0H5z" />
        </Svg>
    );
}

export default function AccountButton() {
    const { session, loading } = useAuth();
    const hasPro = useSubscription();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [menuOpen, setMenuOpen] = useState(false);

    if (loading) return null;

    const email = session?.user?.email ?? '';
    const initial = email ? email.charAt(0).toUpperCase() : 'U';

    return (
        <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
            {session ? (
                <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.avatarButton}>
                    <Text style={styles.avatarText}>{initial}</Text>
                </TouchableOpacity>
            ) : (
                <TouchableOpacity onPress={() => router.push('/sign-in')} style={styles.signInButton}>
                    <PersonIcon />
                </TouchableOpacity>
            )}

            {session && (
                <SettingsDrawer
                    visible={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    email={email}
                    hasPro={hasPro}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        position: 'absolute',
        right: spacing.md,
        zIndex: 50,
    },
    avatarButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontFamily: fonts.sans.bold,
        fontSize: 15,
        color: colors.sand1,
    },
    signInButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: `${colors.ink}66`,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
