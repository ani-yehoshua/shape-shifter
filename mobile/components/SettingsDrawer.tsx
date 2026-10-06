// Port of the "Settings Drawer" in ../../components/Header.tsx: a dark
// full-height panel that slides in from the right (swipe right to dismiss),
// with Preferences (handedness, default tuning), the account email, Manage
// Subscription for Pro users, and Sign out.
//
// Not here yet, each blocked on the deployed website's URL (they call
// /api/* Next.js routes) or on dark mode existing: the theme toggle, change
// email, delete account, and the feedback form. The email is shown
// read-only until change-email can be wired.
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Linking,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { usePreferences } from '../lib/preferences-context';
import { supabase } from '../lib/supabase';
import { fonts, radius, spacing, type Palette } from '../lib/theme';
import { useTheme, useThemedStyles, type ThemeSetting } from '../lib/theme-context';
import { TUNINGS } from '../lib/tunings';

// Same billing portal link as the website's Header.tsx "Manage Subscription".
const BILLING_PORTAL_URL = 'https://billing.stripe.com/p/login/fZu3cu1XQeGWcxs1lhgUM00';
const DRAWER_MAX_WIDTH = 384; // max-w-sm

type Props = {
    visible: boolean;
    onClose: () => void;
    email: string;
    hasPro: boolean;
};

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
];

function CloseIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={`${colors.sand1}B3`} strokeWidth={2}>
            <Path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </Svg>
    );
}

function SignOutIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.sand4} strokeWidth={2}>
            <Path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
        </Svg>
    );
}

export default function SettingsDrawer({ visible, onClose, email, hasPro }: Props) {
    const { width: screenWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const preferences = usePreferences();
    const { theme, setTheme } = useTheme();
    const styles = useThemedStyles(makeStyles);
    const drawerWidth = Math.min(screenWidth, DRAWER_MAX_WIDTH);

    const anim = useRef(new Animated.Value(0)).current;
    const drag = useRef(new Animated.Value(0)).current;
    const [modalVisible, setModalVisible] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        if (visible) {
            drag.setValue(0);
            setModalVisible(true);
            Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        } else {
            Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start(({ finished }) => {
                if (finished) setModalVisible(false);
            });
        }
    }, [visible, anim, drag]);

    // Swipe right on the drawer to dismiss (same gesture as the website's
    // touch handlers): follow the finger rightward, close past 80px.
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_e, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy),
            onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dx)),
            onPanResponderRelease: (_e, g) => {
                if (g.dx > 80) {
                    onClose();
                } else {
                    Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
            },
        }),
    ).current;

    const handleSignOut = async () => {
        setSigningOut(true);
        onClose();
        await supabase.auth.signOut();
        setSigningOut(false);
    };

    const translateX = Animated.add(
        anim.interpolate({ inputRange: [0, 1], outputRange: [drawerWidth, 0] }),
        drag,
    );

    return (
        <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose}>
            <View style={styles.container}>
                <Animated.View style={[styles.backdrop, { opacity: anim }]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                </Animated.View>

                <Animated.View
                    {...panResponder.panHandlers}
                    style={[
                        styles.drawer,
                        { width: drawerWidth, paddingTop: insets.top, transform: [{ translateX }] },
                    ]}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Settings</Text>
                        <TouchableOpacity onPress={onClose}>
                            <CloseIcon />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.body}>
                        <View style={styles.group}>
                            <Text style={styles.groupTitle}>Preferences</Text>

                            <View style={styles.field}>
                                <Text style={styles.fieldLabel}>Theme</Text>
                                <View style={styles.segmented}>
                                    {THEME_OPTIONS.map(({ value, label }, i) => {
                                        const active = theme === value;
                                        return (
                                            <TouchableOpacity
                                                key={value}
                                                onPress={() => setTheme(value)}
                                                style={[
                                                    styles.segment,
                                                    i > 0 && styles.segmentDivider,
                                                    active && styles.segmentActive,
                                                ]}>
                                                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                                                    {label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.field}>
                                <Text style={styles.fieldLabel}>Handedness</Text>
                                <View style={styles.segmented}>
                                    {(
                                        [
                                            ['right', 'Right-handed'],
                                            ['left', 'Left-handed'],
                                        ] as const
                                    ).map(([val, label], i) => {
                                        const active = preferences.handedness === val;
                                        return (
                                            <TouchableOpacity
                                                key={val}
                                                onPress={() => preferences.setHandedness(val)}
                                                style={[
                                                    styles.segment,
                                                    i > 0 && styles.segmentDivider,
                                                    active && styles.segmentActive,
                                                ]}>
                                                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                                                    {label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.field}>
                                <Text style={styles.fieldLabel}>Default Tuning</Text>
                                <View style={styles.pillWrap}>
                                    {TUNINGS.map((t) => {
                                        const active = preferences.tuningName === t.name;
                                        return (
                                            <TouchableOpacity
                                                key={t.name}
                                                onPress={() => preferences.setTuningName(t.name)}
                                                style={[styles.pill, active && styles.pillActive]}>
                                                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                                                    {t.name}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                {preferences.tuningName !== 'Standard' && (
                                    <Text style={styles.tuningNotes}>
                                        {[...(TUNINGS.find((t) => t.name === preferences.tuningName)?.notes ?? [])]
                                            .reverse()
                                            .join(' · ')}
                                    </Text>
                                )}
                            </View>
                        </View>

                        <View style={styles.group}>
                            <Text style={styles.groupTitle}>Email</Text>
                            <Text style={styles.email} numberOfLines={1}>
                                {email}
                            </Text>
                        </View>

                        {hasPro && (
                            <TouchableOpacity
                                style={styles.manageButton}
                                onPress={() => Linking.openURL(BILLING_PORTAL_URL)}>
                                <Text style={styles.manageButtonText}>Manage Subscription</Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>

                    <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>
                        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} disabled={signingOut}>
                            <SignOutIcon />
                            <Text style={styles.signOutText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
    container: { flex: 1 },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    drawer: {
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.sand4,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md + 4,
        paddingVertical: spacing.sm + 4,
        borderBottomWidth: 1,
        borderBottomColor: `${colors.ink}33`,
    },
    title: { fontFamily: fonts.sans.bold, fontSize: 18, color: colors.sand1 },
    body: { padding: spacing.md + 4, gap: spacing.lg },
    group: { gap: spacing.md },
    groupTitle: {
        fontFamily: fonts.sans.bold,
        fontSize: 12,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: `${colors.sand1}B3`,
    },
    field: { gap: spacing.xs + 2 },
    fieldLabel: {
        fontFamily: fonts.sans.bold,
        fontSize: 10,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: `${colors.sand1}80`,
    },
    segmented: {
        flexDirection: 'row',
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: `${colors.sand1}33`,
        overflow: 'hidden',
    },
    segment: { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center' },
    segmentDivider: { borderLeftWidth: 1, borderLeftColor: `${colors.sand1}33` },
    segmentActive: { backgroundColor: colors.sand1 },
    segmentText: { fontFamily: fonts.sans.medium, fontSize: 14, color: `${colors.sand1}99` },
    segmentTextActive: { fontFamily: fonts.sans.semiBold, color: colors.sand4 },
    pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
    pill: {
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.sand1}33`,
    },
    pillActive: { backgroundColor: colors.sand1, borderColor: colors.sand1 },
    pillText: { fontFamily: fonts.sans.semiBold, fontSize: 12, color: `${colors.sand1}B3` },
    pillTextActive: { color: colors.sand4 },
    tuningNotes: {
        fontSize: 10,
        color: `${colors.sand1}66`,
        fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    },
    email: { fontFamily: fonts.sans.regular, fontSize: 14, color: colors.sand1 },
    manageButton: {
        alignSelf: 'flex-start',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
        borderRadius: radius.pill,
        backgroundColor: colors.sand1,
    },
    manageButtonText: { fontFamily: fonts.sans.semiBold, fontSize: 14, color: colors.sand4 },
    footer: {
        paddingHorizontal: spacing.md + 4,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
    },
    signOutButton: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        backgroundColor: colors.sand1,
    },
    signOutText: { fontFamily: fonts.sans.semiBold, fontSize: 14, color: colors.sand4 },
});
