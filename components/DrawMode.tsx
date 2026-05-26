"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import FretboardHorizontal from "@/components/FretboardHorizontal";
import FretboardVertical from "@/components/FretboardVertical";
import NotesIntervalsToggle from "@/components/NotesIntervalsToggle";
import { noteNameToSemitone, spellNote } from "@/lib/MusicTheory";
import { playNote, playChord } from "@/lib/guitarAudio";
import {
    useDrawModeIndex,
    keyFromSelection,
} from "@/lib/hooks/useDrawModeIndex";
import {
    allChordShapes,
    useCycleList,
    getFinalFormulasFromMatch,
} from "@/lib/API";
import { generateAllVoicingsForShape } from "@/lib/fretboardMap";
import type { NotePosition } from "@/lib/fretboardMap";
import CapoButton from "@/components/CapoButton";
import { SCALE_SHAPES } from "@/lib/Shapes/Scales";
import { CHORD_SHAPES } from "@/lib/Shapes/Chords";

const QUALITY_DISPLAY: Record<string, string> = {
    Maj: "Major",
    Min: "Minor",
    Aug: "Augmented",
    Dim: "Diminished",
    Maj7: "Maj7",
    Dom7: "Dom7",
    Min7: "Min7",
    mMaj7: "mMaj7",
    Min7b5: "Min7b5",
    Dim7: "Dim7",
};

type ChordNode = {
    levelName?: string;
    options?: Record<string, ChordNode>;
    pattern?: { semitones: number }[];
    altShapes?: ChordNode[];
};

function getPatternSemitones(formula: ChordNode): number[] | null {
    if (!Array.isArray(formula.pattern)) return null;
    const semis = [...new Set(formula.pattern.map(n => n.semitones))].sort(
        (a, b) => a - b,
    );
    return semis.length >= 2 ? semis : null;
}

function registerFormula(
    formula: ChordNode,
    displayName: string,
    map: Map<string, string>,
) {
    const semis = getPatternSemitones(formula);
    if (semis) {
        const key = semis.join(",");
        if (!map.has(key)) map.set(key, displayName);
    }
    if (Array.isArray(formula.altShapes)) {
        for (const alt of formula.altShapes) {
            const altSemis = getPatternSemitones(alt);
            if (altSemis) {
                const key = altSemis.join(",");
                if (!map.has(key)) map.set(key, displayName);
            }
        }
    }
}

function buildChordQualityMap(shapes: ChordNode): Map<string, string> {
    const map = new Map<string, string>();

    function crawl(node: ChordNode) {
        if (!node || typeof node !== "object") return;
        if (node.levelName === "Chord Qualities" && node.options) {
            for (const [qualityKey, qualityNode] of Object.entries(
                node.options,
            )) {
                const displayName = QUALITY_DISPLAY[qualityKey] ?? qualityKey;
                if (
                    qualityNode.levelName === "Positions" &&
                    qualityNode.options
                ) {
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
        if (topLevel && typeof topLevel === "object")
            crawl(topLevel as ChordNode);
    }
    return map;
}

const CHORD_QUALITY_MAP = buildChordQualityMap(
    CHORD_SHAPES as unknown as ChordNode,
);

const STANDARD_TUNING = ["E", "B", "G", "D", "A", "E"];
const NUM_FRETS = 24;
const NOTES = [
    "C",
    "C#",
    "Db",
    "D",
    "D#",
    "Eb",
    "E",
    "F",
    "F#",
    "Gb",
    "G",
    "G#",
    "Ab",
    "A",
    "A#",
    "Bb",
    "B",
];

const CANONICAL_ROOTS = [
    "C",
    "C#",
    "D",
    "Eb",
    "E",
    "F",
    "F#",
    "G",
    "Ab",
    "A",
    "Bb",
    "B",
];
const INTERVAL_NAMES: Record<number, string> = {
    0: "1",
    1: "b2",
    2: "2",
    3: "b3",
    4: "3",
    5: "4",
    6: "b5",
    7: "5",
    8: "b6",
    9: "6",
    10: "b7",
    11: "7",
};

const DEGREE_INDEX_BY_SEMITONES: Record<number, number> = {
    0: 0,
    1: 1,
    2: 1,
    3: 2,
    4: 2,
    5: 3,
    6: 4,
    7: 4,
    8: 5,
    9: 5,
    10: 6,
    11: 6,
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

// ─── flat chord finder ────────────────────────────────────────────────────────

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
        const semis = new Set<number>(
            formula.pattern.map((n: any) => n.semitones as number),
        );
        return drawnSemis.every(s => semis.has(s));
    }

    function voicingCoversPositions(formula: any): boolean {
        if (pitchOnly) return true;
        const raw =
            generateAllVoicingsForShape(root, formula, fretboardMap) || [];
        const voicings: NotePosition[][] = Array.isArray(raw[0])
            ? (raw as any)
            : [raw as any];
        return voicings.some(v =>
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
        return (
            !!v && typeof v === "object" && ("pattern" in v || "altShapes" in v)
        );
    }

    function walk(
        node: any,
        pathSegments: string[],
        qualityKey: string | null,
    ) {
        if (!node || typeof node !== "object") return;
        if (node.options && isPosBag(node.options)) {
            if (!qualityKey) return;
            const matchingPosKey = Object.keys(node.options).find(pk =>
                anyFormulaMatches(node.options[pk]),
            );
            if (matchingPosKey !== undefined) {
                results.push({
                    qualityKey,
                    displayLabel: QUALITY_DISPLAY[qualityKey] ?? qualityKey,
                    contextLabel: pathSegments.slice(1, -1).join(" · "),
                    finalFormulas: node.options,
                    posKey: matchingPosKey,
                });
            }
            return;
        }
        if (node.options) {
            const isQualityLevel = node.levelName === "Chord Qualities";
            for (const [key, child] of Object.entries(node.options)) {
                walk(
                    child,
                    [...pathSegments, key],
                    isQualityLevel ? key : qualityKey,
                );
            }
        }
    }

    for (const [category, node] of Object.entries(shapes)) {
        walk(node, [category], null);
    }

    return results;
}

const CHROMATIC_INTERVALS = [
    "1",
    "b2",
    "2",
    "b3",
    "3",
    "4",
    "b5",
    "5",
    "b6",
    "6",
    "b7",
    "7",
];

function intervalSemitones(rootName: string, targetName: string): number {
    return wrap12(
        noteNameToSemitone(targetName) - noteNameToSemitone(rootName),
    );
}

function firstEnharmonic(cell: string): string {
    return (cell || "").split("/")[0];
}

function ChevronLeft() {
    return (
        <svg
            className='w-5 h-5'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'>
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 19l-7-7 7-7'
            />
        </svg>
    );
}

function ChevronRight() {
    return (
        <svg
            className='w-5 h-5'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'>
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M9 5l7 7-7 7'
            />
        </svg>
    );
}

function StrumIcon({ className = "w-5 h-5" }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox='12.5 7.5 175 175'
            fill='currentColor'>
            <path d='M 42 58 C 56 23 144 23 158 58 C 169 80 118 168 100 165 C 82 168 31 80 42 58 Z' />
        </svg>
    );
}

function HandIcon({ flipped = false }: { flipped?: boolean }) {
    return (
        <svg
            className='w-5 h-5'
            viewBox='0 0 640 640'
            fill='currentColor'
            style={flipped ? { transform: "scaleX(-1)" } : undefined}>
            <path d='M352 96C352 78.3 337.7 64 320 64C302.3 64 288 78.3 288 96L288 304C288 312.8 280.8 320 272 320C263.2 320 256 312.8 256 304L256 128C256 110.3 241.7 96 224 96C206.3 96 192 110.3 192 128L192 400C192 401.5 192 403.1 192.1 404.6L131.6 347C115.6 331.8 90.3 332.4 75 348.4C59.7 364.4 60.4 389.7 76.4 405L188.8 512C231.9 553.1 289.2 576 348.8 576L368 576C465.2 576 544 497.2 544 400L544 192C544 174.3 529.7 160 512 160C494.3 160 480 174.3 480 192L480 304C480 312.8 472.8 320 464 320C455.2 320 448 312.8 448 304L448 128C448 110.3 433.7 96 416 96C398.3 96 384 110.3 384 128L384 304C384 312.8 376.8 320 368 320C359.2 320 352 312.8 352 304L352 96z' />
        </svg>
    );
}

export default function DrawMode({
    tuning = STANDARD_TUNING,
    tuningFreqs,
    capo: capoProp = 0,
    onCapoChange,
    preloadNotes,
    onPreloadConsumed,
    onSaveRequest,
    onProgressionRequest,
}: {
    tuning?: string[];
    tuningFreqs?: number[];
    capo?: number;
    onCapoChange?: (v: number) => void;
    preloadNotes?: NotePosition[] | null;
    onPreloadConsumed?: () => void;
    onSaveRequest?: (notes: NotePosition[], label: string) => void;
    onProgressionRequest?: (notes: NotePosition[], label: string) => void;
} = {}) {
    const [root, setRoot] = React.useState("C");
    const [showIntervals, setShowIntervals] = React.useState(false);
    const [rootMenuOpen, setRootMenuOpen] = React.useState(false);
    const [isRight, setIsRight] = React.useState(true);
    // Set of "string:fret" keys — allows multiple notes per string for scale drawing
    const [selected, setSelected] = React.useState(new Set<string>());
    const [matchInfo, setMatchInfo] = React.useState<any>(null);
    const [selectedPosition, setSelectedPosition] = React.useState("");
    const [selectedAltShape, setSelectedAltShape] = React.useState(0);
    const [browsedVoicing, setBrowsedVoicing] = React.useState<
        NotePosition[] | null
    >(null);

    // Restore a saved Draw Mode chord when preloadNotes arrives
    React.useEffect(() => {
        if (!preloadNotes?.length) return;
        setSelected(
            new Set<string>(preloadNotes.map(n => `${n.string}:${n.fret}`)),
        );
        setBrowsedVoicing(null);
        setMatchInfo(null);
        onPreloadConsumed?.();
    }, [preloadNotes]); // eslint-disable-line react-hooks/exhaustive-deps

    const [pickedChord, setPickedChord] = React.useState<{
        finalFormulas: Record<string, any>;
        posKey: string;
        label: string;
    } | null>(null);
    const capo = capoProp;
    const setCapo = (v: number | ((prev: number) => number)) => {
        const next = typeof v === "function" ? v(capo) : v;
        onCapoChange?.(next);
    };
    const [anchored, setAnchored] = React.useState(false);
    const [anchorMatches, setAnchorMatches] = React.useState<FlatChordMatch[]>(
        [],
    );
    const [anchorIndex, setAnchorIndex] = React.useState(0);
    const [chordPickerOpen, setChordPickerOpen] = React.useState(false);
    const [octaveUp, setOctaveUp] = React.useState(false);
    const [pivotKey, setPivotKey] = React.useState<string | null>(null);
    const [pivotInterval, setPivotInterval] = React.useState(0);

    const handedness = isRight ? "right" : "left";

    const { index, fretboardMap } = useDrawModeIndex({
        allChordShapes,
        tuning,
        numFrets: NUM_FRETS,
        rootNote: root,
    });

    const effectiveRoot = React.useMemo(() => {
        if (!pivotKey) return root;
        const [s, f] = pivotKey.split(":").map(Number);
        const cell = fretboardMap[s]?.[f];
        if (!cell) return root;
        const noteSemi = noteNameToSemitone(firstEnharmonic(cell));
        return CANONICAL_ROOTS[wrap12(noteSemi - pivotInterval)];
    }, [pivotKey, pivotInterval, root, fretboardMap]);

    const { finalFormulas, posKey } = React.useMemo(() => {
        if (pickedChord) {
            return {
                finalFormulas: pickedChord.finalFormulas,
                posKey: pickedChord.posKey,
            };
        }
        return getFinalFormulasFromMatch(allChordShapes, matchInfo);
    }, [matchInfo, pickedChord]);

    // One-note-per-string map derived from selected — used for chord matching only
    const selectedAsMap = React.useMemo(() => {
        const map = new Map<number, number>();
        for (const key of selected) {
            const [s, f] = key.split(":").map(Number);
            if (!map.has(s) || f < map.get(s)!) map.set(s, f);
        }
        return map;
    }, [selected]);

    const toggle = React.useCallback(
        (string: number, fret: number) => {
            const key = `${string}:${fret}`;
            if (anchored) {
                // Only allow removing a note that is part of the user's drawn selection
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

                // Recompute anchor with updated selection inline (selectedAsMap is stale here)
                const newMap = new Map<number, number>();
                for (const k of newSelected) {
                    const [s, f] = k.split(":").map(Number);
                    if (!newMap.has(s) || f < newMap.get(s)!) newMap.set(s, f);
                }
                const newSemis = [
                    ...new Set(
                        [...newMap.entries()]
                            .map(([s, f]) => {
                                const cell = fretboardMap[s]?.[f];
                                if (!cell) return -1;
                                return wrap12(
                                    noteNameToSemitone(firstEnharmonic(cell)) -
                                        noteNameToSemitone(effectiveRoot),
                                );
                            })
                            .filter(s => s >= 0),
                    ),
                ].sort((a, b) => a - b);

                const matches = findChordsAtPositions(
                    newSemis,
                    newMap,
                    allChordShapes,
                    effectiveRoot,
                    fretboardMap,
                );
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
                    const variants = [
                        posData,
                        ...(Array.isArray(posData.altShapes)
                            ? posData.altShapes
                            : []),
                    ];
                    for (const formula of variants) {
                        const raw =
                            generateAllVoicingsForShape(
                                root,
                                formula,
                                fretboardMap,
                            ) || [];
                        const voicings: NotePosition[][] = Array.isArray(raw[0])
                            ? (raw as any)
                            : [raw as any];
                        const hit = voicings.find(v =>
                            [...newMap.entries()].every(([s, f]) =>
                                (v as NotePosition[]).some(
                                    n => n.string === s && n.fret === f,
                                ),
                            ),
                        );
                        if (hit) {
                            setBrowsedVoicing(
                                (hit as NotePosition[])
                                    .slice()
                                    .sort(
                                        (a, b) =>
                                            a.string - b.string ||
                                            (a.fret ?? 0) - (b.fret ?? 0),
                                    ),
                            );
                            return;
                        }
                    }
                    setBrowsedVoicing(null);
                } else {
                    setPickedChord(null);
                    setBrowsedVoicing(null);
                }
                return;
            }
            setSelected(prev => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else {
                    next.add(key);
                    playNote(string, fret, tuningFreqs);
                }
                return next;
            });
        },
        [anchored, selected, effectiveRoot, fretboardMap], // eslint-disable-line react-hooks/exhaustive-deps
    );

    React.useEffect(() => {
        setSelected(new Set());
        setAnchored(false);
        setAnchorMatches([]);
        setAnchorIndex(0);
        setPickedChord(null);
        setBrowsedVoicing(null);
    }, [capo]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const pickVoicingFor = React.useCallback(
        (
            posKeyToUse: string,
            altIdxToUse: number,
            useOctaveUp = false,
            anchorPositions?: Map<number, number>,
        ): NotePosition[] | null => {
            if (!finalFormulas || !finalFormulas[posKeyToUse]) return null;
            const posData = finalFormulas[posKeyToUse] as any;
            // index 0 = base formula, 1 = altShapes[0], 2 = altShapes[1], …
            const variants = [
                posData,
                ...(Array.isArray(posData.altShapes) ? posData.altShapes : []),
            ];
            const formula = variants[altIdxToUse] ?? posData;
            if (!formula) return null;
            const raw =
                generateAllVoicingsForShape(
                    effectiveRoot,
                    formula,
                    fretboardMap,
                ) || [];
            const allVoicings: NotePosition[][] = Array.isArray(raw[0])
                ? (raw as any)
                : [raw as any];

            // Split by octave register
            const low: NotePosition[][] = [];
            const crossing: NotePosition[][] = [];
            const high: NotePosition[][] = [];
            for (const v of allVoicings) {
                const frets = (v as NotePosition[])
                    .map(n => n.fret)
                    .filter((f): f is number => f != null && f >= 0);
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

            // Anchor mode: find a voicing containing the anchored positions
            // Normal mode: match selection size and strings
            const best =
                anchorPositions && anchorPositions.size > 0
                    ? pool.find(v =>
                          [...anchorPositions.entries()].every(([s, f]) =>
                              (v as NotePosition[]).some(
                                  n => n.string === s && n.fret === f,
                              ),
                          ),
                      ) ||
                      pool[0] ||
                      allVoicings[0]
                    : pool.find(
                          v =>
                              Array.isArray(v) &&
                              v.length === selectedAsMap.size &&
                              v.every((n: any) =>
                                  new Set(selectedAsMap.keys()).has(n.string),
                              ),
                      ) ||
                      pool[0] ||
                      allVoicings[0];

            if (!best) return null;
            return (best as NotePosition[])
                .slice()
                .sort(
                    (a, b) =>
                        a.string - b.string || (a.fret ?? 0) - (b.fret ?? 0),
                );
        },
        [finalFormulas, effectiveRoot, fretboardMap, selectedAsMap],
    );

    const hasOctave = React.useMemo(() => {
        if (
            !finalFormulas ||
            !selectedPosition ||
            !finalFormulas[selectedPosition]
        )
            return false;
        const posData = finalFormulas[selectedPosition] as any;
        const variants = [
            posData,
            ...(Array.isArray(posData.altShapes) ? posData.altShapes : []),
        ];
        const formula = variants[selectedAltShape] ?? posData;
        if (!Array.isArray(formula?.pattern)) return false;
        const raw =
            generateAllVoicingsForShape(effectiveRoot, formula, fretboardMap) ||
            [];
        const voicings: NotePosition[][] = Array.isArray(raw[0])
            ? (raw as any)
            : [raw as any];
        const hasLow = voicings.some(v => {
            const frets = v
                .map(n => n.fret)
                .filter((f): f is number => f != null && f >= 0);
            return frets.length > 0 && Math.max(...frets) <= 12;
        });
        const hasHigh = voicings.some(v => {
            const frets = v
                .map(n => n.fret)
                .filter((f): f is number => f != null && f >= 0);
            return frets.length > 0 && Math.min(...frets) >= 12;
        });
        return hasLow && hasHigh;
    }, [
        finalFormulas,
        selectedPosition,
        selectedAltShape,
        effectiveRoot,
        fretboardMap,
    ]);

    // Re-pick voicing when octave toggle changes
    React.useEffect(() => {
        if (selectedPosition) {
            setBrowsedVoicing(
                pickVoicingFor(selectedPosition, selectedAltShape, octaveUp),
            );
        }
    }, [octaveUp]); // eslint-disable-line react-hooks/exhaustive-deps

    const chordShape: NotePosition[] = React.useMemo(() => {
        if (browsedVoicing?.length) return browsedVoicing;
        const shape: NotePosition[] = [];
        for (const key of selected) {
            const [string, fret] = key.split(":").map(Number);
            const cell = fretboardMap[string]?.[fret];
            if (!cell) continue;
            const name = firstEnharmonic(cell);
            const semis = intervalSemitones(effectiveRoot, name);
            shape.push({
                string,
                fret,
                semitones: semis,
                degree: semitonesToDegreeNumber(semis),
            });
        }
        return shape.sort(
            (a, b) => a.string - b.string || (a.fret ?? 0) - (b.fret ?? 0),
        );
    }, [selected, fretboardMap, effectiveRoot, browsedVoicing]);

    const applyAnchorMatch = React.useCallback(
        (match: FlatChordMatch) => {
            setPickedChord({
                finalFormulas: match.finalFormulas,
                posKey: match.posKey,
                label: match.displayLabel,
            });
            setSelectedPosition(match.posKey);
            setSelectedAltShape(0);
            setOctaveUp(false);

            // Find the voicing covering the drawn positions directly from match formulas
            // (can't use pickVoicingFor here — finalFormulas memo hasn't updated yet)
            const posData = match.finalFormulas[match.posKey] as any;
            const variants = [
                posData,
                ...(Array.isArray(posData.altShapes) ? posData.altShapes : []),
            ];
            for (const formula of variants) {
                const raw =
                    generateAllVoicingsForShape(
                        effectiveRoot,
                        formula,
                        fretboardMap,
                    ) || [];
                const voicings: NotePosition[][] = Array.isArray(raw[0])
                    ? (raw as any)
                    : [raw as any];
                const hit = voicings.find(v =>
                    [...selectedAsMap.entries()].every(([s, f]) =>
                        (v as NotePosition[]).some(
                            n => n.string === s && n.fret === f,
                        ),
                    ),
                );
                if (hit) {
                    setBrowsedVoicing(
                        (hit as NotePosition[])
                            .slice()
                            .sort(
                                (a, b) =>
                                    a.string - b.string ||
                                    (a.fret ?? 0) - (b.fret ?? 0),
                            ),
                    );
                    return;
                }
            }
            setBrowsedVoicing(null);
        },
        [effectiveRoot, fretboardMap, selectedAsMap],
    );

    const handleAnchor = React.useCallback(() => {
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
        const drawnSemis = [
            ...new Set(chordShape.map(n => n.semitones ?? 0)),
        ].sort((a, b) => a - b);
        const matches = findChordsAtPositions(
            drawnSemis,
            selectedAsMap,
            allChordShapes,
            effectiveRoot,
            fretboardMap,
        );
        setAnchorMatches(matches);
        setAnchorIndex(0);
        setAnchored(true);
        if (matches[0]) applyAnchorMatch(matches[0]);
    }, [
        anchored,
        chordShape,
        selectedAsMap,
        effectiveRoot,
        fretboardMap,
        applyAnchorMatch,
    ]);

    const stepAnchor = React.useCallback(
        (dir: 1 | -1) => {
            setAnchorIndex(prev => {
                const next =
                    (prev + dir + anchorMatches.length) % anchorMatches.length;
                applyAnchorMatch(anchorMatches[next]);
                return next;
            });
        },
        [anchorMatches, applyAnchorMatch],
    );

    // Re-run anchor search when pivot changes the effective root
    React.useEffect(() => {
        if (!pivotKey || !selected.size) return;
        const newSemis = [
            ...new Set(
                [...selectedAsMap.entries()]
                    .map(([s, f]) => {
                        const cell = fretboardMap[s]?.[f];
                        if (!cell) return -1;
                        return wrap12(
                            noteNameToSemitone(firstEnharmonic(cell)) -
                                noteNameToSemitone(effectiveRoot),
                        );
                    })
                    .filter(v => v >= 0),
            ),
        ].sort((a, b) => a - b);
        const matches = findChordsAtPositions(
            newSemis,
            selectedAsMap,
            allChordShapes,
            effectiveRoot,
            fretboardMap,
        );
        setAnchorMatches(matches);
        setAnchorIndex(0);
        setAnchored(true);
        if (matches[0]) applyAnchorMatch(matches[0]);
        else {
            setPickedChord(null);
            setBrowsedVoicing(null);
        }
    }, [effectiveRoot]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear pivot when user changes the root picker
    React.useEffect(() => {
        setPivotKey(null);
        setPivotInterval(0);
    }, [root]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear pivot when selection is fully cleared
    React.useEffect(() => {
        if (selected.size === 0) {
            setPivotKey(null);
            setPivotInterval(0);
            setChordPickerOpen(false);
        }
    }, [selected]);

    // Per-note interval info for the note-roles strip
    const selectedNoteInfos = React.useMemo(() => {
        return [...selected]
            .map(key => {
                const [s, f] = key.split(":").map(Number);
                const cell = fretboardMap[s]?.[f];
                if (!cell) return null;
                const intervalSemi = wrap12(
                    noteNameToSemitone(firstEnharmonic(cell)) -
                        noteNameToSemitone(effectiveRoot),
                );
                const degreeNum = semitonesToDegreeNumber(intervalSemi);
                const noteName = spellNote(
                    effectiveRoot,
                    intervalSemi,
                    degreeNum,
                );
                return {
                    key,
                    noteName,
                    intervalSemi,
                    intervalName: INTERVAL_NAMES[intervalSemi] ?? "?",
                };
            })
            .filter(Boolean) as Array<{
            key: string;
            noteName: string;
            intervalSemi: number;
            intervalName: string;
        }>;
    }, [selected, fretboardMap, effectiveRoot]);

    const nudgeNote = React.useCallback(
        (key: string, dir: 1 | -1) => {
            const [s, f] = key.split(":").map(Number);
            const newFret = f + dir;
            if (newFret < 0 || newFret > NUM_FRETS) return;
            const newKey = `${s}:${newFret}`;
            setSelected(prev => {
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
        },
        [anchored],
    );

    // Unique note names and intervals for the freeform label
    type ScaleMatch = {
        scaleName: string;
        modeName?: string;
        exact: boolean;
        degreeMap: Map<number, number> | null;
    };
    const scaleMatches = React.useMemo((): ScaleMatch[] => {
        const drawnSemis = [
            ...new Set(chordShape.map(n => n.semitones ?? 0)),
        ].sort((a, b) => a - b);
        if (drawnSemis.length < 3) return [];

        const results: ScaleMatch[] = [];
        for (const scales of Object.values(SCALE_SHAPES)) {
            for (const entry of Object.values(scales)) {
                for (let d = 0; d < entry.intervals.length; d++) {
                    const pivot = entry.intervals[d];
                    const rotatedArr = entry.intervals
                        .map(i => (i - pivot + 12) % 12)
                        .sort((a, b) => a - b);
                    const rotated = new Set(rotatedArr);
                    if (!drawnSemis.every(s => rotated.has(s))) continue;
                    // Only build a degree map for 7-note scales — positional
                    // index = scale degree only holds when all 7 degrees are present.
                    const degreeMap =
                        rotatedArr.length === 7
                            ? new Map<number, number>(
                                  rotatedArr.map((s, idx) => [s, idx + 1]),
                              )
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
            .filter(r => {
                const key = `${r.scaleName}|${r.modeName ?? ""}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    }, [chordShape]);

    // First scale match that has a valid 7-note degree map for correct spelling
    const spellDegreeMap = React.useMemo(
        () => scaleMatches.find(m => m.degreeMap != null)?.degreeMap ?? null,
        [scaleMatches],
    );

    const drawnNotes = React.useMemo(() => {
        const semis = [...new Set(chordShape.map(n => n.semitones ?? 0))].sort(
            (a, b) => a - b,
        );
        return semis
            .map(s => {
                const deg =
                    spellDegreeMap?.get(s) ?? semitonesToDegreeNumber(s);
                return spellNote(effectiveRoot, s, deg);
            })
            .join("  ");
    }, [chordShape, effectiveRoot, spellDegreeMap]);

    const drawnIntervals = React.useMemo(() => {
        const semis = [...new Set(chordShape.map(n => n.semitones ?? 0))].sort(
            (a, b) => a - b,
        );
        return semis
            .map(s => {
                if (spellDegreeMap) {
                    const deg = spellDegreeMap.get(s);
                    if (deg != null) return spellDegree(s, deg);
                }
                return CHROMATIC_INTERVALS[s] ?? "?";
            })
            .join("  ");
    }, [chordShape, spellDegreeMap]);

    const freeformLabel = showIntervals ? drawnIntervals : drawnNotes;

    const correctedChordShape = React.useMemo(() => {
        if (!spellDegreeMap) return chordShape;
        return chordShape.map(pos => {
            const deg = spellDegreeMap.get(pos.semitones ?? 0);
            return deg != null ? { ...pos, degree: deg } : pos;
        });
    }, [chordShape, spellDegreeMap]);

    React.useEffect(() => {
        if (!selectedAsMap.size) {
            setMatchInfo(null);
            return;
        }
        const hit =
            index.get(`${root}::${keyFromSelection(selectedAsMap)}`) || null;
        setMatchInfo(hit);
    }, [selectedAsMap, index, root]);

    const positions = React.useMemo(
        () => (finalFormulas ? Object.keys(finalFormulas) : []),
        [finalFormulas],
    );

    React.useEffect(() => {
        if (pickedChord) return;
        if (!matchInfo || !finalFormulas) {
            setSelectedPosition("");
            setSelectedAltShape(0);
            return;
        }
        const keys = Object.keys(finalFormulas);
        if (!selectedPosition || !finalFormulas[selectedPosition]) {
            setSelectedPosition(
                posKey && finalFormulas[posKey] ? posKey : keys[0] || "",
            );
        }
        const posData = finalFormulas[
            selectedPosition || posKey || keys[0]
        ] as any;
        const altCount = 1 + (posData?.altShapes?.length || 0);
        if (selectedAltShape >= altCount) setSelectedAltShape(0);
    }, [
        matchInfo,
        finalFormulas,
        posKey,
        selectedPosition,
        selectedAltShape,
        pickedChord,
    ]);

    const chordIntervalMatch = React.useMemo(() => {
        if (!chordShape.length) return null;
        const semis = [...new Set(chordShape.map(n => n.semitones ?? 0))].sort(
            (a, b) => a - b,
        );
        return CHORD_QUALITY_MAP.get(semis.join(",")) ?? null;
    }, [chordShape]);

    const chordIntervalLabel = chordIntervalMatch
        ? `${effectiveRoot} ${chordIntervalMatch}`
        : "";

    const lastFamilyRef = React.useRef("");
    const familyKey = matchInfo
        ? `${matchInfo.difficulty}|${matchInfo.category}|${(matchInfo.trail || []).join(">")}`
        : "";

    React.useEffect(() => {
        if (pickedChord) return;
        if (!matchInfo || !finalFormulas) {
            setSelectedPosition("");
            setSelectedAltShape(0);
            lastFamilyRef.current = "";
            return;
        }
        if (familyKey !== lastFamilyRef.current) {
            lastFamilyRef.current = familyKey;
            const keys = Object.keys(finalFormulas);
            const nextPos =
                matchInfo.posKey && finalFormulas[matchInfo.posKey]
                    ? matchInfo.posKey
                    : keys[0] || "";
            setSelectedPosition(nextPos);
            const altCount =
                1 + ((finalFormulas[nextPos] as any)?.altShapes?.length || 0);
            setSelectedAltShape(Math.min(matchInfo.altIdx ?? 0, altCount - 1));
        }
    }, [familyKey, matchInfo, finalFormulas, root, pickedChord]);

    React.useEffect(() => {
        if (anchored) return; // anchor manages its own state via toggle
        setBrowsedVoicing(null);
        setPickedChord(null);
    }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
    React.useEffect(() => {
        setBrowsedVoicing(null);
    }, [familyKey]);

    const availableAltsForUI = React.useMemo(() => {
        if (
            !finalFormulas ||
            !selectedPosition ||
            !finalFormulas[selectedPosition]
        )
            return [];
        const base = finalFormulas[selectedPosition] as any;
        return [base, ...(Array.isArray(base.altShapes) ? base.altShapes : [])];
    }, [finalFormulas, selectedPosition]);

    const safeCurrent = positions.includes(selectedPosition)
        ? selectedPosition
        : positions[0] || "";
    const { prev: goPrevPos, next: goNextPos } = useCycleList(
        positions,
        safeCurrent,
        p => {
            setSelectedPosition(p);
            setBrowsedVoicing(
                pickVoicingFor(
                    p,
                    selectedAltShape,
                    octaveUp,
                    anchored ? selectedAsMap : undefined,
                ),
            );
        },
    );
    const { prev: goPrevAlt, next: goNextAlt } = useCycleList(
        availableAltsForUI,
        selectedAltShape,
        idx => {
            setSelectedAltShape(idx as unknown as number);
            setBrowsedVoicing(
                pickVoicingFor(
                    selectedPosition,
                    idx as unknown as number,
                    octaveUp,
                    anchored ? selectedAsMap : undefined,
                ),
            );
        },
    );

    const getQuality = (info: any) =>
        Array.isArray(info?.trail) && info.trail.length
            ? info.trail[info.trail.length - 1]
            : "";

    const chordLabel = pickedChord
        ? `${effectiveRoot} ${pickedChord.label}`
        : matchInfo
          ? `${effectiveRoot} ${getQuality(matchInfo)}`
          : "";

    // Fallback: try all 12 roots to auto-detect chord name after a fret nudge
    const autoChordLabel = React.useMemo(() => {
        if (chordLabel) return chordLabel;
        if (chordIntervalLabel) return chordIntervalLabel;
        if (!chordShape.length) return "";
        const rootSemi = noteNameToSemitone(effectiveRoot);
        for (const candidateRoot of CANONICAL_ROOTS) {
            const candidateSemi = noteNameToSemitone(candidateRoot);
            const semis = [
                ...new Set(
                    chordShape.map(n =>
                        wrap12((n.semitones ?? 0) + rootSemi - candidateSemi),
                    ),
                ),
            ].sort((a, b) => a - b);
            const quality = CHORD_QUALITY_MAP.get(semis.join(","));
            if (quality) return `${candidateRoot} ${quality}`;
        }
        return "";
    }, [chordLabel, chordIntervalLabel, chordShape, effectiveRoot]);

    const cycleBtn =
        "w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors";

    return (
        <div className='flex-1 min-h-0 flex flex-col text-ink'>
            {/* Chord picker overlay — rendered via portal to escape any parent clipping */}
            {chordPickerOpen &&
                typeof document !== "undefined" &&
                createPortal(
                    <div
                        className='fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40'
                        onClick={() => setChordPickerOpen(false)}>
                        <div
                            className='bg-sand-2 rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:w-80 max-h-72 flex flex-col'
                            onClick={e => e.stopPropagation()}>
                            <div className='px-4 py-3 border-b border-ink/10 shrink-0'>
                                <span className='text-sm font-bold text-ink'>
                                    {anchorMatches.length} chord
                                    {anchorMatches.length !== 1 ? "s" : ""}{" "}
                                    found
                                </span>
                            </div>
                            <div className='overflow-y-auto p-2'>
                                {anchorMatches.map((match, idx) => (
                                    <button
                                        key={`${match.qualityKey}-${match.posKey}-${idx}`}
                                        onClick={() => {
                                            setAnchorIndex(idx);
                                            applyAnchorMatch(match);
                                            setChordPickerOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 rounded-xl mb-1 transition-colors ${
                                            idx === anchorIndex
                                                ? "bg-ink text-sand-1"
                                                : "text-ink hover:bg-sand-3"
                                        }`}>
                                        <div className='text-sm font-semibold leading-tight'>
                                            {effectiveRoot} {match.displayLabel}
                                        </div>
                                        {match.contextLabel && (
                                            <div
                                                className={`text-xs leading-tight mt-0.5 ${idx === anchorIndex ? "opacity-60" : "text-ink/50"}`}>
                                                {match.contextLabel}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}

            {/* ── MOBILE (max-sm) ─────────────────────────────────────── */}
            <div className='sm:hidden flex-1 min-h-0 flex flex-col'>
                {/* Chord / scale label */}
                <div className='text-center px-4 pt-1 shrink-0'>
                    <span className='text-2xl font-bold tracking-tight'>
                        {autoChordLabel ||
                            (chordShape.length > 0 ? freeformLabel : root)}
                    </span>
                    {!chordLabel && scaleMatches.length > 0 && (
                        <p className='text-xs font-semibold text-ink/50 mt-0.5 leading-relaxed'>
                            {scaleMatches.map((m, i) => (
                                <React.Fragment
                                    key={`${m.scaleName}|${m.modeName ?? ""}`}>
                                    {i > 0 && <span className='mx-1'>·</span>}
                                    <span
                                        className={m.exact ? "" : "opacity-60"}>
                                        {m.modeName ?? m.scaleName}
                                        {!m.exact &&
                                            scaleMatches.length > 1 &&
                                            " *"}
                                    </span>
                                </React.Fragment>
                            ))}
                        </p>
                    )}
                </div>

                {/* Fretboard */}
                <div className='flex-1 min-h-0'>
                    <FretboardVertical
                        chordShape={correctedChordShape}
                        handedness={handedness}
                        interactive
                        onTogglePosition={({ string, fret }) =>
                            toggle(string, fret)
                        }
                        rootNote={effectiveRoot}
                        showIntervals={showIntervals}
                        showConnector={chordShape.length > 0}
                        interactivePositions={anchored ? selected : undefined}
                        capo={capo}
                        tuningFreqs={tuningFreqs}
                    />
                </div>

                {/* Note-roles strip */}
                {selected.size > 0 && (
                    <div className='shrink-0 border-t border-ink/20 bg-sand-1 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar'>
                        {selectedNoteInfos.map(
                            ({ key, noteName, intervalName }) => (
                                <div
                                    key={key}
                                    className='flex items-center gap-0.5 rounded-full border border-ink/40 text-ink px-1.5 py-0.5 text-xs font-semibold shrink-0'>
                                    <button
                                        onClick={() => nudgeNote(key, -1)}
                                        title='Nudge down'
                                        className='w-4 h-4 flex items-center justify-center opacity-60 hover:opacity-100'>
                                        ‹
                                    </button>
                                    <span className='px-0.5'>
                                        {noteName}
                                        <span className='opacity-60 ml-0.5'>
                                            {intervalName}
                                        </span>
                                    </span>
                                    <button
                                        onClick={() => nudgeNote(key, 1)}
                                        title='Nudge up'
                                        className='w-4 h-4 flex items-center justify-center opacity-60 hover:opacity-100'>
                                        ›
                                    </button>
                                </div>
                            ),
                        )}
                    </div>
                )}

                {/* Anchor cycling strip */}
                {anchored && (
                    <div className='shrink-0 border-t border-ink/20 bg-sand-1 px-3 py-1.5 flex items-center justify-center gap-1'>
                        {anchorMatches.length > 1 && (
                            <button
                                onClick={() => stepAnchor(-1)}
                                title='Previous voicing'
                                className={cycleBtn}>
                                <ChevronLeft />
                            </button>
                        )}
                        <button
                            onClick={() =>
                                anchorMatches.length > 0 &&
                                setChordPickerOpen(true)
                            }
                            className='flex flex-col items-center min-w-[6rem] text-center'>
                            {anchorMatches.length === 0 ? (
                                <span className='text-xs text-ink/50'>
                                    No matches
                                </span>
                            ) : (
                                <>
                                    <span className='text-xs font-semibold text-ink leading-tight'>
                                        {
                                            anchorMatches[anchorIndex]
                                                ?.displayLabel
                                        }
                                    </span>
                                    {anchorMatches[anchorIndex]
                                        ?.contextLabel && (
                                        <span className='text-[10px] text-ink/60 leading-tight'>
                                            {
                                                anchorMatches[anchorIndex]
                                                    .contextLabel
                                            }
                                        </span>
                                    )}
                                </>
                            )}
                        </button>
                        {anchorMatches.length > 1 && (
                            <button
                                onClick={() => stepAnchor(1)}
                                title='Next voicing'
                                className={cycleBtn}>
                                <ChevronRight />
                            </button>
                        )}
                        {anchorMatches.length > 1 && (
                            <span className='text-[10px] font-semibold text-ink ml-1'>
                                {anchorIndex + 1}/{anchorMatches.length}
                            </span>
                        )}

                        {availableAltsForUI.length > 1 && (
                            <>
                                <div className='w-px h-4 bg-ink mx-1' />
                                <button
                                    onClick={goPrevAlt}
                                    title='Previous alt shape'
                                    className={cycleBtn}>
                                    <ChevronLeft />
                                </button>
                                <span className='text-xs font-semibold text-ink w-8 text-center'>
                                    {selectedAltShape + 1}/
                                    {availableAltsForUI.length}
                                </span>
                                <button
                                    onClick={goNextAlt}
                                    title='Next alt shape'
                                    className={cycleBtn}>
                                    <ChevronRight />
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Position / alt strip */}
                {!anchored && positions.length > 0 && (
                    <div className='shrink-0 border-t border-ink/20 bg-sand-1 px-3 py-1.5 flex items-center justify-center gap-1'>
                        <button
                            onClick={goPrevPos}
                            className={cycleBtn}>
                            <ChevronLeft />
                        </button>
                        <span className='text-xs font-semibold text-ink min-w-[5rem] text-center'>
                            {(finalFormulas as any)?.[selectedPosition]?.name ||
                                selectedPosition ||
                                "–"}
                        </span>
                        <button
                            onClick={goNextPos}
                            className={cycleBtn}>
                            <ChevronRight />
                        </button>

                        {availableAltsForUI.length > 1 && (
                            <>
                                <div className='w-px h-4 bg-ink/20 mx-1' />
                                <button
                                    onClick={goPrevAlt}
                                    title='Previous alt shape'
                                    className={cycleBtn}>
                                    <ChevronLeft />
                                </button>
                                <span className='text-xs font-semibold text-ink w-8 text-center'>
                                    {selectedAltShape + 1}/
                                    {availableAltsForUI.length}
                                </span>
                                <button
                                    onClick={goNextAlt}
                                    title='Next alt shape'
                                    className={cycleBtn}>
                                    <ChevronRight />
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Control strip */}
                <div className='shrink-0 border-t border-ink/20 bg-sand-1 pt-2 pb-4 flex items-center gap-2 pr-4'>
                    {/* Scrollable left: root, toggles, capo, octave */}
                    <div className='flex-1 overflow-x-auto no-scrollbar'>
                        <div className='flex items-center gap-3 px-4 w-max'>
                            <button
                                onClick={() => setRootMenuOpen(true)}
                                title='Select root note'
                                className='shrink-0 w-9 h-9 flex items-center justify-center bg-ink text-sand-1 text-sm font-bold rounded-full'>
                                {root}
                            </button>

                            {rootMenuOpen && (
                                <div
                                    className='fixed inset-0 z-50 flex items-end justify-start bg-black/30 pb-17 pl-4'
                                    onClick={() => setRootMenuOpen(false)}>
                                    <div
                                        className='bg-sand-2 rounded-xl shadow-xl p-2 max-h-56 overflow-y-auto grid grid-cols-3 gap-1'
                                        onClick={e => e.stopPropagation()}>
                                        {NOTES.map(n => (
                                            <button
                                                key={n}
                                                onClick={() => {
                                                    setRoot(n);
                                                    setRootMenuOpen(false);
                                                }}
                                                className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${n === root ? "bg-sand-4 text-sand-1" : "bg-sand-1 text-ink hover:bg-sand-3"}`}>
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <NotesIntervalsToggle
                                showIntervals={showIntervals}
                                onToggle={setShowIntervals}
                            />

                            <button
                                onClick={() => setIsRight(h => !h)}
                                title={isRight ? "Right hand" : "Left hand"}
                                className='shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                                <HandIcon flipped={!isRight} />
                            </button>

                            <CapoButton capo={capo} setCapo={setCapo} size='sm' />

                            {hasOctave && (
                                <button
                                    onClick={() => setOctaveUp(o => !o)}
                                    className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${octaveUp ? "bg-ink text-sand-1 border-ink" : "border-ink/40 text-ink hover:border-ink"}`}>
                                    {octaveUp ? "-12" : "+12"}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Fixed right: save, progression, strum, anchor, clear */}
                    <div className='shrink-0 flex items-center gap-2'>
                        {chordShape.length > 0 && onSaveRequest && (
                            <button
                                onClick={() => onSaveRequest(chordShape, autoChordLabel || chordLabel || root)}
                                title='Save'
                                className='w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                                <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2}>
                                    <path d='M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' />
                                </svg>
                            </button>
                        )}

                        {chordShape.length > 0 && onProgressionRequest && (
                            <button
                                onClick={() => onProgressionRequest(chordShape, autoChordLabel || chordLabel || root)}
                                title='Add to Progression'
                                className='w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                                <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} strokeLinecap='round' strokeLinejoin='round'>
                                    <rect x='2' y='7' width='4' height='10' rx='1' />
                                    <rect x='9' y='4' width='4' height='13' rx='1' />
                                    <rect x='16' y='9' width='4' height='8' rx='1' />
                                </svg>
                            </button>
                        )}

                        {chordShape.length > 0 && (
                            <button
                                onClick={() => playChord(chordShape, tuningFreqs)}
                                title='Play'
                                className='w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                                <StrumIcon />
                            </button>
                        )}

                        {chordShape.length > 0 && (
                            <button
                                onClick={handleAnchor}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${anchored ? "bg-ink text-sand-1 border-ink" : "text-ink border-ink/40 hover:border-ink"}`}>
                                Anchor
                            </button>
                        )}

                        <button
                            onClick={clearAll}
                            className='px-4 py-1.5 text-xs font-semibold text-red-600 border border-red-600 rounded-full hover:bg-red-50 transition-colors'>
                            Clear
                        </button>
                    </div>
                </div>
            </div>

            {/* ── DESKTOP (sm+) ───────────────────────────────────────── */}
            <div className='hidden sm:flex flex-1 min-h-0 flex-col items-center gap-4 py-4'>
                {/* Chord label */}
                <div className='text-center px-4 w-full shrink-0'>
                    <span className='text-3xl font-bold tracking-tight'>
                        {autoChordLabel ||
                            (chordShape.length > 0 ? freeformLabel : root)}
                    </span>
                    {!chordLabel && scaleMatches.length > 0 && (
                        <p className='text-xs font-semibold text-ink/50 mt-0.5 leading-relaxed'>
                            {scaleMatches.map((m, i) => (
                                <React.Fragment
                                    key={`${m.scaleName}|${m.modeName ?? ""}`}>
                                    {i > 0 && <span className='mx-1'>·</span>}
                                    <span
                                        className={m.exact ? "" : "opacity-60"}>
                                        {m.modeName ?? m.scaleName}
                                        {!m.exact &&
                                            scaleMatches.length > 1 &&
                                            " *"}
                                    </span>
                                </React.Fragment>
                            ))}
                        </p>
                    )}
                </div>

                {/* Fretboard */}
                <div className='w-full px-4 shrink-0'>
                    <FretboardHorizontal
                        chordShape={correctedChordShape}
                        handedness={handedness}
                        interactive
                        onTogglePosition={({ string, fret }) =>
                            toggle(string, fret)
                        }
                        rootNote={effectiveRoot}
                        showIntervals={showIntervals}
                        showConnector={chordShape.length > 0}
                        interactivePositions={anchored ? selected : undefined}
                        capo={capo}
                        tuningFreqs={tuningFreqs}
                    />
                </div>

                {/* Note-roles strip */}
                {selected.size > 0 && (
                    <div className='flex items-center gap-2 flex-wrap justify-center px-4 shrink-0'>
                        {selectedNoteInfos.map(
                            ({ key, noteName, intervalName }) => (
                                <div
                                    key={key}
                                    className='flex items-center gap-0.5 rounded-full border border-ink/40 text-ink px-2 py-1 text-sm font-semibold'>
                                    <button
                                        onClick={() => nudgeNote(key, -1)}
                                        title='Nudge down'
                                        className='w-5 h-5 flex items-center justify-center opacity-60 hover:opacity-100'>
                                        ‹
                                    </button>
                                    <span className='px-1'>
                                        {noteName}
                                        <span className='opacity-60 ml-1'>
                                            {intervalName}
                                        </span>
                                    </span>
                                    <button
                                        onClick={() => nudgeNote(key, 1)}
                                        title='Nudge up'
                                        className='w-5 h-5 flex items-center justify-center opacity-60 hover:opacity-100'>
                                        ›
                                    </button>
                                </div>
                            ),
                        )}
                    </div>
                )}

                {/* Root grid */}
                <div className='flex flex-col items-center gap-1.5 shrink-0'>
                    <span className='text-xs font-semibold text-ink/60'>
                        Root
                    </span>
                    <div className='grid grid-cols-9 gap-1 max-w-2xl'>
                        {NOTES.map(n => (
                            <button
                                key={n}
                                onClick={() => setRoot(n)}
                                className={`px-3 py-1.5 text-sm font-semibold rounded border transition-colors ${
                                    n === root
                                        ? "bg-sand-4 text-sand-1 border-ink"
                                        : "bg-sand-1 text-ink border-ink/40 hover:border-ink"
                                }`}>
                                {n}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Anchor cycling row */}
                {anchored && (
                    <div className='flex items-center justify-center gap-3 px-4 shrink-0'>
                        {anchorMatches.length > 1 && (
                            <button
                                onClick={() => stepAnchor(-1)}
                                title='Previous voicing'
                                className={cycleBtn}>
                                <ChevronLeft />
                            </button>
                        )}
                        <button
                            onClick={() =>
                                anchorMatches.length > 0 &&
                                setChordPickerOpen(true)
                            }
                            className='flex flex-col items-center min-w-[8rem] text-center'>
                            {anchorMatches.length === 0 ? (
                                <span className='text-sm text-ink/50'>
                                    No matches
                                </span>
                            ) : (
                                <>
                                    <span className='text-sm font-semibold text-ink'>
                                        {
                                            anchorMatches[anchorIndex]
                                                ?.displayLabel
                                        }
                                    </span>
                                    {anchorMatches[anchorIndex]
                                        ?.contextLabel && (
                                        <span className='text-xs text-ink/50'>
                                            {
                                                anchorMatches[anchorIndex]
                                                    .contextLabel
                                            }
                                        </span>
                                    )}
                                </>
                            )}
                        </button>
                        {anchorMatches.length > 1 && (
                            <button
                                onClick={() => stepAnchor(1)}
                                title='Next voicing'
                                className={cycleBtn}>
                                <ChevronRight />
                            </button>
                        )}
                        {anchorMatches.length > 1 && (
                            <span className='text-xs text-ink/40'>
                                {anchorIndex + 1}/{anchorMatches.length}
                            </span>
                        )}
                    </div>
                )}

                {/* Position / alt row */}
                {((!anchored && positions.length > 0) ||
                    availableAltsForUI.length > 1) && (
                    <div className='flex items-center justify-center gap-4 px-4 shrink-0'>
                        {!anchored && positions.length > 0 && (
                            <div className='flex flex-col items-center gap-1.5'>
                                <span className='text-xs font-semibold text-ink/60'>
                                    Position
                                </span>
                                <div className='flex rounded overflow-hidden border border-ink'>
                                    {positions.map(pos => (
                                        <button
                                            key={pos}
                                            onClick={() => {
                                                setSelectedPosition(pos);
                                                setBrowsedVoicing(
                                                    pickVoicingFor(
                                                        pos,
                                                        selectedAltShape,
                                                        octaveUp,
                                                    ),
                                                );
                                            }}
                                            className={`px-3 py-1.5 text-sm font-medium border-r border-ink last:border-r-0 transition-colors ${
                                                selectedPosition === pos
                                                    ? "bg-sand-4 text-sand-1 font-semibold"
                                                    : "bg-sand-1 text-ink hover:bg-sand-2"
                                            }`}>
                                            {(
                                                finalFormulas?.[pos] as {
                                                    name?: string;
                                                } | null
                                            )?.name || pos}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {availableAltsForUI.length > 1 && (
                            <div className='flex flex-col items-center gap-1.5'>
                                <span className='text-xs font-semibold text-ink/60'>
                                    {anchored ? "Shape" : "Alternate Positions"}
                                </span>
                                <div className='flex items-center gap-2 border border-ink rounded overflow-hidden'>
                                    <button
                                        onClick={goPrevAlt}
                                        className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-r border-ink'>
                                        <ChevronLeft />
                                    </button>
                                    <span className='px-3 text-sm font-medium text-ink'>
                                        {selectedAltShape + 1}/
                                        {availableAltsForUI.length}
                                    </span>
                                    <button
                                        onClick={goNextAlt}
                                        className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-l border-ink'>
                                        <ChevronRight />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Controls row */}
                <div className='flex flex-wrap items-center justify-center gap-4 px-4 shrink-0'>
                    <button
                        onClick={() => setIsRight(h => !h)}
                        className='flex items-center gap-2 px-4 py-2 rounded-full border border-ink bg-sand-2 text-ink text-sm font-semibold hover:bg-sand-3 transition-colors'>
                        <HandIcon flipped={!isRight} />
                        {isRight ? "Right hand" : "Left hand"}
                    </button>

                    <NotesIntervalsToggle
                        showIntervals={showIntervals}
                        onToggle={setShowIntervals}
                    />

                    <CapoButton capo={capo} setCapo={setCapo} size='md' />

                    {hasOctave && (
                        <button
                            onClick={() => setOctaveUp(o => !o)}
                            className={`px-4 py-1.5 rounded-full border text-sm font-semibold transition-colors ${octaveUp ? "bg-ink text-sand-1 border-ink" : "border-ink/40 text-ink hover:border-ink"}`}>
                            {octaveUp ? "-12" : "+12"}
                        </button>
                    )}

                    {chordShape.length > 0 && onSaveRequest && (
                        <button
                            onClick={() => onSaveRequest(chordShape, autoChordLabel || chordLabel || root)}
                            title='Save'
                            className='w-10 h-10 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                            <svg className='w-5 h-5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2}>
                                <path d='M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' />
                            </svg>
                        </button>
                    )}

                    {chordShape.length > 0 && onProgressionRequest && (
                        <button
                            onClick={() => onProgressionRequest(chordShape, autoChordLabel || chordLabel || root)}
                            title='Add to Progression'
                            className='flex items-center gap-2 px-4 py-2 rounded-full border border-ink/40 text-ink text-sm font-semibold hover:border-ink transition-colors'>
                            <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} strokeLinecap='round' strokeLinejoin='round'>
                                <rect x='2' y='7' width='4' height='10' rx='1' />
                                <rect x='9' y='4' width='4' height='13' rx='1' />
                                <rect x='16' y='9' width='4' height='8' rx='1' />
                            </svg>
                            Progression
                        </button>
                    )}

                    {chordShape.length > 0 && (
                        <button
                            onClick={() => playChord(chordShape, tuningFreqs)}
                            title='Play'
                            className='w-10 h-10 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                            <StrumIcon className='w-7 h-7' />
                        </button>
                    )}

                    {chordShape.length > 0 && (
                        <button
                            onClick={handleAnchor}
                            className={`px-4 py-1.5 text-sm font-semibold rounded-full border transition-colors ${anchored ? "bg-ink text-sand-1 border-ink" : "text-ink border-ink/40 hover:border-ink"}`}>
                            Anchor
                        </button>
                    )}

                    <button
                        onClick={clearAll}
                        className='px-4 py-1.5 text-sm font-semibold text-red-600 border border-red-600 rounded-full hover:bg-red-50 transition-colors'>
                        Clear
                    </button>
                </div>
            </div>
        </div>
    );
}
