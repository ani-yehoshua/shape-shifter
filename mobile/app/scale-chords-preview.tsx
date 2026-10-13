// Dev-only preview of lib/Shapes/ScaleChords.layouts.ts (reached from the
// Settings drawer in a development build). It reads the layout TABLE directly
// -- not the built tree the app will eventually use -- so it can show every
// cell: approved shapes (#n), candidates you haven't reviewed yet ('?'), and
// shapes you removed ('x'). Pick a fingering, a scale and a degree and it's
// drawn on the fretboard, with the fret span on all seven degrees so you can
// see where a shape stretches. Edit the table, save, and it updates (run
// `npm run sync:mobile:watch` from the repo root next to Expo).
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import FretboardVertical from '../components/FretboardVertical';
import { generateAllVoicingsForShape, generateFretboardMap } from '../lib/fretboardMap';
import type { NotePosition, ShapeFormula } from '../lib/fretboardMap';
import {
    chordAtDegree,
    diatonicChords,
    generateDiatonicVoicings,
    layoutFromRow,
    shapeFromLayout,
    shapeSpan,
} from '../lib/harmony';
import { SCALE_CHORD_LAYOUTS, STRUCTURES } from '../lib/Shapes/ScaleChords.layouts';
import { SCALE_SHAPES } from '../lib/Shapes/Scales';
import { fonts, radius, spacing, type Palette } from '../lib/theme';
import { useTheme, useThemedStyles } from '../lib/theme-context';
import { STANDARD_TUNING } from '../lib/tunings';

// ── The table's shape (its own types aren't exported) ────────────────────────
type Cell = number | '?' | 'x';
type Row = readonly [number, string, readonly Cell[]];
type SetNode = { positions: Record<string, Row[]> };
const LAYOUTS = SCALE_CHORD_LAYOUTS as Record<string, Record<string, SetNode> | SetNode>;
const isSetNode = (n: SetNode | Record<string, SetNode>): n is SetNode => 'positions' in n;

const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const REACH_WARN_FRETS = 5; // same threshold the '?' candidates were chosen with

const degreesOf = (structure: string) => (structure.startsWith('(Base)') ? [1, 3, 5, 7] : structure.split(' ').map(Number));
const shortLabel = (structure: string) => (structure.startsWith('(Base)') ? 'Base' : structure.replace(/ /g, ''));
const voicingMinFret = (v: NotePosition[]) => Math.min(...v.map(n => n.fret).filter((f): f is number => f != null && f >= 0));

function Pill({
    label,
    active,
    onPress,
    styles,
}: {
    label: string;
    active: boolean;
    onPress: () => void;
    styles: ReturnType<typeof makeStyles>;
}) {
    return (
        <TouchableOpacity onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
        </TouchableOpacity>
    );
}

export default function ScaleChordsPreview() {
    const { colors } = useTheme();
    const styles = useThemedStyles(makeStyles);
    const router = useRouter();
    const { height: screenHeight } = useWindowDimensions();

    const voicings = Object.keys(LAYOUTS);
    const [voicing, setVoicing] = useState(voicings[0]);
    const [setKey, setSetKey] = useState('Mid');
    const [structIdx, setStructIdx] = useState(0);
    const [inversion, setInversion] = useState('Root');
    const [scaleName, setScaleName] = useState('Major');
    const [rootNote, setRootNote] = useState('C');
    const [degree, setDegree] = useState(0);
    const [rowIdx, setRowIdx] = useState(0);
    const [register, setRegister] = useState(0);
    const [showIntervals, setShowIntervals] = useState(false);

    // ── Which table slice is selected ──────────────────────────────────────
    const voicingNode = LAYOUTS[voicing] ?? LAYOUTS[voicings[0]];
    // a voicing with no string-set level (Raise 3/1 of 2) holds its fingerings directly
    const hasSets = !isSetNode(voicingNode);
    const sets = isSetNode(voicingNode) ? [] : Object.keys(voicingNode);
    const set = sets.includes(setKey) ? setKey : sets[0];
    const setNode: SetNode = isSetNode(voicingNode) ? voicingNode : voicingNode[set];
    const inversions = Object.keys(setNode.positions);
    const inv = inversions.includes(inversion) ? inversion : inversions[0];
    const rows = setNode.positions[inv];
    const structure = STRUCTURES[structIdx];

    // rows with something in this structure's column: a number, '?' or 'x'
    const visible = rows
        .map((row, i) => ({ row, i, cell: row[2][structIdx] }))
        .filter(x => x.cell !== 0);
    const pick = visible[Math.min(rowIdx, visible.length - 1)];

    // ── Scale + degree ─────────────────────────────────────────────────────
    const scales = Object.entries(SCALE_SHAPES['7-note']);
    const scale = SCALE_SHAPES['7-note'][scaleName] ?? scales[0][1];
    const intervals = scale.intervals;
    const degreeChords = diatonicChords(intervals, degreesOf(structure));
    const rootSemi = ROOTS.indexOf(rootNote);

    // ── The picked fingering, on every degree ──────────────────────────────
    const perDegree = useMemo(() => {
        if (!pick) return null;
        const chord = chordAtDegree(MAJOR, 0, degreesOf(structure));
        const template: ShapeFormula = shapeFromLayout(layoutFromRow(pick.row), chord);
        return generateDiatonicVoicings(template, intervals).map(
            (pattern): ShapeFormula => ({ rootString: template.rootString, pattern }),
        );
    }, [pick, structure, intervals]);

    const fretboardMap = useMemo(() => generateFretboardMap(STANDARD_TUNING.notes, 24), []);
    const chordRoot = ROOTS[(rootSemi + intervals[degree]) % 12];
    const positions = useMemo(() => {
        if (!perDegree) return [];
        return generateAllVoicingsForShape(chordRoot, perDegree[degree], fretboardMap, STANDARD_TUNING.semitones)
            .filter(v => v.some(n => n.fret != null))
            .sort((a, b) => voicingMinFret(a) - voicingMinFret(b));
    }, [perDegree, chordRoot, degree, fretboardMap]);
    const shown = positions[Math.min(register, Math.max(positions.length - 1, 0))] ?? [];

    const cellBadge = (cell: Cell) =>
        typeof cell === 'number' ? { text: `#${cell}`, style: styles.badgeApproved, textStyle: styles.badgeApprovedText }
        : cell === '?' ? { text: 'candidate', style: styles.badgeCandidate, textStyle: styles.badgeCandidateText }
        : { text: 'removed', style: styles.badgeRemoved, textStyle: styles.badgeRemovedText };

    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.back}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Scale Chords preview</Text>
            </View>

            <View style={[styles.fretboardBox, { height: Math.min(380, screenHeight * 0.42) }]}>
                {shown.length > 0 ? (
                    <FretboardVertical
                        chordShape={shown}
                        rootNote={chordRoot}
                        showIntervals={showIntervals}
                        showConnector
                        tuningFreqs={STANDARD_TUNING.freqs}
                    />
                ) : (
                    <Text style={styles.empty}>
                        {pick ? 'This shape doesn’t fit on the neck for this chord.' : 'Nothing in this cell yet.'}
                    </Text>
                )}
            </View>

            <ScrollView contentContainerStyle={styles.body}>
                {/* Degrees: chord, and how far the fingering stretches on each */}
                <Text style={styles.label}>Degree (fret span of this fingering)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.degreeRow}>
                    {intervals.map((_, d) => {
                        const span = perDegree ? shapeSpan(perDegree[d]) : null;
                        const wide = span != null && span > REACH_WARN_FRETS;
                        return (
                            <TouchableOpacity
                                key={d}
                                onPress={() => {
                                    setDegree(d);
                                    setRegister(0);
                                }}
                                style={[styles.degreeBtn, degree === d && styles.degreeBtnActive]}>
                                <Text style={[styles.degreeRoman, degree === d && styles.degreeTextActive]}>{ROMAN[d]}</Text>
                                <Text style={[styles.degreeChord, degree === d && styles.degreeTextActive]}>
                                    {degreeChords[d].qualityKey ?? '?'}
                                </Text>
                                <Text style={[styles.degreeSpan, wide && styles.degreeSpanWide]}>
                                    {span == null ? '–' : `${span} fr`}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {positions.length > 1 && (
                    <View style={styles.registerRow}>
                        <TouchableOpacity onPress={() => setRegister(r => Math.max(0, r - 1))} style={styles.stepBtn}>
                            <Text style={styles.stepText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.registerText}>
                            Position {Math.min(register, positions.length - 1) + 1}/{positions.length} on the neck
                        </Text>
                        <TouchableOpacity
                            onPress={() => setRegister(r => Math.min(positions.length - 1, r + 1))}
                            style={styles.stepBtn}>
                            <Text style={styles.stepText}>+</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <Text style={styles.label}>
                    Fingerings in this cell ({visible.length}) — #n approved · candidate · removed
                </Text>
                {visible.length === 0 && <Text style={styles.empty}>No fingering is numbered or marked ? here yet.</Text>}
                {visible.map((x, n) => {
                    const badge = cellBadge(x.cell);
                    const active = pick === x;
                    return (
                        <TouchableOpacity
                            key={x.i}
                            onPress={() => {
                                setRowIdx(n);
                                setRegister(0);
                            }}
                            style={[styles.rowCard, active && styles.rowCardActive]}>
                            <View style={[styles.badge, badge.style]}>
                                <Text style={badge.textStyle}>{badge.text}</Text>
                            </View>
                            <Text style={styles.rowText}>{x.row[1]}</Text>
                            <Text style={styles.rowMeta}>row {x.i + 1}</Text>
                        </TouchableOpacity>
                    );
                })}

                <Text style={styles.label}>Voicing</Text>
                <View style={styles.pillWrap}>
                    {voicings.map(v => (
                        <Pill key={v} label={v} active={v === voicing} styles={styles} onPress={() => { setVoicing(v); setRowIdx(0); setRegister(0); }} />
                    ))}
                </View>

                {hasSets && (
                    <>
                        <Text style={styles.label}>String set</Text>
                        <View style={styles.pillWrap}>
                            {sets.map(s => (
                                <Pill key={s} label={s} active={s === set} styles={styles} onPress={() => { setSetKey(s); setRowIdx(0); setRegister(0); }} />
                            ))}
                        </View>
                    </>
                )}

                <Text style={styles.label}>Structure (column)</Text>
                <View style={styles.pillWrap}>
                    {STRUCTURES.map((s, i) => (
                        <Pill key={s} label={shortLabel(s)} active={i === structIdx} styles={styles} onPress={() => { setStructIdx(i); setRowIdx(0); setRegister(0); }} />
                    ))}
                </View>

                <Text style={styles.label}>Inversion</Text>
                <View style={styles.pillWrap}>
                    {inversions.map(i => (
                        <Pill key={i} label={i} active={i === inv} styles={styles} onPress={() => { setInversion(i); setRowIdx(0); setRegister(0); }} />
                    ))}
                </View>

                <Text style={styles.label}>Scale</Text>
                <View style={styles.pillWrap}>
                    {scales.map(([name]) => (
                        <Pill key={name} label={name} active={name === scaleName} styles={styles} onPress={() => setScaleName(name)} />
                    ))}
                </View>

                <Text style={styles.label}>Key</Text>
                <View style={styles.pillWrap}>
                    {ROOTS.map(r => (
                        <Pill key={r} label={r} active={r === rootNote} styles={styles} onPress={() => setRootNote(r)} />
                    ))}
                </View>

                <Text style={styles.label}>Labels</Text>
                <View style={styles.pillWrap}>
                    <Pill label="Notes" active={!showIntervals} styles={styles} onPress={() => setShowIntervals(false)} />
                    <Pill label="Intervals" active={showIntervals} styles={styles} onPress={() => setShowIntervals(true)} />
                </View>

                <Text style={[styles.hint, { color: `${colors.ink}80` }]}>
                    Shapes are placed on the {ROMAN[degree]} chord of {rootNote} {scaleName}. Edit lib/Shapes/ScaleChords.layouts.ts,
                    save, and this updates (keep `npm run sync:mobile:watch` running).
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const makeStyles = (colors: Palette) =>
    StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.bg },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
        },
        back: { fontFamily: fonts.sans.semiBold, fontSize: 14, color: colors.ink },
        title: { fontFamily: fonts.sans.bold, fontSize: 16, color: colors.ink },
        fretboardBox: {
            marginHorizontal: spacing.md,
            borderRadius: radius.xl,
            backgroundColor: colors.sand2,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
        },
        empty: { fontFamily: fonts.sans.regular, fontSize: 13, color: `${colors.ink}99`, padding: spacing.md },
        body: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 2 },
        label: {
            marginTop: spacing.sm,
            fontFamily: fonts.sans.bold,
            fontSize: 11,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: `${colors.ink}99`,
        },
        pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
        pill: {
            paddingHorizontal: spacing.sm + 4,
            paddingVertical: spacing.xs + 2,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: `${colors.ink}40`,
        },
        pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
        pillText: { fontFamily: fonts.sans.semiBold, fontSize: 12, color: colors.ink },
        pillTextActive: { color: colors.sand1 },
        degreeRow: { gap: spacing.xs + 2 },
        degreeBtn: {
            minWidth: 64,
            alignItems: 'center',
            paddingVertical: spacing.xs + 2,
            paddingHorizontal: spacing.sm,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: `${colors.ink}40`,
        },
        degreeBtnActive: { backgroundColor: colors.ink, borderColor: colors.ink },
        degreeRoman: { fontFamily: fonts.sans.bold, fontSize: 13, color: colors.ink },
        degreeChord: { fontFamily: fonts.sans.regular, fontSize: 10, color: `${colors.ink}B3` },
        degreeTextActive: { color: colors.sand1 },
        degreeSpan: { marginTop: 2, fontFamily: fonts.sans.semiBold, fontSize: 11, color: colors.olive },
        degreeSpanWide: { color: colors.rootRed },
        registerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        stepBtn: {
            width: 32,
            height: 32,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: `${colors.ink}40`,
            alignItems: 'center',
            justifyContent: 'center',
        },
        stepText: { fontFamily: fonts.sans.bold, fontSize: 16, color: colors.ink },
        registerText: { fontFamily: fonts.sans.regular, fontSize: 12, color: colors.ink },
        rowCard: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            padding: spacing.sm + 2,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: `${colors.ink}33`,
        },
        rowCardActive: { borderColor: colors.ink, backgroundColor: colors.sand2 },
        rowText: { flex: 1, fontFamily: fonts.sans.medium, fontSize: 12, color: colors.ink },
        rowMeta: { fontFamily: fonts.sans.regular, fontSize: 10, color: `${colors.ink}80` },
        badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
        badgeApproved: { backgroundColor: colors.ink },
        badgeApprovedText: { fontFamily: fonts.sans.bold, fontSize: 10, color: colors.sand1 },
        badgeCandidate: { backgroundColor: `${colors.olive}33`, borderWidth: 1, borderColor: `${colors.olive}99` },
        badgeCandidateText: { fontFamily: fonts.sans.bold, fontSize: 10, color: colors.olive },
        badgeRemoved: { backgroundColor: `${colors.rootRed}22`, borderWidth: 1, borderColor: `${colors.rootRed}66` },
        badgeRemovedText: { fontFamily: fonts.sans.bold, fontSize: 10, color: colors.rootRed },
        hint: { marginTop: spacing.md, fontFamily: fonts.sans.regular, fontSize: 11, lineHeight: 16 },
    });
