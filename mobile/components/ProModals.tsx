// Ports of the website's Paywall and "Welcome to Pro" modals
// (components/Header.tsx and app/page.tsx). The paywall starts a hosted
// Stripe Checkout session (lib/billing.ts) in the in-app browser.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../lib/auth-context';
import { fetchPrices, startCheckout, type Plan, type Prices } from '../lib/billing';
import { useSubscription } from '../lib/hooks/useSubscription';
import { fonts, radius, spacing, type Palette } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/theme-context';

const PAYWALL_FEATURES = [
    'Alternate chord voicings & shapes',
    'All scale patterns & variants',
    'Draw Mode — build custom chord shapes',
    'Save & manage chord progressions',
];

const WELCOME_FEATURES = [
    'Alternate chord voicings',
    'Additional scale patterns & variants',
    'Draw Mode — build any shape',
    'New content added regularly',
];

function ProBadge() {
    const { colors } = useTheme();
    const styles = useThemedStyles(makeStyles);
    return (
        <View style={styles.badge}>
            <Svg width={12} height={12} viewBox="0 0 24 24" fill={colors.olive}>
                <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </Svg>
            <Text style={styles.badgeText}>Pro</Text>
        </View>
    );
}

function FeatureList({ items }: { items: string[] }) {
    const { colors } = useTheme();
    const styles = useThemedStyles(makeStyles);
    return (
        <View style={styles.features}>
            {items.map((f) => (
                <View key={f} style={styles.featureRow}>
                    <View style={styles.checkCircle}>
                        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={colors.olive} strokeWidth={3}>
                            <Path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </Svg>
                    </View>
                    <Text style={styles.featureText}>{f}</Text>
                </View>
            ))}
        </View>
    );
}

export function PaywallModal({
    visible,
    onClose,
    onAlreadyPro,
    onSubscribed,
    onSignIn,
}: {
    visible: boolean;
    /** shown as "Already subscribed? Sign in" when given (signed-out users) */
    onSignIn?: () => void;
    /** dismissed ("Maybe later" / backdrop) */
    onClose: () => void;
    /** Pro status resolved while the paywall was up -- just hide it */
    onAlreadyPro: () => void;
    /** checkout finished with a successful payment (Pro lands via Realtime,
     *  or after sign-in if they bought without an account) */
    onSubscribed: () => void;
}) {
    const styles = useThemedStyles(makeStyles);
    const { session } = useAuth();
    const hasPro = useSubscription();
    const [plan, setPlan] = useState<Plan>('monthly');
    const [prices, setPrices] = useState<Prices>({ monthly: null, yearly: null });
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState('');

    useEffect(() => {
        if (!visible) return;
        fetchPrices()
            .then((p) => {
                if (p.monthly || p.yearly) setPrices(p);
            })
            .catch(() => {});
    }, [visible]);

    // A Pro user should never be looking at the paywall.
    useEffect(() => {
        if (hasPro && visible) onAlreadyPro();
    }, [hasPro, visible, onAlreadyPro]);

    const handleSubscribe = async () => {
        setLoading(true);
        setAlert('');
        try {
            const outcome = await startCheckout(plan, session?.user.email);
            if (outcome === 'success') onSubscribed();
        } catch (e) {
            // Surface the real cause in the dev log (it was being swallowed).
            console.warn('[checkout] failed to start:', e);
            setAlert('Unable to start checkout. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={styles.card} onPress={() => {}}>
                    <View style={styles.header}>
                        <ProBadge />
                        <Text style={styles.title}>{'Unlock your full\nfretboard'}</Text>
                        <Text style={styles.subtitle}>For the curious and the committed</Text>
                    </View>

                    <FeatureList items={PAYWALL_FEATURES} />

                    <View style={styles.paywallBody}>
                        <View style={styles.saveRow}>
                            <View style={styles.flex} />
                            <View style={[styles.flex, styles.saveCenter]}>
                                <Text style={styles.saveBadge}>SAVE 50%</Text>
                            </View>
                        </View>
                        <View style={styles.planToggle}>
                            {(['monthly', 'yearly'] as const).map((p) => {
                                const active = plan === p;
                                return (
                                    <TouchableOpacity
                                        key={p}
                                        style={[styles.planOption, active && styles.planOptionActive]}
                                        onPress={() => setPlan(p)}>
                                        {prices[p] && (
                                            <Text style={[styles.planPrice, active && styles.planPriceActive]}>
                                                {prices[p]}
                                            </Text>
                                        )}
                                        <Text style={[styles.planName, active && styles.planNameActive]}>
                                            {p === 'monthly' ? 'Monthly' : 'Yearly'}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {alert ? <Text style={styles.alert}>{alert}</Text> : null}

                        <TouchableOpacity
                            style={[styles.cta, loading && styles.ctaDisabled]}
                            disabled={loading}
                            onPress={handleSubscribe}>
                            {loading ? (
                                <ActivityIndicator color={styles.ctaText.color} />
                            ) : (
                                <Text style={styles.ctaText}>
                                    {plan === 'yearly' ? 'Start yearly plan' : 'Start monthly plan'}
                                </Text>
                            )}
                        </TouchableOpacity>

                        {onSignIn && (
                            <TouchableOpacity onPress={onSignIn} style={styles.later}>
                                <Text style={[styles.laterText, styles.signInLink]}>
                                    Already subscribed? Sign in
                                </Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity onPress={onClose} style={styles.later}>
                            <Text style={styles.laterText}>Maybe later</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

/**
 * Shown after a successful checkout made without an account: the purchase is
 * tied to the email entered at Stripe and unlocks once they sign in with it.
 */
export function SignInToUnlockModal({
    visible,
    onClose,
    onSignIn,
}: {
    visible: boolean;
    onClose: () => void;
    onSignIn: () => void;
}) {
    const styles = useThemedStyles(makeStyles);
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={styles.card} onPress={() => {}}>
                    <View style={styles.header}>
                        <ProBadge />
                        <Text style={styles.title}>{'Payment received.\nSign in to unlock Pro.'}</Text>
                        <Text style={styles.subtitle}>
                            Sign in with the email you used at checkout and your Pro features will turn on.
                        </Text>
                    </View>
                    <FeatureList items={WELCOME_FEATURES} />
                    <View style={styles.paywallBody}>
                        <TouchableOpacity style={styles.cta} onPress={onSignIn}>
                            <Text style={styles.ctaText}>Sign in to continue</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onClose} style={styles.later}>
                            <Text style={styles.laterText}>I’ll do it later</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

export function ProWelcomeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const styles = useThemedStyles(makeStyles);
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={styles.card} onPress={() => {}}>
                    <View style={styles.header}>
                        <ProBadge />
                        <Text style={styles.title}>You’re in. Welcome to Pro.</Text>
                        <Text style={styles.subtitle}>Here’s what’s now unlocked for you</Text>
                    </View>
                    <FeatureList items={WELCOME_FEATURES} />
                    <View style={styles.paywallBody}>
                        <TouchableOpacity style={styles.cta} onPress={onClose}>
                            <Text style={styles.ctaText}>Start exploring</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const makeStyles = (colors: Palette) =>
    StyleSheet.create({
        flex: { flex: 1 },
        backdrop: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.md,
            backgroundColor: 'rgba(0,0,0,0.6)',
        },
        card: {
            width: '100%',
            maxWidth: 384,
            borderRadius: radius['3xl'],
            backgroundColor: colors.sand4,
            overflow: 'hidden',
        },
        header: {
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg + 4,
            paddingBottom: spacing.md + 4,
            borderBottomWidth: 1,
            borderBottomColor: `${colors.sand1}1A`,
        },
        badge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: radius.pill,
            backgroundColor: `${colors.olive}33`,
            borderWidth: 1,
            borderColor: `${colors.olive}66`,
        },
        badgeText: {
            fontFamily: fonts.sans.bold,
            fontSize: 12,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: colors.olive,
        },
        title: {
            fontFamily: fonts.sans.bold,
            fontSize: 24,
            lineHeight: 30,
            textAlign: 'center',
            color: colors.sand1,
        },
        subtitle: { fontFamily: fonts.sans.regular, fontSize: 14, textAlign: 'center', color: `${colors.sand1}99` },
        features: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 10 },
        featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
        checkCircle: {
            width: 20,
            height: 20,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${colors.olive}33`,
            borderWidth: 1,
            borderColor: `${colors.olive}66`,
        },
        featureText: { flex: 1, fontFamily: fonts.sans.medium, fontSize: 14, color: `${colors.sand1}CC` },
        paywallBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md + 4, gap: spacing.sm + 4 },
        saveRow: { flexDirection: 'row' },
        saveCenter: { alignItems: 'center' },
        saveBadge: {
            overflow: 'hidden',
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: radius.pill,
            backgroundColor: colors.olive,
            fontFamily: fonts.sans.bold,
            fontSize: 10,
            color: colors.sand1,
        },
        planToggle: {
            flexDirection: 'row',
            borderRadius: radius.xl,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: `${colors.sand1}33`,
            backgroundColor: `${colors.sand1}0D`,
        },
        planOption: { flex: 1, paddingVertical: spacing.sm + 4, alignItems: 'center', gap: 2 },
        planOptionActive: { backgroundColor: colors.sand1 },
        planPrice: { fontFamily: fonts.sans.semiBold, fontSize: 18, color: `${colors.sand1}80` },
        planPriceActive: { color: colors.sand4 },
        planName: { fontFamily: fonts.sans.medium, fontSize: 12, color: `${colors.sand1}4D` },
        planNameActive: { color: `${colors.sand4}99` },
        alert: {
            overflow: 'hidden',
            borderRadius: radius.lg,
            borderWidth: 1,
            paddingHorizontal: spacing.sm + 4,
            paddingVertical: spacing.sm,
            fontFamily: fonts.sans.semiBold,
            fontSize: 12,
            color: '#fecaca',
            backgroundColor: '#7f1d1d99',
            borderColor: '#991b1b99',
        },
        cta: {
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: spacing.md - 2,
            borderRadius: radius.pill,
            backgroundColor: colors.sand1,
        },
        ctaDisabled: { opacity: 0.4 },
        ctaText: { fontFamily: fonts.sans.bold, fontSize: 14, letterSpacing: 0.3, color: colors.sand4 },
        later: { alignItems: 'center', paddingVertical: 4 },
        laterText: { fontFamily: fonts.sans.regular, fontSize: 12, color: `${colors.sand1}66` },
        signInLink: { fontFamily: fonts.sans.semiBold, color: `${colors.sand1}99`, textDecorationLine: 'underline' },
    });
