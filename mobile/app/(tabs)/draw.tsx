// Draw Mode tab. Faithful port of the mobile (sm:hidden) layout branch of
// ../../../components/DrawMode.tsx on the website -- the desktop branch is
// the same state/logic rendered differently for wide screens, so it isn't
// ported (this app is phone-only, same reasoning as the website's
// NotesIntervalsToggle/CapoButton mobile-variant-only ports).
//
// Unlike the website, where DrawMode is an overlay toggled from the shared
// page.tsx state (capo/tuning/save/progression all passed down as props),
// this app already splits each mode into its own tab screen (see
// (tabs)/index.tsx for Chords mode) -- so Draw Mode owns its own local
// capo/tuning state here instead of receiving it as props, and there's a
// small tuning-picker Modal added (the website's tuning picker lives in the
// shared page-level menu, which doesn't exist in this per-tab architecture).
//
// Deferred, not in this screen: Save and Add-to-Progression actions (need
// lib/savedChords.ts / a progressions store, same as the Chords screen's
// deferred scope) -- the website guards those buttons on `onSaveRequest`/
// `onProgressionRequest` being passed in; here they're simply omitted since
// there's nowhere to save to yet. Real audio (playNote/playChord) remains
// stubbed per the earlier guitarAudio.ts commit.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import CapoButton from '../../components/CapoButton';
import FretboardVertical from '../../components/FretboardVertical';
import NotesIntervalsToggle from '../../components/NotesIntervalsToggle';
import {
    allChordShapes,
    getFinalFormulasFromMatch,
    useCycleList,
} from '../../lib/API';
import { generateAllVoicingsForShape } from '../../lib/fretboardMap';
import type { NotePosition } from '../../lib/fretboardMap';
import { keyFromSelection, useDrawModeIndex } from '../../lib/hooks/useDrawModeIndex';
import { playChord, playNote } from '../../lib/guitarAudio';
import { noteNameToSemitone, spellNote } from '../../lib/MusicTheory';
import { CHORD_SHAPES } from '../../lib/Shapes/Chords';
import { SCALE_SHAPES } from '../../lib/Shapes/Scales';
import { colors, fonts, radius, spacing } from '../../lib/theme';
import { STANDARD_TUNING, TUNINGS } from '../../lib/tunings';

const QUALITY_DISPLAY: Record<string, string> = {
    Maj: 'Major',
    Min: 'Minor',
    Aug: 'Augmented',
    Dim: 'Diminished',
    Maj7: 'Maj7',
    Dom7: 'Dom7',
    Min7: 'Min7',
    mMaj7: 'mMaj7',
    Min7b5: 'Min7b5',
    Dim7: 'Dim7',
};

type ChordNode = {
    levelName?: string;
    options?: Record<string, ChordNode>;
    pattern?: { semitones: number }[];
    altShapes?: ChordNode[];
};

function getPatternSemitones(formula: ChordNode): number[] | null {
    if (!Array.isArray(formula.pattern)) return null;
    const semis = [...new Set(formula.pattern.map((n) => n.semitones))].sort((a, b) => a - b);
    return semis.length >= 2 ? semis : null;
}

function registerFormula(formula: ChordNode, displayName: string, map: Map<string, string>) {
    const semis = getPatternSemitones(formula);
    if (semis) {
        const key = semis.join(',');
        if (!map.has(key)) map.set(key, displayName);
    }
    if (Array.isArray(formula.altShapes)) {
        for (const alt of formula.altShapes) {
            const altSemis = getPatternSemitones(alt);
            if (altSemis) {
                const key = altSemis.join(',');
                if (!map.has(key)) map.set(key, displayName);
            }
        }
    }
}

function buildChordQualityMap(shapes: ChordNode): Map<string, string> {
    const map = new Map<string, string>();

    function crawl(node: ChordNode) {
        if (!node || typeof node !== 'object') return;
        if (node.levelName === 'Chord Qualities' && node.options) {
            for (const [qualityKey, qualityNode] of Object.entries(node.options)) {
                const displayName = QUALITY_DISPLAY[qualityKey] ?? qualityKey;
                if (qualityNode.levelName === 'Positions' && qualityNode.options) {
                    for (const formula of Object.values(qualityNode.options)) {
                        registerFormula(formula, displayName, map);
                    }
                }
            }
            return;
        }
        if (node.options) {
            for (const child of Object.values(node.options)) crawl(child);
        }
    }

    for (const topLevel of Object.values(shapes)) {
        if (topLevel && typeof topLevel === 'object') crawl(topLevel as ChordNode);
    }
    return map;
}

const CHORD_QUALITY_MAP = buildChordQualityMap(CHORD_SHAPES as unknown as ChordNode);

const NUM_FRETS = 24;
const NOTES = [
    'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
];

const CANONICAL_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const INTERVAL_NAMES: Record<number, string> = {
    0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5',
    7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

const DEGREE_INDEX_BY_SEMITONES: Record<number, number> = {
    0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6,
};

function semitonesToDegreeNumber(semi: number): number {
    const idx = DEGREE_INDEX_BY_SEMITONES[semi];
    return idx === 0 ? 1 : idx + 1;
}

const NATURAL_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

function spellDegree(semitone: number, degreeNum: number): string {
    const natural = NATURAL_SEMITONES[degreeNum - 1];
    const diff = semitone - natural;
    const base = String(degreeNum);
    if (diff === 0) return base;
    if (diff === -1) return `b${base}`;
    if (diff === 1) return `#${base}`;
    if (diff === -2) return `bb${base}`;
    if (diff === 2) return `##${base}`;
    return base;
}

const wrap12 = (n: number) => ((n % 12) + 12) % 12;

type FlatChordMatch = {
    qualityKey: string;
    displayLabel: string;
    contextLabel: string;
    finalFormulas: Record<string, any>;
    posKey: string;
};

function findChordsAtPositions(
    drawnSemis: number[],
    drawnPositions: Map<number, number>,
    shapes: Record<string, any>,
    root: string,
    fretboardMap: string[][],
    pitchOnly = false,
): FlatChordMatch[] {
    if (!drawnSemis.length) return [];
    const results: FlatChordMatch[] = [];

    function semisMatch(formula: any): boolean {
        if (!Array.isArray(formula?.pattern)) return false;
        const semis = new Set<number>(formula.pattern.map((n: any) => n.semitones as number));
        return drawnSemis.every((s) => semis.has(s));
    }

    function voicingCoversPositions(formula: any): boolean {
        if (pitchOnly) return true;
        const raw = generateAllVoicingsForShape(root, formula, fretboardMap) || [];
        const voicings: NotePosition[][] = Array.isArray(raw[0]) ? (raw as any) : [raw as any];
        return voicings.some((v) =>
            [...drawnPositions.entries()].every(([s, f]) =>
                v.some((n: NotePosition) => n.string === s && n.fret === f),
            ),
        );
    }

    function formulaMatches(formula: any): boolean {
        if (!semisMatch(formula)) return false;
        return voicingCoversPositions(formula);
    }

    function anyFormulaMatches(formula: any): boolean {
        if (formulaMatches(formula)) return true;
        if (Array.isArray(formula?.altShapes)) {
            return formula.altShapes.some((alt: any) => formulaMatches(alt));
        }
        return false;
    }

    function isPosBag(options: Record<string, any>): boolean {
        const v = Object.values(options)[0] as any;
        return !!v && typeof v === 'object' && ('pattern' in v || 'altShapes' in v);
    }

    function walk(node: any, pathSegments: string[], qualityKey: string | null) {
        if (!node || typeof node !== 'object') return;
        if (node.options && isPosBag(node.options)) {
            if (!qualityKey) return;
            const matchingPosKey = Object.keys(node.options).find((pk) =>
                anyFormulaMatches(node.options[pk]),
            );
            if (matchingPosKey !== undefined) {
                results.push({
                    qualityKey,
                    displayLabel: QUALITY_DISPLAY[qualityKey] ?? qualityKey,
                    contextLabel: pathSegments.slice(1, -1).join(' · '),
                    finalFormulas: node.options,
                    posKey: matchingPosKey,
                });
            }
            return;
        }
        if (node.options) {
            const isQualityLevel = node.levelName === 'Chord Qualities';
            for (const [key, child] of Object.entries(node.options)) {
                walk(child, [...pathSegments, key], isQualityLevel ? key : qualityKey);
            }
        }
    }

    for (const [category, node] of Object.entries(shapes)) {
        walk(node, [category], null);
    }

    return results;
}

const CHROMATIC_INTERVALS = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

function intervalSemitones(rootName: string, targetName: string): number {
    return wrap12(noteNameToSemitone(targetName) - noteNameToSemitone(rootName));
}

function firstEnharmonic(cell: string): string {
    return (cell || '').split('/')[0];
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
    const d = direction === 'left' ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7';
    return (
        <Svg width={20} height={20} fill="none" stroke={colors.ink} strokeWidth={2} viewBox="0 0 24 24">
            <Path strokeLinecap="round" strokeLinejoin="round" d={d} />
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

function HandIcon({ flipped = false }: { flipped?: boolean }) {
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

export default function DrawModeScreen() {
    const [root, setRoot] = useState('C');
    const [showIntervals, setShowIntervals] = useState(false);
    const [rootMenuOpen, setRootMenuOpen] = useState(false);
    const [isRight, setIsRight] = useState(true);
    const [capo, setCapo] = useState(0);
    const [selectedTuning, setSelectedTuning] = useState(STANDARD_TUNING);
    const [tuningMenuOpen, setTuningMenuOpen] = useState(false);
    // Set of "string:fret" keys -- allows multiple notes per string for scale drawing
    const [selected, setSelected] = useState(new Set<string>());
    const [matchInfo, setMatchInfo] = useState<any>(null);
    const [selectedPosition, setSelectedPosition] = useState('');
    const [selectedAltShape, setSelectedAltShape] = useState(0);
    const [browsedVoicing, setBrowsedVoicing] = useState<NotePosition[] | null>(null);

    const [pickedChord, setPickedChord] = useState<{
        finalFormulas: Record<string, any>;
        posKey: string;
        label: string;
    } | null>(null);
    const [anchored, setAnchored] = useState(false);
    const [anchorMatches, setAnchorMatches] = useState<FlatChordMatch[]>([]);
    const [anchorIndex, setAnchorIndex] = useState(0);
    const [chordPickerOpen, setChordPickerOpen] = useState(false);
    const [octaveUp, setOctaveUp] = useState(false);
    const [pivotKey, setPivotKey] = useState<string | null>(null);
    const [pivotInterval, setPivotInterval] = useState(0);

    const handedness = isRight ? 'right' : 'left';
    const tuning = selectedTuning.notes;
    const tuningFreqs = selectedTuning.freqs;

    const { index, fretboardMap } = useDrawModeIndex({
        allChordShapes,
        tuning,
        numFrets: NUM_FRETS,
        rootNote: root,
    });

    const effectiveRoot = useMemo(() => {
        if (!pivotKey) return root;
        const [s, f] = pivotKey.split(':').map(Number);
        const cell = fretboardMap[s]?.[f];
        if (!cell) return root;
        const noteSemi = noteNameToSemitone(firstEnharmonic(cell));
        return CANONICAL_ROOTS[wrap12(noteSemi - pivotInterval)];
    }, [pivotKey, pivotInterval, root, fretboardMap]);

    const { finalFormulas, posKey } = useMemo(() => {
        if (pickedChord) {
            return { finalFormulas: pickedChord.finalFormulas, posKey: pickedChord.posKey };
        }
        return getFinalFormulasFromMatch(allChordShapes, matchInfo);
    }, [matchInfo, pickedChord]);

    // One-note-per-string map derived from selected -- used for chord matching only
    const selectedAsMap = useMemo(() => {
        const map = new Map<number, number>();
        for (const key of selected) {
            const [s, f] = key.split(':').map(Number);
            if (!map.has(s) || f < map.get(s)!) map.set(s, f);
        }
        return map;
    }, [selected]);

    const toggle = (string: number, fret: number) => {
        const key = `${string}:${fret}`;
        if (anchored) {
            if (!selected.has(key)) return;
            const newSelected = new Set(selected);
            newSelected.delete(key);
            setSelected(newSelected);

            if (newSelected.size === 0) {
                setAnchored(false);
                setAnchorMatches([]);
                setAnchorIndex(0);
                setPickedChord(null);
                setBrowsedVoicing(null);
                return;
            }

            const newMap = new Map<number, number>();
            for (const k of newSelected) {
                const [s, f] = k.split(':').map(Number);
                if (!newMap.has(s) || f < newMap.get(s)!) newMap.set(s, f);
            }
            const newSemis = [
                ...new Set(
                    [...newMap.entries()]
                        .map(([s, f]) => {
                            const cell = fretboardMap[s]?.[f];
                            if (!cell) return -1;
                            return wrap12(
                                noteNameToSemitone(firstEnharmonic(cell)) - noteNameToSemitone(effectiveRoot),
                            );
                        })
                        .filter((s) => s >= 0),
                ),
            ].sort((a, b) => a - b);

            const matches = findChordsAtPositions(newSemis, newMap, allChordShapes, effectiveRoot, fretboardMap);
            setAnchorMatches(matches);
            setAnchorIndex(0);
            if (matches[0]) {
                const match = matches[0];
                setPickedChord({
                    finalFormulas: match.finalFormulas,
                    posKey: match.posKey,
                    label: match.displayLabel,
                });
                setSelectedPosition(match.posKey);
                setSelectedAltShape(0);
                setOctaveUp(false);
                const posData = match.finalFormulas[match.posKey] as any;
                const variants = [posData, ...(Array.isArray(posData.altShapes) ? posData.altShapes : [])];
                let picked: NotePosition[] | null = null;
                for (const formula of variants) {
                    const raw = generateAllVoicingsForShape(root, formula, fretboardMap) || [];
                    const voicings: NotePosition[][] = Array.isArray(raw[0]) ? (raw as any) : [raw as any];
                    const hit = voicings.find((v) =>
                        [...newMap.entries()].every(([s, f]) =>
                            (v as NotePosition[]).some((n) => n.string === s && n.fret === f),
                        ),
                    );
                    if (hit) {
                        picked = (hit as NotePosition[])
                            .slice()
                            .sort((a, b) => a.string - b.string || (a.fret ?? 0) - (b.fret ?? 0));
                        break;
                    }
                }
                setBrowsedVoicing(picked);
            } else {
                setPickedChord(null);
                setBrowsedVoicing(null);
            }
            return;
        }
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else {
                next.add(key);
                playNote(string, fret, tuningFreqs);
            }
            return next;
        });
    };

    useEffect(() => {
        setSelected(new Set());
        setAnchored(false);
        setAnchorMatches([]);
        setAnchorIndex(0);
        setPickedChord(null);
        setBrowsedVoicing(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [capo]);

    const clearAll = () => {
        setSelected(new Set());
        setAnchored(false);
        setAnchorMatches([]);
        setAnchorIndex(0);
        setPickedChord(null);
        setBrowsedVoicing(null);
        setPivotKey(null);
        setPivotInterval(0);
        setChordPickerOpen(false);
    };

    const pickVoicingFor = (
        posKeyToUse: string,
        altIdxToUse: number,
        useOctaveUp = false,
        anchorPositions?: Map<number, number>,
    ): NotePosition[] | null => {
        if (!finalFormulas || !finalFormulas[posKeyToUse]) return null;
        const posData = finalFormulas[posKeyToUse] as any;
        const variants = [posData, ...(Array.isArray(posData.altShapes) ? posData.altShapes : [])];
        const formula = variants[altIdxToUse] ?? posData;
        if (!formula) return null;
        const raw = generateAllVoicingsForShape(effectiveRoot, formula, fretboardMap) || [];
        const allVoicings: NotePosition[][] = Array.isArray(raw[0]) ? (raw as any) : [raw as any];

        const low: NotePosition[][] = [];
        const crossing: NotePosition[][] = [];
        const high: NotePosition[][] = [];
        for (const v of allVoicings) {
            const frets = (v as NotePosition[]).map((n) => n.fret).filter((f): f is number => f != null && f >= 0);
            if (!frets.length) {
                crossing.push(v);
                continue;
            }
            const min = Math.min(...frets);
            const max = Math.max(...frets);
            if (max <= 12) low.push(v);
            else if (min >= 12) high.push(v);
            else crossing.push(v);
        }
        const hasOct = low.length > 0 && high.length > 0;
        const pool = useOctaveUp && hasOct ? high : [...low, ...crossing];

        const best =
            anchorPositions && anchorPositions.size > 0
                ? pool.find((v) =>
                      [...anchorPositions.entries()].every(([s, f]) =>
                          (v as NotePosition[]).some((n) => n.string === s && n.fret === f),
                      ),
                  ) ||
                  pool[0] ||
                  allVoicings[0]
                : pool.find(
                      (v) =>
                          Array.isArray(v) &&
                          v.length === selectedAsMap.size &&
                          v.every((n: any) => new Set(selectedAsMap.keys()).has(n.string)),
                  ) ||
                  pool[0] ||
                  allVoicings[0];

        if (!best) return null;
        return (best as NotePosition[]).slice().sort((a, b) => a.string - b.string || (a.fret ?? 0) - (b.fret ?? 0));
    };

    const hasOctave = useMemo(() => {
        if (!finalFormulas || !selectedPosition || !finalFormulas[selectedPosition]) return false;
        const posData = finalFormulas[selectedPosition] as any;
        const variants = [posData, ...(Array.isArray(posData.altShapes) ? posData.altShapes : [])];
        const formula = variants[selectedAltShape] ?? posData;
        if (!Array.isArray(formula?.pattern)) return false;
        const raw = generateAllVoicingsForShape(effectiveRoot, formula, fretboardMap) || [];
        const voicings: NotePosition[][] = Array.isArray(raw[0]) ? (raw as any) : [raw as any];
        const hasLow = voicings.some((v) => {
            const frets = v.map((n) => n.fret).filter((f): f is number => f != null && f >= 0);
            return frets.length > 0 && Math.max(...frets) <= 12;
        });
        const hasHigh = voicings.some((v) => {
            const frets = v.map((n) => n.fret).filter((f): f is number => f != null && f >= 0);
            return frets.length > 0 && Math.min(...frets) >= 12;
        });
        return hasLow && hasHigh;
    }, [finalFormulas, selectedPosition, selectedAltShape, effectiveRoot, fretboardMap]);

    // Re-pick voicing when octave toggle changes
    useEffect(() => {
        if (selectedPosition) {
            setBrowsedVoicing(pickVoicingFor(selectedPosition, selectedAltShape, octaveUp));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [octaveUp]);

    const chordShape: NotePosition[] = useMemo(() => {
        if (browsedVoicing?.length) return browsedVoicing;
        const shape: NotePosition[] = [];
        for (const key of selected) {
            const [string, fret] = key.split(':').map(Number);
            const cell = fretboardMap[string]?.[fret];
            if (!cell) continue;
            const name = firstEnharmonic(cell);
            const semis = intervalSemitones(effectiveRoot, name);
            shape.push({ string, fret, semitones: semis, degree: semitonesToDegreeNumber(semis) });
        }
        return shape.sort((a, b) => a.string - b.string || (a.fret ?? 0) - (b.fret ?? 0));
    }, [selected, fretboardMap, effectiveRoot, browsedVoicing]);

    const applyAnchorMatch = (match: FlatChordMatch) => {
        setPickedChord({ finalFormulas: match.finalFormulas, posKey: match.posKey, label: match.displayLabel });
        setSelectedPosition(match.posKey);
        setSelectedAltShape(0);
        setOctaveUp(false);

        const posData = match.finalFormulas[match.posKey] as any;
        const variants = [posData, ...(Array.isArray(posData.altShapes) ? posData.altShapes : [])];
        for (const formula of variants) {
            const raw = generateAllVoicingsForShape(effectiveRoot, formula, fretboardMap) || [];
            const voicings: NotePosition[][] = Array.isArray(raw[0]) ? (raw as any) : [raw as any];
            const hit = voicings.find((v) =>
                [...selectedAsMap.entries()].every(([s, f]) =>
                    (v as NotePosition[]).some((n) => n.string === s && n.fret === f),
                ),
            );
            if (hit) {
                setBrowsedVoicing(
                    (hit as NotePosition[]).slice().sort((a, b) => a.string - b.string || (a.fret ?? 0) - (b.fret ?? 0)),
                );
                return;
            }
        }
        setBrowsedVoicing(null);
    };

    const handleAnchor = () => {
        if (anchored) {
            setAnchored(false);
            setAnchorMatches([]);
            setAnchorIndex(0);
            setPickedChord(null);
            setPivotKey(null);
            setPivotInterval(0);
            setChordPickerOpen(false);
            return;
        }
        const drawnSemis = [...new Set(chordShape.map((n) => n.semitones ?? 0))].sort((a, b) => a - b);
        const matches = findChordsAtPositions(drawnSemis, selectedAsMap, allChordShapes, effectiveRoot, fretboardMap);
        setAnchorMatches(matches);
        setAnchorIndex(0);
        setAnchored(true);
        if (matches[0]) applyAnchorMatch(matches[0]);
    };

    const stepAnchor = (dir: 1 | -1) => {
        setAnchorIndex((prev) => {
            const next = (prev + dir + anchorMatches.length) % anchorMatches.length;
            applyAnchorMatch(anchorMatches[next]);
            return next;
        });
    };

    // Re-run anchor search when pivot changes the effective root
    useEffect(() => {
        if (!pivotKey || !selected.size) return;
        const newSemis = [
            ...new Set(
                [...selectedAsMap.entries()]
                    .map(([s, f]) => {
                        const cell = fretboardMap[s]?.[f];
                        if (!cell) return -1;
                        return wrap12(noteNameToSemitone(firstEnharmonic(cell)) - noteNameToSemitone(effectiveRoot));
                    })
                    .filter((v) => v >= 0),
            ),
        ].sort((a, b) => a - b);
        const matches = findChordsAtPositions(newSemis, selectedAsMap, allChordShapes, effectiveRoot, fretboardMap);
        setAnchorMatches(matches);
        setAnchorIndex(0);
        setAnchored(true);
        if (matches[0]) applyAnchorMatch(matches[0]);
        else {
            setPickedChord(null);
            setBrowsedVoicing(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveRoot]);

    // Clear pivot when user changes the root picker
    useEffect(() => {
        setPivotKey(null);
        setPivotInterval(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [root]);

    // Clear pivot when selection is fully cleared
    useEffect(() => {
        if (selected.size === 0) {
            setPivotKey(null);
            setPivotInterval(0);
            setChordPickerOpen(false);
        }
    }, [selected]);

    const selectedNoteInfos = useMemo(() => {
        return [...selected]
            .map((key) => {
                const [s, f] = key.split(':').map(Number);
                const cell = fretboardMap[s]?.[f];
                if (!cell) return null;
                const intervalSemi = wrap12(
                    noteNameToSemitone(firstEnharmonic(cell)) - noteNameToSemitone(effectiveRoot),
                );
                const degreeNum = semitonesToDegreeNumber(intervalSemi);
                const noteName = spellNote(effectiveRoot, intervalSemi, degreeNum);
                return {
                    key,
                    noteName,
                    intervalSemi,
                    intervalName: INTERVAL_NAMES[intervalSemi] ?? '?',
                };
            })
            .filter(Boolean) as Array<{ key: string; noteName: string; intervalSemi: number; intervalName: string }>;
    }, [selected, fretboardMap, effectiveRoot]);

    const nudgeNote = (key: string, dir: 1 | -1) => {
        const [s, f] = key.split(':').map(Number);
        const newFret = f + dir;
        if (newFret < 0 || newFret > NUM_FRETS) return;
        const newKey = `${s}:${newFret}`;
        setSelected((prev) => {
            const next = new Set<string>();
            for (const k of prev) next.add(k === key ? newKey : k);
            return next;
        });
        if (anchored) {
            setAnchored(false);
            setAnchorMatches([]);
            setAnchorIndex(0);
            setPickedChord(null);
            setBrowsedVoicing(null);
        }
    };

    type ScaleMatch = {
        scaleName: string;
        modeName?: string;
        exact: boolean;
        degreeMap: Map<number, number> | null;
    };
    const scaleMatches = useMemo((): ScaleMatch[] => {
        const drawnSemis = [...new Set(chordShape.map((n) => n.semitones ?? 0))].sort((a, b) => a - b);
        if (drawnSemis.length < 3) return [];

        const results: ScaleMatch[] = [];
        for (const scales of Object.values(SCALE_SHAPES)) {
            for (const entry of Object.values(scales) as any[]) {
                for (let d = 0; d < entry.intervals.length; d++) {
                    const pivot = entry.intervals[d];
                    const rotatedArr = entry.intervals.map((i: number) => (i - pivot + 12) % 12).sort((a: number, b: number) => a - b);
                    const rotated = new Set(rotatedArr);
                    if (!drawnSemis.every((s) => rotated.has(s))) continue;
                    const degreeMap =
                        rotatedArr.length === 7
                            ? new Map<number, number>(rotatedArr.map((s: number, idx: number) => [s, idx + 1]))
                            : null;
                    results.push({
                        scaleName: entry.name,
                        modeName: entry.positions[d]?.modeName,
                        exact: drawnSemis.length === rotated.size,
                        degreeMap,
                    });
                }
            }
        }

        const seen = new Set<string>();
        return results
            .sort((a, b) => Number(b.exact) - Number(a.exact))
            .filter((r) => {
                const key = `${r.scaleName}|${r.modeName ?? ''}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, [chordShape]);

    const spellDegreeMap = useMemo(
        () => scaleMatches.find((m) => m.degreeMap != null)?.degreeMap ?? null,
        [scaleMatches],
    );

    const drawnNotes = useMemo(() => {
        const semis = [...new Set(chordShape.map((n) => n.semitones ?? 0))].sort((a, b) => a - b);
        return semis
            .map((s) => {
                const deg = spellDegreeMap?.get(s) ?? semitonesToDegreeNumber(s);
                return spellNote(effectiveRoot, s, deg);
            })
            .join('  ');
    }, [chordShape, effectiveRoot, spellDegreeMap]);

    const drawnIntervals = useMemo(() => {
        const semis = [...new Set(chordShape.map((n) => n.semitones ?? 0))].sort((a, b) => a - b);
        return semis
            .map((s) => {
                if (spellDegreeMap) {
                    const deg = spellDegreeMap.get(s);
                    if (deg != null) return spellDegree(s, deg);
                }
                return CHROMATIC_INTERVALS[s] ?? '?';
            })
            .join('  ');
    }, [chordShape, spellDegreeMap]);

    const freeformLabel = showIntervals ? drawnIntervals : drawnNotes;

    const correctedChordShape = useMemo(() => {
        if (!spellDegreeMap) return chordShape;
        return chordShape.map((pos) => {
            const deg = spellDegreeMap.get(pos.semitones ?? 0);
            return deg != null ? { ...pos, degree: deg } : pos;
        });
    }, [chordShape, spellDegreeMap]);

    useEffect(() => {
        if (!selectedAsMap.size) {
            setMatchInfo(null);
            return;
        }
        const hit = index.get(`${root}::${keyFromSelection(selectedAsMap)}`) || null;
        setMatchInfo(hit);
    }, [selectedAsMap, index, root]);

    const positions = useMemo(() => (finalFormulas ? Object.keys(finalFormulas) : []), [finalFormulas]);

    useEffect(() => {
        if (pickedChord) return;
        if (!matchInfo || !finalFormulas) {
            setSelectedPosition('');
            setSelectedAltShape(0);
            return;
        }
        const keys = Object.keys(finalFormulas);
        if (!selectedPosition || !finalFormulas[selectedPosition]) {
            setSelectedPosition(posKey && finalFormulas[posKey] ? posKey : keys[0] || '');
        }
        const posData = finalFormulas[selectedPosition || posKey || keys[0]] as any;
        const altCount = 1 + (posData?.altShapes?.length || 0);
        if (selectedAltShape >= altCount) setSelectedAltShape(0);
    }, [matchInfo, finalFormulas, posKey, selectedPosition, selectedAltShape, pickedChord]);

    const chordIntervalMatch = useMemo(() => {
        if (!chordShape.length) return null;
        const semis = [...new Set(chordShape.map((n) => n.semitones ?? 0))].sort((a, b) => a - b);
        return CHORD_QUALITY_MAP.get(semis.join(',')) ?? null;
    }, [chordShape]);

    const chordIntervalLabel = chordIntervalMatch ? `${effectiveRoot} ${chordIntervalMatch}` : '';

    const lastFamilyRef = useRef('');
    const familyKey = matchInfo
        ? `${matchInfo.difficulty}|${matchInfo.category}|${(matchInfo.trail || []).join('>')}`
        : '';

    useEffect(() => {
        if (pickedChord) return;
        if (!matchInfo || !finalFormulas) {
            setSelectedPosition('');
            setSelectedAltShape(0);
            lastFamilyRef.current = '';
            return;
        }
        if (familyKey !== lastFamilyRef.current) {
            lastFamilyRef.current = familyKey;
            const keys = Object.keys(finalFormulas);
            const nextPos = matchInfo.posKey && finalFormulas[matchInfo.posKey] ? matchInfo.posKey : keys[0] || '';
            setSelectedPosition(nextPos);
            const altCount = 1 + ((finalFormulas[nextPos] as any)?.altShapes?.length || 0);
            setSelectedAltShape(Math.min(matchInfo.altIdx ?? 0, altCount - 1));
        }
    }, [familyKey, matchInfo, finalFormulas, root, pickedChord]);

    useEffect(() => {
        if (anchored) return;
        setBrowsedVoicing(null);
        setPickedChord(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected]);
    useEffect(() => {
        setBrowsedVoicing(null);
    }, [familyKey]);

    const availableAltsForUI = useMemo(() => {
        if (!finalFormulas || !selectedPosition || !finalFormulas[selectedPosition]) return [];
        const base = finalFormulas[selectedPosition] as any;
        return [base, ...(Array.isArray(base.altShapes) ? base.altShapes : [])];
    }, [finalFormulas, selectedPosition]);

    const safeCurrent = positions.includes(selectedPosition) ? selectedPosition : positions[0] || '';
    const { prev: goPrevPos, next: goNextPos } = useCycleList(positions, safeCurrent, (p) => {
        setSelectedPosition(p);
        setBrowsedVoicing(pickVoicingFor(p, selectedAltShape, octaveUp, anchored ? selectedAsMap : undefined));
    });
    const { prev: goPrevAlt, next: goNextAlt } = useCycleList(availableAltsForUI, selectedAltShape, (idx) => {
        setSelectedAltShape(idx as unknown as number);
        setBrowsedVoicing(
            pickVoicingFor(selectedPosition, idx as unknown as number, octaveUp, anchored ? selectedAsMap : undefined),
        );
    });

    const getQuality = (info: any) =>
        Array.isArray(info?.trail) && info.trail.length ? info.trail[info.trail.length - 1] : '';

    const chordLabel = pickedChord
        ? `${effectiveRoot} ${pickedChord.label}`
        : matchInfo
          ? `${effectiveRoot} ${getQuality(matchInfo)}`
          : '';

    const autoChordLabel = useMemo(() => {
        if (chordLabel) return chordLabel;
        if (chordIntervalLabel) return chordIntervalLabel;
        if (!chordShape.length) return '';
        const rootSemi = noteNameToSemitone(effectiveRoot);
        for (const candidateRoot of CANONICAL_ROOTS) {
            const candidateSemi = noteNameToSemitone(candidateRoot);
            const semis = [
                ...new Set(chordShape.map((n) => wrap12((n.semitones ?? 0) + rootSemi - candidateSemi))),
            ].sort((a, b) => a - b);
            const quality = CHORD_QUALITY_MAP.get(semis.join(','));
            if (quality) return `${candidateRoot} ${quality}`;
        }
        return '';
    }, [chordLabel, chordIntervalLabel, chordShape, effectiveRoot]);

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Chord / scale label */}
            <View style={styles.header}>
                <Text style={styles.headerText}>
                    {autoChordLabel || (chordShape.length > 0 ? freeformLabel : root)}
                </Text>
                {!chordLabel && scaleMatches.length > 0 && (
                    <Text style={styles.scaleCaption} numberOfLines={2}>
                        {scaleMatches
                            .map((m) => (m.modeName ?? m.scaleName) + (!m.exact && scaleMatches.length > 1 ? ' *' : ''))
                            .join('  ·  ')}
                    </Text>
                )}
            </View>

            {/* Fretboard */}
            <View style={styles.fretboardArea}>
                <FretboardVertical
                    chordShape={correctedChordShape}
                    handedness={handedness}
                    interactive
                    onTogglePosition={({ string, fret }) => toggle(string, fret)}
                    rootNote={effectiveRoot}
                    showIntervals={showIntervals}
                    showConnector={chordShape.length > 0}
                    interactivePositions={anchored ? selected : undefined}
                    capo={capo}
                    tuningFreqs={tuningFreqs}
                />
            </View>

            {/* Note-roles strip */}
            {selected.size > 0 && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.noteStrip}
                    contentContainerStyle={styles.noteStripContent}
                >
                    {selectedNoteInfos.map(({ key, noteName, intervalName }) => (
                        <View key={key} style={styles.notePill}>
                            <TouchableOpacity onPress={() => nudgeNote(key, -1)} style={styles.noteNudge}>
                                <Text style={styles.noteNudgeText}>‹</Text>
                            </TouchableOpacity>
                            <Text style={styles.notePillText}>
                                {noteName}
                                <Text style={styles.notePillInterval}> {intervalName}</Text>
                            </Text>
                            <TouchableOpacity onPress={() => nudgeNote(key, 1)} style={styles.noteNudge}>
                                <Text style={styles.noteNudgeText}>›</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            )}

            {/* Anchor cycling strip */}
            {anchored && (
                <View style={styles.stepperRow}>
                    {anchorMatches.length > 1 && (
                        <TouchableOpacity onPress={() => stepAnchor(-1)} style={styles.chevronButton}>
                            <ChevronIcon direction="left" />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        onPress={() => anchorMatches.length > 0 && setChordPickerOpen(true)}
                        style={styles.anchorLabelWrap}
                    >
                        {anchorMatches.length === 0 ? (
                            <Text style={styles.stepperLabelMuted}>No matches</Text>
                        ) : (
                            <>
                                <Text style={styles.stepperLabel}>{anchorMatches[anchorIndex]?.displayLabel}</Text>
                                {!!anchorMatches[anchorIndex]?.contextLabel && (
                                    <Text style={styles.anchorContext}>{anchorMatches[anchorIndex].contextLabel}</Text>
                                )}
                            </>
                        )}
                    </TouchableOpacity>
                    {anchorMatches.length > 1 && (
                        <TouchableOpacity onPress={() => stepAnchor(1)} style={styles.chevronButton}>
                            <ChevronIcon direction="right" />
                        </TouchableOpacity>
                    )}
                    {anchorMatches.length > 1 && (
                        <Text style={styles.anchorCount}>
                            {anchorIndex + 1}/{anchorMatches.length}
                        </Text>
                    )}
                    {availableAltsForUI.length > 1 && (
                        <>
                            <View style={styles.divider} />
                            <TouchableOpacity onPress={goPrevAlt} style={styles.chevronButton}>
                                <ChevronIcon direction="left" />
                            </TouchableOpacity>
                            <Text style={styles.altLabel}>
                                {selectedAltShape + 1}/{availableAltsForUI.length}
                            </Text>
                            <TouchableOpacity onPress={goNextAlt} style={styles.chevronButton}>
                                <ChevronIcon direction="right" />
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            )}

            {/* Position / alt strip */}
            {!anchored && positions.length > 0 && (
                <View style={styles.stepperRow}>
                    <TouchableOpacity onPress={goPrevPos} style={styles.chevronButton}>
                        <ChevronIcon direction="left" />
                    </TouchableOpacity>
                    <Text style={styles.stepperLabel}>
                        {(finalFormulas as any)?.[selectedPosition]?.name || selectedPosition || '–'}
                    </Text>
                    <TouchableOpacity onPress={goNextPos} style={styles.chevronButton}>
                        <ChevronIcon direction="right" />
                    </TouchableOpacity>

                    {availableAltsForUI.length > 1 && (
                        <>
                            <View style={styles.divider} />
                            <TouchableOpacity onPress={goPrevAlt} style={styles.chevronButton}>
                                <ChevronIcon direction="left" />
                            </TouchableOpacity>
                            <Text style={styles.altLabel}>
                                {selectedAltShape + 1}/{availableAltsForUI.length}
                            </Text>
                            <TouchableOpacity onPress={goNextAlt} style={styles.chevronButton}>
                                <ChevronIcon direction="right" />
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            )}

            {/* Chord picker modal (anchor mode: browse all matches) */}
            <Modal visible={chordPickerOpen} transparent animationType="fade" onRequestClose={() => setChordPickerOpen(false)}>
                <Pressable style={styles.sheetBackdrop} onPress={() => setChordPickerOpen(false)}>
                    <Pressable style={styles.pickerSheet} onPress={() => {}}>
                        <Text style={styles.pickerHeader}>
                            {anchorMatches.length} chord{anchorMatches.length !== 1 ? 's' : ''} found
                        </Text>
                        <ScrollView>
                            {anchorMatches.map((match, idx) => (
                                <TouchableOpacity
                                    key={`${match.qualityKey}-${match.posKey}-${idx}`}
                                    onPress={() => {
                                        setAnchorIndex(idx);
                                        applyAnchorMatch(match);
                                        setChordPickerOpen(false);
                                    }}
                                    style={[styles.pickerRow, idx === anchorIndex && styles.pickerRowActive]}
                                >
                                    <Text style={[styles.pickerRowLabel, idx === anchorIndex && styles.pickerRowLabelActive]}>
                                        {effectiveRoot} {match.displayLabel}
                                    </Text>
                                    {!!match.contextLabel && (
                                        <Text
                                            style={[
                                                styles.pickerRowContext,
                                                idx === anchorIndex && styles.pickerRowContextActive,
                                            ]}
                                        >
                                            {match.contextLabel}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Control strip */}
            <View style={styles.controlStrip}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlScrollContent}>
                    <TouchableOpacity onPress={() => setRootMenuOpen(true)} style={styles.rootButton}>
                        <Text style={styles.rootButtonText}>{root}</Text>
                    </TouchableOpacity>

                    <NotesIntervalsToggle showIntervals={showIntervals} onToggle={setShowIntervals} />

                    <TouchableOpacity onPress={() => setIsRight((h) => !h)} style={styles.iconButton}>
                        <HandIcon flipped={!isRight} />
                    </TouchableOpacity>

                    <CapoButton capo={capo} setCapo={setCapo} />

                    <TouchableOpacity onPress={() => setTuningMenuOpen(true)} style={styles.tuningButton}>
                        <Text style={styles.tuningButtonText}>{selectedTuning.name}</Text>
                    </TouchableOpacity>

                    {hasOctave && (
                        <TouchableOpacity
                            onPress={() => setOctaveUp((o) => !o)}
                            style={[styles.octaveButton, octaveUp && styles.octaveButtonActive]}
                        >
                            <Text style={[styles.octaveButtonText, octaveUp && styles.octaveButtonTextActive]}>
                                {octaveUp ? '-12' : '+12'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>

                <View style={styles.controlFixedRight}>
                    {chordShape.length > 0 && (
                        <TouchableOpacity onPress={() => playChord(chordShape, tuningFreqs)} style={styles.iconButton}>
                            <StrumIcon />
                        </TouchableOpacity>
                    )}
                    {chordShape.length > 0 && (
                        <TouchableOpacity
                            onPress={handleAnchor}
                            style={[styles.anchorButton, anchored && styles.anchorButtonActive]}
                        >
                            <Text style={[styles.anchorButtonText, anchored && styles.anchorButtonTextActive]}>Anchor</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={clearAll} style={styles.clearButton}>
                        <Text style={styles.clearButtonText}>Clear</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Root note picker modal */}
            <Modal visible={rootMenuOpen} transparent animationType="fade" onRequestClose={() => setRootMenuOpen(false)}>
                <Pressable style={styles.sheetBackdrop} onPress={() => setRootMenuOpen(false)}>
                    <Pressable style={styles.rootGridPopup} onPress={() => {}}>
                        <View style={styles.rootGrid}>
                            {NOTES.map((n) => (
                                <TouchableOpacity
                                    key={n}
                                    onPress={() => {
                                        setRoot(n);
                                        setRootMenuOpen(false);
                                    }}
                                    style={[styles.rootGridButton, n === root && styles.rootGridButtonActive]}
                                >
                                    <Text style={[styles.rootGridButtonText, n === root && styles.rootGridButtonTextActive]}>
                                        {n}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Tuning picker modal -- Draw Mode is its own tab here (unlike the
                website, where tuning lives in the shared page-level menu), so
                it needs its own small picker to change tuning. */}
            <Modal visible={tuningMenuOpen} transparent animationType="fade" onRequestClose={() => setTuningMenuOpen(false)}>
                <Pressable style={styles.sheetBackdrop} onPress={() => setTuningMenuOpen(false)}>
                    <Pressable style={styles.tuningPopup} onPress={() => {}}>
                        <Text style={styles.pickerHeader}>Tuning</Text>
                        {TUNINGS.map((t) => (
                            <TouchableOpacity
                                key={t.name}
                                onPress={() => {
                                    setSelectedTuning(t);
                                    setTuningMenuOpen(false);
                                }}
                                style={[styles.pickerRow, t.name === selectedTuning.name && styles.pickerRowActive]}
                            >
                                <Text
                                    style={[
                                        styles.pickerRowLabel,
                                        t.name === selectedTuning.name && styles.pickerRowLabelActive,
                                    ]}
                                >
                                    {t.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
    headerText: { fontFamily: fonts.sans.bold, fontSize: 24, color: colors.ink, textAlign: 'center' },
    scaleCaption: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: `${colors.ink}80`,
        textAlign: 'center',
        marginTop: 2,
    },
    fretboardArea: { flex: 1 },
    noteStrip: {
        flexGrow: 0,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
        backgroundColor: colors.sand1,
    },
    noteStripContent: { alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
    notePill: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
        paddingHorizontal: spacing.xs + 2,
        paddingVertical: 2,
    },
    noteNudge: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
    noteNudgeText: { color: `${colors.ink}99`, fontSize: 12 },
    notePillText: { fontFamily: fonts.sans.semiBold, fontSize: 12, color: colors.ink, paddingHorizontal: 2 },
    notePillInterval: { color: `${colors.ink}99` },
    stepperRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
        backgroundColor: colors.sand1,
        paddingVertical: spacing.xs + 2,
    },
    chevronButton: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    stepperLabel: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
        minWidth: 80,
        textAlign: 'center',
    },
    stepperLabelMuted: { fontFamily: fonts.sans.semiBold, fontSize: 12, color: `${colors.ink}80` },
    anchorLabelWrap: { minWidth: 96, alignItems: 'center' },
    anchorContext: { fontSize: 10, color: `${colors.ink}99` },
    anchorCount: { fontFamily: fonts.sans.semiBold, fontSize: 10, color: colors.ink, marginLeft: 4 },
    divider: { width: 1, height: 16, backgroundColor: `${colors.ink}33`, marginHorizontal: 4 },
    altLabel: { fontFamily: fonts.sans.semiBold, fontSize: 12, color: colors.ink, width: 32, textAlign: 'center' },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
    pickerSheet: {
        width: '85%',
        maxHeight: '60%',
        backgroundColor: colors.sand2,
        borderRadius: radius.xl,
        padding: spacing.sm,
    },
    pickerHeader: { fontFamily: fonts.sans.bold, fontSize: 13, color: colors.ink, padding: spacing.xs, textAlign: 'center' },
    pickerRow: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.lg, marginBottom: 2 },
    pickerRowActive: { backgroundColor: colors.ink },
    pickerRowLabel: { fontFamily: fonts.sans.semiBold, fontSize: 13, color: colors.ink },
    pickerRowLabelActive: { color: colors.sand1 },
    pickerRowContext: { fontSize: 11, color: `${colors.ink}80`, marginTop: 2 },
    pickerRowContextActive: { color: `${colors.sand1}99` },
    controlStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
        backgroundColor: colors.sand1,
        paddingTop: spacing.xs,
        paddingBottom: spacing.md,
        paddingRight: spacing.md,
    },
    controlScrollContent: { flexGrow: 1, alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
    rootButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rootButtonText: { fontFamily: fonts.sans.bold, fontSize: 13, color: colors.sand1 },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tuningButton: {
        paddingHorizontal: spacing.sm,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tuningButtonText: { fontFamily: fonts.sans.semiBold, fontSize: 11, color: colors.ink },
    octaveButton: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    octaveButtonActive: { backgroundColor: colors.ink, borderColor: colors.ink },
    octaveButtonText: { fontFamily: fonts.sans.semiBold, fontSize: 11, color: colors.ink },
    octaveButtonTextActive: { color: colors.sand1 },
    controlFixedRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 4 },
    anchorButton: {
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    anchorButtonActive: { backgroundColor: colors.ink, borderColor: colors.ink },
    anchorButtonText: { fontFamily: fonts.sans.semiBold, fontSize: 11, color: colors.ink },
    anchorButtonTextActive: { color: colors.sand1 },
    clearButton: {
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: '#dc2626',
    },
    clearButtonText: { fontFamily: fonts.sans.semiBold, fontSize: 11, color: '#dc2626' },
    rootGridPopup: {
        backgroundColor: colors.sand2,
        borderRadius: radius.xl,
        padding: spacing.sm,
        maxWidth: 280,
    },
    rootGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
    rootGridButton: {
        width: 56,
        height: 36,
        borderRadius: radius.md,
        backgroundColor: colors.sand1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rootGridButtonActive: { backgroundColor: colors.ink },
    rootGridButtonText: { fontFamily: fonts.sans.semiBold, fontSize: 12, color: colors.ink },
    rootGridButtonTextActive: { color: colors.sand1 },
    tuningPopup: {
        width: '80%',
        maxHeight: '60%',
        backgroundColor: colors.sand2,
        borderRadius: radius.xl,
        padding: spacing.sm,
    },
});
