// Chords mode + Draw Mode, ported from ../../../app/page.tsx on the website.
// Matches the website's actual architecture: a single screen that toggles
// between the two (via `isDrawMode`), not separate OS-level tabs -- an
// earlier version of this port put Draw Mode in its own bottom tab, which
// doesn't match how the real app works and reads oddly with only two tabs
// ("Home"/"Draw") in the OS tab bar. The website enters/exits Draw Mode via
// a pencil-icon button in the Chords action bar and an "Exit Draw Mode" bar
// at the top while drawing; both are reproduced below.
//
// Chords mode: same state shape, same derivation logic (selectionHierarchy
// via useChordLibrary, voicingInfo's low/high octave split, capo-shifted
// display, category drill-down defaults), same controls -- root note,
// category -> voicing type -> string set -> chord quality -> position/"All",
// alt shapes (Pro-gated past the first), capo, handedness, notes/intervals,
// octave shift.
//
// Draw Mode: same freehand note drawing, chord auto-detection (including
// anchor mode, which locks onto a matched chord shape and lets you cycle
// voicings/alt-shapes/matches), scale-match detection, and per-note fret
// nudging as ../../components/DrawMode.tsx on the website. Only the mobile
// (sm:hidden) layout branch is ported (phone-only app). Capo and tuning are
// shared with Chords mode (as on the website, where they're passed down as
// props); everything else -- root, drawn notes, anchor state, hand/notes-
// intervals toggles -- is Draw Mode's own local state, same as the website
// (DrawMode.tsx manages those independently of page.tsx).
//
// On the website, entering Draw Mode is gated behind Pro (openPaywall
// ("drawmode") if !hasPro). There's no paywall/upgrade screen here yet (see
// the deferred-scope note below), so the gate is reproduced as a silent
// no-op -- same "shows a lock badge and doesn't advance" treatment already
// used for Pro-gated alt shapes here.
//
// Deferred to follow-up screens/commits, not silently dropped:
// - Randomize, Save/bookmark, Add-to-Progression (need lib/savedChords.ts +
//   a saved_chords/progressions Supabase round-trip), and the paywall UI
//   itself.
// - Scales mode, Scale Chords mode -- each its own future screen.
// - Real audio: playChord/playNote are stubbed (see ../../lib/guitarAudio).
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth-context";
import { usePreferences } from "../lib/preferences-context";
import Svg, { Path } from "react-native-svg";
import FretboardVertical from "../components/FretboardVertical";
import NotesIntervalsToggle from "../components/NotesIntervalsToggle";
import RootNoteButton from "../components/RootNoteButton";
import CapoButton from "../components/CapoButton";
import {
    allChordShapes,
    getFinalFormulasFromMatch,
    useCycleList,
} from "../lib/API";
import { playChord, playNote } from "../lib/guitarAudio";
import {
    generateAllVoicingsForShape,
    generateFretboardMap,
    NOTES,
    shuffleArray,
    type NotePosition,
} from "../lib/fretboardMap";
import { STANDARD_TUNING, TUNINGS, type Tuning } from "../lib/tunings";
import useChordLibrary from "../lib/hooks/useChordLibrary";
import {
    keyFromSelection,
    useDrawModeIndex,
} from "../lib/hooks/useDrawModeIndex";
import { useSubscription } from "../lib/hooks/useSubscription";
import { noteNameToSemitone, spellNote } from "../lib/MusicTheory";
import { CHORD_SHAPES } from "../lib/Shapes/Chords";
import { SCALE_SHAPES } from "../lib/Shapes/Scales";
import { colors, fonts, radius, spacing } from "../lib/theme";
import { fetchSavedChords, saveChord, type SavedChord, type SavedChordContext } from "../lib/savedChords";
import SavedChordsPanel from "../components/SavedChordsPanel";
import ProgressionPanel from "../components/ProgressionPanel";

type ChordLevel = {
    levelName?: string;
    options?: Record<string, ChordLevel>;
    altShapes?: ChordLevel[];
    pattern?: Array<{
        string: number;
        fretOffset: number;
        semitones: number;
        degree: number;
    }>;
    rootString?: number;
    name?: string;
};

const SEMIS = [...Array(12).keys()];

function voicingFretRange(v: NotePosition[]) {
    const frets = v
        .map(n => n.fret)
        .filter((f): f is number => f != null && f >= 0);
    if (!frets.length) return null;
    return { min: Math.min(...frets), max: Math.max(...frets) };
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
    return (
        <Svg
            width={20}
            height={20}
            fill='none'
            stroke={colors.ink}
            strokeWidth={2}
            viewBox='0 0 24 24'>
            <Path
                strokeLinecap='round'
                strokeLinejoin='round'
                d={direction === "left" ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"}
            />
        </Svg>
    );
}

function StarIcon() {
    return (
        <Svg
            width={10}
            height={10}
            viewBox='0 0 24 24'
            fill={colors.sand1}>
            <Path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
        </Svg>
    );
}

function StrumIcon() {
    return (
        <Svg
            width={20}
            height={20}
            viewBox='12.5 7.5 175 175'
            fill={colors.ink}>
            <Path d='M 42 58 C 56 23 144 23 158 58 C 169 80 118 168 100 165 C 82 168 31 80 42 58 Z' />
        </Svg>
    );
}

function HandIcon({ flipped }: { flipped: boolean }) {
    return (
        <Svg
            width={20}
            height={20}
            viewBox='0 0 640 640'
            fill={colors.ink}
            style={flipped ? { transform: [{ scaleX: -1 }] } : undefined}>
            <Path d='M352 96C352 78.3 337.7 64 320 64C302.3 64 288 78.3 288 96L288 304C288 312.8 280.8 320 272 320C263.2 320 256 312.8 256 304L256 128C256 110.3 241.7 96 224 96C206.3 96 192 110.3 192 128L192 400C192 401.5 192 403.1 192.1 404.6L131.6 347C115.6 331.8 90.3 332.4 75 348.4C59.7 364.4 60.4 389.7 76.4 405L188.8 512C231.9 553.1 289.2 576 348.8 576L368 576C465.2 576 544 497.2 544 400L544 192C544 174.3 529.7 160 512 160C494.3 160 480 174.3 480 192L480 304C480 312.8 472.8 320 464 320C455.2 320 448 312.8 448 304L448 128C448 110.3 433.7 96 416 96C398.3 96 384 110.3 384 128L384 304C384 312.8 376.8 320 368 320C359.2 320 352 312.8 352 304L352 96z' />
        </Svg>
    );
}

function PencilIcon() {
    return (
        <Svg
            width={20}
            height={20}
            viewBox='0 0 640 640'
            fill={colors.ink}>
            <Path d='M100.4 417.2C104.5 402.6 112.2 389.3 123 378.5L304.2 197.3L338.1 163.4C354.7 180 389.4 214.7 442.1 267.4L476 301.3L442.1 335.2L260.9 516.4C250.2 527.1 236.8 534.9 222.2 539L94.4 574.6C86.1 576.9 77.1 574.6 71 568.4C64.9 562.2 62.6 553.3 64.9 545L100.4 417.2zM156 413.5C151.6 418.2 148.4 423.9 146.7 430.1L122.6 517L209.5 492.9C215.9 491.1 221.7 487.8 226.5 483.2L155.9 413.5zM510 267.4C493.4 250.8 458.7 216.1 406 163.4L372 129.5C398.5 103 413.4 88.1 416.9 84.6C430.4 71 448.8 63.4 468 63.4C487.2 63.4 505.6 71 519.1 84.6L554.8 120.3C568.4 133.9 576 152.3 576 171.4C576 190.5 568.4 209 554.8 222.5C551.3 226 536.4 240.9 509.9 267.4z' />
        </Svg>
    );
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
    return (
        <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill={filled ? colors.ink : "none"}
            stroke={colors.ink}
            strokeWidth={2}>
            <Path strokeLinecap="round" strokeLinejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </Svg>
    );
}

function ListIcon() {
    return (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round">
            <Path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </Svg>
    );
}

// ─── Draw Mode helpers (module-level, ported verbatim from
// ../../components/DrawMode.tsx on the website) ────────────────────────────

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

const NUM_DRAW_FRETS = 24;
const DRAW_ROOT_NOTES = [
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

// Sizing for anchoring Draw Mode's own root popup above its button, same
// technique as ../../components/RootNoteButton.tsx (measureInWindow +
// clamped `left`, `bottom` positioned relative to the button).
const DRAW_ROOT_POPUP_WIDTH = 280;
const POPUP_GAP = 8;
const POPUP_MARGIN = 8;

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

export default function ChordsScreen() {
    const hasPro = useSubscription();
    const { session } = useAuth();
    const router = useRouter();

    // Unlike the earlier version of this app, sign-in is no longer forced on
    // launch (see app/_layout.tsx) -- the website doesn't require an account
    // just to browse Chords/Draw Mode either. This gate is what replaces
    // that: it only prompts sign-in for actions that actually need an
    // account (a Pro-gated feature today; saving a chord once that screen
    // exists). Being signed in but not Pro is a separate, already-handled
    // case -- see the deferred-paywall notes on handleAltChange/
    // handleToggleDrawMode below -- so this only fires when there's no
    // session at all.
    const [authGateReason, setAuthGateReason] = useState<"save" | "pro" | null>(null);

    // ─── Shared state (Chords + Draw Mode both use these) ─────────────────
    // Handedness and default tuning are persisted preferences on the
    // website (lib/contexts/PreferencesContext.tsx, backed by
    // localStorage); ported to ../lib/preferences-context.tsx here, backed
    // by AsyncStorage. Draw Mode does NOT read from these -- its own
    // handedness/tuning state is local and independent, same split as the
    // website (DrawMode.tsx owns that state itself).
    const preferences = usePreferences();
    const isRight = preferences.handedness === "right";
    const setIsRight = (v: boolean) => preferences.setHandedness(v ? "right" : "left");

    const [capo, setCapo] = useState(0);
    const [selectedTuning, setSelectedTuningRaw] = useState<Tuning>(
        () => TUNINGS.find((t) => t.name === preferences.tuningName) ?? STANDARD_TUNING,
    );
    const setSelectedTuning = (t: Tuning) => {
        setSelectedTuningRaw(t);
        preferences.setTuningName(t.name);
    };
    // Sync when the preference loads in (it starts as the "Standard"
    // default and resolves from AsyncStorage a tick later) or changes from
    // the settings drawer.
    useEffect(() => {
        setSelectedTuningRaw(TUNINGS.find((t) => t.name === preferences.tuningName) ?? STANDARD_TUNING);
    }, [preferences.tuningName]);

    const [isDrawMode, setIsDrawMode] = useState(false);

    // ─── Chords mode state ──────────────────────────────────────────────
    const [currentRootNote, setCurrentRootNote] = useState("C");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedVoicingType, setSelectedVoicingType] = useState("");
    const [selectedStringSet, setSelectedStringSet] = useState("");
    const [selectedChordQuality, setSelectedChordQuality] = useState("");
    const [selectedPosition, setSelectedPosition] = useState("All");
    const [selectedAltShape, setSelectedAltShape] = useState(0);

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

    const drillDownAndSetDefaults = (
        startLevel: ChordLevel | null | undefined,
    ) => {
        let currentLevel = startLevel;
        if (!currentLevel) return;
        let newVoicingType = "";
        let newStringSet = "";
        let newChordQuality = "";
        while (currentLevel && currentLevel.levelName && currentLevel.options) {
            const options: Record<string, ChordLevel> = currentLevel.options;
            const firstOption = Object.keys(options)[0];
            if (!firstOption) break;
            if (currentLevel.levelName === "Voicing Types")
                newVoicingType = firstOption;
            else if (currentLevel.levelName === "String Sets")
                newStringSet = firstOption;
            else if (currentLevel.levelName === "Chord Qualities")
                newChordQuality = firstOption;
            currentLevel = currentLevel.options[firstOption];
        }
        setSelectedVoicingType(newVoicingType);
        setSelectedStringSet(newStringSet);
        setSelectedChordQuality(newChordQuality);
    };

    const handleCategoryChange = (newCategory: string) => {
        setSelectedCategory(newCategory);
        setSelectedPosition("All");
        setSelectedAltShape(0);
        setOctaveUp(false);
        drillDownAndSetDefaults(
            (allChordShapes as Record<string, ChordLevel>)[newCategory],
        );
    };

    const getSetterForLevel = (levelName: string): ((v: string) => void) => {
        switch (levelName) {
            case "Voicing Types":
                return v => {
                    setSelectedVoicingType(v);
                    setOctaveUp(false);
                };
            case "String Sets":
                return v => {
                    setSelectedStringSet(v);
                    setOctaveUp(false);
                };
            case "Chord Qualities":
                return v => {
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
            const firstCategory = categories[0] || "";
            setSelectedCategory(firstCategory);
            drillDownAndSetDefaults(
                (allChordShapes as Record<string, ChordLevel>)[firstCategory],
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCategory]);

    const octaveFromDisplay = () => {
        const frets = displayShape
            .map(n => n.fret)
            .filter((f): f is number => f != null && f >= 0);
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
        { allToken: "All" },
    );

    const hasAlts = availableAlts.length > 1;
    const altsLocked = hasAlts && !hasPro;

    const handleAltChange = (i: number) => {
        if (i > 0 && !hasPro) {
            // No session at all -> prompt sign-in, since Pro isn't reachable
            // without an account. Signed in but not Pro -> deferred (no
            // paywall/upgrade screen exists yet), same lock-badge-only
            // treatment as before.
            if (!session) setAuthGateReason("pro");
            return;
        }
        setSelectedAltShape(i);
        setOctaveUp(octaveFromDisplay());
    };

    const { prev: goPrevAlt, next: goNextAlt } = useCycleList(
        availableAlts,
        selectedAltShape,
        handleAltChange,
    );

    const voicingInfo = useMemo(() => {
        if (selectedPosition === "All" || !currentRootNote) return null;
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
                ? Math.min(
                      ...highRanges
                          .filter((r): r is NonNullable<typeof r> => r !== null)
                          .map(r => r.min),
                  )
                : Infinity;
        const high = highAll.filter(
            (_, i) => (highRanges[i]?.min ?? Infinity) === lowestHighMin,
        );
        return {
            low,
            crossing,
            high,
            hasOctave: low.length > 0 && high.length > 0,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        selectedPosition,
        currentRootNote,
        selectedAltShape,
        availableAlts,
        fretboardMap,
        selectedTuning.semitones,
    ]);

    useEffect(() => {
        const formulas = selectionHierarchy.finalFormulas;
        if (!currentRootNote || !formulas) {
            setDisplayShape([]);
            return;
        }
        const primaryShapes: NotePosition[][] = [];
        if (selectedPosition === "All") {
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
    }, [
        currentRootNote,
        selectedPosition,
        selectionHierarchy.finalFormulas,
        fretboardMap,
        voicingInfo,
        octaveUp,
        selectedTuning.semitones,
    ]);

    const capoDisplayShape = useMemo(
        () =>
            capo === 0
                ? displayShape
                : displayShape.map(n => ({
                      ...n,
                      fret: n.fret != null ? n.fret + capo : n.fret,
                  })),
        [displayShape, capo],
    );
    const capoDisplayGroups = useMemo(
        () =>
            capo === 0
                ? displayGroups
                : displayGroups.map(group =>
                      group.map(n => ({
                          ...n,
                          fret: n.fret != null ? n.fret + capo : n.fret,
                      })),
                  ),
        [displayGroups, capo],
    );

    const capoRootNote = useMemo(() => {
        if (capo === 0) return currentRootNote;
        const idx = NOTES.findIndex(pair => pair.includes(currentRootNote));
        const shifted = NOTES[(idx + capo) % NOTES.length];
        return shifted[shifted.length - 1];
    }, [currentRootNote, capo]);

    const chordLabel =
        selectedCategory === "CAGED"
            ? capoRootNote
            : `${capoRootNote} ${selectedChordQuality}`;

    const handleGenerateNewRoot = () => {
        const deck = noteDeck.length ? [...noteDeck] : shuffleArray(SEMIS);
        const nextSem = deck.pop()!;
        setNoteDeck(deck);
        const candidates = NOTES[nextSem];
        const simple =
            candidates.find(r => !r.includes("#") && !r.includes("b")) ||
            candidates[1] ||
            candidates[0];
        setCurrentRootNote(simple);
    };

    const handedness = isRight ? "right" : "left";

    const handleToggleDrawMode = () => {
        if (!isDrawMode) {
            if (!hasPro) {
                if (!session) setAuthGateReason("pro");
                return;
            }
            setIsDrawMode(true);
        } else {
            setIsDrawMode(false);
        }
    };

    // ─── Draw Mode state (independent of Chords mode, except capo/tuning
    // above -- matches the website, where DrawMode.tsx owns this state
    // locally and only receives capo/tuning as props) ──────────────────
    const [drawRoot, setDrawRoot] = useState("C");
    const [drawShowIntervals, setDrawShowIntervals] = useState(false);
    const [drawRootMenuOpen, setDrawRootMenuOpen] = useState(false);
    const [drawRootAnchor, setDrawRootAnchor] = useState<{
        x: number;
        y: number;
        width: number;
        height: number;
    } | null>(null);
    const drawRootButtonRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const [drawIsRight, setDrawIsRight] = useState(true);
    const [drawSelected, setDrawSelected] = useState(new Set<string>());
    const [drawMatchInfo, setDrawMatchInfo] = useState<any>(null);
    const [drawSelectedPosition, setDrawSelectedPosition] = useState("");
    const [drawSelectedAltShape, setDrawSelectedAltShape] = useState(0);
    const [drawBrowsedVoicing, setDrawBrowsedVoicing] = useState<
        NotePosition[] | null
    >(null);
    const [drawPickedChord, setDrawPickedChord] = useState<{
        finalFormulas: Record<string, any>;
        posKey: string;
        label: string;
    } | null>(null);
    const [drawAnchored, setDrawAnchored] = useState(false);
    const [drawAnchorMatches, setDrawAnchorMatches] = useState<
        FlatChordMatch[]
    >([]);
    const [drawAnchorIndex, setDrawAnchorIndex] = useState(0);
    const [drawChordPickerOpen, setDrawChordPickerOpen] = useState(false);
    const [drawOctaveUp, setDrawOctaveUp] = useState(false);
    const [drawPivotKey, setDrawPivotKey] = useState<string | null>(null);
    const [drawPivotInterval, setDrawPivotInterval] = useState(0);

    const drawHandedness = drawIsRight ? "right" : "left";
    const drawTuning = selectedTuning.notes;
    const drawTuningFreqs = selectedTuning.freqs;

    const handleOpenDrawRootMenu = () => {
        drawRootButtonRef.current?.measureInWindow((x, y, width, height) => {
            setDrawRootAnchor({ x, y, width, height });
            setDrawRootMenuOpen(true);
        });
    };

    const drawRootPopupPosition = drawRootAnchor
        ? {
              position: "absolute" as const,
              bottom: screenHeight - drawRootAnchor.y + POPUP_GAP,
              left: Math.max(
                  POPUP_MARGIN,
                  Math.min(
                      screenWidth - DRAW_ROOT_POPUP_WIDTH - POPUP_MARGIN,
                      drawRootAnchor.x + drawRootAnchor.width / 2 - DRAW_ROOT_POPUP_WIDTH / 2,
                  ),
              ),
          }
        : null;

    const { index: drawIndex, fretboardMap: drawFretboardMap } =
        useDrawModeIndex({
            allChordShapes,
            tuning: drawTuning,
            numFrets: NUM_DRAW_FRETS,
            rootNote: drawRoot,
        });

    const drawEffectiveRoot = useMemo(() => {
        if (!drawPivotKey) return drawRoot;
        const [s, f] = drawPivotKey.split(":").map(Number);
        const cell = drawFretboardMap[s]?.[f];
        if (!cell) return drawRoot;
        const noteSemi = noteNameToSemitone(firstEnharmonic(cell));
        return CANONICAL_ROOTS[wrap12(noteSemi - drawPivotInterval)];
    }, [drawPivotKey, drawPivotInterval, drawRoot, drawFretboardMap]);

    const { finalFormulas: drawFinalFormulas, posKey: drawPosKey } =
        useMemo(() => {
            if (drawPickedChord) {
                return {
                    finalFormulas: drawPickedChord.finalFormulas,
                    posKey: drawPickedChord.posKey,
                };
            }
            return getFinalFormulasFromMatch(allChordShapes, drawMatchInfo);
        }, [drawMatchInfo, drawPickedChord]);

    const drawSelectedAsMap = useMemo(() => {
        const map = new Map<number, number>();
        for (const key of drawSelected) {
            const [s, f] = key.split(":").map(Number);
            if (!map.has(s) || f < map.get(s)!) map.set(s, f);
        }
        return map;
    }, [drawSelected]);

    const handleDrawToggle = (string: number, fret: number) => {
        const key = `${string}:${fret}`;
        if (drawAnchored) {
            if (!drawSelected.has(key)) return;
            const newSelected = new Set(drawSelected);
            newSelected.delete(key);
            setDrawSelected(newSelected);

            if (newSelected.size === 0) {
                setDrawAnchored(false);
                setDrawAnchorMatches([]);
                setDrawAnchorIndex(0);
                setDrawPickedChord(null);
                setDrawBrowsedVoicing(null);
                return;
            }

            const newMap = new Map<number, number>();
            for (const k of newSelected) {
                const [s, f] = k.split(":").map(Number);
                if (!newMap.has(s) || f < newMap.get(s)!) newMap.set(s, f);
            }
            const newSemis = [
                ...new Set(
                    [...newMap.entries()]
                        .map(([s, f]) => {
                            const cell = drawFretboardMap[s]?.[f];
                            if (!cell) return -1;
                            return wrap12(
                                noteNameToSemitone(firstEnharmonic(cell)) -
                                    noteNameToSemitone(drawEffectiveRoot),
                            );
                        })
                        .filter(s => s >= 0),
                ),
            ].sort((a, b) => a - b);

            const matches = findChordsAtPositions(
                newSemis,
                newMap,
                allChordShapes,
                drawEffectiveRoot,
                drawFretboardMap,
            );
            setDrawAnchorMatches(matches);
            setDrawAnchorIndex(0);
            if (matches[0]) {
                const match = matches[0];
                setDrawPickedChord({
                    finalFormulas: match.finalFormulas,
                    posKey: match.posKey,
                    label: match.displayLabel,
                });
                setDrawSelectedPosition(match.posKey);
                setDrawSelectedAltShape(0);
                setDrawOctaveUp(false);
                const posData = match.finalFormulas[match.posKey] as any;
                const variants = [
                    posData,
                    ...(Array.isArray(posData.altShapes)
                        ? posData.altShapes
                        : []),
                ];
                let picked: NotePosition[] | null = null;
                for (const formula of variants) {
                    const raw =
                        generateAllVoicingsForShape(
                            drawRoot,
                            formula,
                            drawFretboardMap,
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
                        picked = (hit as NotePosition[])
                            .slice()
                            .sort(
                                (a, b) =>
                                    a.string - b.string ||
                                    (a.fret ?? 0) - (b.fret ?? 0),
                            );
                        break;
                    }
                }
                setDrawBrowsedVoicing(picked);
            } else {
                setDrawPickedChord(null);
                setDrawBrowsedVoicing(null);
            }
            return;
        }
        setDrawSelected(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else {
                next.add(key);
                playNote(string, fret, drawTuningFreqs);
            }
            return next;
        });
    };

    useEffect(() => {
        setDrawSelected(new Set());
        setDrawAnchored(false);
        setDrawAnchorMatches([]);
        setDrawAnchorIndex(0);
        setDrawPickedChord(null);
        setDrawBrowsedVoicing(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [capo]);

    const clearDrawAll = () => {
        setDrawSelected(new Set());
        setDrawAnchored(false);
        setDrawAnchorMatches([]);
        setDrawAnchorIndex(0);
        setDrawPickedChord(null);
        setDrawBrowsedVoicing(null);
        setDrawPivotKey(null);
        setDrawPivotInterval(0);
        setDrawChordPickerOpen(false);
    };

    const pickDrawVoicingFor = (
        posKeyToUse: string,
        altIdxToUse: number,
        useOctaveUp = false,
        anchorPositions?: Map<number, number>,
    ): NotePosition[] | null => {
        if (!drawFinalFormulas || !drawFinalFormulas[posKeyToUse]) return null;
        const posData = drawFinalFormulas[posKeyToUse] as any;
        const variants = [
            posData,
            ...(Array.isArray(posData.altShapes) ? posData.altShapes : []),
        ];
        const formula = variants[altIdxToUse] ?? posData;
        if (!formula) return null;
        const raw =
            generateAllVoicingsForShape(
                drawEffectiveRoot,
                formula,
                drawFretboardMap,
            ) || [];
        const allVoicings: NotePosition[][] = Array.isArray(raw[0])
            ? (raw as any)
            : [raw as any];

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
                          v.length === drawSelectedAsMap.size &&
                          v.every((n: any) =>
                              new Set(drawSelectedAsMap.keys()).has(n.string),
                          ),
                  ) ||
                  pool[0] ||
                  allVoicings[0];

        if (!best) return null;
        return (best as NotePosition[])
            .slice()
            .sort(
                (a, b) => a.string - b.string || (a.fret ?? 0) - (b.fret ?? 0),
            );
    };

    const drawHasOctave = useMemo(() => {
        if (
            !drawFinalFormulas ||
            !drawSelectedPosition ||
            !drawFinalFormulas[drawSelectedPosition]
        )
            return false;
        const posData = drawFinalFormulas[drawSelectedPosition] as any;
        const variants = [
            posData,
            ...(Array.isArray(posData.altShapes) ? posData.altShapes : []),
        ];
        const formula = variants[drawSelectedAltShape] ?? posData;
        if (!Array.isArray(formula?.pattern)) return false;
        const raw =
            generateAllVoicingsForShape(
                drawEffectiveRoot,
                formula,
                drawFretboardMap,
            ) || [];
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
        drawFinalFormulas,
        drawSelectedPosition,
        drawSelectedAltShape,
        drawEffectiveRoot,
        drawFretboardMap,
    ]);

    useEffect(() => {
        if (drawSelectedPosition) {
            setDrawBrowsedVoicing(
                pickDrawVoicingFor(
                    drawSelectedPosition,
                    drawSelectedAltShape,
                    drawOctaveUp,
                ),
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawOctaveUp]);

    const drawChordShape: NotePosition[] = useMemo(() => {
        if (drawBrowsedVoicing?.length) return drawBrowsedVoicing;
        const shape: NotePosition[] = [];
        for (const key of drawSelected) {
            const [string, fret] = key.split(":").map(Number);
            const cell = drawFretboardMap[string]?.[fret];
            if (!cell) continue;
            const name = firstEnharmonic(cell);
            const semis = intervalSemitones(drawEffectiveRoot, name);
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
    }, [drawSelected, drawFretboardMap, drawEffectiveRoot, drawBrowsedVoicing]);

    const applyDrawAnchorMatch = (match: FlatChordMatch) => {
        setDrawPickedChord({
            finalFormulas: match.finalFormulas,
            posKey: match.posKey,
            label: match.displayLabel,
        });
        setDrawSelectedPosition(match.posKey);
        setDrawSelectedAltShape(0);
        setDrawOctaveUp(false);

        const posData = match.finalFormulas[match.posKey] as any;
        const variants = [
            posData,
            ...(Array.isArray(posData.altShapes) ? posData.altShapes : []),
        ];
        for (const formula of variants) {
            const raw =
                generateAllVoicingsForShape(
                    drawEffectiveRoot,
                    formula,
                    drawFretboardMap,
                ) || [];
            const voicings: NotePosition[][] = Array.isArray(raw[0])
                ? (raw as any)
                : [raw as any];
            const hit = voicings.find(v =>
                [...drawSelectedAsMap.entries()].every(([s, f]) =>
                    (v as NotePosition[]).some(
                        n => n.string === s && n.fret === f,
                    ),
                ),
            );
            if (hit) {
                setDrawBrowsedVoicing(
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
        setDrawBrowsedVoicing(null);
    };

    const handleDrawAnchor = () => {
        if (drawAnchored) {
            setDrawAnchored(false);
            setDrawAnchorMatches([]);
            setDrawAnchorIndex(0);
            setDrawPickedChord(null);
            setDrawPivotKey(null);
            setDrawPivotInterval(0);
            setDrawChordPickerOpen(false);
            return;
        }
        const drawnSemis = [
            ...new Set(drawChordShape.map(n => n.semitones ?? 0)),
        ].sort((a, b) => a - b);
        const matches = findChordsAtPositions(
            drawnSemis,
            drawSelectedAsMap,
            allChordShapes,
            drawEffectiveRoot,
            drawFretboardMap,
        );
        setDrawAnchorMatches(matches);
        setDrawAnchorIndex(0);
        setDrawAnchored(true);
        if (matches[0]) applyDrawAnchorMatch(matches[0]);
    };

    const stepDrawAnchor = (dir: 1 | -1) => {
        setDrawAnchorIndex(prev => {
            const next =
                (prev + dir + drawAnchorMatches.length) %
                drawAnchorMatches.length;
            applyDrawAnchorMatch(drawAnchorMatches[next]);
            return next;
        });
    };

    useEffect(() => {
        if (!drawPivotKey || !drawSelected.size) return;
        const newSemis = [
            ...new Set(
                [...drawSelectedAsMap.entries()]
                    .map(([s, f]) => {
                        const cell = drawFretboardMap[s]?.[f];
                        if (!cell) return -1;
                        return wrap12(
                            noteNameToSemitone(firstEnharmonic(cell)) -
                                noteNameToSemitone(drawEffectiveRoot),
                        );
                    })
                    .filter(v => v >= 0),
            ),
        ].sort((a, b) => a - b);
        const matches = findChordsAtPositions(
            newSemis,
            drawSelectedAsMap,
            allChordShapes,
            drawEffectiveRoot,
            drawFretboardMap,
        );
        setDrawAnchorMatches(matches);
        setDrawAnchorIndex(0);
        setDrawAnchored(true);
        if (matches[0]) applyDrawAnchorMatch(matches[0]);
        else {
            setDrawPickedChord(null);
            setDrawBrowsedVoicing(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawEffectiveRoot]);

    useEffect(() => {
        setDrawPivotKey(null);
        setDrawPivotInterval(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawRoot]);

    useEffect(() => {
        if (drawSelected.size === 0) {
            setDrawPivotKey(null);
            setDrawPivotInterval(0);
            setDrawChordPickerOpen(false);
        }
    }, [drawSelected]);

    const drawSelectedNoteInfos = useMemo(() => {
        return [...drawSelected]
            .map(key => {
                const [s, f] = key.split(":").map(Number);
                const cell = drawFretboardMap[s]?.[f];
                if (!cell) return null;
                const intervalSemi = wrap12(
                    noteNameToSemitone(firstEnharmonic(cell)) -
                        noteNameToSemitone(drawEffectiveRoot),
                );
                const degreeNum = semitonesToDegreeNumber(intervalSemi);
                const noteName = spellNote(
                    drawEffectiveRoot,
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
    }, [drawSelected, drawFretboardMap, drawEffectiveRoot]);

    const nudgeDrawNote = (key: string, dir: 1 | -1) => {
        const [s, f] = key.split(":").map(Number);
        const newFret = f + dir;
        if (newFret < 0 || newFret > NUM_DRAW_FRETS) return;
        const newKey = `${s}:${newFret}`;
        setDrawSelected(prev => {
            const next = new Set<string>();
            for (const k of prev) next.add(k === key ? newKey : k);
            return next;
        });
        if (drawAnchored) {
            setDrawAnchored(false);
            setDrawAnchorMatches([]);
            setDrawAnchorIndex(0);
            setDrawPickedChord(null);
            setDrawBrowsedVoicing(null);
        }
    };

    type ScaleMatch = {
        scaleName: string;
        modeName?: string;
        exact: boolean;
        degreeMap: Map<number, number> | null;
    };
    const drawScaleMatches = useMemo((): ScaleMatch[] => {
        const drawnSemis = [
            ...new Set(drawChordShape.map(n => n.semitones ?? 0)),
        ].sort((a, b) => a - b);
        if (drawnSemis.length < 3) return [];

        const results: ScaleMatch[] = [];
        for (const scales of Object.values(SCALE_SHAPES)) {
            for (const entry of Object.values(scales) as any[]) {
                for (let d = 0; d < entry.intervals.length; d++) {
                    const pivot = entry.intervals[d];
                    const rotatedArr = entry.intervals
                        .map((i: number) => (i - pivot + 12) % 12)
                        .sort((a: number, b: number) => a - b);
                    const rotated = new Set(rotatedArr);
                    if (!drawnSemis.every(s => rotated.has(s))) continue;
                    const degreeMap =
                        rotatedArr.length === 7
                            ? new Map<number, number>(
                                  rotatedArr.map((s: number, idx: number) => [
                                      s,
                                      idx + 1,
                                  ]),
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
    }, [drawChordShape]);

    const drawSpellDegreeMap = useMemo(
        () =>
            drawScaleMatches.find(m => m.degreeMap != null)?.degreeMap ?? null,
        [drawScaleMatches],
    );

    const drawnNotes = useMemo(() => {
        const semis = [
            ...new Set(drawChordShape.map(n => n.semitones ?? 0)),
        ].sort((a, b) => a - b);
        return semis
            .map(s => {
                const deg =
                    drawSpellDegreeMap?.get(s) ?? semitonesToDegreeNumber(s);
                return spellNote(drawEffectiveRoot, s, deg);
            })
            .join("  ");
    }, [drawChordShape, drawEffectiveRoot, drawSpellDegreeMap]);

    const drawnIntervals = useMemo(() => {
        const semis = [
            ...new Set(drawChordShape.map(n => n.semitones ?? 0)),
        ].sort((a, b) => a - b);
        return semis
            .map(s => {
                if (drawSpellDegreeMap) {
                    const deg = drawSpellDegreeMap.get(s);
                    if (deg != null) return spellDegree(s, deg);
                }
                return CHROMATIC_INTERVALS[s] ?? "?";
            })
            .join("  ");
    }, [drawChordShape, drawSpellDegreeMap]);

    const drawFreeformLabel = drawShowIntervals ? drawnIntervals : drawnNotes;

    const drawCorrectedChordShape = useMemo(() => {
        if (!drawSpellDegreeMap) return drawChordShape;
        return drawChordShape.map(pos => {
            const deg = drawSpellDegreeMap.get(pos.semitones ?? 0);
            return deg != null ? { ...pos, degree: deg } : pos;
        });
    }, [drawChordShape, drawSpellDegreeMap]);

    useEffect(() => {
        if (!drawSelectedAsMap.size) {
            setDrawMatchInfo(null);
            return;
        }
        const hit =
            drawIndex.get(
                `${drawRoot}::${keyFromSelection(drawSelectedAsMap)}`,
            ) || null;
        setDrawMatchInfo(hit);
    }, [drawSelectedAsMap, drawIndex, drawRoot]);

    const drawPositions = useMemo(
        () => (drawFinalFormulas ? Object.keys(drawFinalFormulas) : []),
        [drawFinalFormulas],
    );

    useEffect(() => {
        if (drawPickedChord) return;
        if (!drawMatchInfo || !drawFinalFormulas) {
            setDrawSelectedPosition("");
            setDrawSelectedAltShape(0);
            return;
        }
        const keys = Object.keys(drawFinalFormulas);
        if (!drawSelectedPosition || !drawFinalFormulas[drawSelectedPosition]) {
            setDrawSelectedPosition(
                drawPosKey && drawFinalFormulas[drawPosKey]
                    ? drawPosKey
                    : keys[0] || "",
            );
        }
        const posData = drawFinalFormulas[
            drawSelectedPosition || drawPosKey || keys[0]
        ] as any;
        const altCount = 1 + (posData?.altShapes?.length || 0);
        if (drawSelectedAltShape >= altCount) setDrawSelectedAltShape(0);
    }, [
        drawMatchInfo,
        drawFinalFormulas,
        drawPosKey,
        drawSelectedPosition,
        drawSelectedAltShape,
        drawPickedChord,
    ]);

    const drawChordIntervalMatch = useMemo(() => {
        if (!drawChordShape.length) return null;
        const semis = [
            ...new Set(drawChordShape.map(n => n.semitones ?? 0)),
        ].sort((a, b) => a - b);
        return CHORD_QUALITY_MAP.get(semis.join(",")) ?? null;
    }, [drawChordShape]);

    const drawChordIntervalLabel = drawChordIntervalMatch
        ? `${drawEffectiveRoot} ${drawChordIntervalMatch}`
        : "";

    const drawLastFamilyRef = useRef("");
    const drawFamilyKey = drawMatchInfo
        ? `${drawMatchInfo.difficulty}|${drawMatchInfo.category}|${(drawMatchInfo.trail || []).join(">")}`
        : "";

    useEffect(() => {
        if (drawPickedChord) return;
        if (!drawMatchInfo || !drawFinalFormulas) {
            setDrawSelectedPosition("");
            setDrawSelectedAltShape(0);
            drawLastFamilyRef.current = "";
            return;
        }
        if (drawFamilyKey !== drawLastFamilyRef.current) {
            drawLastFamilyRef.current = drawFamilyKey;
            const keys = Object.keys(drawFinalFormulas);
            const nextPos =
                drawMatchInfo.posKey && drawFinalFormulas[drawMatchInfo.posKey]
                    ? drawMatchInfo.posKey
                    : keys[0] || "";
            setDrawSelectedPosition(nextPos);
            const altCount =
                1 +
                ((drawFinalFormulas[nextPos] as any)?.altShapes?.length || 0);
            setDrawSelectedAltShape(
                Math.min(drawMatchInfo.altIdx ?? 0, altCount - 1),
            );
        }
    }, [
        drawFamilyKey,
        drawMatchInfo,
        drawFinalFormulas,
        drawRoot,
        drawPickedChord,
    ]);

    useEffect(() => {
        if (drawAnchored) return;
        setDrawBrowsedVoicing(null);
        setDrawPickedChord(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawSelected]);
    useEffect(() => {
        setDrawBrowsedVoicing(null);
    }, [drawFamilyKey]);

    const drawAvailableAltsForUI = useMemo(() => {
        if (
            !drawFinalFormulas ||
            !drawSelectedPosition ||
            !drawFinalFormulas[drawSelectedPosition]
        )
            return [];
        const base = drawFinalFormulas[drawSelectedPosition] as any;
        return [base, ...(Array.isArray(base.altShapes) ? base.altShapes : [])];
    }, [drawFinalFormulas, drawSelectedPosition]);

    const drawSafeCurrent = drawPositions.includes(drawSelectedPosition)
        ? drawSelectedPosition
        : drawPositions[0] || "";
    const { prev: goPrevDrawPos, next: goNextDrawPos } = useCycleList(
        drawPositions,
        drawSafeCurrent,
        p => {
            setDrawSelectedPosition(p);
            setDrawBrowsedVoicing(
                pickDrawVoicingFor(
                    p,
                    drawSelectedAltShape,
                    drawOctaveUp,
                    drawAnchored ? drawSelectedAsMap : undefined,
                ),
            );
        },
    );
    const { prev: goPrevDrawAlt, next: goNextDrawAlt } = useCycleList(
        drawAvailableAltsForUI,
        drawSelectedAltShape,
        idx => {
            setDrawSelectedAltShape(idx as unknown as number);
            setDrawBrowsedVoicing(
                pickDrawVoicingFor(
                    drawSelectedPosition,
                    idx as unknown as number,
                    drawOctaveUp,
                    drawAnchored ? drawSelectedAsMap : undefined,
                ),
            );
        },
    );

    const getDrawQuality = (info: any) =>
        Array.isArray(info?.trail) && info.trail.length
            ? info.trail[info.trail.length - 1]
            : "";

    const drawChordLabel = drawPickedChord
        ? `${drawEffectiveRoot} ${drawPickedChord.label}`
        : drawMatchInfo
          ? `${drawEffectiveRoot} ${getDrawQuality(drawMatchInfo)}`
          : "";

    const drawAutoChordLabel = useMemo(() => {
        if (drawChordLabel) return drawChordLabel;
        if (drawChordIntervalLabel) return drawChordIntervalLabel;
        if (!drawChordShape.length) return "";
        const rootSemi = noteNameToSemitone(drawEffectiveRoot);
        for (const candidateRoot of CANONICAL_ROOTS) {
            const candidateSemi = noteNameToSemitone(candidateRoot);
            const semis = [
                ...new Set(
                    drawChordShape.map(n =>
                        wrap12((n.semitones ?? 0) + rootSemi - candidateSemi),
                    ),
                ),
            ].sort((a, b) => a - b);
            const quality = CHORD_QUALITY_MAP.get(semis.join(","));
            if (quality) return `${candidateRoot} ${quality}`;
        }
        return "";
    }, [
        drawChordLabel,
        drawChordIntervalLabel,
        drawChordShape,
        drawEffectiveRoot,
    ]);

    // ─── Saved chords (both modes) ──────────────────────────────────────
    // Port of the "saved chords" slice of ../../app/page.tsx plus
    // ../../components/SavedChordsPanel.tsx. openSave/handleSaveConfirm/
    // handleLoadSaved live here (rather than split per-mode) since they're
    // genuinely shared logic on the website too -- one save dialog, one
    // panel, fed by whichever mode's "Save" button was tapped.
    const userId = session?.user?.id ?? null;
    const [savedChordKeys, setSavedChordKeys] = useState<Set<string>>(new Set());
    const [savedPanelOpen, setSavedPanelOpen] = useState(false);
    const [savedRefreshKey, setSavedRefreshKey] = useState(0);
    const [saveDialog, setSaveDialog] = useState<{
        label: string;
        notes: NotePosition[];
        context: SavedChordContext;
    } | null>(null);
    const [saveLabel, setSaveLabel] = useState("");
    const [saving, setSaving] = useState(false);
    const [drawPreloadNotes, setDrawPreloadNotes] = useState<NotePosition[] | null>(null);

    const chordSignature = (notes: NotePosition[]) =>
        `${selectedTuning.name}|${capo}|${notes
            .map((n) => `${n.string}:${n.fret}`)
            .sort()
            .join(",")}`;

    useEffect(() => {
        if (!userId) {
            setSavedChordKeys(new Set());
            return;
        }
        fetchSavedChords()
            .then((chords) => {
                setSavedChordKeys(
                    new Set(
                        chords.map(
                            (c) =>
                                `${c.context.tuningName}|${c.context.capo}|${c.notes
                                    .map((n) => `${n.string}:${n.fret}`)
                                    .sort()
                                    .join(",")}`,
                        ),
                    ),
                );
            })
            .catch(() => {});
    }, [userId, savedRefreshKey]);

    const openSave = (notes: NotePosition[], label: string, context: SavedChordContext) => {
        if (!userId) {
            setAuthGateReason("save");
            return;
        }
        setSaveLabel(label);
        setSaveDialog({ label, notes, context });
    };

    const handleSaveConfirm = async () => {
        if (!saveDialog) return;
        setSaving(true);
        try {
            await saveChord({ ...saveDialog, label: saveLabel.trim() || saveDialog.label });
            setSavedChordKeys((prev) => new Set([...prev, chordSignature(saveDialog.notes)]));
            setSaveDialog(null);
            setSavedRefreshKey((k) => k + 1);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const handleLoadSaved = (chord: SavedChord) => {
        const ctx = chord.context;
        if (ctx.source === "draw") {
            // Matches the website exactly -- a saved Draw Mode chord
            // restores the drawn notes but not capo/tuning (DrawMode.tsx's
            // preloadNotes prop only ever touched `selected`).
            setIsDrawMode(true);
            setDrawPreloadNotes(chord.notes);
            return;
        }
        setIsDrawMode(false);
        setCurrentRootNote(ctx.rootNote);
        setCapo(ctx.capo);
        const t = TUNINGS.find((t) => t.name === ctx.tuningName);
        if (t) setSelectedTuning(t);
        if (ctx.mode === "chords") {
            setSelectedCategory(ctx.category);
            setSelectedVoicingType(ctx.voicingType);
            setSelectedStringSet(ctx.stringSet);
            setSelectedChordQuality(ctx.chordQuality);
            setSelectedPosition(ctx.position);
            setSelectedAltShape(ctx.altShape);
        }
        // ctx.mode === "scales" isn't restorable yet -- Scales mode doesn't
        // exist in this app yet (see the Phase 2 sequencing notes elsewhere
        // in this project). The chord still shows up in the panel and can
        // be renamed/deleted, just not loaded.
    };

    // Restore a saved Draw Mode chord when handleLoadSaved sets it, same
    // effect DrawMode.tsx runs on its preloadNotes prop.
    useEffect(() => {
        if (!drawPreloadNotes?.length) return;
        setDrawSelected(new Set(drawPreloadNotes.map((n) => `${n.string}:${n.fret}`)));
        setDrawBrowsedVoicing(null);
        setDrawMatchInfo(null);
        setDrawPreloadNotes(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawPreloadNotes]);

    const isCurrentChordSaved = capoDisplayShape.length > 0 && savedChordKeys.has(chordSignature(capoDisplayShape));
    const isDrawChordSaved = drawChordShape.length > 0 && savedChordKeys.has(chordSignature(drawChordShape));

    // ─── Progression builder (both modes) ──────────────────────────────
    const [progressionPanelOpen, setProgressionPanelOpen] = useState(false);
    const [progressionPendingChord, setProgressionPendingChord] = useState<{
        label: string;
        notes: NotePosition[];
        tuningName: string;
        tuningFreqs?: number[];
        capo: number;
    } | null>(null);

    const currentChordForProgression = isDrawMode
        ? drawChordShape.length > 0
            ? {
                  label: drawAutoChordLabel || drawChordLabel || drawRoot,
                  notes: drawChordShape,
                  tuningName: selectedTuning.name,
                  tuningFreqs: drawTuningFreqs,
                  capo,
              }
            : null
        : capoDisplayShape.length > 0
          ? {
                label: chordLabel,
                notes: capoDisplayShape,
                tuningName: selectedTuning.name,
                tuningFreqs: selectedTuning.freqs,
                capo,
            }
          : null;

    const authGateCopy =
        authGateReason === "save"
            ? {
                  title: "Sign in to save",
                  body: "Create a free account to save chords and access them anywhere.",
              }
            : {
                  title: "Sign in to unlock Pro",
                  body: "Create a free account, then upgrade to Pro for alt shapes, Draw Mode, and more.",
              };

    const authGateModal = (
        <Modal
            visible={authGateReason !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setAuthGateReason(null)}>
            <Pressable
                style={styles.authGateBackdrop}
                onPress={() => setAuthGateReason(null)}>
                <Pressable style={styles.authGateCard} onPress={() => {}}>
                    <Text style={styles.authGateTitle}>{authGateCopy.title}</Text>
                    <Text style={styles.authGateBody}>{authGateCopy.body}</Text>
                    <TouchableOpacity
                        style={styles.authGateSignInButton}
                        onPress={() => {
                            setAuthGateReason(null);
                            router.push("/sign-in");
                        }}>
                        <Text style={styles.authGateSignInText}>Sign in</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.authGateCancelButton}
                        onPress={() => setAuthGateReason(null)}>
                        <Text style={styles.authGateCancelText}>Cancel</Text>
                    </TouchableOpacity>
                </Pressable>
            </Pressable>
        </Modal>
    );

    const saveDialogModal = (
        <Modal visible={saveDialog !== null} transparent animationType="fade" onRequestClose={() => setSaveDialog(null)}>
            <Pressable style={styles.authGateBackdrop} onPress={() => setSaveDialog(null)}>
                <Pressable style={styles.authGateCard} onPress={() => {}}>
                    <Text style={styles.authGateTitle}>Save chord</Text>
                    <TextInput
                        autoFocus
                        style={styles.saveInput}
                        value={saveLabel}
                        onChangeText={setSaveLabel}
                        placeholder="Chord name…"
                        placeholderTextColor={`${colors.ink}66`}
                        onSubmitEditing={handleSaveConfirm}
                    />
                    <View style={styles.saveDialogRow}>
                        <TouchableOpacity style={styles.saveDialogCancel} onPress={() => setSaveDialog(null)}>
                            <Text style={styles.saveDialogCancelText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.saveDialogConfirm, saving && styles.saveDialogConfirmDisabled]}
                            onPress={handleSaveConfirm}
                            disabled={saving}>
                            <Text style={styles.saveDialogConfirmText}>{saving ? "Saving…" : "Save"}</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );

    const savedChordsPanel = (
        <SavedChordsPanel
            visible={savedPanelOpen}
            onClose={() => setSavedPanelOpen(false)}
            onLoad={handleLoadSaved}
            refreshKey={savedRefreshKey}
            onChange={() => setSavedRefreshKey((k) => k + 1)}
        />
    );

    const progressionPanel = (
        <ProgressionPanel
            visible={progressionPanelOpen}
            onClose={() => setProgressionPanelOpen(false)}
            currentChord={currentChordForProgression}
            onAuthRequired={() => setAuthGateReason("save")}
            pendingChord={progressionPendingChord}
            onPendingConsumed={() => setProgressionPendingChord(null)}
        />
    );

    if (isDrawMode) {
        return (
            <SafeAreaView
                style={styles.safeArea}
                edges={["top"]}>
                {/* Exit bar */}
                <View style={styles.exitBar}>
                    <TouchableOpacity
                        onPress={handleToggleDrawMode}
                        style={styles.exitButton}>
                        <ChevronIcon direction='left' />
                        <Text style={styles.exitButtonText}>
                            Exit Draw Mode
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Chord / scale label */}
                <View style={styles.header}>
                    <Text style={styles.headerText}>
                        {drawAutoChordLabel ||
                            (drawChordShape.length > 0
                                ? drawFreeformLabel
                                : drawRoot)}
                    </Text>
                    {!drawChordLabel && drawScaleMatches.length > 0 && (
                        <Text
                            style={styles.scaleCaption}
                            numberOfLines={2}>
                            {drawScaleMatches
                                .map(
                                    m =>
                                        (m.modeName ?? m.scaleName) +
                                        (!m.exact && drawScaleMatches.length > 1
                                            ? " *"
                                            : ""),
                                )
                                .join("  ·  ")}
                        </Text>
                    )}
                </View>

                {/* Fretboard */}
                <View style={styles.fretboardArea}>
                    <FretboardVertical
                        chordShape={drawCorrectedChordShape}
                        handedness={drawHandedness}
                        interactive
                        onTogglePosition={({ string, fret }) =>
                            handleDrawToggle(string, fret)
                        }
                        rootNote={drawEffectiveRoot}
                        showIntervals={drawShowIntervals}
                        showConnector={drawChordShape.length > 0}
                        interactivePositions={
                            drawAnchored ? drawSelected : undefined
                        }
                        capo={capo}
                        tuningFreqs={drawTuningFreqs}
                    />
                </View>

                {/* Note-roles strip */}
                {drawSelected.size > 0 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.noteStrip}
                        contentContainerStyle={styles.noteStripContent}>
                        {drawSelectedNoteInfos.map(
                            ({ key, noteName, intervalName }) => (
                                <View
                                    key={key}
                                    style={styles.notePill}>
                                    <TouchableOpacity
                                        onPress={() => nudgeDrawNote(key, -1)}
                                        style={styles.noteNudge}>
                                        <Text style={styles.noteNudgeText}>
                                            ‹
                                        </Text>
                                    </TouchableOpacity>
                                    <Text style={styles.notePillText}>
                                        {noteName}
                                        <Text style={styles.notePillInterval}>
                                            {" "}
                                            {intervalName}
                                        </Text>
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => nudgeDrawNote(key, 1)}
                                        style={styles.noteNudge}>
                                        <Text style={styles.noteNudgeText}>
                                            ›
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            ),
                        )}
                    </ScrollView>
                )}

                {/* Anchor cycling strip */}
                {drawAnchored && (
                    <View style={styles.stepperRow}>
                        {drawAnchorMatches.length > 1 && (
                            <TouchableOpacity
                                onPress={() => stepDrawAnchor(-1)}
                                style={styles.chevronButton}>
                                <ChevronIcon direction='left' />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={() =>
                                drawAnchorMatches.length > 0 &&
                                setDrawChordPickerOpen(true)
                            }
                            style={styles.anchorLabelWrap}>
                            {drawAnchorMatches.length === 0 ? (
                                <Text style={styles.stepperLabelMuted}>
                                    No matches
                                </Text>
                            ) : (
                                <>
                                    <Text style={styles.stepperLabel}>
                                        {
                                            drawAnchorMatches[drawAnchorIndex]
                                                ?.displayLabel
                                        }
                                    </Text>
                                    {!!drawAnchorMatches[drawAnchorIndex]
                                        ?.contextLabel && (
                                        <Text style={styles.anchorContext}>
                                            {
                                                drawAnchorMatches[
                                                    drawAnchorIndex
                                                ].contextLabel
                                            }
                                        </Text>
                                    )}
                                </>
                            )}
                        </TouchableOpacity>
                        {drawAnchorMatches.length > 1 && (
                            <TouchableOpacity
                                onPress={() => stepDrawAnchor(1)}
                                style={styles.chevronButton}>
                                <ChevronIcon direction='right' />
                            </TouchableOpacity>
                        )}
                        {drawAnchorMatches.length > 1 && (
                            <Text style={styles.anchorCount}>
                                {drawAnchorIndex + 1}/{drawAnchorMatches.length}
                            </Text>
                        )}
                        {drawAvailableAltsForUI.length > 1 && (
                            <>
                                <View style={styles.divider} />
                                <TouchableOpacity
                                    onPress={goPrevDrawAlt}
                                    style={styles.chevronButton}>
                                    <ChevronIcon direction='left' />
                                </TouchableOpacity>
                                <Text style={styles.altLabel}>
                                    {drawSelectedAltShape + 1}/
                                    {drawAvailableAltsForUI.length}
                                </Text>
                                <TouchableOpacity
                                    onPress={goNextDrawAlt}
                                    style={styles.chevronButton}>
                                    <ChevronIcon direction='right' />
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                )}

                {/* Position / alt strip */}
                {!drawAnchored && drawPositions.length > 0 && (
                    <View style={styles.stepperRow}>
                        <TouchableOpacity
                            onPress={goPrevDrawPos}
                            style={styles.chevronButton}>
                            <ChevronIcon direction='left' />
                        </TouchableOpacity>
                        <Text style={styles.stepperLabel}>
                            {(drawFinalFormulas as any)?.[drawSelectedPosition]
                                ?.name ||
                                drawSelectedPosition ||
                                "–"}
                        </Text>
                        <TouchableOpacity
                            onPress={goNextDrawPos}
                            style={styles.chevronButton}>
                            <ChevronIcon direction='right' />
                        </TouchableOpacity>

                        {drawAvailableAltsForUI.length > 1 && (
                            <>
                                <View style={styles.divider} />
                                <TouchableOpacity
                                    onPress={goPrevDrawAlt}
                                    style={styles.chevronButton}>
                                    <ChevronIcon direction='left' />
                                </TouchableOpacity>
                                <Text style={styles.altLabel}>
                                    {drawSelectedAltShape + 1}/
                                    {drawAvailableAltsForUI.length}
                                </Text>
                                <TouchableOpacity
                                    onPress={goNextDrawAlt}
                                    style={styles.chevronButton}>
                                    <ChevronIcon direction='right' />
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                )}

                {/* Chord picker modal (anchor mode: browse all matches) */}
                <Modal
                    visible={drawChordPickerOpen}
                    transparent
                    animationType='fade'
                    onRequestClose={() => setDrawChordPickerOpen(false)}>
                    <Pressable
                        style={styles.sheetBackdrop}
                        onPress={() => setDrawChordPickerOpen(false)}>
                        <Pressable
                            style={styles.pickerSheet}
                            onPress={() => {}}>
                            <Text style={styles.pickerHeader}>
                                {drawAnchorMatches.length} chord
                                {drawAnchorMatches.length !== 1 ? "s" : ""}{" "}
                                found
                            </Text>
                            <ScrollView>
                                {drawAnchorMatches.map((match, idx) => (
                                    <TouchableOpacity
                                        key={`${match.qualityKey}-${match.posKey}-${idx}`}
                                        onPress={() => {
                                            setDrawAnchorIndex(idx);
                                            applyDrawAnchorMatch(match);
                                            setDrawChordPickerOpen(false);
                                        }}
                                        style={[
                                            styles.pickerRow,
                                            idx === drawAnchorIndex &&
                                                styles.pickerRowActive,
                                        ]}>
                                        <Text
                                            style={[
                                                styles.pickerRowLabel,
                                                idx === drawAnchorIndex &&
                                                    styles.pickerRowLabelActive,
                                            ]}>
                                            {drawEffectiveRoot}{" "}
                                            {match.displayLabel}
                                        </Text>
                                        {!!match.contextLabel && (
                                            <Text
                                                style={[
                                                    styles.pickerRowContext,
                                                    idx === drawAnchorIndex &&
                                                        styles.pickerRowContextActive,
                                                ]}>
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
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.controlScrollContent}>
                        <TouchableOpacity
                            ref={drawRootButtonRef}
                            onPress={handleOpenDrawRootMenu}
                            style={styles.rootCircleButton}>
                            <Text style={styles.rootCircleButtonText}>
                                {drawRoot}
                            </Text>
                        </TouchableOpacity>

                        <NotesIntervalsToggle
                            showIntervals={drawShowIntervals}
                            onToggle={setDrawShowIntervals}
                        />

                        <TouchableOpacity
                            onPress={() => setDrawIsRight(h => !h)}
                            style={styles.iconButton}>
                            <HandIcon flipped={!drawIsRight} />
                        </TouchableOpacity>

                        <CapoButton
                            capo={capo}
                            setCapo={setCapo}
                        />

                        {drawHasOctave && (
                            <TouchableOpacity
                                onPress={() => setDrawOctaveUp(o => !o)}
                                style={[
                                    styles.octaveButton,
                                    drawOctaveUp && styles.octaveButtonActive,
                                ]}>
                                <Text
                                    style={[
                                        styles.octaveButtonText,
                                        drawOctaveUp &&
                                            styles.octaveButtonTextActive,
                                    ]}>
                                    {drawOctaveUp ? "-12" : "+12"}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>

                    <View style={styles.controlFixedRight}>
                        {drawChordShape.length > 0 && (
                            <TouchableOpacity
                                onPress={() =>
                                    playChord(drawChordShape, drawTuningFreqs)
                                }
                                style={styles.iconButton}>
                                <StrumIcon />
                            </TouchableOpacity>
                        )}
                        {drawChordShape.length > 0 && (
                            <TouchableOpacity
                                onPress={() =>
                                    openSave(
                                        drawChordShape,
                                        drawAutoChordLabel || drawChordLabel || drawRoot,
                                        { source: "draw", tuningName: selectedTuning.name, capo },
                                    )
                                }
                                style={styles.iconButton}>
                                <BookmarkIcon filled={isDrawChordSaved} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={() => setSavedPanelOpen(true)}
                            style={styles.iconButton}>
                            <BookmarkIcon filled />
                        </TouchableOpacity>
                        {drawChordShape.length > 0 && (
                            <TouchableOpacity
                                onPress={() => {
                                    setProgressionPendingChord({
                                        label: drawAutoChordLabel || drawChordLabel || drawRoot,
                                        notes: drawChordShape,
                                        tuningName: selectedTuning.name,
                                        tuningFreqs: drawTuningFreqs,
                                        capo,
                                    });
                                    setProgressionPanelOpen(true);
                                }}
                                style={styles.iconButton}>
                                <ListIcon />
                            </TouchableOpacity>
                        )}
                        {drawChordShape.length > 0 && (
                            <TouchableOpacity
                                onPress={handleDrawAnchor}
                                style={[
                                    styles.anchorButton,
                                    drawAnchored && styles.anchorButtonActive,
                                ]}>
                                <Text
                                    style={[
                                        styles.anchorButtonText,
                                        drawAnchored &&
                                            styles.anchorButtonTextActive,
                                    ]}>
                                    Anchor
                                </Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={clearDrawAll}
                            style={styles.clearButton}>
                            <Text style={styles.clearButtonText}>Clear</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Root note picker modal -- anchored above the root button,
                    same measureInWindow technique as
                    ../components/RootNoteButton.tsx (this one has its own
                    inline picker rather than reusing that component, since
                    it's a plain grid with no sharp/flat toggle). */}
                <Modal
                    visible={drawRootMenuOpen}
                    transparent
                    animationType='fade'
                    onRequestClose={() => setDrawRootMenuOpen(false)}>
                    <Pressable
                        style={styles.plainBackdrop}
                        onPress={() => setDrawRootMenuOpen(false)}>
                        <Pressable
                            style={[styles.rootGridPopup, drawRootPopupPosition]}
                            onPress={() => {}}>
                            <View style={styles.rootGrid}>
                                {DRAW_ROOT_NOTES.map(n => (
                                    <TouchableOpacity
                                        key={n}
                                        onPress={() => {
                                            setDrawRoot(n);
                                            setDrawRootMenuOpen(false);
                                        }}
                                        style={[
                                            styles.rootGridButton,
                                            n === drawRoot &&
                                                styles.rootGridButtonActive,
                                        ]}>
                                        <Text
                                            style={[
                                                styles.rootGridButtonText,
                                                n === drawRoot &&
                                                    styles.rootGridButtonTextActive,
                                            ]}>
                                            {n}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </Pressable>
                    </Pressable>
                </Modal>

                {authGateModal}
                {saveDialogModal}
                {savedChordsPanel}
                {progressionPanel}
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView
            style={styles.safeArea}
            edges={["top"]}>
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
                    chordGroups={
                        capoDisplayGroups.length > 0
                            ? capoDisplayGroups
                            : undefined
                    }
                    playOnClick
                    capo={capo}
                    tuningFreqs={selectedTuning.freqs}
                />
            </View>

            {/* Position / alt-shape row */}
            <View style={[styles.stepperRow, styles.chordsStepperRow]}>
                <TouchableOpacity
                    onPress={() => setMenuOpen(true)}
                    style={styles.menuButton}>
                    <Text style={styles.menuButtonText}>Menu</Text>
                </TouchableOpacity>

                {voicingInfo?.hasOctave && (
                    <TouchableOpacity
                        onPress={() => setOctaveUp(o => !o)}
                        style={[
                            styles.pillButton,
                            octaveUp && styles.pillButtonActive,
                        ]}>
                        <Text
                            style={[
                                styles.pillButtonText,
                                octaveUp && styles.pillButtonTextActive,
                            ]}>
                            {octaveUp ? "+12" : "-12"}
                        </Text>
                    </TouchableOpacity>
                )}

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.stepperScroll}
                    contentContainerStyle={styles.stepperScrollContent}>
                    {selectionHierarchy.positions.length > 0 && (
                        <View style={styles.stepperGroup}>
                            <TouchableOpacity
                                onPress={() => handlePositionChange("All")}
                                style={[
                                    styles.allButton,
                                    selectedPosition === "All" &&
                                        styles.allButtonActive,
                                ]}>
                                <Text
                                    style={[
                                        styles.allButtonText,
                                        selectedPosition === "All" &&
                                            styles.allButtonTextActive,
                                    ]}>
                                    All
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={goPrevPos}
                                style={styles.chevronButton}>
                                <ChevronIcon direction='left' />
                            </TouchableOpacity>
                            <Text style={styles.stepperLabel}>
                                {selectionHierarchy.finalFormulas?.[
                                    selectedPosition
                                ]?.name || selectedPosition}
                            </Text>
                            <TouchableOpacity
                                onPress={goNextPos}
                                style={styles.chevronButton}>
                                <ChevronIcon direction='right' />
                            </TouchableOpacity>
                        </View>
                    )}

                    {hasAlts && (
                        <View style={styles.stepperGroup}>
                            <TouchableOpacity
                                onPress={goPrevAlt}
                                style={styles.chevronButton}>
                                <ChevronIcon direction='left' />
                            </TouchableOpacity>
                            <View style={styles.altLabelWrap}>
                                {altsLocked && (
                                    <View style={styles.lockBadge}>
                                        <StarIcon />
                                    </View>
                                )}
                                <Text
                                    style={[
                                        styles.stepperLabel,
                                        altsLocked && styles.altLabelLocked,
                                    ]}>
                                    {`${selectedAltShape + 1}/${availableAlts.length}`}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={goNextAlt}
                                style={styles.chevronButton}>
                                <ChevronIcon direction='right' />
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </View>

            {/* Action bar */}
            <View style={styles.actionBar}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.actionScroll}
                    contentContainerStyle={styles.actionScrollContent}>
                    <NotesIntervalsToggle
                        showIntervals={showIntervals}
                        onToggle={setShowIntervals}
                    />

                    <TouchableOpacity
                        onPress={() => setIsRight(!isRight)}
                        style={styles.iconButton}>
                        <HandIcon flipped={!isRight} />
                    </TouchableOpacity>

                    <CapoButton
                        capo={capo}
                        setCapo={setCapo}
                    />

                    <TouchableOpacity
                        onPress={() =>
                            playChord(
                                capoDisplayShape as any,
                                selectedTuning.freqs,
                            )
                        }
                        style={styles.iconButton}>
                        <StrumIcon />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleToggleDrawMode}
                        style={styles.iconButton}>
                        {!hasPro && (
                            <View style={styles.proBadge}>
                                <StarIcon />
                            </View>
                        )}
                        <PencilIcon />
                    </TouchableOpacity>

                    {capoDisplayShape.length > 0 && (
                        <TouchableOpacity
                            onPress={() =>
                                openSave(capoDisplayShape, chordLabel, {
                                    source: "library",
                                    mode: "chords",
                                    rootNote: capoRootNote,
                                    tuningName: selectedTuning.name,
                                    capo,
                                    category: selectedCategory,
                                    voicingType: selectedVoicingType,
                                    stringSet: selectedStringSet,
                                    chordQuality: selectedChordQuality,
                                    position: selectedPosition,
                                    altShape: selectedAltShape,
                                })
                            }
                            style={styles.iconButton}>
                            <BookmarkIcon filled={isCurrentChordSaved} />
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        onPress={() => setSavedPanelOpen(true)}
                        style={styles.iconButton}>
                        <BookmarkIcon filled />
                    </TouchableOpacity>

                    {capoDisplayShape.length > 0 && (
                        <TouchableOpacity
                            onPress={() => {
                                setProgressionPendingChord({
                                    label: chordLabel,
                                    notes: capoDisplayShape,
                                    tuningName: selectedTuning.name,
                                    tuningFreqs: selectedTuning.freqs,
                                    capo,
                                });
                                setProgressionPanelOpen(true);
                            }}
                            style={styles.iconButton}>
                            <ListIcon />
                        </TouchableOpacity>
                    )}
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
            <Modal
                visible={menuOpen}
                transparent
                animationType='slide'
                onRequestClose={() => setMenuOpen(false)}>
                <Pressable
                    style={styles.sheetBackdrop}
                    onPress={() => setMenuOpen(false)}>
                    <Pressable
                        style={styles.sheet}
                        onPress={() => {}}>
                        <ScrollView contentContainerStyle={styles.sheetContent}>
                            <Text style={styles.sheetSectionLabel}>
                                Category
                            </Text>
                            <View style={styles.pillWrap}>
                                {Object.keys(allChordShapes).map(cat => (
                                    <TouchableOpacity
                                        key={cat}
                                        onPress={() =>
                                            handleCategoryChange(cat)
                                        }
                                        style={[
                                            styles.pillButton,
                                            selectedCategory === cat &&
                                                styles.pillButtonActive,
                                        ]}>
                                        <Text
                                            style={[
                                                styles.pillButtonText,
                                                selectedCategory === cat &&
                                                    styles.pillButtonTextActive,
                                            ]}>
                                            {cat}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {selectionHierarchy.subLevels.map(level => {
                                const setter = getSetterForLevel(
                                    level.levelName,
                                );
                                const selectedValue =
                                    level.levelName === "Voicing Types"
                                        ? selectedVoicingType
                                        : level.levelName === "String Sets"
                                          ? selectedStringSet
                                          : selectedChordQuality;
                                return (
                                    <View key={level.levelName}>
                                        <Text style={styles.sheetSectionLabel}>
                                            {level.levelName}
                                        </Text>
                                        <View style={styles.pillWrap}>
                                            {level.options.map(option => (
                                                <TouchableOpacity
                                                    key={option}
                                                    onPress={() =>
                                                        setter(option)
                                                    }
                                                    style={[
                                                        styles.pillButton,
                                                        selectedValue ===
                                                            option &&
                                                            styles.pillButtonActive,
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            styles.pillButtonText,
                                                            selectedValue ===
                                                                option &&
                                                                styles.pillButtonTextActive,
                                                        ]}>
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
                                {TUNINGS.map(t => (
                                    <TouchableOpacity
                                        key={t.name}
                                        onPress={() => setSelectedTuning(t)}
                                        style={[
                                            styles.pillButton,
                                            selectedTuning.name === t.name &&
                                                styles.pillButtonActive,
                                        ]}>
                                        <Text
                                            style={[
                                                styles.pillButtonText,
                                                selectedTuning.name ===
                                                    t.name &&
                                                    styles.pillButtonTextActive,
                                            ]}>
                                            {t.name}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>

                        <TouchableOpacity
                            onPress={() => setMenuOpen(false)}
                            style={styles.sheetDoneButton}>
                            <Text style={styles.sheetDoneText}>Done</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            {authGateModal}
            {saveDialogModal}
            {savedChordsPanel}
            {progressionPanel}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        alignItems: "center",
        paddingTop: spacing.xs,
    },
    headerText: {
        fontFamily: fonts.sans.bold,
        fontSize: 22,
        color: colors.ink,
    },
    scaleCaption: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: `${colors.ink}80`,
        textAlign: "center",
        marginTop: 2,
        paddingHorizontal: spacing.md,
    },
    fretboardArea: {
        flex: 1,
        minHeight: 0,
    },
    exitBar: {
        paddingHorizontal: spacing.md,
        paddingTop: spacing.xs,
        paddingBottom: spacing.xs,
    },
    exitButton: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 4,
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    exitButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
    },
    stepperRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs + 2,
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
        backgroundColor: colors.bg,
        minHeight: 44,
    },
    // The website's Chords/Scales menu+octave+position/alt row uses py-2
    // (8px) -- a touch more than Draw Mode's anchor/position rows (py-1.5,
    // 6px, already matched by stepperRow above), which also use stepperRow.
    chordsStepperRow: {
        paddingVertical: spacing.sm,
    },
    // A horizontal ScrollView clips its content to its own bounds by
    // default (same as `overflow: hidden` on the web), which is why
    // lockBadge's negative `top` offset was getting cut off -- unlike the
    // website's `overflow-x-auto`, which only affects the x axis and
    // leaves vertical overflow visible. `overflow: 'visible'` here turns
    // off RN's clipping the same way, without needing extra padding that
    // would grow the row's height.
    stepperScroll: {
        flex: 1,
        overflow: "visible",
    },
    stepperScrollContent: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: spacing.xs,
    },
    stepperGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    menuButton: {
        flexDirection: "row",
        alignItems: "center",
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
        alignItems: "center",
        justifyContent: "center",
    },
    stepperLabel: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
        minWidth: 56,
        textAlign: "center",
    },
    stepperLabelMuted: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: `${colors.ink}80`,
    },
    anchorLabelWrap: {
        minWidth: 96,
        alignItems: "center",
    },
    anchorContext: {
        fontSize: 10,
        color: `${colors.ink}99`,
    },
    anchorCount: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 10,
        color: colors.ink,
        marginLeft: 4,
    },
    divider: {
        width: 1,
        height: 16,
        backgroundColor: `${colors.ink}33`,
        marginHorizontal: 4,
    },
    altLabel: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
        width: 32,
        textAlign: "center",
    },
    altLabelWrap: {
        position: "relative",
        alignItems: "center",
        justifyContent: "center",
    },
    // Top-right corner overlay, same treatment as proBadge on the Draw
    // Mode pencil button -- relies on stepperScroll's `overflow: 'visible'`
    // to render outside the label without being clipped by the row's
    // horizontal ScrollView.
    lockBadge: {
        position: "absolute",
        top: -10,
        right: 6,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.olive,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
    },
    altLabelLocked: {
        opacity: 0.5,
    },
    actionBar: {
        flexDirection: "row",
        alignItems: "center",
        // Matches the website's mobile action bar: gap-3 (12px) between the
        // scrollable icon row and the fixed root-note button.
        gap: spacing.sm + 4,
        paddingHorizontal: spacing.sm + 8,
        paddingVertical: spacing.sm,
        paddingBottom: spacing.md,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
        backgroundColor: colors.bg,
    },
    // See stepperScroll's comment -- same overflow-visible fix for
    // proBadge on the pencil (Draw Mode) button in this row.
    actionScroll: {
        overflow: "visible",
    },
    actionScrollContent: {
        flexDirection: "row",
        alignItems: "center",
        // gap-3 (12px) and py-2.5 (10px) on the website's inner scrollable
        // row -- the vertical padding in particular was missing here,
        // which is most of why this bar read as tighter/smaller than the
        // website's.
        gap: spacing.sm + 4,
        paddingVertical: spacing.sm + 2,
        paddingRight: spacing.sm,
    },
    iconButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
        alignItems: "center",
        justifyContent: "center",
    },
    proBadge: {
        position: "absolute",
        // See lockBadge's comment -- actionScroll's `overflow: 'visible'`
        // is what keeps this negative top offset from being clipped.
        top: -3,
        right: -4,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.olive,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99,
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
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.35)",
    },
    plainBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.3)",
    },
    sheet: {
        maxHeight: "80%",
        backgroundColor: colors.bg,
        borderTopLeftRadius: radius["2xl"],
        borderTopRightRadius: radius["2xl"],
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
        textTransform: "uppercase",
        color: `${colors.ink}80`,
        marginBottom: spacing.xs,
    },
    pillWrap: {
        flexDirection: "row",
        flexWrap: "wrap",
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
        alignItems: "center",
    },
    sheetDoneText: {
        fontFamily: fonts.sans.bold,
        fontSize: 14,
        color: colors.sand1,
    },
    // ─── Draw Mode styles ───────────────────────────────────────────────
    noteStrip: {
        flexGrow: 0,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
        backgroundColor: colors.sand1,
    },
    noteStripContent: {
        alignItems: "center",
        gap: 6,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
    },
    notePill: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
        paddingHorizontal: spacing.xs + 2,
        paddingVertical: 2,
    },
    noteNudge: {
        width: 16,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    noteNudgeText: {
        color: `${colors.ink}99`,
        fontSize: 12,
    },
    notePillText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
        paddingHorizontal: 2,
    },
    notePillInterval: {
        color: `${colors.ink}99`,
    },
    pickerSheet: {
        width: "85%",
        maxHeight: "60%",
        backgroundColor: colors.sand2,
        borderRadius: radius.xl,
        padding: spacing.sm,
    },
    pickerHeader: {
        fontFamily: fonts.sans.bold,
        fontSize: 13,
        color: colors.ink,
        padding: spacing.xs,
        textAlign: "center",
    },
    pickerRow: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
        borderRadius: radius.lg,
        marginBottom: 2,
    },
    pickerRowActive: {
        backgroundColor: colors.ink,
    },
    pickerRowLabel: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: colors.ink,
    },
    pickerRowLabelActive: {
        color: colors.sand1,
    },
    pickerRowContext: {
        fontSize: 11,
        color: `${colors.ink}80`,
        marginTop: 2,
    },
    pickerRowContextActive: {
        color: `${colors.sand1}99`,
    },
    controlStrip: {
        flexDirection: "row",
        alignItems: "center",
        // Matches the website's Draw Mode control strip: pt-2 (8px, was
        // 4px here) and gap-2 (8px) between the scrollable controls and
        // the fixed strum/save/anchor/clear group.
        gap: spacing.xs + 4,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
        backgroundColor: colors.sand1,
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
        paddingRight: spacing.md,
    },
    controlScrollContent: {
        flexGrow: 1,
        alignItems: "center",
        // gap-3 (12px) on the website's inner scrollable row.
        gap: spacing.sm + 4,
        paddingHorizontal: spacing.md,
    },
    rootCircleButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.ink,
        alignItems: "center",
        justifyContent: "center",
    },
    rootCircleButtonText: {
        fontFamily: fonts.sans.bold,
        fontSize: 13,
        color: colors.sand1,
    },
    octaveButton: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    octaveButtonActive: {
        backgroundColor: colors.ink,
        borderColor: colors.ink,
    },
    octaveButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: colors.ink,
    },
    octaveButtonTextActive: {
        color: colors.sand1,
    },
    controlFixedRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs + 4,
    },
    anchorButton: {
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    anchorButtonActive: {
        backgroundColor: colors.ink,
        borderColor: colors.ink,
    },
    anchorButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: colors.ink,
    },
    anchorButtonTextActive: {
        color: colors.sand1,
    },
    clearButton: {
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: "#dc2626",
    },
    clearButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: "#dc2626",
    },
    rootGridPopup: {
        backgroundColor: colors.sand2,
        borderRadius: radius.xl,
        padding: spacing.sm,
        width: 280,
    },
    rootGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 4,
        justifyContent: "center",
    },
    rootGridButton: {
        width: 56,
        height: 36,
        borderRadius: radius.md,
        backgroundColor: colors.sand1,
        alignItems: "center",
        justifyContent: "center",
    },
    rootGridButtonActive: {
        backgroundColor: colors.ink,
    },
    rootGridButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
    },
    rootGridButtonTextActive: {
        color: colors.sand1,
    },
    // ─── Auth gate modal ────────────────────────────────────────────────
    authGateBackdrop: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.4)",
        padding: spacing.md,
    },
    authGateCard: {
        width: "100%",
        maxWidth: 320,
        backgroundColor: colors.bg,
        borderRadius: radius["2xl"],
        padding: spacing.lg,
        gap: spacing.sm,
    },
    authGateTitle: {
        fontFamily: fonts.sans.bold,
        fontSize: 18,
        color: colors.ink,
        textAlign: "center",
    },
    authGateBody: {
        fontFamily: fonts.sans.regular,
        fontSize: 13,
        color: `${colors.ink}99`,
        textAlign: "center",
        lineHeight: 18,
        marginBottom: spacing.xs,
    },
    authGateSignInButton: {
        backgroundColor: colors.ink,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm + 4,
        alignItems: "center",
    },
    authGateSignInText: {
        fontFamily: fonts.sans.bold,
        fontSize: 14,
        color: colors.sand1,
    },
    authGateCancelButton: {
        paddingVertical: spacing.xs + 4,
        alignItems: "center",
    },
    authGateCancelText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: `${colors.ink}80`,
    },
    // ─── Save dialog (shares authGateBackdrop/authGateCard) ──────────────
    saveInput: {
        width: "100%",
        backgroundColor: colors.sand2,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: `${colors.ink}33`,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 4,
        fontFamily: fonts.sans.regular,
        fontSize: 14,
        color: colors.ink,
    },
    saveDialogRow: {
        flexDirection: "row",
        gap: spacing.sm,
        width: "100%",
    },
    saveDialogCancel: {
        flex: 1,
        paddingVertical: spacing.sm + 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}4D`,
        alignItems: "center",
    },
    saveDialogCancelText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: colors.ink,
    },
    saveDialogConfirm: {
        flex: 1,
        paddingVertical: spacing.sm + 4,
        borderRadius: radius.pill,
        backgroundColor: colors.ink,
        alignItems: "center",
    },
    saveDialogConfirmDisabled: {
        opacity: 0.5,
    },
    saveDialogConfirmText: {
        fontFamily: fonts.sans.bold,
        fontSize: 13,
        color: colors.sand1,
    },
});
