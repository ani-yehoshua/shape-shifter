import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { colors, fonts, spacing } from '../../lib/theme';

export default function Home() {
    const { session } = useAuth();

    async function signOut() {
        await supabase.auth.signOut();
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <Text style={styles.title}>Welcome to Shape Shifter</Text>
            <Text style={styles.subtitle}>
                Signed in as {session?.user.email ?? 'unknown'}
            </Text>
            <TouchableOpacity onPress={signOut}>
                <Text style={styles.signOut}>Sign out</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
        gap: spacing.sm + 4,
    },
    title: {
        fontFamily: fonts.sans.bold,
        fontSize: 22,
        color: colors.ink,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: fonts.sans.regular,
        fontSize: 14,
        color: `${colors.ink}99`,
        textAlign: 'center',
    },
    signOut: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 14,
        color: colors.rootRed,
        marginTop: spacing.md,
    },
});
