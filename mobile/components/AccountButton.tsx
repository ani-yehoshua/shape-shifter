// Port of the account-avatar slice of ../../components/Header.tsx on the
// website -- the fixed top-right avatar button and its settings drawer.
// Only the account-management pieces are ported here (email/Pro status,
// manage subscription, sign out); the rest of that drawer (theme toggle,
// handedness, default tuning, change email, delete account) is either not
// applicable to this app yet (no theme toggle exists) or already lives
// elsewhere in this app (handedness/tuning are controlled directly in the
// Chords screen's own controls) or is explicitly deferred (email change and
// account deletion call relative /api/* Next.js routes that don't exist
// here -- see the note on this in ../lib/API.ts).
//
// Rendered globally from app/_layout.tsx (like the website's Header, which
// is mounted once in app/layout.tsx) rather than per-screen, so it's
// visible no matter which mode/screen is showing underneath it.
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth-context';
import { useSubscription } from '../lib/hooks/useSubscription';
import { supabase } from '../lib/supabase';
import { colors, fonts, radius, spacing } from '../lib/theme';

// Same billing portal link as the website's Header.tsx "Manage Subscription" button.
const BILLING_PORTAL_URL = 'https://billing.stripe.com/p/login/fZu3cu1XQeGWcxs1lhgUM00';

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
    const [signingOut, setSigningOut] = useState(false);

    if (loading) return null;

    const email = session?.user?.email ?? '';
    const initial = email ? email.charAt(0).toUpperCase() : 'U';

    const handleSignOut = async () => {
        setSigningOut(true);
        await supabase.auth.signOut();
        setSigningOut(false);
        setMenuOpen(false);
    };

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

            <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
                <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
                    <Pressable style={styles.card} onPress={() => {}}>
                        <View style={styles.cardAvatar}>
                            <Text style={styles.cardAvatarText}>{initial}</Text>
                        </View>
                        <Text style={styles.email} numberOfLines={1}>
                            {email}
                        </Text>
                        <Text style={styles.planLabel}>{hasPro ? '★ Pro member' : 'Free plan'}</Text>

                        {hasPro && (
                            <TouchableOpacity
                                style={styles.manageButton}
                                onPress={() => Linking.openURL(BILLING_PORTAL_URL)}
                            >
                                <Text style={styles.manageButtonText}>Manage Subscription</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} disabled={signingOut}>
                            <Text style={styles.signOutText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.closeButton} onPress={() => setMenuOpen(false)}>
                            <Text style={styles.closeText}>Close</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
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
    backdrop: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.4)',
        padding: spacing.md,
    },
    card: {
        width: '100%',
        maxWidth: 320,
        backgroundColor: colors.bg,
        borderRadius: radius['2xl'],
        padding: spacing.lg,
        alignItems: 'center',
        gap: spacing.xs,
    },
    cardAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.xs,
    },
    cardAvatarText: {
        fontFamily: fonts.sans.bold,
        fontSize: 22,
        color: colors.sand1,
    },
    email: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 14,
        color: colors.ink,
        maxWidth: '100%',
    },
    planLabel: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: `${colors.ink}80`,
        marginBottom: spacing.xs,
    },
    manageButton: {
        width: '100%',
        paddingVertical: spacing.sm + 4,
        borderRadius: radius.pill,
        backgroundColor: colors.ink,
        alignItems: 'center',
    },
    manageButtonText: {
        fontFamily: fonts.sans.bold,
        fontSize: 14,
        color: colors.sand1,
    },
    signOutButton: {
        width: '100%',
        paddingVertical: spacing.sm + 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
        alignItems: 'center',
        marginTop: spacing.xs,
    },
    signOutText: {
        fontFamily: fonts.sans.bold,
        fontSize: 14,
        color: colors.ink,
    },
    closeButton: {
        paddingVertical: spacing.xs + 4,
        alignItems: 'center',
    },
    closeText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: `${colors.ink}80`,
    },
});
