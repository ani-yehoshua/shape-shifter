// Chords mode, ported from ../../../app/page.tsx on the website (the
// selectedMode === "chords" slice of it). Same state shape, same derivation
// logic (selectionHierarchy via useChordLibrary, voicingInfo's low/high
// octave split, capo-shifted display, category drill-down defaults), same
// controls -- root note, category -> voicing type -> string set -> chord
// quality -> position/"All", alt shapes (Pro-gated past the first), capo,
// handedness, notes/intervals, octave shift.
//
// Deferred to follow-up screens/commits, not silently dropped:
// - Randomize, Save/bookmark (needs lib/savedChords.ts + a `saved_chords`
//   Supabase round-trip), and the paywall UI itself (Pro-locked alt shapes
//   here just show a lock badge and don't advance past Main -- there's no
//   "upgrade" screen to send them to yet).
// - Draw Mode, Scales mode, Scale Chords mode -- each its own future tab.
// - Real audio: playChord/playNote are stubbed (see ../../lib/guitarAudio).
import { useEffect, useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import FretboardVertical from '../../components/FretboardVertical';
import NotesIntervalsToggle from '../../components/NotesIntervalsToggle';
import RootNoteButton from '../../components/RootNoteButton';
import CapoButton from '../../components/CapoButton';
import { allChordShapes, useCycleList } from '../../lib/API';
import { playChord } from '../../lib/guitarAudio';
import {
    generateAllVoicingsForShape,
    generateFretboardMap,
    NOTES,
    shuffleArray,
    type NotePosition,
} from '../../lib/fretboardMap';
import { STANDARD_TUNING, TUNINGS, type Tuning } from '../../lib/tunings';
import useChordLibrary from '../../lib/hooks/useChordLibrary';
import { useSubscription } from '../../lib/hooks/useSubscription';
import { colors, fonts, radius, spacing } from '../../lib/theme';

type ChordLevel = {
    levelName?: string;
    options?: Record<string, ChordLevel>;
    altShapes?: ChordLevel[];
    pattern?: Array<{ string: number; fretOffset: number; semitones: number; degree: number }>;
    rootString?: number;
    name?: string;
};

const SEMIS = [...Array(12).keys()];

function voicingFretRange(v: NotePosition[]) {
    const frets = v.map((n) => n.fret).filter((f): f is number => f != null && f >= 0);
    if (!frets.length) return null;
    return { min: Math.min(...frets), max: Math.max(...frets) };
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
    return (
        <Svg width={20} height={20} fill="none" stroke={colors.ink} strokeWidth={2} viewBox="0 0 24 24">
            <Path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={direction === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'}
            />
        </Svg>
    );
}

function StarIcon() {
    return (
        <Svg width={10} height={10} viewBox="0 0 24 24" fill={colors.sand1}>
            <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </Svg>
    );
}

function StrumIcon() {
    return (
        <Svg width={20} height={20} viewBox="12.5 7.5 175 175" fill={colors.ink}>
            <Path d="M 42 58 C 56 23 144 23 158 58 C 169 80 118 168 100 165 C 82 168 31 80 42 58 Z" />
        </Svg>
    );
}

function HandIcon({ flipped }: { flipped: boolean }) {
    return (
        <Svg
            width={20}
            height={20}
            viewBox="0 0 640 640"
            fill={colors.ink}
            style={flipped ? { transform: [{ scaleX: -1 }] } : undefined}
        >
            <Path d="M352 96C352 78.3 337.7 64 320 64C302.3 64 288 78.3 288 96L288 304C288 312.8 280.8 320 272 320C263.2 320 256 312.8 256 304L256 128C256 110.3 241.7 96 224 96C206.3 96 192 110.3 192 128L192 400C192 401.5 192 403.1 192.1 404.6L131.6 347C115.6 331.8 90.3 332.4 75 348.4C59.7 364.4 60.4 389.7 76.4 405L188.8 512C231.9 553.1 289.2 576 348.8 576L368 576C465.2 576 544 497.2 544 400L544 192C544 174.3 529.7 160 512 160C494.3 160 480 174.3 480 192L480 304C480 312.8 472.8 320 464 320C455.2 320 448 312.8 448 304L448 128C448 110.3 433.7 96 416 96C398.3 96 384 110.3 384 128L384 304C384 312.8 376.8 320 368 320C359.2 320 352 312.8 352 304L352 96z" />
        </Svg>
    );
}

export default function ChordsScreen() {
    const hasPro = useSubscription();

    const [currentRootNote, setCurrentRootNote] = useState('C');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedVoicingType, setSelectedVoicingType] = useState('');
    const [selectedStringSet, setSelectedStringSet] = useState('');
    const [selectedChordQuality, setSelectedChordQuality] = useState('');
    const [selectedPosition, setSelectedPosition] = useState('All');
    const [selectedAltShape, setSelectedAltShape] = useState(0);

    const [capo, setCapo] = useState(0);
    const [selectedTuning, setSelectedTuning] = useState<Tuning>(STANDARD_TUNING);
    const [isRight, setIsRight] = useState(true);
    const [showIntervals, setShowIntervals] = useState(false);
    const [octaveUp, setOctaveUp] = useState(false);
    const [noteDeck, setNoteDeck] = useState<number[]>([]);

    const [displayShape, setDisplayShape] = useState<NotePosition[]>([]);
    const [displayGroups, setDisplayGroups] = useState<NotePosition[][]>([]);
    const [menuOpen, setMenuOpen] = useState(false);

    const fretboardMap = useMemo(
        () => generateFretboardMap(selectedTuning.notes, 24),
        [selectedTuning],
    );

    const { selectionHierarchy, availableAlts } = useChordLibrary({
        allChordShapes,
        selectedCategory,
        selectedVoicingType,
        selectedStringSet,
        selectedChordQuality,
        selectedPosition,
    });

    const drillDownAndSetDefaults = (startLevel: ChordLevel | null | undefined) => {
        let currentLevel = startLevel;
        if (!currentLevel) return;
        let newVoicingType = '';
        let newStringSet = '';
        let newChordQuality = '';
        while (currentLevel && currentLevel.levelName && currentLevel.options) {
            const options: Record<string, ChordLevel> = currentLevel.options;
            const firstOption = Object.keys(options)[0];
            if (!firstOption) break;
            if (currentLevel.levelName === 'Voicing Types') newVoicingType = firstOption;
            else if (currentLevel.levelName === 'String Sets') newStringSet = firstOption;
            else if (currentLevel.levelName === 'Chord Qualities') newChordQuality = firstOption;
            currentLevel = currentLevel.options[firstOption];
        }
        setSelectedVoicingType(newVoicingType);
        setSelectedStringSet(newStringSet);
        setSelectedChordQuality(newChordQuality);
    };

    const handleCategoryChange = (newCategory: string) => {
        setSelectedCategory(newCategory);
        setSelectedPosition('All');
        setSelectedAltShape(0);
        setOctaveUp(false);
        drillDownAndSetDefaults((allChordShapes as Record<string, ChordLevel>)[newCategory]);
    };

    const getSetterForLevel = (levelName: string): ((v: string) => void) => {
        switch (levelName) {
            case 'Voicing Types':
                return (v) => {
                    setSelectedVoicingType(v);
                    setOctaveUp(false);
                };
            case 'String Sets':
                return (v) => {
                    setSelectedStringSet(v);
                    setOctaveUp(false);
                };
            case 'Chord Qualities':
                return (v) => {
                    setSelectedChordQuality(v);
                    setOctaveUp(false);
                };
            default:
                return () => {};
        }
    };

    // Validates selectedCategory on mount too (initial value is "").
    useEffect(() => {
        const categories = Object.keys(allChordShapes);
        if (!categories.includes(selectedCategory)) {
            const firstCategory = categories[0] || '';
            setSelectedCategory(firstCategory);
            drillDownAndSetDefaults((allChordShapes as Record<string, ChordLevel>)[firstCategory]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCategory]);

    const octaveFromDisplay = () => {
        const frets = displayShape.map((n) => n.fret).filter((f): f is number => f != null && f >= 0);
        if (!frets.length) return false;
        return (Math.min(...frets) + Math.max(...frets)) / 2 >= 12;
    };

    const handlePositionChange = (newPosition: string) => {
        setSelectedPosition(newPosition);
        setSelectedAltShape(0);
        setOctaveUp(octaveFromDisplay());
    };

    const { prev: goPrevPos, next: goNextPos } = useCycleList(
        selectionHierarchy.positions,
        selectedPosition,
        handlePositionChange,
        { allToken: 'All' },
    );

    const hasAlts = availableAlts.length > 1;
    const altsLocked = hasAlts && !hasPro;

    const handleAltChange = (i: number) => {
        if (i > 0 && !hasPro) return;
        setSelectedAltShape(i);
        setOctaveUp(octaveFromDisplay());
    };

    const { prev: goPrevAlt, next: goNextAlt } = useCycleList(
        availableAlts,
        selectedAltShape,
        handleAltChange,
    );

    const voicingInfo = useMemo(() => {
        if (selectedPosition === 'All' || !currentRootNote) return null;
        const formula = availableAlts[selectedAltShape] as any;
        if (!formula) return null;
        const all = generateAllVoicingsForShape(
            currentRootNote,
            formula,
            fretboardMap,
            selectedTuning.semitones,
        );
        const low: NotePosition[][] = [];
        const crossing: NotePosition[][] = [];
        const highAll: NotePosition[][] = [];
        for (const v of all) {
            const range = voicingFretRange(v);
            if (!range) continue;
            if (range.min >= 12) highAll.push(v);
            else if (range.max <= 12) low.push(v);
            else crossing.push(v);
        }
        const highRanges = highAll.map(voicingFretRange);
        const lowestHighMin =
            highRanges.length > 0
                ? Math.min(...highRanges.filter((r): r is NonNullable<typeof r> => r !== null).map((r) => r.min))
                : Infinity;
        const high = highAll.filter((_, i) => (highRanges[i]?.min ?? Infinity) === lowestHighMin);
        return { low, crossing, high, hasOctave: low.length > 0 && high.length > 0 };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPosition, currentRootNote, selectedAltShape, availableAlts, fretboardMap, selectedTuning.semitones]);

    useEffect(() => {
        const formulas = selectionHierarchy.finalFormulas;
        if (!currentRootNote || !formulas) {
            setDisplayShape([]);
            return;
        }
        const primaryShapes: NotePosition[][] = [];
        if (selectedPosition === 'All') {
            for (const posName in formulas) {
                primaryShapes.push(
                    ...generateAllVoicingsForShape(
                        currentRootNote,
                        formulas[posName],
                        fretboardMap,
                        selectedTuning.semitones,
                    ),
                );
            }
            setDisplayShape(primaryShapes.flat());
            setDisplayGroups(primaryShapes);
        } else {
            if (!voicingInfo) {
                setDisplayShape([]);
                setDisplayGroups([]);
                return;
            }
            const { low, crossing, high, hasOctave } = voicingInfo;
            const active = octaveUp && hasOctave ? high : [...low, ...crossing];
            setDisplayShape(active.flat());
            setDisplayGroups([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentRootNote, selectedPosition, selectionHierarchy.finalFormulas, fretboardMap, voicingInfo, octaveUp, selectedTuning.semitones]);

    const capoDisplayShape = useMemo(
        () =>
            capo === 0
                ? displayShape
                : displayShape.map((n) => ({ ...n, fret: n.fret != null ? n.fret + capo : n.fret })),
        [displayShape, capo],
    );
    const capoDisplayGroups = useMemo(
        () =>
            capo === 0
                ? displayGroups
                : displayGroups.map((group) =>
                      group.map((n) => ({ ...n, fret: n.fret != null ? n.fret + capo : n.fret })),
                  ),
        [displayGroups, capo],
    );

    const capoRootNote = useMemo(() => {
        if (capo === 0) return currentRootNote;
        const idx = NOTES.findIndex((pair) => pair.includes(currentRootNote));
        const shifted = NOTES[(idx + capo) % NOTES.length];
        return shifted[shifted.length - 1];
    }, [currentRootNote, capo]);

    const chordLabel =
        selectedCategory === 'CAGED' ? capoRootNote : `${capoRootNote} ${selectedChordQuality}`;

    const handleGenerateNewRoot = () => {
        const deck = noteDeck.length ? [...noteDeck] : shuffleArray(SEMIS);
        const nextSem = deck.pop()!;
        setNoteDeck(deck);
        const candidates = NOTES[nextSem];
        const simple = candidates.find((r) => !r.includes('#') && !r.includes('b')) || candidates[1] || candidates[0];
        setCurrentRootNote(simple);
    };

    const handedness = isRight ? 'right' : 'left';

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.headerText}>{chordLabel}</Text>
            </View>

            <View style={styles.fretboardArea}>
                <FretboardVertical
                    chordShape={capoDisplayShape}
                    handedness={handedness}
                    rootNote={capoRootNote}
                    showIntervals={showIntervals}
                    showConnector
                    chordGroups={capoDisplayGroups.length > 0 ? capoDisplayGroups : undefined}
                    playOnClick
                    capo={capo}
                    tuningFreqs={selectedTuning.freqs}
                />
            </View>

            {/* Position / alt-shape row */}
            <View style={styles.stepperRow}>
                <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.menuButton}>
                    <Text style={styles.menuButtonText}>Menu</Text>
                </TouchableOpacity>

                {voicingInfo?.hasOctave && (
                    <TouchableOpacity
                        onPress={() => setOctaveUp((o) => !o)}
                        style={[styles.pillButton, octaveUp && styles.pillButtonActive]}
                    >
                        <Text style={[styles.pillButtonText, octaveUp && styles.pillButtonTextActive]}>
                            {octaveUp ? '+12' : '-12'}
                        </Text>
                    </TouchableOpacity>
                )}

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ flex: 1 }}
                    contentContainerStyle={styles.stepperScrollContent}
                >
                    {selectionHierarchy.positions.length > 0 && (
                        <View style={styles.stepperGroup}>
                            <TouchableOpacity
                                onPress={() => handlePositionChange('All')}
                                style={[styles.allButton, selectedPosition === 'All' && styles.allButtonActive]}
                            >
                                <Text
                                    style={[
                                        styles.allButtonText,
                                        selectedPosition === 'All' && styles.allButtonTextActive,
                                    ]}
                                >
                                    All
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={goPrevPos} style={styles.chevronButton}>
                                <ChevronIcon direction="left" />
                            </TouchableOpacity>
                            <Text style={styles.stepperLabel}>
                                {selectionHierarchy.finalFormulas?.[selectedPosition]?.name || selectedPosition}
                            </Text>
                            <TouchableOpacity onPress={goNextPos} style={styles.chevronButton}>
                                <ChevronIcon direction="right" />
                            </TouchableOpacity>
                        </View>
                    )}

                    {hasAlts && (
                        <View style={styles.stepperGroup}>
                            <TouchableOpacity onPress={goPrevAlt} style={styles.chevronButton}>
                                <ChevronIcon direction="left" />
                            </TouchableOpacity>
                            <View style={styles.altLabelWrap}>
                                {altsLocked && (
                                    <View style={styles.lockBadge}>
                                        <StarIcon />
                                    </View>
                                )}
                                <Text style={[styles.stepperLabel, altsLocked && styles.altLabelLocked]}>
                                    {`${selectedAltShape + 1}/${availableAlts.length}`}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={goNextAlt} style={styles.chevronButton}>
                                <ChevronIcon direction="right" />
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </View>

            {/* Action bar */}
            <View style={styles.actionBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionScrollContent}>
                    <NotesIntervalsToggle showIntervals={showIntervals} onToggle={setShowIntervals} />

                    <TouchableOpacity onPress={() => setIsRight((r) => !r)} style={styles.iconButton}>
                        <HandIcon flipped={!isRight} />
                    </TouchableOpacity>

                    <CapoButton capo={capo} setCapo={setCapo} />

                    <TouchableOpacity
                        onPress={() => playChord(capoDisplayShape as any, selectedTuning.freqs)}
                        style={styles.iconButton}
                    >
                        <StrumIcon />
                    </TouchableOpacity>
                </ScrollView>

                <RootNoteButton
                    root={currentRootNote}
                    onSelect={setCurrentRootNote}
                    onRandom={handleGenerateNewRoot}
                    style={styles.rootButton}
                    textStyle={styles.rootButtonText}
                />
            </View>

            {/* Menu sheet: category -> voicing type -> string set -> chord quality, tuning */}
            <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
                <Pressable style={styles.sheetBackdrop} onPress={() => setMenuOpen(false)}>
                    <Pressable style={styles.sheet} onPress={() => {}}>
                        <ScrollView contentContainerStyle={styles.sheetContent}>
                            <Text style={styles.sheetSectionLabel}>Category</Text>
                            <View style={styles.pillWrap}>
                                {Object.keys(allChordShapes).map((cat) => (
                                    <TouchableOpacity
                                        key={cat}
                                        onPress={() => handleCategoryChange(cat)}
                                        style={[styles.pillButton, selectedCategory === cat && styles.pillButtonActive]}
                                    >
                                        <Text
                                            style={[
                                                styles.pillButtonText,
                                                selectedCategory === cat && styles.pillButtonTextActive,
                                            ]}
                                        >
                                            {cat}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {selectionHierarchy.subLevels.map((level) => {
                                const setter = getSetterForLevel(level.levelName);
                                const selectedValue =
                                    level.levelName === 'Voicing Types'
                                        ? selectedVoicingType
                                        : level.levelName === 'String Sets'
                                          ? selectedStringSet
                                          : selectedChordQuality;
                                return (
                                    <View key={level.levelName}>
                                        <Text style={styles.sheetSectionLabel}>{level.levelName}</Text>
                                        <View style={styles.pillWrap}>
                                            {level.options.map((option) => (
                                                <TouchableOpacity
                                                    key={option}
                                                    onPress={() => setter(option)}
                                                    style={[
                                                        styles.pillButton,
                                                        selectedValue === option && styles.pillButtonActive,
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.pillButtonText,
                                                            selectedValue === option && styles.pillButtonTextActive,
                                                        ]}
                                                    >
                                                        {option}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </View>
                                );
                            })}

                            <Text style={styles.sheetSectionLabel}>Tuning</Text>
                            <View style={styles.pillWrap}>
                                {TUNINGS.map((t) => (
                                    <TouchableOpacity
                                        key={t.name}
                                        onPress={() => setSelectedTuning(t)}
                                        style={[
                                            styles.pillButton,
                                            selectedTuning.name === t.name && styles.pillButtonActive,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.pillButtonText,
                                                selectedTuning.name === t.name && styles.pillButtonTextActive,
                                            ]}
                                        >
                                            {t.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>

                        <TouchableOpacity onPress={() => setMenuOpen(false)} style={styles.sheetDoneButton}>
                            <Text style={styles.sheetDoneText}>Done</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        alignItems: 'center',
        paddingTop: spacing.xs,
    },
    headerText: {
        fontFamily: fonts.sans.bold,
        fontSize: 22,
        color: colors.ink,
    },
    fretboardArea: {
        flex: 1,
        minHeight: 0,
    },
    stepperRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs + 2,
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
        backgroundColor: colors.bg,
        minHeight: 44,
    },
    stepperScrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: spacing.xs,
    },
    stepperGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    menuButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    menuButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
    },
    allButton: {
        paddingHorizontal: spacing.xs + 4,
        paddingVertical: 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    allButtonActive: {
        backgroundColor: colors.ink,
        borderColor: colors.ink,
    },
    allButtonText: {
        fontFamily: fonts.sans.bold,
        fontSize: 11,
        color: colors.ink,
    },
    allButtonTextActive: {
        color: colors.sand1,
    },
    chevronButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepperLabel: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
        minWidth: 56,
        textAlign: 'center',
    },
    altLabelWrap: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    lockBadge: {
        position: 'absolute',
        top: -8,
        right: -6,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.olive,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    altLabelLocked: {
        opacity: 0.5,
    },
    actionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.sm,
        paddingBottom: spacing.md,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
        backgroundColor: colors.bg,
    },
    actionScrollContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingRight: spacing.sm,
    },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rootButton: {
        paddingHorizontal: spacing.md + 4,
        paddingVertical: spacing.sm + 2,
        borderRadius: radius.pill,
        backgroundColor: colors.ink,
    },
    rootButtonText: {
        fontFamily: fonts.sans.bold,
        fontSize: 14,
        color: colors.sand1,
    },
    sheetBackdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    sheet: {
        maxHeight: '80%',
        backgroundColor: colors.bg,
        borderTopLeftRadius: radius['2xl'],
        borderTopRightRadius: radius['2xl'],
        paddingTop: spacing.sm,
    },
    sheetContent: {
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.md,
        gap: spacing.md,
    },
    sheetSectionLabel: {
        fontFamily: fonts.sans.bold,
        fontSize: 10,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: `${colors.ink}80`,
        marginBottom: spacing.xs,
    },
    pillWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs + 2,
    },
    pillButton: {
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    pillButtonActive: {
        backgroundColor: colors.surface,
        borderColor: colors.ink,
    },
    pillButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
    },
    pillButtonTextActive: {
        color: colors.onSurface,
    },
    sheetDoneButton: {
        marginHorizontal: spacing.md,
        marginBottom: spacing.lg,
        paddingVertical: spacing.sm + 4,
        borderRadius: radius.pill,
        backgroundColor: colors.ink,
        alignItems: 'center',
    },
    sheetDoneText: {
        fontFamily: fonts.sans.bold,
        fontSize: 14,
        color: colors.sand1,
    },
});
