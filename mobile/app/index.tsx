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
// ("drawmode") if !hasPro). Here: signed out -> the sign-in gate, signed in
// but not Pro -> the paywall (components/ProModals.tsx).
//
// Deferred to follow-up screens/commits, not silently dropped:
// - Randomize, Save/bookmark, Add-to-Progression (need lib/savedChords.ts +
//   a saved_chords/progressions Supabase round-trip), and the paywall UI
//   itself.
// - Scales mode, Scale Chords mode -- each its own future screen.
// - Audio: playChord/playNote synthesize and play via expo-audio (see
//   ../lib/guitarAudio).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Modal,
    Pressable,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth-context";
import { usePreferences } from "../lib/preferences-context";
import Svg, { Path, Rect } from "react-native-svg";
import FretboardVertical from "../components/FretboardVertical";
import { PaywallModal, ProWelcomeModal, SignInToUnlockModal } from "../components/ProModals";
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
    STANDARD_MIDI,
    type NotePosition,
} from "../lib/fretboardMap";
import { STANDARD_TUNING, TUNINGS, type Tuning } from "../lib/tunings";
import useChordLibrary from "../lib/hooks/useChordLibrary";
import {
    keyFromSelection,
    useDrawModeIndex,
} from "../lib/hooks/useDrawModeIndex";
import { useSubscriptionStatus } from "../lib/hooks/useSubscription";
import {
    MAJOR_SCALE_OFFSETS,
    noteNameToSemitone,
    spellInterval,
    spellNote,
} from "../lib/MusicTheory";
import { CHORD_SHAPES } from "../lib/Shapes/Chords";
import { SCALE_SHAPES } from "../lib/Shapes/Scales";
import { fonts, radius, spacing, type Palette } from "../lib/theme";
import { useTheme, useThemedStyles } from "../lib/theme-context";
import { fetchSavedChords, saveChord, type SavedChord, type SavedChordContext } from "../lib/savedChords";
import SavedChordsPanel from "../components/SavedChordsPanel";
import ProgressionPanel from "../components/ProgressionPanel";
import RandomizeSheet, {
    EMPTY_CHORD_RANDOMIZE,
    EMPTY_SCALE_RANDOMIZE,
    type ChordRandomizeConfig,
    type ScaleRandomizeConfig,
} from "../components/RandomizeSheet";

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

// Same shape as the website's SessionState, minus the scaleChords fields
// (that mode isn't ported yet).
const SESSION_STORAGE_KEY = "shapeshifter_session_v1";
const PENDING_INTENT_KEY = "ss_pending_intent";
type PendingIntent = { intent?: string; value?: string | number; ts?: number; signedOut?: boolean };
const PENDING_INTENT_MAX_AGE_MS = 15 * 60 * 1000;
// Long enough for a closing sheet/panel Modal (200-300ms slide) to finish
// before another Modal is presented; see openPaywall.
const MODAL_DISMISS_MS = 450;
type SessionState = {
    selectedMode?: "chords" | "scales";
    currentRootNote?: string;
    capo?: number;
    showIntervals?: boolean;
    selectedCategory?: string;
    selectedVoicingType?: string;
    selectedStringSet?: string;
    selectedChordQuality?: string;
    selectedPosition?: string;
    selectedAltShape?: number;
    selectedNoteGroup?: string;
    selectedScale?: string;
    selectedScalePosition?: number;
    selectedScalePattern?: string;
    selectedScaleVariant?: number;
    showAllScalePositions?: boolean;
};

// Lets the Menu sheet's backdrop animate its own opacity while remaining
// tappable-to-dismiss (Animated.View isn't pressable on its own).
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function voicingFretRange(v: NotePosition[]) {
    const frets = v
        .map(n => n.fret)
        .filter((f): f is number => f != null && f >= 0);
    if (!frets.length) return null;
    return { min: Math.min(...frets), max: Math.max(...frets) };
}

// Port of ../../app/page.tsx's wrapAtParen -- long scale/mode names with a
// parenthetical ("Dorian (2nd mode)") read better on two lines. The website
// does this with a <br/>; RN's Text renders \n natively, so no JSX needed.
function wrapAtParen(text: string): string {
    const idx = text.indexOf(" (");
    if (idx === -1) return text;
    return `${text.slice(0, idx)}\n${text.slice(idx + 1)}`;
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
    const { colors } = useTheme();
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

function MenuIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={14} height={14} fill='none' stroke={colors.ink} strokeWidth={2} viewBox='0 0 24 24'>
            <Path strokeLinecap='round' strokeLinejoin='round' d='M4 6h16M4 12h16M4 18h16' />
        </Svg>
    );
}

function StarIcon() {
    const { colors } = useTheme();
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
    const { colors } = useTheme();
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

function RandomizeIcon({ color }: { color?: string }) {
    const { colors } = useTheme();
    return (
        <Svg
            width={16}
            height={16}
            fill='none'
            stroke={color ?? colors.ink}
            strokeWidth={2}
            viewBox='0 0 24 24'
            strokeLinecap='round'
            strokeLinejoin='round'>
            <Path d='M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22' />
            <Path d='m18 2 4 4-4 4' />
            <Path d='M2 6h1.9c1.5 0 2.9.9 3.5 2.2' />
            <Path d='M22 18h-5.9c-1.3 0-2.5-.7-3.1-1.8l-.5-.8' />
            <Path d='m18 14 4 4-4 4' />
        </Svg>
    );
}

function StopIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={20} height={20} viewBox='0 0 24 24' fill={colors.sand1}>
            <Rect x={5} y={5} width={14} height={14} rx={2} />
        </Svg>
    );
}

function HandIcon({ flipped }: { flipped: boolean }) {
    const { colors } = useTheme();
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
    const { colors } = useTheme();
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

// Tailwind's yellow-400 -- the website's saved-chord color (text-yellow-400).
const SAVED_YELLOW = "#facc15";

// Website's BookmarkIcon uses fill/stroke="currentColor" for both, so the
// per-chord Save button's saved/unsaved color swap (ink -> yellow-400) just
// falls out of the button's own text-color className. RN has no
// currentColor equivalent, so that swap is an explicit `color` prop here
// instead -- the "My Chords" panel-open buttons don't pass one and stay
// ink, same as the website (they're never wrapped in that yellow class).
function BookmarkIcon({ filled = false, color }: { filled?: boolean; color?: string }) {
    const { colors } = useTheme();
    const c = color ?? colors.ink;
    return (
        <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill={filled ? c : "none"}
            stroke={c}
            strokeWidth={2}>
            <Path strokeLinecap="round" strokeLinejoin="round" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </Svg>
    );
}

function ListIcon() {
    const { colors } = useTheme();
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
    const { colors } = useTheme();
    const styles = useThemedStyles(makeStyles);
    const { hasPro, loaded: subLoaded } = useSubscriptionStatus();
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

    // Signed in but not Pro -> the paywall (Stripe Checkout, see
    // components/ProModals.tsx). Remembers a Draw Mode request so it
    // resumes once Pro lands, like the website's openPaywall(intent).
    const [paywallOpen, setPaywallOpen] = useState(false);
    const [proWelcomeOpen, setProWelcomeOpen] = useState(false);
    const [signInToUnlockOpen, setSignInToUnlockOpen] = useState(false);
    // The pending intent records what they were after -- the Pro-gated
    // action ("drawmode", "alt" + index, "scalePattern" + key, "scaleVariant"
    // + index, "progressions", or a generic "paywall") -- and whether they
    // were signed out when the paywall opened, so that once they're Pro
    // (right after paying, or after signing in) it's applied and they're
    // back where they were (see the effects below).
    const openPaywall = (intent?: string, value?: string | number) => {
        const pending: PendingIntent = {
            intent: intent ?? "paywall",
            value,
            ts: Date.now(),
            signedOut: !session,
        };
        AsyncStorage.setItem(PENDING_INTENT_KEY, JSON.stringify(pending)).catch(() => {});

        // The paywall is its own Modal, and iOS won't present one while
        // another is up (or still sliding away) -- it just silently doesn't
        // show. The Menu sheet (scale pattern/variant pills), the Randomize
        // sheet and the Progression panel are all Modals, so close whichever
        // the tap came from first (the website's openPaywall closes its menu
        // the same way), then present once it has finished leaving.
        const fromModal = menuOpen || menuModalVisible || randomizeSheetOpen || progressionPanelOpen;
        if (menuOpen) setMenuOpen(false);
        if (randomizeSheetOpen) setRandomizeSheetOpen(false);
        if (progressionPanelOpen) setProgressionPanelOpen(false);
        if (fromModal) setTimeout(() => setPaywallOpen(true), MODAL_DISMISS_MS);
        else setPaywallOpen(true);
    };
    // They paid without an account: signing in next is to claim that
    // purchase, not to be sent back to the paywall.
    const markIntentPurchased = () => {
        AsyncStorage.getItem(PENDING_INTENT_KEY)
            .then((raw) => {
                if (!raw) return;
                const pending = JSON.parse(raw) as PendingIntent;
                return AsyncStorage.setItem(PENDING_INTENT_KEY, JSON.stringify({ ...pending, signedOut: false }));
            })
            .catch(() => {});
    };
    const dismissPaywall = useCallback(() => {
        setPaywallOpen(false);
        AsyncStorage.removeItem(PENDING_INTENT_KEY).catch(() => {});
    }, []);

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

    // Chords vs. Scales, matching the website's selectedMode (which also
    // has "scaleChords" -- deferred here, see the Phase 2 sequencing notes
    // elsewhere in this project: Scale Chords needs the website's chord/
    // scale-generation algorithm refactor done first, so it isn't ported
    // yet). Everything below in this component is shared between the two
    // and branches on selectedMode the same way page.tsx does, rather than
    // being two separate screens -- capo/tuning/handedness/showIntervals/
    // octaveUp/displayShape are genuinely shared state on the website too.
    const [selectedMode, setSelectedMode] = useState<"chords" | "scales">("chords");

    // ─── Chords mode state ──────────────────────────────────────────────
    const [currentRootNote, setCurrentRootNote] = useState("C");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [selectedVoicingType, setSelectedVoicingType] = useState("");
    const [selectedStringSet, setSelectedStringSet] = useState("");
    const [selectedChordQuality, setSelectedChordQuality] = useState("");
    const [selectedPosition, setSelectedPosition] = useState("All");
    const [selectedAltShape, setSelectedAltShape] = useState(0);

    // ─── Scales mode state ──────────────────────────────────────────────
    const [selectedNoteGroup, setSelectedNoteGroup] = useState("7-note");
    const [selectedScale, setSelectedScale] = useState("Major");
    const [selectedScalePosition, setSelectedScalePosition] = useState(0);
    const [selectedScalePattern, setSelectedScalePattern] = useState(
        () => (SCALE_SHAPES as any)["7-note"]["Major"].defaultPattern as string,
    );
    const [selectedScaleVariant, setSelectedScaleVariant] = useState(0);
    const [showAllScalePositions, setShowAllScalePositions] = useState(true);
    const [playbackSpeed, setPlaybackSpeed] = useState(4);
    const [isPlayingScale, setIsPlayingScale] = useState(false);
    const scalePlayRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    const [randomizeOn, setRandomizeOn] = useState(false);
    const [randomizeSheetOpen, setRandomizeSheetOpen] = useState(false);
    const [chordRandomize, setChordRandomize] = useState<ChordRandomizeConfig>(EMPTY_CHORD_RANDOMIZE);
    const [scaleRandomize, setScaleRandomize] = useState<ScaleRandomizeConfig>(EMPTY_SCALE_RANDOMIZE);

    const [showIntervals, setShowIntervals] = useState(false);
    const [octaveUp, setOctaveUp] = useState(false);
    const [noteDeck, setNoteDeck] = useState<number[]>([]);

    const [displayShape, setDisplayShape] = useState<NotePosition[]>([]);
    const [displayGroups, setDisplayGroups] = useState<NotePosition[][]>([]);
    const [menuOpen, setMenuOpen] = useState(false);
    // Drives the Menu sheet's entrance/exit: backdrop opacity fades on its
    // own while the sheet itself slides (see the Modal below) -- RN's
    // built-in animationType="slide" animates the whole modal (backdrop
    // included) as one sliding block, which is the "dark background
    // slides up with it" look this replaces. The Modal's own `visible`
    // lags one animation behind menuOpen so the closing slide-down
    // actually plays instead of the modal just vanishing mid-animation.
    const [menuModalVisible, setMenuModalVisible] = useState(false);
    const menuAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (menuOpen) {
            setMenuModalVisible(true);
            Animated.timing(menuAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
        } else {
            Animated.timing(menuAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
                if (finished) setMenuModalVisible(false);
            });
        }
    }, [menuOpen, menuAnim]);

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

    // ─── Session persistence ────────────────────────────────────────────
    // Port of the website's persistedSession/save effect: restores the last
    // mode, root, capo and selections on launch instead of resetting to
    // defaults. Handedness/tuning live in the preferences context (their own
    // keys), same split as the website. AsyncStorage is async, so the
    // restore runs once on mount and saving is gated on it finishing --
    // otherwise the first render's defaults would overwrite the stored
    // session before it was read.
    const [sessionLoaded, setSessionLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        AsyncStorage.getItem(SESSION_STORAGE_KEY)
            .then(raw => {
                if (cancelled || !raw) return;
                const p = JSON.parse(raw) as SessionState;
                if (p.selectedMode === "chords" || p.selectedMode === "scales") setSelectedMode(p.selectedMode);
                if (p.currentRootNote !== undefined) setCurrentRootNote(p.currentRootNote);
                if (p.capo !== undefined) setCapo(p.capo);
                if (p.showIntervals !== undefined) setShowIntervals(p.showIntervals);
                if (p.selectedCategory !== undefined) setSelectedCategory(p.selectedCategory);
                if (p.selectedVoicingType !== undefined) setSelectedVoicingType(p.selectedVoicingType);
                if (p.selectedStringSet !== undefined) setSelectedStringSet(p.selectedStringSet);
                if (p.selectedChordQuality !== undefined) setSelectedChordQuality(p.selectedChordQuality);
                if (p.selectedPosition !== undefined) setSelectedPosition(p.selectedPosition);
                if (p.selectedAltShape !== undefined) setSelectedAltShape(p.selectedAltShape);
                if (p.selectedNoteGroup !== undefined) setSelectedNoteGroup(p.selectedNoteGroup);
                if (p.selectedScale !== undefined) setSelectedScale(p.selectedScale);
                if (p.selectedScalePosition !== undefined) setSelectedScalePosition(p.selectedScalePosition);
                if (p.selectedScalePattern !== undefined) setSelectedScalePattern(p.selectedScalePattern);
                if (p.selectedScaleVariant !== undefined) setSelectedScaleVariant(p.selectedScaleVariant);
                if (p.showAllScalePositions !== undefined) setShowAllScalePositions(p.showAllScalePositions);
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setSessionLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Resume a pending Pro-gated action once the user is Pro (right after
    // checkout, or after signing in): Draw Mode, the alt shape / scale
    // pattern / scale variant they tapped, or the progression panel. Same as
    // the website's ss_pending_intent handling, but in AsyncStorage since
    // sign-in is a separate screen here and this one unmounts while it's
    // open. The selection context (mode, root, chord/scale choices) comes
    // back through the persisted session, so only the action is replayed --
    // through the same handlers the taps use, which this render's closure
    // sees with hasPro now true.
    useEffect(() => {
        if (!hasPro || !sessionLoaded) return;
        AsyncStorage.getItem(PENDING_INTENT_KEY)
            .then((raw) => {
                if (!raw) return;
                AsyncStorage.removeItem(PENDING_INTENT_KEY).catch(() => {});
                const pending = JSON.parse(raw) as PendingIntent;
                if (pending.ts && Date.now() - pending.ts > PENDING_INTENT_MAX_AGE_MS) return;
                const { intent, value } = pending;
                if (intent === "drawmode") setIsDrawMode(true);
                else if (intent === "alt" && typeof value === "number" && value < availableAlts.length)
                    handleAltChange(value);
                else if (intent === "scalePattern" && typeof value === "string") handleScalePatternChange(value);
                else if (intent === "scaleVariant" && typeof value === "number") handleScaleVariantChange(value);
                else if (intent === "progressions") setProgressionPanelOpen(true);
            })
            .catch(() => {});
        // Deliberately keyed on Pro landing, not on every selection change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasPro, sessionLoaded]);

    // The other half of sign-in-then-paywall: they opened the paywall signed
    // out, went off to sign in ("Already subscribed? Sign in"), and are now
    // back signed in but not Pro -> show the paywall again (the website does
    // the same via /signin?redirect=paywall). Waits for the subscription
    // lookup to finish so a Pro user never sees it flash up.
    useEffect(() => {
        if (!session || !sessionLoaded || !subLoaded || hasPro) return;
        AsyncStorage.getItem(PENDING_INTENT_KEY)
            .then((raw) => {
                if (!raw) return;
                const pending = JSON.parse(raw) as PendingIntent;
                if (!pending.signedOut) return;
                if (pending.ts && Date.now() - pending.ts > PENDING_INTENT_MAX_AGE_MS) {
                    AsyncStorage.removeItem(PENDING_INTENT_KEY).catch(() => {});
                    return;
                }
                // Keep the intent (Draw Mode still resumes if they buy), but
                // don't reopen the paywall on every launch.
                AsyncStorage.setItem(PENDING_INTENT_KEY, JSON.stringify({ ...pending, signedOut: false })).catch(() => {});
                setPaywallOpen(true);
            })
            .catch(() => {});
    }, [session, sessionLoaded, subLoaded, hasPro]);

    useEffect(() => {
        if (!sessionLoaded) return;
        const snapshot: SessionState = {
            selectedMode,
            currentRootNote,
            capo,
            showIntervals,
            selectedCategory,
            selectedVoicingType,
            selectedStringSet,
            selectedChordQuality,
            selectedPosition,
            selectedAltShape,
            selectedNoteGroup,
            selectedScale,
            selectedScalePosition,
            selectedScalePattern,
            selectedScaleVariant,
            showAllScalePositions,
        };
        AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot)).catch(() => {});
    }, [
        sessionLoaded,
        selectedMode,
        currentRootNote,
        capo,
        showIntervals,
        selectedCategory,
        selectedVoicingType,
        selectedStringSet,
        selectedChordQuality,
        selectedPosition,
        selectedAltShape,
        selectedNoteGroup,
        selectedScale,
        selectedScalePosition,
        selectedScalePattern,
        selectedScaleVariant,
        showAllScalePositions,
    ]);

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
            // The paywall opens signed in or not (signed-out buyers are tied
            // to their checkout email and sign in afterwards); the tapped
            // alt is remembered so it's applied once they're Pro.
            openPaywall("alt", i);
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
        if (selectedMode !== "chords") return;
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
        selectedMode,
        currentRootNote,
        selectedPosition,
        selectionHierarchy.finalFormulas,
        fretboardMap,
        voicingInfo,
        octaveUp,
        selectedTuning.semitones,
    ]);

    // ─── Scales mode: octave-alt detection + display effect ────────────
    // Ported from ../../app/page.tsx's scaleOctaveInfo memo and its
    // selectedMode === "scales" display effect. NUM_FRETS there is 24,
    // same as this screen's own fretboardMap.
    const scaleOctaveInfo = useMemo(() => {
        if (selectedMode !== "scales") return null;
        const entry = (SCALE_SHAPES as any)[selectedNoteGroup]?.[selectedScale];
        if (!entry || !currentRootNote) return null;
        const variants = entry.altPatterns[selectedScalePattern] ?? [entry.positions];
        const pos = (variants[selectedScaleVariant] ?? variants[0])[selectedScalePosition];
        if (!pos) return null;
        const rootFret = (NOTES.findIndex(p => p.includes(currentRootNote)) - 7 + 12) % 12;
        const frets = pos.notes.map((n: any) => {
            const delta = (selectedTuning.semitones[n.string] ?? STANDARD_MIDI[n.string]) - STANDARD_MIDI[n.string];
            return n.fretOffset + rootFret - delta;
        });
        const minFret = Math.min(...frets);
        return { hasAlt: minFret >= 12 };
    }, [
        selectedMode,
        selectedNoteGroup,
        selectedScale,
        selectedScalePosition,
        selectedScalePattern,
        selectedScaleVariant,
        currentRootNote,
        selectedTuning.semitones,
    ]);

    useEffect(() => {
        if (selectedMode !== "scales") return;
        const entry = (SCALE_SHAPES as any)[selectedNoteGroup]?.[selectedScale];
        if (!entry || !currentRootNote) {
            setDisplayShape([]);
            return;
        }
        const rootSemitone = NOTES.findIndex(p => p.includes(currentRootNote));
        const rootFret = (rootSemitone - 7 + 12) % 12;
        const variants = entry.altPatterns[selectedScalePattern] ?? [entry.positions];
        const activePositions = variants[selectedScaleVariant] ?? variants[0];
        const parentDegrees = entry.degrees.map((d: string) => parseInt(d.match(/\d+/)?.[0] ?? "1"));

        if (showAllScalePositions) {
            // Overlay every position/box together using the scale's actual
            // root as a consistent reference, and tile each whole position
            // at every octave offset that still lands on the fretboard --
            // needed for scales with fewer positions (pentatonic/hexatonic)
            // that don't otherwise tile the full neck the way 7-position
            // patterns do.
            const seen = new Set<string>();
            const groups: NotePosition[][] = [];
            for (const position of activePositions ?? []) {
                const baseFrets = position.notes.map((n: any) => {
                    const delta = (selectedTuning.semitones[n.string] ?? STANDARD_MIDI[n.string]) - STANDARD_MIDI[n.string];
                    return n.fretOffset + rootFret - delta;
                });
                if (baseFrets.length === 0) continue;
                const minBase = Math.min(...baseFrets);
                const maxBase = Math.max(...baseFrets);
                const firstK = Math.ceil(-minBase / 12);
                const lastK = Math.floor((24 - maxBase) / 12);
                for (let k = firstK; k <= lastK; k++) {
                    const group: NotePosition[] = [];
                    position.notes.forEach((n: any, i: number) => {
                        const fret = baseFrets[i] + k * 12;
                        const key = `${n.string}:${fret}`;
                        if (seen.has(key)) return;
                        seen.add(key);
                        group.push({
                            string: n.string,
                            fret,
                            semitones: n.semitones,
                            degree: parentDegrees[n.degree],
                            isTonic: n.semitones === 0,
                        });
                    });
                    if (group.length > 0) groups.push(group);
                }
            }
            setDisplayGroups(groups);
            setDisplayShape(groups.flat());
            return;
        }
        setDisplayGroups([]);

        const position = activePositions?.[selectedScalePosition];
        if (!position) {
            setDisplayShape([]);
            return;
        }
        // Derive the mode root from the position's lowest note (not just
        // intervals[selectedScalePosition]) so bebop Std. patterns (7
        // positions, 8-entry intervals array) resolve correctly.
        const modeRootScaleNote = position.notes[0];
        const modeInterval = modeRootScaleNote.semitones;
        const modeRootParentDeg = parentDegrees[modeRootScaleNote.degree];
        const rawFrets = position.notes.map((n: any) => {
            const delta = (selectedTuning.semitones[n.string] ?? STANDARD_MIDI[n.string]) - STANDARD_MIDI[n.string];
            return n.fretOffset + rootFret - delta;
        });
        const octaveOffset = octaveUp && Math.min(...rawFrets) >= 12 ? -12 : 0;
        setDisplayShape(
            position.notes.map((n: any, i: number) => ({
                string: n.string,
                fret: rawFrets[i] + octaveOffset,
                semitones: (n.semitones - modeInterval + 12) % 12,
                degree: ((parentDegrees[n.degree] - modeRootParentDeg + 7) % 7) + 1,
                isTonic: n.semitones === 0,
            })),
        );
    }, [
        selectedMode,
        selectedNoteGroup,
        selectedScale,
        selectedScalePosition,
        selectedScalePattern,
        selectedScaleVariant,
        showAllScalePositions,
        currentRootNote,
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

    // ─── Scales mode: derived selectors + handlers ─────────────────────
    // Ported from ../../app/page.tsx (the "scales" slices only -- the
    // "scaleChords" branches there are dropped, deferred with the rest of
    // that mode).
    const scaleEntry = (SCALE_SHAPES as any)[selectedNoteGroup]?.[selectedScale];
    const scalePatternKeys: string[] = scaleEntry ? Object.keys(scaleEntry.altPatterns) : [];
    const scaleVariants: any[] | undefined =
        scaleEntry?.altPatterns[selectedScalePattern] ?? (scaleEntry ? [scaleEntry.positions] : undefined);
    const scaleNumVariants = scaleVariants?.length ?? 1;
    const scaleVariantLocked = !hasPro && scaleNumVariants > 1;
    const scalePosition = scaleVariants
        ? (scaleVariants[selectedScaleVariant] ?? scaleVariants[0])[selectedScalePosition]
        : undefined;

    const handleNoteGroupChange = (group: string) => {
        const groupScales = (SCALE_SHAPES as any)[group] ?? {};
        const firstScale = Object.keys(groupScales)[0] ?? "";
        setSelectedNoteGroup(group);
        setSelectedScale(firstScale);
        setSelectedScalePosition(0);
        setSelectedScalePattern(firstScale ? groupScales[firstScale].defaultPattern : "3nps");
        setSelectedScaleVariant(0);
        setOctaveUp(false);
    };

    const handleSelectScale = (s: string) => {
        const entry = (SCALE_SHAPES as any)[selectedNoteGroup]?.[s];
        setSelectedScale(s);
        setSelectedScalePosition(0);
        setSelectedScalePattern(entry?.defaultPattern ?? "3nps");
        setSelectedScaleVariant(0);
        setOctaveUp(false);
    };

    const handleScalePatternChange = (pattern: string) => {
        if (!hasPro && pattern !== scaleEntry?.defaultPattern) {
            openPaywall("scalePattern", pattern);
            return;
        }
        setSelectedScalePattern(pattern);
        setSelectedScaleVariant(0);
        setOctaveUp(false);
    };

    const handleScaleVariantChange = (variant: number) => {
        if (!hasPro && variant > 0) {
            openPaywall("scaleVariant", variant);
            return;
        }
        setSelectedScaleVariant(variant);
        setOctaveUp(false);
    };

    const stopScale = () => {
        scalePlayRef.current.forEach(clearTimeout);
        scalePlayRef.current = [];
        setIsPlayingScale(false);
    };

    const playScale = () => {
        scalePlayRef.current.forEach(clearTimeout);
        scalePlayRef.current = [];
        const delay = Math.round(1000 / playbackSpeed);
        const sorted = [...capoDisplayShape]
            .filter(n => n.fret != null && n.fret >= 0)
            .sort((a, b) => {
                const pa = (selectedTuning.semitones[a.string] ?? 0) + (a.fret ?? 0);
                const pb = (selectedTuning.semitones[b.string] ?? 0) + (b.fret ?? 0);
                return pa - pb;
            });
        setIsPlayingScale(true);
        sorted.forEach((note, i) => {
            const t = setTimeout(() => {
                playNote(note.string, note.fret!, selectedTuning.freqs);
                if (i === sorted.length - 1) setIsPlayingScale(false);
            }, i * delay);
            scalePlayRef.current.push(t);
        });
    };

    // modeRootNote is what's actually shown/edited via the root button --
    // in "All" or chords mode it's just the picked root, but for a single
    // scale position it's that position's own tonic (spelled relative to
    // the picked root), matching the website exactly.
    const modeRootNote = useMemo(() => {
        if (selectedMode === "scales" && showAllScalePositions) return currentRootNote;
        if (selectedMode === "scales") {
            if (!scaleEntry) return currentRootNote;
            const rootScaleNote = scalePosition?.notes[0];
            const modeInterval = rootScaleNote?.semitones ?? scaleEntry.intervals[selectedScalePosition];
            const degreeNum = rootScaleNote
                ? parseInt(scaleEntry.degrees[rootScaleNote.degree]?.match(/\d+/)?.[0] ?? "1")
                : parseInt(scaleEntry.degrees[selectedScalePosition]?.match(/\d+/)?.[0] ?? "1");
            return spellNote(currentRootNote, modeInterval, degreeNum);
        }
        return currentRootNote;
    }, [selectedMode, selectedNoteGroup, selectedScale, selectedScalePosition, showAllScalePositions, currentRootNote, scalePosition?.notes]);

    const capoRootNote = useMemo(() => {
        if (capo === 0) return modeRootNote;
        const idx = NOTES.findIndex(pair => pair.includes(modeRootNote));
        const shifted = NOTES[(idx + capo) % NOTES.length];
        return shifted[shifted.length - 1];
    }, [modeRootNote, capo]);

    const chordLabel =
        selectedCategory === "CAGED"
            ? capoRootNote
            : `${capoRootNote} ${selectedChordQuality}`;

    const scaleLabel = scalePosition?.modeName
        ? `${capoRootNote} ${scalePosition.modeName}`
        : `${capoRootNote} ${selectedScale} — Pos. ${selectedScalePosition + 1}`;

    const displayLabel = selectedMode === "scales" ? scaleLabel : chordLabel;

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
        if (selectedMode === "scales") setSelectedScalePosition(0);
    };

    // Picking a root from the picker resets to position 0 in scales mode,
    // same as the website, so the chosen note becomes the displayed tonic.
    const handleSelectRoot = (note: string) => {
        setCurrentRootNote(note);
        if (selectedMode === "scales") setSelectedScalePosition(0);
    };

    // ─── Randomize ──────────────────────────────────────────────────────
    // Ported from ../../app/page.tsx's handleRandomize (chords and scales
    // branches; scaleChords is deferred with that mode). Pinned config
    // values narrow the pool at each level; an empty pin means "all".
    function pick<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    function pickFrom<T>(pool: T[], all: T[]): T {
        return pick(pool.length ? pool : all);
    }

    const handleRandomize = () => {
        if (selectedMode === "scales") {
            const shapes = SCALE_SHAPES as Record<string, Record<string, any>>;
            // The currently displayed tonic (what the root button shows),
            // so "don't randomize root" can keep it fixed across modes.
            const currentRootIdx = NOTES.findIndex(p => p.includes(currentRootNote));
            const currentEntry = shapes[selectedNoteGroup]?.[selectedScale];
            const currentVariants =
                currentEntry?.altPatterns[selectedScalePattern] ??
                (currentEntry ? [currentEntry.positions] : undefined);
            const currentPosition = currentVariants
                ? (currentVariants[selectedScaleVariant] ?? currentVariants[0])?.[selectedScalePosition]
                : undefined;
            const currentModeScaleNote = currentPosition?.notes[0];
            const currentModeInterval =
                currentModeScaleNote?.semitones ?? currentEntry?.intervals[selectedScalePosition] ?? 0;
            const currentDegreeNum = currentModeScaleNote
                ? parseInt((currentEntry?.degrees[currentModeScaleNote.degree] ?? "1").match(/\d+/)?.[0] ?? "1")
                : parseInt((currentEntry?.degrees[selectedScalePosition] ?? "1").match(/\d+/)?.[0] ?? "1");
            const displayedTonicIdx = (currentRootIdx + currentModeInterval) % 12;
            const tonicNoteStr = spellNote(currentRootNote, currentModeInterval, currentDegreeNum);
            const tonicLetterIdx = "ABCDEFG".indexOf(tonicNoteStr[0]);

            const allGroups = Object.keys(shapes);
            const group = pickFrom(scaleRandomize.noteGroups, allGroups);
            const allScales = Object.keys(shapes[group] ?? {});
            const pool =
                scaleRandomize.scales.length > 0
                    ? scaleRandomize.scales.filter(s => allScales.includes(s))
                    : allScales;
            const eligibleScales =
                scaleRandomize.modes.length > 0
                    ? (() => {
                          const f = pool.filter(s =>
                              ((shapes[group]?.[s]?.positions ?? []) as any[]).some(
                                  p => p.modeName && scaleRandomize.modes.includes(p.modeName),
                              ),
                          );
                          return f.length > 0 ? f : pool;
                      })()
                    : pool;
            const scale = pickFrom(eligibleScales, allScales);
            const entry = shapes[group]?.[scale];
            if (!entry) return;
            const positionCount = entry.positions.length;
            const eligibleIndices: number[] =
                scaleRandomize.modes.length > 0
                    ? (entry.positions as any[])
                          .map((p, i) => ({ p, i }))
                          .filter(({ p }) => p.modeName && scaleRandomize.modes.includes(p.modeName))
                          .map(({ i }) => i)
                    : Array.from({ length: positionCount }, (_, i) => i);
            const position =
                eligibleIndices.length > 0 ? eligibleIndices[Math.floor(Math.random() * eligibleIndices.length)] : 0;
            setSelectedNoteGroup(group);
            setSelectedScale(scale);
            setSelectedScalePosition(position);
            setSelectedScalePattern(entry.defaultPattern);
            setSelectedScaleVariant(0);
            setShowAllScalePositions(false);

            let newRoot: string;
            if (scaleRandomize.randomizeRoot) {
                const naturals = NOTES[Math.floor(Math.random() * 12)].filter(n => !n.includes("#") && !n.includes("b"));
                newRoot = pick(naturals.length ? naturals : NOTES[0]);
            } else {
                // Back-calculate the parent scale root so the displayed tonic
                // stays fixed: parent letter = tonic letter - (degree-1) in
                // ABCDEFG space.
                const newModeInterval = entry.intervals[position];
                const parentIdx = (displayedTonicIdx - newModeInterval + 12) % 12;
                const pair = NOTES[parentIdx];
                const newDegreeNum = parseInt((entry.degrees[position] ?? "1").match(/\d+/)?.[0] ?? "1");
                const parentLetterIdx = (((tonicLetterIdx - (newDegreeNum - 1)) % 7) + 7) % 7;
                const parentLetter = "ABCDEFG"[parentLetterIdx];
                newRoot =
                    pair.find(n => n[0] === parentLetter) ?? pair.find(n => !n.includes("#")) ?? pair[0];
            }

            // If the new position sits entirely above fret 12, start on the
            // octave-shifted copy.
            const pos = entry.positions[position];
            if (pos?.notes?.length) {
                const newRootFret = (NOTES.findIndex(p => p.includes(newRoot)) - 7 + 12) % 12;
                const posFrets = pos.notes.map((n: any) => {
                    const delta =
                        (selectedTuning.semitones[n.string] ?? STANDARD_MIDI[n.string]) - STANDARD_MIDI[n.string];
                    return n.fretOffset + newRootFret - delta;
                });
                setOctaveUp(Math.max(...posFrets) > 24 && Math.min(...posFrets) >= 12);
            } else {
                setOctaveUp(false);
            }

            setCurrentRootNote(newRoot);
            return;
        }

        // Chords mode
        const cfg = chordRandomize;
        const allCats = Object.keys(allChordShapes);
        const cat = pickFrom(cfg.categories, allCats);

        const newSelections = { voicingType: "", stringSet: "", quality: "", position: "", altShape: 0 };
        let cursor: ChordLevel | undefined = (allChordShapes as Record<string, ChordLevel>)[cat];
        while (cursor && cursor.options && cursor.levelName !== "Positions") {
            const levelName = cursor.levelName;
            const options: Record<string, ChordLevel> = cursor.options;
            const allKeys = Object.keys(options);
            let poolKeys: string[];
            if (levelName === "Voicing Types") {
                const directFilter = cfg.voicingTypes.filter(v => allKeys.includes(v));
                if (directFilter.length > 0) {
                    poolKeys = directFilter;
                } else if (cfg.stringSets.length > 0) {
                    // Exclude voicing types with no String Sets level, then
                    // narrow to those containing the selected set(s).
                    const hasStringSets = allKeys.filter(k => options[k]?.levelName === "String Sets");
                    const hasMatchingSet = hasStringSets.filter(k =>
                        cfg.stringSets.some(ss => options[k].options && ss in options[k].options!),
                    );
                    poolKeys =
                        hasMatchingSet.length > 0 ? hasMatchingSet : hasStringSets.length > 0 ? hasStringSets : allKeys;
                } else {
                    poolKeys = allKeys;
                }
            } else if (levelName === "String Sets") poolKeys = cfg.stringSets.filter(v => allKeys.includes(v));
            else if (levelName === "Chord Qualities") poolKeys = cfg.qualities.filter(v => allKeys.includes(v));
            else poolKeys = [];
            const chosen = pickFrom(poolKeys, allKeys);
            if (levelName === "Voicing Types") newSelections.voicingType = chosen;
            else if (levelName === "String Sets") newSelections.stringSet = chosen;
            else if (levelName === "Chord Qualities") newSelections.quality = chosen;
            cursor = options[chosen];
        }

        if (!cursor?.options) return;
        const posKeys = Object.keys(cursor.options);
        const filteredPosKeys = cfg.inversions.length ? posKeys.filter(k => cfg.inversions.includes(k)) : posKeys;
        newSelections.position = pick(filteredPosKeys.length ? filteredPosKeys : posKeys);
        const pd = cursor.options[newSelections.position];
        const alts = Array.isArray(pd.altShapes) && pd.altShapes.length ? pd.altShapes : [];
        newSelections.altShape = hasPro && alts.length ? Math.floor(Math.random() * alts.length) : 0;

        setSelectedCategory(cat);
        setSelectedVoicingType(newSelections.voicingType);
        setSelectedStringSet(newSelections.stringSet);
        setSelectedChordQuality(newSelections.quality);
        setSelectedPosition(newSelections.position);
        setSelectedAltShape(newSelections.altShape);

        if (cfg.randomizeRoot) {
            const positionData: any = cursor.options[newSelections.position];
            const formula = Array.isArray(positionData.altShapes)
                ? positionData.altShapes[newSelections.altShape]
                : positionData;
            const pattern = formula?.pattern as Array<{ semitones: number; degree: number }> | undefined;
            const naturalRoot = (candidates: string[]) =>
                candidates.find(r => !r.includes("#") && !r.includes("b")) ?? candidates[0];
            const candidates = NOTES[Math.floor(Math.random() * 12)];
            if (pattern) {
                // Only roots whose spelling stays clean for every interval in
                // the shape (no double accidentals, no B#/E#).
                const isCleanRoot = (root: string) => {
                    if (root === "B#" || root === "E#") return false;
                    return pattern.every(({ semitones, degree }) => {
                        const label = spellInterval(root, semitones, degree);
                        return degree !== 1 && MAJOR_SCALE_OFFSETS[degree] !== semitones
                            ? /^[#b][2-7]$/.test(label)
                            : !/^[#b]/.test(label);
                    });
                };
                const valid = candidates.filter(isCleanRoot);
                setCurrentRootNote(valid.length ? pick(valid) : naturalRoot(candidates));
            } else {
                setCurrentRootNote(naturalRoot(candidates));
            }
        }
    };

    const handedness = isRight ? "right" : "left";

    const handleToggleDrawMode = () => {
        if (!isDrawMode) {
            if (!hasPro) {
                // Remembered so it resumes once Pro lands (right after
                // checkout, or after signing in post-purchase).
                openPaywall("drawmode");
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
        setSelectedMode(ctx.mode);
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
        } else {
            setSelectedNoteGroup(ctx.noteGroup);
            setSelectedScale(ctx.scale);
            setSelectedScalePosition(ctx.scalePosition);
            setSelectedScalePattern(ctx.scalePattern);
            setSelectedScaleVariant(ctx.scaleVariant);
        }
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
                label: displayLabel,
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

    const proModals = (
        <>
            <PaywallModal
                visible={paywallOpen}
                onClose={dismissPaywall}
                onAlreadyPro={() => setPaywallOpen(false)}
                onSubscribed={() => {
                    setPaywallOpen(false);
                    // Bought without an account -> sign in with the checkout
                    // email to unlock it (claimed server-side on sign-in).
                    if (session) setProWelcomeOpen(true);
                    else {
                        markIntentPurchased();
                        setSignInToUnlockOpen(true);
                    }
                }}
                onSignIn={
                    session
                        ? undefined
                        : () => {
                              // Keep the pending intent: it brings them back
                              // to the paywall (or Draw Mode) after sign-in.
                              setPaywallOpen(false);
                              router.push("/sign-in");
                          }
                }
            />
            <ProWelcomeModal visible={proWelcomeOpen} onClose={() => setProWelcomeOpen(false)} />
            <SignInToUnlockModal
                visible={signInToUnlockOpen}
                onClose={() => setSignInToUnlockOpen(false)}
                onSignIn={() => {
                    setSignInToUnlockOpen(false);
                    router.push("/sign-in");
                }}
            />
        </>
    );

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
            onProRequired={() => openPaywall("progressions")}
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
                                <BookmarkIcon filled={isDrawChordSaved} color={isDrawChordSaved ? SAVED_YELLOW : colors.ink} />
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
                {proModals}
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
                <Text style={styles.headerText}>
                    {selectedMode === "scales" && (showAllScalePositions || !scalePosition?.modeName)
                        ? `${capoRootNote} ${selectedScale}`
                        : wrapAtParen(displayLabel)}
                </Text>
                {selectedMode === "scales" &&
                    (showAllScalePositions ? (
                        <Text style={styles.headerSubtitle}>All</Text>
                    ) : (
                        !scalePosition?.modeName && (
                            <Text style={styles.headerSubtitle}>
                                {`Position ${selectedScalePosition + 1}`}
                            </Text>
                        )
                    ))}
            </View>

            <View style={styles.fretboardArea}>
                <FretboardVertical
                    chordShape={capoDisplayShape}
                    handedness={handedness}
                    rootNote={capoRootNote}
                    showIntervals={showIntervals}
                    showConnector={selectedMode === "chords"}
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
                {/* Fixed left: Menu + octave toggle, same treatment as
                    Save/Strum/Root fixed to the right of the action bar
                    below -- these don't scroll with the position/pattern/
                    variant groups. */}
                <View style={styles.stepperFixedLeft}>
                    <TouchableOpacity
                        onPress={() => setMenuOpen(true)}
                        style={styles.menuButton}>
                        <MenuIcon />
                        <Text style={styles.menuButtonText}>Menu</Text>
                    </TouchableOpacity>

                    {((selectedMode === "chords" && voicingInfo?.hasOctave) ||
                        (selectedMode === "scales" && !showAllScalePositions && scaleOctaveInfo?.hasAlt)) && (
                        <TouchableOpacity
                            onPress={() => setOctaveUp(o => !o)}
                            style={[
                                styles.pillButton,
                                styles.chordsOctavePill,
                                octaveUp && styles.pillButtonActive,
                            ]}>
                            <Text
                                style={[
                                    styles.pillButtonText,
                                    styles.chordsOctavePillText,
                                    octaveUp && styles.pillButtonTextActive,
                                ]}>
                                {octaveUp ? "+12" : "-12"}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Scrollable rest: position/alt groups (Chords) or
                    position/pattern/variant groups (Scales) -- this is a
                    website's overflow-x-auto flex-1 div: it visually reads
                    as static in Chords mode (its content always fits) but
                    genuinely scrolls in Scales mode, where all three groups
                    can be showing at once. Can scroll behind the fixed-left
                    group above. */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.stepperScroll}
                    contentContainerStyle={styles.stepperScrollContent}>
                    {selectedMode === "chords" && selectionHierarchy.positions.length > 0 && (
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
                                style={[styles.chevronButton, styles.chordsChevronButton]}>
                                <ChevronIcon direction='left' />
                            </TouchableOpacity>
                            <Text style={[styles.stepperLabel, styles.chordsStepperLabel]}>
                                {selectionHierarchy.finalFormulas?.[
                                    selectedPosition
                                ]?.name || selectedPosition}
                            </Text>
                            <TouchableOpacity
                                onPress={goNextPos}
                                style={[styles.chevronButton, styles.chordsChevronButton]}>
                                <ChevronIcon direction='right' />
                            </TouchableOpacity>
                        </View>
                    )}

                    {selectedMode === "chords" && hasAlts && (
                        <View style={styles.stepperGroup}>
                            <TouchableOpacity
                                onPress={goPrevAlt}
                                style={[styles.chevronButton, styles.chordsChevronButton]}>
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
                                        styles.chordsStepperLabel,
                                        altsLocked && styles.altLabelLocked,
                                    ]}>
                                    {`${selectedAltShape + 1}/${availableAlts.length}`}
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={goNextAlt}
                                style={[styles.chevronButton, styles.chordsChevronButton]}>
                                <ChevronIcon direction='right' />
                            </TouchableOpacity>
                        </View>
                    )}

                    {selectedMode === "scales" &&
                        (() => {
                            const activePositions: any[] = scaleVariants?.[selectedScaleVariant] ?? scaleVariants?.[0] ?? [];
                            const numPos = activePositions.length;
                            const patIdx = scalePatternKeys.indexOf(selectedScalePattern);
                            return (
                                <>
                                    <View style={styles.stepperGroup}>
                                        <TouchableOpacity
                                            onPress={() => setShowAllScalePositions(v => !v)}
                                            style={[
                                                styles.allButton,
                                                showAllScalePositions && styles.allButtonActive,
                                            ]}>
                                            <Text
                                                style={[
                                                    styles.allButtonText,
                                                    showAllScalePositions && styles.allButtonTextActive,
                                                ]}>
                                                All
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => {
                                                if (showAllScalePositions) {
                                                    setShowAllScalePositions(false);
                                                    setSelectedScalePosition(numPos - 1);
                                                } else {
                                                    setSelectedScalePosition(p => (p - 1 + numPos) % numPos);
                                                }
                                            }}
                                            style={[styles.chevronButton, styles.chordsChevronButton]}>
                                            <ChevronIcon direction='left' />
                                        </TouchableOpacity>
                                        <Text style={[styles.stepperLabel, styles.chordsStepperLabel]}>
                                            {showAllScalePositions
                                                ? "All"
                                                : activePositions[selectedScalePosition]?.modeName
                                                  ? "Mode"
                                                  : `${selectedScalePosition + 1}`}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => {
                                                if (showAllScalePositions) {
                                                    setShowAllScalePositions(false);
                                                    setSelectedScalePosition(0);
                                                } else {
                                                    setSelectedScalePosition(p => (p + 1) % numPos);
                                                }
                                            }}
                                            style={[styles.chevronButton, styles.chordsChevronButton]}>
                                            <ChevronIcon direction='right' />
                                        </TouchableOpacity>
                                    </View>

                                    {scalePatternKeys.length > 1 && (
                                        <View style={styles.stepperGroup}>
                                            <TouchableOpacity
                                                onPress={() =>
                                                    handleScalePatternChange(
                                                        scalePatternKeys[(patIdx - 1 + scalePatternKeys.length) % scalePatternKeys.length],
                                                    )
                                                }
                                                style={[styles.chevronButton, styles.chordsChevronButton]}>
                                                <ChevronIcon direction='left' />
                                            </TouchableOpacity>
                                            <Text style={[styles.stepperLabel, styles.chordsStepperLabel]}>
                                                {selectedScalePattern}
                                            </Text>
                                            <TouchableOpacity
                                                onPress={() =>
                                                    handleScalePatternChange(
                                                        scalePatternKeys[(patIdx + 1) % scalePatternKeys.length],
                                                    )
                                                }
                                                style={[styles.chevronButton, styles.chordsChevronButton]}>
                                                <ChevronIcon direction='right' />
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {scaleNumVariants > 1 && (
                                        <View style={styles.stepperGroup}>
                                            <TouchableOpacity
                                                onPress={() =>
                                                    handleScaleVariantChange(
                                                        (selectedScaleVariant - 1 + scaleNumVariants) % scaleNumVariants,
                                                    )
                                                }
                                                style={[styles.chevronButton, styles.chordsChevronButton]}>
                                                <ChevronIcon direction='left' />
                                            </TouchableOpacity>
                                            <View style={styles.altLabelWrap}>
                                                {scaleVariantLocked && (
                                                    <View style={styles.lockBadge}>
                                                        <StarIcon />
                                                    </View>
                                                )}
                                                <Text
                                                    style={[
                                                        styles.stepperLabel,
                                                        styles.chordsStepperLabel,
                                                        scaleVariantLocked && styles.altLabelLocked,
                                                    ]}>
                                                    {`${selectedScaleVariant + 1}/${scaleNumVariants}`}
                                                </Text>
                                            </View>
                                            <TouchableOpacity
                                                onPress={() =>
                                                    handleScaleVariantChange((selectedScaleVariant + 1) % scaleNumVariants)
                                                }
                                                style={[styles.chevronButton, styles.chordsChevronButton]}>
                                                <ChevronIcon direction='right' />
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </>
                            );
                        })()}
                </ScrollView>
            </View>

            {/* Action bar */}
            <View style={styles.actionBar}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.actionScroll}
                    contentContainerStyle={styles.actionScrollContent}>
                    <TouchableOpacity
                        onPress={() => {
                            if (randomizeOn) setRandomizeOn(false);
                            else setRandomizeSheetOpen(true);
                        }}
                        style={[styles.iconButton, randomizeOn && styles.iconButtonActive]}>
                        <RandomizeIcon color={randomizeOn ? colors.sand1 : colors.ink} />
                    </TouchableOpacity>

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
                        onPress={handleToggleDrawMode}
                        style={styles.iconButton}>
                        {!hasPro && (
                            <View style={styles.proBadge}>
                                <StarIcon />
                            </View>
                        )}
                        <PencilIcon />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => setSavedPanelOpen(true)}
                        style={styles.iconButton}>
                        <BookmarkIcon filled />
                    </TouchableOpacity>

                    {capoDisplayShape.length > 0 && (
                        <TouchableOpacity
                            onPress={() => {
                                setProgressionPendingChord({
                                    label: displayLabel,
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

                    {selectedMode === "scales" && (
                        <View style={styles.playbackSpeedStepper}>
                            <TouchableOpacity
                                onPress={() => setPlaybackSpeed(v => Math.max(1, v - 1))}
                                style={styles.bpmStepButton}>
                                <Text style={styles.bpmStepButtonText}>-</Text>
                            </TouchableOpacity>
                            <Text style={styles.playbackSpeedValue}>{playbackSpeed}</Text>
                            <TouchableOpacity
                                onPress={() => setPlaybackSpeed(v => Math.min(8, v + 1))}
                                style={styles.bpmStepButton}>
                                <Text style={styles.bpmStepButtonText}>+</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>

                {/* Fixed right: Save + Strum/Play + Root, same grouping as
                    the website's mobile action bar. */}
                <View style={styles.actionBarFixedRight}>
                    {capoDisplayShape.length > 0 && (
                        <>
                            <TouchableOpacity
                                onPress={() =>
                                    openSave(
                                        capoDisplayShape,
                                        displayLabel,
                                        selectedMode === "scales"
                                            ? {
                                                  source: "library",
                                                  mode: "scales",
                                                  rootNote: currentRootNote,
                                                  tuningName: selectedTuning.name,
                                                  capo,
                                                  noteGroup: selectedNoteGroup,
                                                  scale: selectedScale,
                                                  scalePosition: selectedScalePosition,
                                                  scalePattern: selectedScalePattern,
                                                  scaleVariant: selectedScaleVariant,
                                              }
                                            : {
                                                  source: "library",
                                                  mode: "chords",
                                                  rootNote: currentRootNote,
                                                  tuningName: selectedTuning.name,
                                                  capo,
                                                  category: selectedCategory,
                                                  voicingType: selectedVoicingType,
                                                  stringSet: selectedStringSet,
                                                  chordQuality: selectedChordQuality,
                                                  position: selectedPosition,
                                                  altShape: selectedAltShape,
                                              },
                                    )
                                }
                                style={styles.iconButton}>
                                <BookmarkIcon filled={isCurrentChordSaved} color={isCurrentChordSaved ? SAVED_YELLOW : colors.ink} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => {
                                    if (selectedMode === "scales") {
                                        if (isPlayingScale) stopScale();
                                        else playScale();
                                    } else {
                                        playChord(capoDisplayShape as any, selectedTuning.freqs);
                                    }
                                }}
                                style={[styles.iconButton, isPlayingScale && styles.iconButtonActive]}>
                                {selectedMode === "scales" && isPlayingScale ? <StopIcon /> : <StrumIcon />}
                            </TouchableOpacity>
                        </>
                    )}

                    {randomizeOn ? (
                        <TouchableOpacity onPress={handleRandomize} style={styles.randomAgainButton}>
                            <RandomizeIcon color={colors.sand1} />
                        </TouchableOpacity>
                    ) : (
                        <RootNoteButton
                        root={modeRootNote}
                        onSelect={handleSelectRoot}
                        onRandom={handleGenerateNewRoot}
                        style={styles.rootButton}
                        textStyle={styles.rootButtonText}
                    />
                    )}
                </View>
            </View>

            {/* Menu sheet: category -> voicing type -> string set -> chord quality, tuning */}
            <Modal
                visible={menuModalVisible}
                transparent
                animationType='none'
                onRequestClose={() => setMenuOpen(false)}>
                <View style={styles.sheetModalContainer}>
                    <AnimatedPressable
                        style={[styles.sheetBackdropAnimated, { opacity: menuAnim }]}
                        onPress={() => setMenuOpen(false)}
                    />
                    <Animated.View
                        style={[
                            styles.sheet,
                            styles.sheetPositioned,
                            {
                                transform: [
                                    {
                                        translateY: menuAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [screenHeight, 0],
                                        }),
                                    },
                                ],
                            },
                        ]}>
                        <View style={styles.sheetHandleWrap}>
                            <View style={styles.sheetHandle} />
                        </View>
                        <View style={styles.modeToggleWrap}>
                            <TouchableOpacity
                                onPress={() => setSelectedMode("chords")}
                                style={[
                                    styles.modeToggleButton,
                                    styles.modeToggleButtonLeft,
                                    selectedMode === "chords" && styles.modeToggleButtonActive,
                                ]}>
                                <Text
                                    style={[
                                        styles.modeToggleButtonText,
                                        selectedMode === "chords" && styles.modeToggleButtonTextActive,
                                    ]}>
                                    Chords
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setSelectedMode("scales")}
                                style={[
                                    styles.modeToggleButton,
                                    selectedMode === "scales" && styles.modeToggleButtonActive,
                                ]}>
                                <Text
                                    style={[
                                        styles.modeToggleButtonText,
                                        selectedMode === "scales" && styles.modeToggleButtonTextActive,
                                    ]}>
                                    Scales
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={styles.sheetContent}>
                            {selectedMode === "chords" && (
                                <>
<View>
                                        <Text style={styles.sheetSectionLabel}>
                                            Type
                                        </Text>
                                        <View style={styles.typeToggleWrap}>
                                            {selectionHierarchy.categories.map((cat, idx) => (
                                                <TouchableOpacity
                                                    key={cat}
                                                    onPress={() => handleCategoryChange(cat)}
                                                    style={[
                                                        styles.typeToggleButton,
                                                        idx === 0 && styles.typeToggleButtonFirst,
                                                        selectedCategory === cat && styles.typeToggleButtonActive,
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            styles.typeToggleButtonText,
                                                            selectedCategory === cat && styles.typeToggleButtonTextActive,
                                                        ]}>
                                                        {cat === "Sevenths" ? "7ths" : cat}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
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
                                                    {level.levelName === "Voicing Types"
                                                        ? "Voicing"
                                                        : level.levelName === "String Sets"
                                                          ? "String Set"
                                                          : "Chord"}
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
                                                                {level.levelName === "String Sets" &&
                                                                option.includes("String Set")
                                                                    ? option.trim().split(/\s+/, 1)[0]
                                                                    : option}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </View>
                                        );
                                    })}
                                </>
                            )}

                            {selectedMode === "scales" && (
                                <>
                                    <Text style={styles.sheetSectionLabel}>Note Count</Text>
                                    <View style={styles.pillWrap}>
                                        {Object.entries(SCALE_SHAPES).map(([group, groupScales]) => {
                                            const hasScales = Object.keys(groupScales).length > 0;
                                            return (
                                                <TouchableOpacity
                                                    key={group}
                                                    disabled={!hasScales}
                                                    onPress={() => hasScales && handleNoteGroupChange(group)}
                                                    style={[
                                                        styles.pillButton,
                                                        selectedNoteGroup === group && styles.pillButtonActive,
                                                        !hasScales && styles.pillButtonDisabled,
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            styles.pillButtonText,
                                                            selectedNoteGroup === group && styles.pillButtonTextActive,
                                                            !hasScales && styles.pillButtonTextDisabled,
                                                        ]}>
                                                        {group}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    <Text style={styles.sheetSectionLabel}>Scale</Text>
                                    <View style={styles.pillWrap}>
                                        {Object.keys((SCALE_SHAPES as any)[selectedNoteGroup] ?? {}).map(s => (
                                            <TouchableOpacity
                                                key={s}
                                                onPress={() => handleSelectScale(s)}
                                                style={[
                                                    styles.pillButton,
                                                    selectedScale === s && styles.pillButtonActive,
                                                ]}>
                                                <Text
                                                    style={[
                                                        styles.pillButtonText,
                                                        selectedScale === s && styles.pillButtonTextActive,
                                                    ]}>
                                                    {s}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    <Text style={styles.sheetSectionLabel}>
                                        {(scaleVariants?.[selectedScaleVariant] ?? scaleVariants?.[0])?.[0]?.modeName
                                            ? "Mode"
                                            : "Position"}
                                    </Text>
                                    <View style={styles.pillWrap}>
                                        {(scaleVariants?.[selectedScaleVariant] ?? scaleVariants?.[0] ?? []).map(
                                            (pos: any, i: number) => (
                                                <TouchableOpacity
                                                    key={i}
                                                    onPress={() => setSelectedScalePosition(i)}
                                                    style={[
                                                        styles.pillButton,
                                                        selectedScalePosition === i && styles.pillButtonActive,
                                                    ]}>
                                                    <Text
                                                        style={[
                                                            styles.pillButtonText,
                                                            selectedScalePosition === i && styles.pillButtonTextActive,
                                                        ]}>
                                                        {pos.modeName ? wrapAtParen(pos.modeName) : `${i + 1}`}
                                                    </Text>
                                                </TouchableOpacity>
                                            ),
                                        )}
                                    </View>

                                    {scalePatternKeys.length > 1 && (
                                        <>
                                            <Text style={styles.sheetSectionLabel}>Pattern</Text>
                                            <View style={styles.pillWrap}>
                                                {scalePatternKeys.map(k => {
                                                    const locked = !hasPro && k !== scaleEntry?.defaultPattern;
                                                    return (
                                                        <TouchableOpacity
                                                            key={k}
                                                            onPress={() => handleScalePatternChange(k)}
                                                            style={[
                                                                styles.pillButton,
                                                                selectedScalePattern === k && styles.pillButtonActive,
                                                            ]}>
                                                            {locked && (
                                                                <View style={styles.pillLockBadge}>
                                                                    <StarIcon />
                                                                </View>
                                                            )}
                                                            <Text
                                                                style={[
                                                                    styles.pillButtonText,
                                                                    selectedScalePattern === k && styles.pillButtonTextActive,
                                                                    locked && styles.altLabelLocked,
                                                                ]}>
                                                                {k}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </>
                                    )}
                                </>
                            )}

                            <View>
                            <Text style={styles.sheetSectionLabel}>Tuning</Text>
                            <View style={[styles.pillWrap, styles.pillWrapTight]}>
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
                            {selectedTuning.name !== "Standard" && (
                                <Text style={styles.tuningNotes}>
                                    {[...selectedTuning.notes].reverse().join(" · ")}
                                </Text>
                            )}
                            </View>
                        </ScrollView>

                        <View style={styles.sheetFooter}>
                            <TouchableOpacity
                                onPress={() => setMenuOpen(false)}
                                style={styles.sheetDoneButton}>
                                <Text style={styles.sheetDoneText}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </View>
            </Modal>

            <RandomizeSheet
                visible={randomizeSheetOpen}
                mode={selectedMode}
                chordCfg={chordRandomize}
                setChordCfg={setChordRandomize}
                scaleCfg={scaleRandomize}
                setScaleCfg={setScaleRandomize}
                onClose={() => setRandomizeSheetOpen(false)}
                onDone={() => {
                    handleRandomize();
                    setRandomizeOn(true);
                    setRandomizeSheetOpen(false);
                }}
            />
            {authGateModal}
            {proModals}
            {saveDialogModal}
            {savedChordsPanel}
            {progressionPanel}
        </SafeAreaView>
    );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: colors.bg,
    },
    header: {
        alignItems: "center",
        paddingVertical: spacing.sm,
    },
    headerText: {
        fontFamily: fonts.sans.bold,
        fontSize: 22,
        color: colors.ink,
        textAlign: "center",
    },
    headerSubtitle: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 13,
        color: `${colors.ink}99`,
        marginTop: 2,
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
    chordsStepperRow: {
        paddingVertical: spacing.sm,
    },
    stepperFixedLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs + 2,
        backgroundColor: colors.bg,
        paddingRight: spacing.xs,
        zIndex: 1,
    },
    stepperScroll: {
        flex: 1,
        overflow: "visible",
    },
    stepperScrollContent: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: spacing.xs + 2,
    },
    stepperGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    chordsChevronButton: {
        width: 30,
        height: 30,
        borderRadius: 17,
    },
    chordsStepperLabel: {
        fontSize: 14,
        minWidth: 44,
    },
    menuButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: spacing.sm + 6,
        paddingVertical: spacing.xs + 4,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    menuButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 14,
        color: colors.ink,
    },
    allButton: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
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
        fontSize: 14,
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
    lockBadge: {
        position: "absolute",
        top: -8,
        right: 0,
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
        gap: spacing.sm,
        paddingLeft: spacing.sm + 8,
        paddingVertical: spacing.sm,
        paddingBottom: spacing.md,
        borderTopWidth: 1,
        borderTopColor: `${colors.ink}33`,
        backgroundColor: colors.bg,
    },
    actionScroll: {
        overflow: "visible",
    },
    actionBarFixedRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs + 4,
        backgroundColor: colors.bg,
        paddingLeft: spacing.sm,
        paddingRight: spacing.sm + 8,
        zIndex: 1,
    },
    actionScrollContent: {
        flexDirection: "row",
        alignItems: "center",
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
    // Website's w-10 h-10 bg-ink "randomize again" button that replaces
    // the root note button while randomize is on.
    randomAgainButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.ink,
        alignItems: "center",
        justifyContent: "center",
    },
    iconButtonActive: {
        backgroundColor: colors.ink,
        borderColor: colors.ink,
    },
    playbackSpeedStepper: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}4D`,
        overflow: "hidden",
    },
    bpmStepButton: {
        width: 28,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
    },
    bpmStepButtonText: {
        fontFamily: fonts.sans.bold,
        fontSize: 16,
        color: colors.ink,
    },
    playbackSpeedValue: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
        minWidth: 16,
        textAlign: "center",
    },
    proBadge: {
        position: "absolute",
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
        paddingHorizontal: spacing.md + 5,
        paddingVertical: spacing.sm + 3,
        borderRadius: radius.pill,
        backgroundColor: colors.ink,
    },
    rootButtonText: {
        fontFamily: fonts.sans.bold,
        fontSize: 18,
        color: colors.sand1,
    },
    sheetBackdrop: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.35)",
    },
    sheetModalContainer: {
        flex: 1,
    },
    sheetBackdropAnimated: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.35)",
    },
    sheetPositioned: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
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
    },
    modeToggleWrap: {
        flexDirection: "row",
        marginHorizontal: spacing.md,
        marginBottom: spacing.sm + 4,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.ink,
        overflow: "hidden",
    },
    modeToggleButton: {
        flex: 1,
        paddingVertical: spacing.sm + 2,
        alignItems: "center",
        borderLeftWidth: 1,
        borderLeftColor: colors.ink,
    },
    modeToggleButtonLeft: {
        borderLeftWidth: 0,
    },
    modeToggleButtonActive: {
        backgroundColor: colors.surface,
    },
    modeToggleButtonText: {
        fontFamily: fonts.sans.medium,
        fontSize: 18,
        color: colors.ink,
    },
    modeToggleButtonTextActive: {
        fontFamily: fonts.sans.semiBold,
        color: colors.onSurface,
    },
    sheetContent: {
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.md,
        gap: spacing.md + 4,
    },
    sheetSectionLabel: {
        fontFamily: fonts.sans.bold,
        fontSize: 10,
        letterSpacing: 1,
        textTransform: "uppercase",
        color: `${colors.ink}80`,
        marginBottom: spacing.sm,
    },
    pillWrap: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: spacing.sm,
    },
    // Website's Tuning pills use gap-1.5 where the other sections use gap-2.
    pillWrapTight: {
        gap: spacing.xs + 2,
    },
    tuningNotes: {
        marginTop: spacing.xs + 2,
        fontSize: 10,
        color: `${colors.ink}66`,
        fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    },
    // Website's Type toggle: rounded-xl bordered group, py-2.5 text-xs cells.
    typeToggleWrap: {
        flexDirection: "row",
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.ink,
        overflow: "hidden",
    },
    typeToggleButton: {
        flex: 1,
        paddingVertical: spacing.sm + 2,
        alignItems: "center",
        borderLeftWidth: 1,
        borderLeftColor: colors.ink,
        backgroundColor: colors.sand1,
    },
    typeToggleButtonFirst: { borderLeftWidth: 0 },
    typeToggleButtonActive: { backgroundColor: colors.surface },
    typeToggleButtonText: {
        fontFamily: fonts.sans.medium,
        fontSize: 12,
        color: colors.ink,
    },
    typeToggleButtonTextActive: {
        fontFamily: fonts.sans.semiBold,
        color: colors.onSurface,
    },
    sheetHandleWrap: { paddingVertical: spacing.sm + 4, alignItems: "center" },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: `${colors.ink}33` },
    pillButton: {
        position: "relative",
        paddingHorizontal: spacing.sm + 4,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
    },
    chordsOctavePill: {
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs + 4,
    },
    chordsOctavePillText: {
        fontSize: 13,
        textAlign: "center",
    },
    pillButtonActive: {
        backgroundColor: colors.surface,
        borderColor: colors.ink,
    },
    pillButtonDisabled: {
        borderColor: `${colors.ink}33`,
    },
    pillButtonText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 12,
        color: colors.ink,
    },
    pillButtonTextActive: {
        color: colors.onSurface,
    },
    pillButtonTextDisabled: {
        color: `${colors.ink}4D`,
    },
    pillLockBadge: {
        position: "absolute",
        top: -6,
        right: -6,
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.olive,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1,
    },
    // Sibling of the ScrollView above (not part of its scrollable content),
    // so this space is always visible regardless of scroll position --
    // this is what actually separates the Done button from whatever
    // content happens to be scrolled to the bottom, rather than padding
    // added inside the ScrollView itself (which you'd have to scroll past
    // instead of it just being there). paddingTop here is what "raises"
    // this footer's own height for that gap, rather than the button
    // carrying it as its own marginTop.
    sheetFooter: {
        paddingTop: spacing.sm + 4,
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.xl,
    },
    sheetDoneButton: {
        paddingVertical: spacing.sm + 4,
        borderRadius: radius.pill,
        backgroundColor: colors.ink,
        alignItems: "center",
    },
    sheetDoneText: {
        fontFamily: fonts.sans.bold,
        fontSize: 18,
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
