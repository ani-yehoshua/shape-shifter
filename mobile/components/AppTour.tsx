// First-launch tour: a short stepped card (icon, title, body, dots,
// Back/Next, Skip), modeled on the GymPlanner app's AppTour. Shown once
// (AsyncStorage flag) and replayable from the Settings drawer via
// replayTour().
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { fonts, radius, spacing, type Palette } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/theme-context';

const TOUR_DONE_KEY = 'shapeshifter:tourDone';

const replayListeners = new Set<() => void>();

/** Reopen the tour from anywhere (used by the Settings drawer). */
export function replayTour() {
    AsyncStorage.removeItem(TOUR_DONE_KEY).catch(() => {});
    replayListeners.forEach((fn) => fn());
}

type Step = { icon: string[]; title: string; body: string };

const STEPS: Step[] = [
    {
        icon: [
            'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
        ],
        title: 'Chords & Scales',
        body: 'Pick a root note, then browse chord voicings or scale patterns across the fretboard. Open the Menu to switch between Chords and Scales and narrow things down.',
    },
    {
        icon: [
            'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
        ],
        title: 'Make it yours',
        body: 'Tap a note or strum the whole shape to hear it. Switch between note names and intervals, move the capo, and set your handedness and tuning in Settings.',
    },
    {
        icon: [
            'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
        ],
        title: 'Randomize',
        body: 'Not sure what to play? Randomize picks a chord or scale for you. Tune what it can choose from, then hit Random again for another.',
    },
    {
        icon: ['M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z'],
        title: 'Save & build progressions',
        body: 'Sign in (free) to bookmark chords you like and find them again under Saved. Line chords up in the progression panel to hear them one after another.',
    },
    {
        icon: [
            'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
        ],
        title: 'Pro & Draw Mode',
        body: 'Pro unlocks alternate voicings, extra scale patterns, and Draw Mode, where you place notes on the fretboard yourself and we name the chord. Settings has your account, and you can replay this tour there any time.',
    },
];

function StepIcon({ paths }: { paths: string[] }) {
    const { colors } = useTheme();
    return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.sand1} strokeWidth={2}>
            {paths.map((d) => (
                <Path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />
            ))}
        </Svg>
    );
}

export default function AppTour() {
    const styles = useThemedStyles(makeStyles);
    const [open, setOpen] = useState(false);
    const [i, setI] = useState(0);

    useEffect(() => {
        const start = () => {
            setI(0);
            setOpen(true);
        };
        AsyncStorage.getItem(TOUR_DONE_KEY)
            .then((v) => {
                if (v !== '1') start();
            })
            .catch(() => {});
        replayListeners.add(start);
        return () => {
            replayListeners.delete(start);
        };
    }, []);

    const finish = () => {
        AsyncStorage.setItem(TOUR_DONE_KEY, '1').catch(() => {});
        setOpen(false);
    };

    const step = STEPS[i];
    const last = i === STEPS.length - 1;

    return (
        <Modal visible={open} transparent animationType="fade" onRequestClose={finish}>
            <Pressable style={styles.backdrop} onPress={finish}>
                <Pressable style={styles.card} onPress={() => {}}>
                    <View style={styles.topRow}>
                        <View style={styles.iconBox}>
                            <StepIcon paths={step.icon} />
                        </View>
                        <TouchableOpacity onPress={finish} hitSlop={8}>
                            <Text style={styles.skip}>Skip</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.title}>{step.title}</Text>
                    <Text style={styles.body}>{step.body}</Text>

                    <View style={styles.bottomRow}>
                        <View style={styles.dots}>
                            {STEPS.map((s, n) => (
                                <View key={s.title} style={[styles.dot, n === i && styles.dotActive]} />
                            ))}
                        </View>
                        <View style={styles.buttons}>
                            {i > 0 && (
                                <TouchableOpacity style={styles.backButton} onPress={() => setI(i - 1)}>
                                    <Text style={styles.backText}>Back</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={styles.nextButton}
                                onPress={() => (last ? finish() : setI(i + 1))}>
                                <Text style={styles.nextText}>{last ? 'Got it' : 'Next'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const makeStyles = (colors: Palette) =>
    StyleSheet.create({
        backdrop: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.md,
            backgroundColor: 'rgba(0,0,0,0.5)',
        },
        card: {
            width: '100%',
            maxWidth: 384,
            borderRadius: radius['2xl'],
            backgroundColor: colors.sand4,
            padding: spacing.md + 4,
        },
        topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
        iconBox: {
            padding: 10,
            borderRadius: radius.xl,
            backgroundColor: `${colors.sand1}1A`,
        },
        skip: { fontFamily: fonts.sans.regular, fontSize: 12, color: `${colors.sand1}80` },
        title: {
            marginTop: spacing.sm + 4,
            fontFamily: fonts.sans.semiBold,
            fontSize: 16,
            color: colors.sand1,
        },
        body: {
            marginTop: 4,
            fontFamily: fonts.sans.regular,
            fontSize: 14,
            lineHeight: 21,
            color: `${colors.sand1}B3`,
        },
        bottomRow: {
            marginTop: spacing.md + 4,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: `${colors.sand1}33` },
        dotActive: { width: 16, backgroundColor: colors.sand1 },
        buttons: { flexDirection: 'row', gap: spacing.sm },
        backButton: {
            paddingHorizontal: spacing.sm + 4,
            paddingVertical: spacing.xs + 2,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: `${colors.sand1}33`,
        },
        backText: { fontFamily: fonts.sans.medium, fontSize: 14, color: colors.sand1 },
        nextButton: {
            paddingHorizontal: spacing.sm + 4,
            paddingVertical: spacing.xs + 2,
            borderRadius: radius.lg,
            backgroundColor: colors.sand1,
        },
        nextText: { fontFamily: fonts.sans.semiBold, fontSize: 14, color: colors.sand4 },
    });
