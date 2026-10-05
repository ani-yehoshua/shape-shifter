// Port of the "Randomize Sheet" in ../../app/page.tsx (Chords and Scales
// branches; the scaleChords branch is deferred with that mode). Same
// pin-to-narrow-the-pool pickers ("empty = all"), same cascading resets,
// same root-note toggle, same Clear and Done. Slides up as a bottom sheet
// with the backdrop fading separately, like the Menu sheet in app/index.tsx.
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { allChordShapes } from '../lib/API';
import { SCALE_SHAPES } from '../lib/Shapes/Scales';
import { colors, fonts, radius, spacing } from '../lib/theme';

export type ChordRandomizeConfig = {
    categories: string[];
    voicingTypes: string[];
    stringSets: string[];
    qualities: string[];
    inversions: string[];
    randomizeRoot: boolean;
};

export type ScaleRandomizeConfig = {
    noteGroups: string[];
    scales: string[];
    modes: string[];
    randomizeRoot: boolean;
};

export const EMPTY_CHORD_RANDOMIZE: ChordRandomizeConfig = {
    categories: [],
    voicingTypes: [],
    stringSets: [],
    qualities: [],
    inversions: [],
    randomizeRoot: true,
};

export const EMPTY_SCALE_RANDOMIZE: ScaleRandomizeConfig = {
    noteGroups: [],
    scales: [],
    modes: [],
    randomizeRoot: true,
};

type Props = {
    visible: boolean;
    mode: 'chords' | 'scales';
    chordCfg: ChordRandomizeConfig;
    setChordCfg: (fn: (c: ChordRandomizeConfig) => ChordRandomizeConfig) => void;
    scaleCfg: ScaleRandomizeConfig;
    setScaleCfg: (fn: (c: ScaleRandomizeConfig) => ScaleRandomizeConfig) => void;
    onClose: () => void;
    onDone: () => void;
};

type ChordLevel = {
    levelName?: string;
    options?: Record<string, ChordLevel>;
};

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

function PillGroup({
    label,
    hint = '(empty = all)',
    options,
    selected,
    onToggle,
}: {
    label: string;
    hint?: string;
    options: string[];
    selected: string[];
    onToggle: (v: string) => void;
}) {
    return (
        <View>
            <Text style={styles.sectionLabel}>
                {label} <Text style={styles.sectionHint}>{hint}</Text>
            </Text>
            <View style={styles.pillWrap}>
                {options.map((opt) => {
                    const active = selected.includes(opt);
                    return (
                        <TouchableOpacity
                            key={opt}
                            onPress={() => onToggle(opt)}
                            style={[styles.pill, active && styles.pillActive]}>
                            <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

function RootToggle({ value, onChange }: { value: boolean; onChange: () => void }) {
    return (
        <View style={styles.rootRow}>
            <Text style={styles.rootLabel}>Randomize root note</Text>
            <Switch
                value={value}
                onValueChange={onChange}
                trackColor={{ false: `${colors.ink}33`, true: colors.ink }}
                thumbColor={colors.sand1}
            />
        </View>
    );
}

const LEVEL_META: Record<string, { label: string; key: 'voicingTypes' | 'stringSets' | 'qualities' }> = {
    'Voicing Types': { label: 'Voicing', key: 'voicingTypes' },
    'String Sets': { label: 'String Set', key: 'stringSets' },
    'Chord Qualities': { label: 'Quality', key: 'qualities' },
};
const LEVEL_ORDER = ['Voicing Types', 'String Sets', 'Chord Qualities'];

export default function RandomizeSheet({
    visible,
    mode,
    chordCfg,
    setChordCfg,
    scaleCfg,
    setScaleCfg,
    onClose,
    onDone,
}: Props) {
    const { height: screenHeight } = useWindowDimensions();
    const anim = useRef(new Animated.Value(0)).current;
    const [modalVisible, setModalVisible] = useState(false);

    useEffect(() => {
        if (visible) {
            setModalVisible(true);
            Animated.timing(anim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        } else {
            Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
                if (finished) setModalVisible(false);
            });
        }
    }, [visible, anim]);

    const clear = () => {
        if (mode === 'chords') setChordCfg(() => EMPTY_CHORD_RANDOMIZE);
        else setScaleCfg(() => EMPTY_SCALE_RANDOMIZE);
    };

    const renderChords = () => {
        const levelUnions = new Map<string, string[]>();
        const posOptions: string[] = [];
        for (const cat of chordCfg.categories) {
            let node: ChordLevel | undefined = (allChordShapes as Record<string, ChordLevel>)[cat];
            while (node?.options && node.levelName !== 'Positions') {
                const lname = node.levelName ?? '';
                const keys: string[] = Object.keys(node.options);
                if (LEVEL_META[lname]) {
                    if (!levelUnions.has(lname)) levelUnions.set(lname, []);
                    const existing = levelUnions.get(lname)!;
                    for (const k of keys) if (!existing.includes(k)) existing.push(k);
                }
                node = node.options[keys[0]];
            }
            if (node?.levelName === 'Positions' && node.options) {
                for (const k of Object.keys(node.options)) if (!posOptions.includes(k)) posOptions.push(k);
            }
        }
        const posLabel = posOptions.some((k) => k === 'Root' || k.includes('Inv.')) ? 'Inversion' : 'Shape';

        return (
            <>
                <PillGroup
                    label="Category"
                    options={Object.keys(allChordShapes)}
                    selected={chordCfg.categories}
                    onToggle={(cat) =>
                        setChordCfg((c) => ({
                            ...c,
                            categories: toggle(c.categories, cat),
                            voicingTypes: [],
                            stringSets: [],
                            qualities: [],
                            inversions: [],
                        }))
                    }
                />
                {chordCfg.categories.length >= 1 &&
                    LEVEL_ORDER.filter((l) => levelUnions.has(l)).map((lname) => {
                        const { label, key } = LEVEL_META[lname];
                        return (
                            <PillGroup
                                key={key}
                                label={label}
                                options={levelUnions.get(lname)!}
                                selected={chordCfg[key]}
                                onToggle={(opt) => setChordCfg((c) => ({ ...c, [key]: toggle(c[key], opt) }))}
                            />
                        );
                    })}
                {chordCfg.categories.length >= 1 && posOptions.length > 0 && (
                    <PillGroup
                        label={posLabel}
                        options={posOptions}
                        selected={chordCfg.inversions}
                        onToggle={(pos) => setChordCfg((c) => ({ ...c, inversions: toggle(c.inversions, pos) }))}
                    />
                )}
                <RootToggle
                    value={chordCfg.randomizeRoot}
                    onChange={() => setChordCfg((c) => ({ ...c, randomizeRoot: !c.randomizeRoot }))}
                />
            </>
        );
    };

    const renderScales = () => {
        const shapes = SCALE_SHAPES as Record<string, Record<string, any>>;
        const relevantScales =
            scaleCfg.scales.length > 0
                ? scaleCfg.scales
                : scaleCfg.noteGroups.flatMap((g) => Object.keys(shapes[g] ?? {}));
        const allModeNames = Array.from(
            new Set(
                relevantScales.flatMap((s) =>
                    scaleCfg.noteGroups.flatMap((g) =>
                        ((shapes[g]?.[s]?.positions ?? []) as { modeName?: string }[])
                            .map((p) => p.modeName)
                            .filter((m): m is string => !!m),
                    ),
                ),
            ),
        );

        return (
            <>
                <PillGroup
                    label="Note Group"
                    options={Object.keys(SCALE_SHAPES)}
                    selected={scaleCfg.noteGroups}
                    onToggle={(group) =>
                        setScaleCfg((c) => ({ ...c, noteGroups: toggle(c.noteGroups, group), scales: [] }))
                    }
                />
                {scaleCfg.noteGroups.length > 0 && (
                    <PillGroup
                        label="Scale"
                        hint="(empty = all in group)"
                        options={scaleCfg.noteGroups.flatMap((g) => Object.keys(shapes[g] ?? {}))}
                        selected={scaleCfg.scales}
                        onToggle={(s) => setScaleCfg((c) => ({ ...c, scales: toggle(c.scales, s) }))}
                    />
                )}
                {scaleCfg.noteGroups.length > 0 && allModeNames.length > 0 && (
                    <PillGroup
                        label="Mode"
                        options={allModeNames}
                        selected={scaleCfg.modes}
                        onToggle={(m) => setScaleCfg((c) => ({ ...c, modes: toggle(c.modes, m) }))}
                    />
                )}
                <RootToggle
                    value={scaleCfg.randomizeRoot}
                    onChange={() => setScaleCfg((c) => ({ ...c, randomizeRoot: !c.randomizeRoot, modes: [] }))}
                />
            </>
        );
    };

    return (
        <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose}>
            <View style={styles.container}>
                <Animated.View style={[styles.backdrop, { opacity: anim }]}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                </Animated.View>
                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            transform: [
                                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [screenHeight, 0] }) },
                            ],
                        },
                    ]}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Randomize</Text>
                        <View style={styles.headerActions}>
                            <TouchableOpacity onPress={clear}>
                                <Text style={styles.clearText}>Clear</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClose}>
                                <Text style={styles.closeX}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView contentContainerStyle={styles.body}>
                        {mode === 'chords' ? renderChords() : renderScales()}
                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity onPress={onDone} style={styles.doneButton}>
                            <Text style={styles.doneText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    sheet: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '80%',
        backgroundColor: colors.sand1,
        borderTopLeftRadius: radius['2xl'],
        borderTopRightRadius: radius['2xl'],
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md + 4,
        paddingTop: spacing.md + 4,
        paddingBottom: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: `${colors.ink}1A`,
    },
    title: { fontFamily: fonts.sans.bold, fontSize: 16, color: colors.ink },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    clearText: { fontFamily: fonts.sans.semiBold, fontSize: 12, color: `${colors.ink}66` },
    closeX: { fontSize: 20, color: `${colors.ink}66` },
    body: {
        paddingHorizontal: spacing.md + 4,
        paddingVertical: spacing.md,
        gap: spacing.md + 4,
    },
    sectionLabel: {
        fontFamily: fonts.sans.bold,
        fontSize: 10,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: `${colors.ink}66`,
        marginBottom: spacing.sm,
    },
    sectionHint: {
        fontFamily: fonts.sans.semiBold,
        textTransform: 'none',
        letterSpacing: 0,
        color: `${colors.ink}4D`,
    },
    pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    pill: {
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
    pillText: { fontFamily: fonts.sans.semiBold, fontSize: 12, color: colors.ink },
    pillTextActive: { color: colors.sand1 },
    rootRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rootLabel: { fontFamily: fonts.sans.semiBold, fontSize: 14, color: colors.ink },
    footer: {
        paddingHorizontal: spacing.md + 4,
        paddingTop: spacing.sm + 4,
        paddingBottom: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}1A`,
    },
    doneButton: {
        paddingVertical: spacing.sm + 4,
        borderRadius: radius.pill,
        backgroundColor: colors.ink,
        alignItems: 'center',
    },
    doneText: { fontFamily: fonts.sans.bold, fontSize: 14, color: colors.sand1 },
});
