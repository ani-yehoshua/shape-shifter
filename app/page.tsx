"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import FretboardHorizontal from "@/components/FretboardHorizontal";
import FretboardVertical from "@/components/FretboardVertical";
import NotesIntervalsToggle from "@/components/NotesIntervalsToggle";
import DrawMode from "@/components/DrawMode";
import {
    generateFretboardMap,
    generateAllVoicingsForShape,
    NOTES,
    shuffleArray,
} from "@/lib/fretboardMap";
import type { NotePosition } from "@/lib/fretboardMap";

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
};
import { allChordShapes, useCycleList } from "@/lib/API";
import {
    spellInterval,
    spellNote,
    MAJOR_SCALE_OFFSETS,
} from "@/lib/MusicTheory";
import { SCALE_SHAPES } from "@/lib/Shapes/Scales";
import useChordLibrary from "@/lib/hooks/useChordLibrary";
import { useSubscription } from "@/lib/hooks/useSubscription";

const TUNING = ["E", "B", "G", "D", "A", "E"];
const NUM_FRETS = 24;
const SEMIS = [...Array(12).keys()];

// ─── small reusable pieces ────────────────────────────────────────────────────

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

function MenuIcon() {
    return (
        <svg
            className='w-3.5 h-3.5'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'>
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M4 6h16M4 12h16M4 18h16'
            />
        </svg>
    );
}

function LockIcon() {
    return (
        <span className='inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-olive/20 border border-olive/40 text-olive'>
            <svg
                className='w-3 h-3'
                viewBox='0 0 24 24'
                fill='currentColor'>
                <path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
            </svg>
        </span>
    );
}

function PencilIcon() {
    return (
        <svg
            aria-hidden='true'
            className='w-5 h-5'
            fill='currentColor'
            focusable='false'
            viewBox='0 0 640 640'>
            <path d='M100.4 417.2C104.5 402.6 112.2 389.3 123 378.5L304.2 197.3L338.1 163.4C354.7 180 389.4 214.7 442.1 267.4L476 301.3L442.1 335.2L260.9 516.4C250.2 527.1 236.8 534.9 222.2 539L94.4 574.6C86.1 576.9 77.1 574.6 71 568.4C64.9 562.2 62.6 553.3 64.9 545L100.4 417.2zM156 413.5C151.6 418.2 148.4 423.9 146.7 430.1L122.6 517L209.5 492.9C215.9 491.1 221.7 487.8 226.5 483.2L155.9 413.5zM510 267.4C493.4 250.8 458.7 216.1 406 163.4L372 129.5C398.5 103 413.4 88.1 416.9 84.6C430.4 71 448.8 63.4 468 63.4C487.2 63.4 505.6 71 519.1 84.6L554.8 120.3C568.4 133.9 576 152.3 576 171.4C576 190.5 568.4 209 554.8 222.5C551.3 226 536.4 240.9 509.9 267.4z' />
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

function voicingFretRange(v: NotePosition[]) {
    const frets = v
        .map(n => n.fret)
        .filter((f): f is number => f != null && f >= 0);
    if (!frets.length) return null;
    return { min: Math.min(...frets), max: Math.max(...frets) };
}

function ShuffleIcon() {
    return (
        <svg
            className='w-6 h-6'
            fill='none'
            stroke='currentColor'
            strokeWidth={1.5}
            viewBox='0 0 24 24'>
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99'
            />
        </svg>
    );
}

function wrapAtParen(text: string): React.ReactNode {
    const idx = text.indexOf(' (');
    if (idx === -1) return text;
    return <>{text.slice(0, idx)}<br />{text.slice(idx + 1)}</>;
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Home() {
    const router = useRouter();
    const hasPro = useSubscription();

    // ── state ──────────────────────────────────────────────────────────────────
    const [isDrawMode, setIsDrawMode] = React.useState(false);
    const [selectedCategory, setSelectedCategory] = React.useState("");
    const [selectedVoicingType, setSelectedVoicingType] =
        React.useState("Drop 2");
    const [selectedStringSet, setSelectedStringSet] =
        React.useState("High String Set");
    const [selectedChordQuality, setSelectedChordQuality] =
        React.useState("Maj7");
    const [selectedPosition, setSelectedPosition] = React.useState("All");
    const [selectedAltShape, setSelectedAltShape] = React.useState(0);
    const [currentRootNote, setCurrentRootNote] = React.useState("C");
    const [displayShape, setDisplayShape] = React.useState<NotePosition[]>([]);
    const [displayGroups, setDisplayGroups] = React.useState<NotePosition[][]>([]);
    const [noteDeck, setNoteDeck] = React.useState<number[]>([]);
    const [shuffleChecked, setShuffleChecked] = React.useState(false);
    const [showIntervals, setShowIntervals] = React.useState(false);
    const [isRight, setIsRight] = React.useState(true);
    const [octaveUp, setOctaveUp] = React.useState(false);
    const handedness = isRight ? "right" : "left";

    const [menuOpen, setMenuOpen] = React.useState(false);

    const openPaywall = React.useCallback(() => {
        setMenuOpen(false);
        router.replace("?paywall=1", { scroll: false });
    }, [router]);

    const [selectedMode, setSelectedMode] = React.useState<"chords" | "scales">(
        "chords",
    );
    const [selectedNoteGroup, setSelectedNoteGroup] = React.useState("7-note");
    const [selectedScale, setSelectedScale] = React.useState("Major");
    const [selectedScalePosition, setSelectedScalePosition] = React.useState(0);
    const [selectedScalePattern, setSelectedScalePattern] = React.useState(
        () => SCALE_SHAPES["7-note"]["Major"].defaultPattern,
    );
    const [selectedScaleVariant, setSelectedScaleVariant] = React.useState(0);

    const fretboardMap = React.useMemo(
        () => generateFretboardMap(TUNING, NUM_FRETS),
        [],
    );

    const { selectionHierarchy, availableAlts } = useChordLibrary({
        allChordShapes,
        selectedCategory,
        selectedVoicingType,
        selectedStringSet,
        selectedChordQuality,
        selectedPosition,
    });

    // ── hierarchy helpers ──────────────────────────────────────────────────────
    const getSetterForLevel = (levelName: string): ((v: string) => void) => {
        switch (levelName) {
            case "Voicing Types":
                return (v: string) => {
                    setSelectedVoicingType(v);
                    setOctaveUp(false);
                };
            case "String Sets":
                return (v: string) => {
                    setSelectedStringSet(v);
                    setOctaveUp(false);
                };
            case "Chord Qualities":
                return (v: string) => {
                    setSelectedChordQuality(v);
                    setOctaveUp(false);
                };
            default:
                return () => {};
        }
    };

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
            const firstOption: string | undefined = Object.keys(options)[0];
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
        setSelectedMode("chords");
        setSelectedCategory(newCategory);
        setSelectedPosition("All");
        setSelectedAltShape(0);
        setOctaveUp(false);
        drillDownAndSetDefaults(
            (allChordShapes as Record<string, ChordLevel>)[newCategory],
        );
    };

    const handleNoteGroupChange = (group: string) => {
        const groupScales = SCALE_SHAPES[group] ?? {};
        const firstScale = Object.keys(groupScales)[0] ?? "";
        setSelectedNoteGroup(group);
        setSelectedScale(firstScale);
        setSelectedScalePosition(0);
        setSelectedScalePattern(
            firstScale ? groupScales[firstScale].defaultPattern : "3nps",
        );
        setSelectedScaleVariant(0);
        setOctaveUp(false);
    };

    const handleToggleDrawMode = () => {
        if (!isDrawMode) {
            if (!hasPro) {
                openPaywall();
                return;
            }
            setIsDrawMode(true);
        } else {
            setIsDrawMode(false);
        }
    };

    const octaveFromDisplay = React.useCallback(() => {
        const frets = displayShape
            .map(n => n.fret)
            .filter((f): f is number => f != null && f >= 0);
        if (!frets.length) return false;
        return (Math.min(...frets) + Math.max(...frets)) / 2 >= 12;
    }, [displayShape]);

    const handlePositionChange = (newPosition: string) => {
        setSelectedPosition(newPosition);
        setSelectedAltShape(0);
        setOctaveUp(octaveFromDisplay());
    };

    // ── generate new root ──────────────────────────────────────────────────────
    const handleGenerateNewRoot = () => {
        const deck = noteDeck.length ? [...noteDeck] : shuffleArray(SEMIS);
        const nextSem = deck.pop()!;
        setNoteDeck(deck);
        const candidates = NOTES[nextSem];

        if (!shuffleChecked || selectedMode === "scales") {
            const simple =
                candidates.find(r => !r.includes("#") && !r.includes("b")) ||
                candidates[1] ||
                candidates[0];
            setCurrentRootNote(simple);
            return;
        }

        const newSelections = {
            voicingType: "",
            stringSet: "",
            quality: "",
            position: "",
            altShape: 0,
        };
        let cursor: ChordLevel | undefined = (
            allChordShapes as Record<string, ChordLevel>
        )[selectedCategory];
        while (cursor && cursor.options && cursor.levelName !== "Positions") {
            const levelName = cursor.levelName;
            const options: Record<string, ChordLevel> = cursor.options;
            const keys = Object.keys(options);
            const pick = keys[Math.floor(Math.random() * keys.length)];
            if (levelName === "Voicing Types") newSelections.voicingType = pick;
            else if (levelName === "String Sets")
                newSelections.stringSet = pick;
            else if (levelName === "Chord Qualities")
                newSelections.quality = pick;
            cursor = options[pick];
        }

        if (!cursor?.options) return;
        const posKeys = Object.keys(cursor.options);
        newSelections.position =
            posKeys[Math.floor(Math.random() * posKeys.length)];
        const pd = cursor.options[newSelections.position];
        const alts =
            Array.isArray(pd.altShapes) && pd.altShapes.length
                ? pd.altShapes
                : [];
        newSelections.altShape =
            hasPro && alts.length ? Math.floor(Math.random() * alts.length) : 0;

        const positionData = cursor.options[newSelections.position];
        const formula = Array.isArray(positionData.altShapes)
            ? positionData.altShapes[newSelections.altShape]
            : positionData;
        const pattern = formula.pattern!;

        function isCleanRoot(root: string) {
            if (root === "B#" || root === "E#") return false;
            return pattern.every(
                ({
                    semitones,
                    degree,
                }: {
                    semitones: number;
                    degree: number;
                }) => {
                    const label = spellInterval(root, semitones, degree);
                    if (
                        degree !== 1 &&
                        MAJOR_SCALE_OFFSETS[degree] !== semitones
                    ) {
                        return /^[#b][2-7]$/.test(label);
                    } else {
                        return !/^[#b]/.test(label);
                    }
                },
            );
        }

        const valid = candidates.filter(isCleanRoot);
        let rootName: string;
        if (valid.length > 1) {
            rootName = valid[Math.floor(Math.random() * valid.length)];
        } else if (valid.length === 1) {
            rootName = valid[0];
        } else {
            rootName =
                candidates.find(isCleanRoot) ||
                candidates.find(r => !r.includes("#") && !r.includes("b")) ||
                candidates[0];
        }

        setCurrentRootNote(rootName);
        setSelectedVoicingType(newSelections.voicingType);
        setSelectedStringSet(newSelections.stringSet);
        setSelectedChordQuality(newSelections.quality);
        setSelectedPosition(newSelections.position);
        setSelectedAltShape(newSelections.altShape);
    };

    // ── effects ────────────────────────────────────────────────────────────────
    React.useEffect(() => {
        const categories = Object.keys(allChordShapes);
        if (!categories.includes(selectedCategory)) {
            const firstCategory = categories[0] || "";
            setSelectedCategory(firstCategory);
            drillDownAndSetDefaults(
                (allChordShapes as Record<string, ChordLevel>)[firstCategory],
            );
        }
    }, [selectedCategory]);

    React.useEffect(() => {
        const firstCategory = Object.keys(allChordShapes)[0] || "";
        setSelectedCategory(firstCategory);
        drillDownAndSetDefaults(
            (allChordShapes as Record<string, ChordLevel>)[firstCategory],
        );
    }, []);

    const voicingInfo = React.useMemo(() => {
        if (isDrawMode || selectedPosition === "All" || !currentRootNote)
            return null;
        const formula = availableAlts[selectedAltShape];
        if (!formula) return null;
        const all = generateAllVoicingsForShape(
            currentRootNote,
            formula,
            fretboardMap,
        );
        const low: NotePosition[][] = [];
        const crossing: NotePosition[][] = [];
        const high: NotePosition[][] = [];
        for (const v of all) {
            const range = voicingFretRange(v);
            if (!range) continue;
            if (range.max <= 12) low.push(v);
            else if (range.min >= 12) high.push(v);
            else crossing.push(v);
        }
        return {
            low,
            crossing,
            high,
            hasOctave: low.length > 0 && high.length > 0,
        };
    }, [
        isDrawMode,
        selectedPosition,
        currentRootNote,
        selectedAltShape,
        availableAlts,
        fretboardMap,
    ]);

    const scaleOctaveInfo = React.useMemo(() => {
        if (selectedMode !== "scales") return null;
        const entry = SCALE_SHAPES[selectedNoteGroup]?.[selectedScale];
        if (!entry || !currentRootNote) return null;
        const variants = entry.altPatterns[selectedScalePattern] ?? [
            entry.positions,
        ];
        const pos = (variants[selectedScaleVariant] ?? variants[0])[
            selectedScalePosition
        ];
        if (!pos) return null;
        const rootFret =
            (NOTES.findIndex(p => p.includes(currentRootNote)) - 7 + 12) % 12;
        const frets = pos.notes.map(n => n.fretOffset + rootFret);
        const maxFret = Math.max(...frets);
        const minFret = Math.min(...frets);
        return {
            hasAlt: maxFret > 24 && minFret - 12 >= 0,
        };
    }, [
        selectedMode,
        selectedNoteGroup,
        selectedScale,
        selectedScalePosition,
        selectedScalePattern,
        selectedScaleVariant,
        currentRootNote,
    ]);

    React.useEffect(() => {
        if (selectedMode !== "scales") return;
        const scaleEntry = SCALE_SHAPES[selectedNoteGroup]?.[selectedScale];
        if (!scaleEntry || !currentRootNote) {
            setDisplayShape([]);
            return;
        }
        const rootSemitone = NOTES.findIndex(p => p.includes(currentRootNote));
        const rootFret = (rootSemitone - 7 + 12) % 12;
        const variants = scaleEntry.altPatterns[selectedScalePattern] ?? [
            scaleEntry.positions,
        ];
        const position = (variants[selectedScaleVariant] ?? variants[0])[
            selectedScalePosition
        ];
        if (!position) {
            setDisplayShape([]);
            return;
        }
        const octaveOffset = octaveUp ? -12 : 0;
        const modeInterval = scaleEntry.intervals[selectedScalePosition];
        const parentDegrees = scaleEntry.degrees.map(d =>
            parseInt(d.match(/\d+/)?.[0] ?? "1"),
        );
        const modeRootParentDeg = parentDegrees[selectedScalePosition];
        setDisplayShape(
            position.notes.map(n => ({
                string: n.string,
                fret: n.fretOffset + rootFret + octaveOffset,
                semitones: (n.semitones - modeInterval + 12) % 12,
                degree:
                    ((parentDegrees[n.degree] - modeRootParentDeg + 7) % 7) + 1,
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
        currentRootNote,
        octaveUp,
    ]);

    React.useEffect(() => {
        if (isDrawMode) return;
        if (selectedMode === "scales") return;
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
    }, [
        isDrawMode,
        selectedMode,
        currentRootNote,
        selectedPosition,
        selectionHierarchy.finalFormulas,
        fretboardMap,
        voicingInfo,
        octaveUp,
    ]);

    // ── cycle controls ─────────────────────────────────────────────────────────
    const { prev: goPrevPos, next: goNextPos } = useCycleList(
        selectionHierarchy.positions,
        selectedPosition,
        handlePositionChange,
        { allToken: "All" },
    );

    const handleAltChange = (i: number) => {
        if (i > 0 && !hasPro) {
            openPaywall();
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

    const handleScalePatternChange = (pattern: string) => {
        if (!hasPro && pattern !== SCALE_SHAPES[selectedNoteGroup]?.[selectedScale]?.defaultPattern) {
            openPaywall();
            return;
        }
        setSelectedScalePattern(pattern);
        setSelectedScaleVariant(0);
        setOctaveUp(false);
    };

    const handleScaleVariantChange = (variant: number) => {
        if (!hasPro && variant > 0) {
            openPaywall();
            return;
        }
        setSelectedScaleVariant(variant);
        setOctaveUp(false);
    };

    // ── chord label ─────────────────────────────────────────────────────────────
    const chordLabel =
        selectedCategory === "CAGED"
            ? currentRootNote
            : `${currentRootNote} ${selectedChordQuality}`;

    const scaleEntry = SCALE_SHAPES[selectedNoteGroup]?.[selectedScale];
    const scalePatternKeys = scaleEntry
        ? Object.keys(scaleEntry.altPatterns)
        : [];
    const scaleVariants =
        scaleEntry?.altPatterns[selectedScalePattern] ??
        (scaleEntry ? [scaleEntry.positions] : undefined);
    const scaleNumVariants = scaleVariants?.length ?? 1;
    const scaleVariantLocked = !hasPro && scaleNumVariants > 1;
    const scalePosition = scaleVariants
        ? (scaleVariants[selectedScaleVariant] ?? scaleVariants[0])[
              selectedScalePosition
          ]
        : undefined;

    const modeRootNote = React.useMemo(() => {
        if (selectedMode !== "scales") return currentRootNote;
        const scaleEntry = SCALE_SHAPES[selectedNoteGroup]?.[selectedScale];
        if (!scaleEntry) return currentRootNote;
        const modeInterval = scaleEntry.intervals[selectedScalePosition];
        const degreeNum = parseInt(
            scaleEntry.degrees[selectedScalePosition].match(/\d+/)?.[0] ?? "1",
        );
        return spellNote(currentRootNote, modeInterval, degreeNum);
    }, [
        selectedMode,
        selectedNoteGroup,
        selectedScale,
        selectedScalePosition,
        currentRootNote,
    ]);

    const scaleLabel = scalePosition?.modeName
        ? `${modeRootNote} ${scalePosition.modeName}`
        : `${modeRootNote} ${selectedScale} — Pos. ${selectedScalePosition + 1}`;
    const displayLabel = selectedMode === "scales" ? scaleLabel : chordLabel;

    // ── sub-level value helper ─────────────────────────────────────────────────
    const getSubLevelValue = (levelName: string) => {
        if (levelName === "Voicing Types") return selectedVoicingType;
        if (levelName === "String Sets") return selectedStringSet;
        return selectedChordQuality;
    };

    const firstWord = (s: string) => (s ?? "").trim().split(/\s+/, 1)[0];

    const hasAlts = availableAlts.length > 1;
    const altsLocked = hasAlts && !hasPro;

    // ─────────────────────────────────────────────────────────────────────────
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Shape Shifter",
        url: "https://shapeshifter.djoshware.com",
        description:
            "Explore guitar chords and scales across every key and position. Interactive fretboard diagrams for chord voicings, scale patterns, and modes.",
        applicationCategory: "MusicApplication",
        operatingSystem: "Web",
        offers: [
            {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
                name: "Free",
            },
            {
                "@type": "Offer",
                price: "14.99",
                priceCurrency: "USD",
                name: "Pro",
            },
        ],
    };

    return (
        <>
            <script
                type='application/ld+json'
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <main className='flex-1 min-h-0 flex flex-col'>
                {isDrawMode ? (
                    <>
                        {/* Exit bar — visible on both mobile and desktop when in Draw Mode */}
                        <div className='flex items-center justify-between px-4 pt-3 pb-1 shrink-0'>
                            <button
                                onClick={handleToggleDrawMode}
                                className='flex items-center gap-2 px-4 py-1.5 rounded-full border border-ink/40 text-ink text-xs font-semibold hover:border-ink transition-colors'>
                                <svg
                                    className='w-3.5 h-3.5'
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
                                Exit Draw Mode
                            </button>
                        </div>
                        <DrawMode />
                    </>
                ) : (
                    <>
                        {/* ── MOBILE layout (max-sm) ───────────────────────────────── */}
                        <div className='sm:hidden flex-1 min-h-0 flex flex-col'>
                            {/* Chord/scale name */}
                            <div className='text-center'>
                                <span className='text-2xl font-bold text-ink tracking-tight'>
                                    {selectedMode === "scales" &&
                                    !scalePosition?.modeName
                                        ? `${modeRootNote} ${selectedScale}`
                                        : wrapAtParen(displayLabel)}
                                </span>
                                {selectedMode === "scales" &&
                                    !scalePosition?.modeName && (
                                        <p className='text-sm font-semibold text-ink/60 mt-0.5'>
                                            {`Position ${selectedScalePosition + 1}`}
                                        </p>
                                    )}
                            </div>

                            {/* Full-width fretboard */}
                            <div className='flex-1 min-h-0'>
                                <FretboardVertical
                                    chordShape={displayShape}
                                    handedness={handedness}
                                    rootNote={modeRootNote}
                                    showIntervals={showIntervals}
                                    showConnector={selectedMode === "chords"}
                                    chordGroups={displayGroups.length > 0 ? displayGroups : undefined}
                                />
                            </div>

                            {/* Control strip */}
                            <div className='shrink-0 border-t border-ink/20 bg-sand-1 px-3 py-2 flex items-center gap-1.5 min-h-[2.75rem]'>
                                <button
                                    onClick={() => setMenuOpen(true)}
                                    className='flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-ink/40 text-ink text-xs font-semibold hover:border-ink transition-colors'>
                                    <MenuIcon />
                                    Menu
                                </button>

                                {selectedMode === "chords" &&
                                    voicingInfo?.hasOctave && (
                                        <button
                                            onClick={() => setOctaveUp(o => !o)}
                                            className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${octaveUp ? "bg-ink text-sand-1 border-ink" : "border-ink/40 text-ink hover:border-ink"}`}>
                                            {octaveUp ? "+12" : "-12"}
                                        </button>
                                    )}

                                {selectedMode === "scales" &&
                                    scaleOctaveInfo?.hasAlt && (
                                        <button
                                            onClick={() => setOctaveUp(o => !o)}
                                            className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${octaveUp ? "bg-ink text-sand-1 border-ink" : "border-ink/40 text-ink hover:border-ink"}`}>
                                            {octaveUp ? "+12" : "-12"}
                                        </button>
                                    )}

                                <div className='flex-1 min-w-0 overflow-x-auto no-scrollbar flex items-center justify-end gap-1'>
                                    {selectedMode === "chords" &&
                                        selectionHierarchy.positions.length >
                                            0 && (
                                            <div className='flex items-center gap-1'>
                                                <button
                                                    onClick={() =>
                                                        handlePositionChange(
                                                            "All",
                                                        )
                                                    }
                                                    className={`px-2 py-1 rounded-full text-xs font-bold border transition-colors ${
                                                        selectedPosition ===
                                                        "All"
                                                            ? "bg-ink text-sand-1 border-ink"
                                                            : "text-ink border-ink/40 hover:border-ink"
                                                    }`}>
                                                    All
                                                </button>
                                                <button
                                                    onClick={goPrevPos}
                                                    className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                    <ChevronLeft />
                                                </button>
                                                <span className='text-xs font-semibold text-ink min-w-[3.5rem] text-center leading-tight'>
                                                    {selectionHierarchy
                                                        .finalFormulas?.[
                                                        selectedPosition
                                                    ]?.name || selectedPosition}
                                                </span>
                                                <button
                                                    onClick={goNextPos}
                                                    className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                    <ChevronRight />
                                                </button>
                                            </div>
                                        )}

                                    {selectedMode === "scales" &&
                                        (() => {
                                            const activePositions =
                                                scaleVariants?.[
                                                    selectedScaleVariant
                                                ] ??
                                                scaleVariants?.[0] ??
                                                [];
                                            const numPos =
                                                activePositions.length;
                                            const patIdx =
                                                scalePatternKeys.indexOf(
                                                    selectedScalePattern,
                                                );
                                            return (
                                                <>
                                                    <div className='flex items-center gap-1'>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedScalePosition(
                                                                    p =>
                                                                        (p -
                                                                            1 +
                                                                            numPos) %
                                                                        numPos,
                                                                );
                                                                setOctaveUp(
                                                                    false,
                                                                );
                                                            }}
                                                            className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                            <ChevronLeft />
                                                        </button>
                                                        <span
                                                            className={`text-xs font-semibold text-ink ${activePositions[selectedScalePosition]?.modeName ? "w-10" : "w-3"} text-center leading-tight`}>
                                                            {activePositions[
                                                                selectedScalePosition
                                                            ]?.modeName
                                                                ? "Mode"
                                                                : `${selectedScalePosition + 1}`}
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedScalePosition(
                                                                    p =>
                                                                        (p +
                                                                            1) %
                                                                        numPos,
                                                                );
                                                                setOctaveUp(
                                                                    false,
                                                                );
                                                            }}
                                                            className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                            <ChevronRight />
                                                        </button>
                                                    </div>
                                                    {scalePatternKeys.length >
                                                        1 && (
                                                        <div className='flex items-center gap-1 ml-1'>
                                                            <button
                                                                onClick={() => handleScalePatternChange(scalePatternKeys[(patIdx - 1 + scalePatternKeys.length) % scalePatternKeys.length])}
                                                                className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                                <ChevronLeft />
                                                            </button>
                                                            <span className='text-xs font-semibold text-ink w-8 text-center'>
                                                                {selectedScalePattern}
                                                            </span>
                                                            <button
                                                                onClick={() => handleScalePatternChange(scalePatternKeys[(patIdx + 1) % scalePatternKeys.length])}
                                                                className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                                <ChevronRight />
                                                            </button>
                                                        </div>
                                                    )}
                                                    {scaleNumVariants > 1 && (
                                                        <div className='flex items-center gap-1 ml-1'>
                                                            <button
                                                                onClick={() => handleScaleVariantChange((selectedScaleVariant - 1 + scaleNumVariants) % scaleNumVariants)}
                                                                className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                                <ChevronLeft />
                                                            </button>
                                                            <span className={`text-xs font-semibold text-ink w-6 text-center flex items-center justify-center ${scaleVariantLocked ? "opacity-50" : ""}`}>
                                                                {scaleVariantLocked ? <LockIcon /> : `${selectedScaleVariant + 1}/${scaleNumVariants}`}
                                                            </span>
                                                            <button
                                                                onClick={() => handleScaleVariantChange((selectedScaleVariant + 1) % scaleNumVariants)}
                                                                className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                                <ChevronRight />
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}

                                    {selectedMode === "chords" && hasAlts && (
                                        <div className='flex items-center gap-1 ml-1'>
                                            <button
                                                onClick={goPrevAlt}
                                                className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                <ChevronLeft />
                                            </button>
                                            <span
                                                className={`text-xs font-semibold text-ink w-8 text-center flex items-center justify-center gap-0.5 ${altsLocked ? "opacity-50" : ""}`}>
                                                {altsLocked ? (
                                                    <LockIcon />
                                                ) : (
                                                    `${selectedAltShape + 1}/${availableAlts.length}`
                                                )}
                                            </span>
                                            <button
                                                onClick={goNextAlt}
                                                className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                <ChevronRight />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Action bar */}
                            <div className='shrink-0 border-t border-ink/20 bg-sand-1 px-4 pt-2 pb-4 flex items-center gap-3'>
                                <button
                                    onClick={() => setShuffleChecked(s => !s)}
                                    title='Shuffle'
                                    className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors ${
                                        shuffleChecked
                                            ? "bg-ink text-sand-1 border-ink"
                                            : "text-ink border-ink/40 hover:border-ink"
                                    }`}>
                                    <ShuffleIcon />
                                </button>

                                <NotesIntervalsToggle
                                    showIntervals={showIntervals}
                                    onToggle={setShowIntervals}
                                />

                                <button
                                    onClick={() => setIsRight(h => !h)}
                                    title={isRight ? "Right hand" : "Left hand"}
                                    className='w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                                    <HandIcon flipped={!isRight} />
                                </button>

                                <button
                                    onClick={handleToggleDrawMode}
                                    title='Draw Mode'
                                    className='w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                                    <PencilIcon />
                                </button>

                                <div className='flex-1' />

                                <button
                                    onClick={handleGenerateNewRoot}
                                    className='px-6 py-2.5 bg-ink text-sand-1 rounded-full font-bold text-sm hover:opacity-90 active:scale-95 transition-all'>
                                    {selectedMode === "scales"
                                        ? "New Root"
                                        : "New Chord"}
                                </button>
                            </div>
                        </div>

                        {/* ── Mobile Menu Sheet ───────────────────────────────── */}
                        {menuOpen && (
                            <div className='sm:hidden fixed inset-0 z-50 flex flex-col justify-end'>
                                <div
                                    className='flex-1 bg-black/40'
                                    onClick={() => setMenuOpen(false)}
                                />
                                <div className='bg-sand-1 rounded-t-2xl shadow-2xl px-4 pt-3 pb-8'>
                                    <div className='w-10 h-1 bg-ink/20 rounded-full mx-auto mb-4' />

                                    <div className='flex flex-col gap-5'>
                                        {/* Mode toggle */}
                                        <div className='flex rounded-xl overflow-hidden border border-ink'>
                                            <button
                                                onClick={() =>
                                                    setSelectedMode("chords")
                                                }
                                                className={`flex-1 py-2.5 text-sm font-medium border-r border-ink transition-colors ${
                                                    selectedMode === "chords"
                                                        ? "bg-sand-4 text-sand-1 font-semibold"
                                                        : "bg-sand-1 text-ink hover:bg-sand-2"
                                                }`}>
                                                Chords
                                            </button>
                                            <button
                                                onClick={() =>
                                                    setSelectedMode("scales")
                                                }
                                                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                                                    selectedMode === "scales"
                                                        ? "bg-sand-4 text-sand-1 font-semibold"
                                                        : "bg-sand-1 text-ink hover:bg-sand-2"
                                                }`}>
                                                Scales
                                            </button>
                                        </div>

                                        {/* Chord controls */}
                                        {selectedMode === "chords" && (
                                            <>
                                                <div>
                                                    <p className='text-[10px] font-bold text-ink/50 uppercase tracking-widest mb-2'>
                                                        Type
                                                    </p>
                                                    <div className='flex rounded-xl overflow-hidden border border-ink'>
                                                        {selectionHierarchy.categories.map(
                                                            cat => (
                                                                <button
                                                                    key={cat}
                                                                    onClick={() =>
                                                                        handleCategoryChange(
                                                                            cat,
                                                                        )
                                                                    }
                                                                    className={`flex-1 py-2.5 text-xs font-medium border-r border-ink last:border-r-0 transition-colors ${
                                                                        selectedCategory ===
                                                                        cat
                                                                            ? "bg-sand-4 text-sand-1 font-semibold"
                                                                            : "bg-sand-1 text-ink hover:bg-sand-2"
                                                                    }`}>
                                                                    {cat ===
                                                                    "Sevenths"
                                                                        ? "7ths"
                                                                        : cat}
                                                                </button>
                                                            ),
                                                        )}
                                                    </div>
                                                </div>

                                                {selectionHierarchy.subLevels.map(
                                                    ({
                                                        levelName,
                                                        options,
                                                    }) => {
                                                        const isVoicing =
                                                            levelName ===
                                                            "Voicing Types";
                                                        const isString =
                                                            levelName ===
                                                            "String Sets";
                                                        const selectedValue =
                                                            getSubLevelValue(
                                                                levelName,
                                                            );
                                                        const setter =
                                                            getSetterForLevel(
                                                                levelName,
                                                            );
                                                        const label = isVoicing
                                                            ? "Voicing"
                                                            : isString
                                                              ? "String Set"
                                                              : "Chord";
                                                        return (
                                                            <div
                                                                key={levelName}>
                                                                <p className='text-[10px] font-bold text-ink/50 uppercase tracking-widest mb-2'>
                                                                    {label}
                                                                </p>
                                                                <div className='flex flex-wrap gap-2'>
                                                                    {options.map(
                                                                        option => (
                                                                            <button
                                                                                key={
                                                                                    option
                                                                                }
                                                                                onClick={() =>
                                                                                    setter(
                                                                                        option,
                                                                                    )
                                                                                }
                                                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                                                                    selectedValue ===
                                                                                    option
                                                                                        ? "bg-sand-4 text-sand-1 border-ink"
                                                                                        : "text-ink border-ink/40 hover:border-ink"
                                                                                }`}>
                                                                                {isString &&
                                                                                option.includes(
                                                                                    "String Set",
                                                                                )
                                                                                    ? firstWord(
                                                                                          option,
                                                                                      )
                                                                                    : option}
                                                                            </button>
                                                                        ),
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    },
                                                )}
                                            </>
                                        )}

                                        {/* Scale controls */}
                                        {selectedMode === "scales" && (
                                            <>
                                                <div>
                                                    <p className='text-[10px] font-bold text-ink/50 uppercase tracking-widest mb-2'>
                                                        Note Count
                                                    </p>
                                                    <div className='flex flex-wrap gap-2'>
                                                        {Object.entries(
                                                            SCALE_SHAPES,
                                                        ).map(
                                                            ([
                                                                group,
                                                                groupScales,
                                                            ]) => {
                                                                const hasScales =
                                                                    Object.keys(
                                                                        groupScales,
                                                                    ).length >
                                                                    0;
                                                                return (
                                                                    <button
                                                                        key={
                                                                            group
                                                                        }
                                                                        disabled={
                                                                            !hasScales
                                                                        }
                                                                        onClick={() =>
                                                                            hasScales &&
                                                                            handleNoteGroupChange(
                                                                                group,
                                                                            )
                                                                        }
                                                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                                                            selectedNoteGroup ===
                                                                            group
                                                                                ? "bg-sand-4 text-sand-1 border-ink"
                                                                                : hasScales
                                                                                  ? "text-ink border-ink/40 hover:border-ink"
                                                                                  : "text-ink/30 border-ink/20 cursor-not-allowed"
                                                                        }`}>
                                                                        {group}
                                                                    </button>
                                                                );
                                                            },
                                                        )}
                                                    </div>
                                                </div>

                                                <div>
                                                    <p className='text-[10px] font-bold text-ink/50 uppercase tracking-widest mb-2'>
                                                        Scale
                                                    </p>
                                                    <div className='flex flex-wrap gap-2'>
                                                        {Object.keys(
                                                            SCALE_SHAPES[
                                                                selectedNoteGroup
                                                            ] ?? {},
                                                        ).map(s => (
                                                            <button
                                                                key={s}
                                                                onClick={() => {
                                                                    const entry =
                                                                        SCALE_SHAPES[
                                                                            selectedNoteGroup
                                                                        ]?.[s];
                                                                    setSelectedScale(
                                                                        s,
                                                                    );
                                                                    setSelectedScalePosition(
                                                                        0,
                                                                    );
                                                                    setSelectedScalePattern(
                                                                        entry?.defaultPattern ??
                                                                            "3nps",
                                                                    );
                                                                    setSelectedScaleVariant(
                                                                        0,
                                                                    );
                                                                    setOctaveUp(
                                                                        false,
                                                                    );
                                                                }}
                                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                                                    selectedScale ===
                                                                    s
                                                                        ? "bg-sand-4 text-sand-1 border-ink"
                                                                        : "text-ink border-ink/40 hover:border-ink"
                                                                }`}>
                                                                {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div>
                                                    <p className='text-[10px] font-bold text-ink/50 uppercase tracking-widest mb-2'>
                                                        {(scaleVariants?.[selectedScaleVariant] ?? scaleVariants?.[0])?.[0]?.modeName ? "Mode" : "Position"}
                                                    </p>
                                                    <div className='flex flex-wrap gap-2'>
                                                        {(
                                                            scaleVariants?.[
                                                                selectedScaleVariant
                                                            ] ??
                                                            scaleVariants?.[0] ??
                                                            []
                                                        ).map((pos, i) => (
                                                            <button
                                                                key={i}
                                                                onClick={() =>
                                                                    setSelectedScalePosition(
                                                                        i,
                                                                    )
                                                                }
                                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                                                    selectedScalePosition ===
                                                                    i
                                                                        ? "bg-sand-4 text-sand-1 border-ink"
                                                                        : "text-ink border-ink/40 hover:border-ink"
                                                                }`}>
                                                                {pos.modeName
                                                                    ? wrapAtParen(pos.modeName)
                                                                    : `${i + 1}`}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {scalePatternKeys.length >
                                                    1 && (
                                                    <div>
                                                        <p className='text-[10px] font-bold text-ink/50 uppercase tracking-widest mb-2'>
                                                            Pattern
                                                        </p>
                                                        <div className='flex flex-wrap gap-2'>
                                                            {scalePatternKeys.map(
                                                                k => {
                                                                    const locked = !hasPro && k !== scaleEntry?.defaultPattern;
                                                                    return (
                                                                        <button
                                                                            key={k}
                                                                            onClick={() => handleScalePatternChange(k)}
                                                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1 ${
                                                                                selectedScalePattern === k
                                                                                    ? "bg-sand-4 text-sand-1 border-ink"
                                                                                    : "text-ink border-ink/40 hover:border-ink"
                                                                            } ${locked ? "opacity-60" : ""}`}>
                                                                            {k}
                                                                            {locked && <LockIcon />}
                                                                        </button>
                                                                    );
                                                                },
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setMenuOpen(false)}
                                        className='w-full mt-6 py-3 bg-ink text-sand-1 rounded-full font-bold text-sm hover:opacity-90 transition-opacity'>
                                        Done
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── DESKTOP layout (sm+) ─────────────────────────────────── */}
                        <div className='hidden sm:flex flex-col items-center justify-center gap-4 py-8 w-full min-h-0 flex-1'>
                            {/* Name label */}
                            <div className='text-center px-4 xl:px-8 w-full'>
                                <span className='text-3xl font-bold text-ink tracking-tight'>
                                    {selectedMode === "scales" && !scalePosition?.modeName
                                        ? `${modeRootNote} ${selectedScale}`
                                        : wrapAtParen(displayLabel)}
                                </span>
                                {selectedMode === "scales" && !scalePosition?.modeName && (
                                    <p className='text-sm font-semibold text-ink/60 mt-0.5'>
                                        {`Position ${selectedScalePosition + 1}`}
                                    </p>
                                )}
                            </div>

                            {/* Fretboard */}
                            <div className='w-full px-4 xl:px-8'>
                                <FretboardHorizontal
                                    chordShape={displayShape}
                                    handedness={handedness}
                                    rootNote={modeRootNote}
                                    showIntervals={showIntervals}
                                />
                            </div>

                            {/* Controls */}
                            <div className='flex flex-col items-center gap-4 w-full max-w-4xl mx-auto px-4'>
                                {/* Mode toggle (desktop) */}
                                <div className='flex rounded overflow-hidden border border-ink'>
                                    <button
                                        onClick={() =>
                                            setSelectedMode("chords")
                                        }
                                        className={`px-6 py-1.5 text-sm font-medium border-r border-ink transition-colors ${selectedMode === "chords" ? "bg-sand-4 text-sand-1 font-semibold" : "bg-sand-1 text-ink hover:bg-sand-2"}`}>
                                        Chords
                                    </button>
                                    <button
                                        onClick={() =>
                                            setSelectedMode("scales")
                                        }
                                        className={`px-6 py-1.5 text-sm font-medium transition-colors ${selectedMode === "scales" ? "bg-sand-4 text-sand-1 font-semibold" : "bg-sand-1 text-ink hover:bg-sand-2"}`}>
                                        Scales
                                    </button>
                                </div>

                                {/* Chord controls */}
                                {selectedMode === "chords" && (
                                    <>
                                        {/* Category buttons */}
                                        <div className='flex rounded overflow-hidden border border-ink'>
                                            {selectionHierarchy.categories.map(
                                                cat => (
                                                    <button
                                                        key={cat}
                                                        onClick={() =>
                                                            handleCategoryChange(
                                                                cat,
                                                            )
                                                        }
                                                        className={`px-4 py-1.5 text-sm font-medium border-r border-ink last:border-r-0 transition-colors ${
                                                            selectedCategory ===
                                                            cat
                                                                ? "bg-sand-4 text-sand-1 font-semibold"
                                                                : "bg-sand-1 text-ink hover:bg-sand-2"
                                                        }`}>
                                                        {cat}
                                                    </button>
                                                ),
                                            )}
                                        </div>

                                        {/* Sub-level buttons */}
                                        {selectionHierarchy.subLevels.map(
                                            ({ levelName, options }) => {
                                                const selectedValue =
                                                    getSubLevelValue(levelName);
                                                const setter =
                                                    getSetterForLevel(
                                                        levelName,
                                                    );
                                                return (
                                                    <div
                                                        key={levelName}
                                                        className='flex rounded overflow-hidden border border-ink'>
                                                        {options.map(option => (
                                                            <button
                                                                key={option}
                                                                onClick={() =>
                                                                    setter(
                                                                        option,
                                                                    )
                                                                }
                                                                className={`px-4 py-1.5 text-sm font-medium border-r border-ink last:border-r-0 transition-colors ${
                                                                    selectedValue ===
                                                                    option
                                                                        ? "bg-sand-4 text-sand-1 font-semibold"
                                                                        : "bg-sand-1 text-ink hover:bg-sand-2"
                                                                }`}>
                                                                {option}
                                                            </button>
                                                        ))}
                                                    </div>
                                                );
                                            },
                                        )}

                                        {/* Position buttons */}
                                        {selectionHierarchy.positions.length >
                                            0 && (
                                            <div className='flex rounded overflow-hidden border border-ink'>
                                                <button
                                                    onClick={() =>
                                                        handlePositionChange(
                                                            "All",
                                                        )
                                                    }
                                                    className={`px-4 py-1.5 text-sm font-medium border-r border-ink transition-colors ${
                                                        selectedPosition ===
                                                        "All"
                                                            ? "bg-sand-4 text-sand-1 font-semibold"
                                                            : "bg-sand-1 text-ink hover:bg-sand-2"
                                                    }`}>
                                                    All
                                                </button>
                                                {selectionHierarchy.positions.map(
                                                    pos => (
                                                        <button
                                                            key={pos}
                                                            onClick={() =>
                                                                handlePositionChange(
                                                                    pos,
                                                                )
                                                            }
                                                            className={`px-4 py-1.5 text-sm font-medium border-r border-ink last:border-r-0 leading-snug transition-colors ${
                                                                selectedPosition ===
                                                                pos
                                                                    ? "bg-sand-4 text-sand-1 font-semibold"
                                                                    : "bg-sand-1 text-ink hover:bg-sand-2"
                                                            }`}>
                                                            {selectionHierarchy
                                                                .finalFormulas?.[
                                                                pos
                                                            ]?.name || pos}
                                                        </button>
                                                    ),
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Scale controls (desktop) */}
                                {selectedMode === "scales" && (
                                    <>
                                        {/* Note Group buttons */}
                                        <div className='flex rounded overflow-hidden border border-ink'>
                                            {Object.entries(SCALE_SHAPES).map(
                                                ([group, groupScales]) => {
                                                    const hasScales =
                                                        Object.keys(groupScales)
                                                            .length > 0;
                                                    return (
                                                        <button
                                                            key={group}
                                                            disabled={
                                                                !hasScales
                                                            }
                                                            onClick={() =>
                                                                hasScales &&
                                                                handleNoteGroupChange(
                                                                    group,
                                                                )
                                                            }
                                                            className={`px-4 py-1.5 text-sm font-medium border-r border-ink last:border-r-0 transition-colors ${
                                                                selectedNoteGroup ===
                                                                group
                                                                    ? "bg-sand-4 text-sand-1 font-semibold"
                                                                    : hasScales
                                                                      ? "bg-sand-1 text-ink hover:bg-sand-2"
                                                                      : "bg-sand-1 text-ink/30 cursor-not-allowed"
                                                            }`}>
                                                            {group}
                                                        </button>
                                                    );
                                                },
                                            )}
                                        </div>

                                        {/* Scale buttons */}
                                        <div className='flex rounded overflow-hidden border border-ink'>
                                            {Object.keys(
                                                SCALE_SHAPES[
                                                    selectedNoteGroup
                                                ] ?? {},
                                            ).map(s => (
                                                <button
                                                    key={s}
                                                    onClick={() => {
                                                        const entry =
                                                            SCALE_SHAPES[
                                                                selectedNoteGroup
                                                            ]?.[s];
                                                        setSelectedScale(s);
                                                        setSelectedScalePosition(
                                                            0,
                                                        );
                                                        setSelectedScalePattern(
                                                            entry?.defaultPattern ??
                                                                "3nps",
                                                        );
                                                        setSelectedScaleVariant(
                                                            0,
                                                        );
                                                        setOctaveUp(false);
                                                    }}
                                                    className={`px-4 py-1.5 text-sm font-medium border-r border-ink last:border-r-0 transition-colors ${
                                                        selectedScale === s
                                                            ? "bg-sand-4 text-sand-1 font-semibold"
                                                            : "bg-sand-1 text-ink hover:bg-sand-2"
                                                    }`}>
                                                    {s}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Scale position buttons */}
                                        {scaleVariants && (
                                            <div className='flex rounded overflow-hidden border border-ink'>
                                                {(
                                                    scaleVariants[
                                                        selectedScaleVariant
                                                    ] ?? scaleVariants[0]
                                                ).map((pos, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => {
                                                            setSelectedScalePosition(
                                                                i,
                                                            );
                                                            setOctaveUp(false);
                                                        }}
                                                        className={`px-3 py-1.5 text-sm font-medium border-r border-ink last:border-r-0 leading-snug transition-colors ${
                                                            selectedScalePosition ===
                                                            i
                                                                ? "bg-sand-4 text-sand-1 font-semibold"
                                                                : "bg-sand-1 text-ink hover:bg-sand-2"
                                                        }`}>
                                                        {pos.modeName
                                                            ? wrapAtParen(pos.modeName)
                                                            : `Pos. ${i + 1}`}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Scale pattern nav + variant toggle (desktop) */}
                                        {(scalePatternKeys.length > 1 ||
                                            scaleNumVariants > 1) &&
                                            (() => {
                                                const patIdx =
                                                    scalePatternKeys.indexOf(
                                                        selectedScalePattern,
                                                    );
                                                return (
                                                    <div className='flex items-center gap-3'>
                                                        {scalePatternKeys.length >
                                                            1 && (
                                                            <div className='flex flex-col items-center gap-1'>
                                                                <span className='text-xs font-semibold text-ink'>
                                                                    Pattern
                                                                </span>
                                                                <div className='flex items-center gap-2 border border-ink rounded overflow-hidden'>
                                                                    <button
                                                                        onClick={() => handleScalePatternChange(scalePatternKeys[(patIdx - 1 + scalePatternKeys.length) % scalePatternKeys.length])}
                                                                        className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-r border-ink'>
                                                                        <ChevronLeft />
                                                                    </button>
                                                                    <span className='px-3 text-sm font-medium text-ink'>
                                                                        {selectedScalePattern}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleScalePatternChange(scalePatternKeys[(patIdx + 1) % scalePatternKeys.length])}
                                                                        className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-l border-ink'>
                                                                        <ChevronRight />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {scaleNumVariants >
                                                            1 && (
                                                            <div className='flex flex-col items-center gap-1'>
                                                                <span className='text-xs font-semibold text-ink'>
                                                                    Variant
                                                                </span>
                                                                <div className='flex items-center gap-2 border border-ink rounded overflow-hidden'>
                                                                    <button
                                                                        onClick={() => handleScaleVariantChange((selectedScaleVariant - 1 + scaleNumVariants) % scaleNumVariants)}
                                                                        className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-r border-ink'>
                                                                        <ChevronLeft />
                                                                    </button>
                                                                    <span className={`px-3 text-sm font-medium text-ink flex items-center gap-1 ${scaleVariantLocked ? "opacity-50" : ""}`}>
                                                                        {scaleVariantLocked ? <LockIcon /> : `${selectedScaleVariant + 1}/${scaleNumVariants}`}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => handleScaleVariantChange((selectedScaleVariant + 1) % scaleNumVariants)}
                                                                        className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-l border-ink'>
                                                                        <ChevronRight />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                        {/* Scale octave shift (desktop) */}
                                        {scaleOctaveInfo?.hasAlt && (
                                            <button
                                                onClick={() =>
                                                    setOctaveUp(o => !o)
                                                }
                                                className={`px-4 py-1.5 rounded border text-sm font-semibold transition-colors ${octaveUp ? "bg-ink text-sand-1 border-ink" : "bg-sand-1 text-ink border-ink hover:bg-sand-2"}`}>
                                                {octaveUp ? "+12" : "-12"}
                                            </button>
                                        )}
                                    </>
                                )}

                                {/* Alternate positions (chords) */}
                                {selectedMode === "chords" &&
                                    (hasAlts || voicingInfo?.hasOctave) && (
                                        <div className='flex items-center gap-3'>
                                            {hasAlts && (
                                                <div className='flex flex-col items-center gap-1'>
                                                    <span className='text-xs font-semibold text-ink'>
                                                        Alternate Positions
                                                    </span>
                                                    <div className='flex items-center gap-2 border border-ink rounded overflow-hidden'>
                                                        <button
                                                            onClick={goPrevAlt}
                                                            className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-r border-ink'>
                                                            <ChevronLeft />
                                                        </button>
                                                        <span
                                                            className={`px-3 text-sm font-medium text-ink flex items-center gap-1 ${altsLocked ? "opacity-50" : ""}`}>
                                                            {altsLocked ? (
                                                                <LockIcon />
                                                            ) : (
                                                                `${selectedAltShape + 1}/${availableAlts.length}`
                                                            )}
                                                        </span>
                                                        <button
                                                            onClick={goNextAlt}
                                                            className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-l border-ink'>
                                                            <ChevronRight />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {voicingInfo?.hasOctave && (
                                                <button
                                                    onClick={() =>
                                                        setOctaveUp(o => !o)
                                                    }
                                                    className={`px-4 py-1.5 rounded border text-sm font-semibold transition-colors ${octaveUp ? "bg-ink text-sand-1 border-ink" : "bg-sand-1 text-ink border-ink hover:bg-sand-2"}`}>
                                                    {octaveUp ? "-12" : "+12"}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                {/* New Chord/Root */}
                                <button
                                    onClick={handleGenerateNewRoot}
                                    className='px-6 py-2 bg-ink text-sand-1 text-sm font-semibold rounded-full hover:opacity-90 transition-opacity'>
                                    {selectedMode === "scales"
                                        ? "New Root"
                                        : "New Chord"}
                                </button>

                                {/* Actions */}
                                <div className='flex items-center gap-6'>
                                    <button
                                        onClick={() =>
                                            setShuffleChecked(s => !s)
                                        }
                                        className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-colors ${
                                            shuffleChecked
                                                ? "bg-ink text-sand-1 border-ink"
                                                : "bg-sand-1 text-ink border-ink hover:bg-sand-2"
                                        }`}>
                                        <ShuffleIcon />
                                        Shuffle
                                    </button>
                                    <NotesIntervalsToggle
                                        showIntervals={showIntervals}
                                        onToggle={setShowIntervals}
                                    />
                                    <button
                                        onClick={() => setIsRight(h => !h)}
                                        className='flex items-center gap-2 px-4 py-2 rounded-full border border-ink bg-sand-2 text-ink text-sm font-semibold hover:bg-sand-3 transition-colors'>
                                        <HandIcon flipped={!isRight} />
                                        {isRight ? "Right hand" : "Left hand"}
                                    </button>
                                    <button
                                        onClick={handleToggleDrawMode}
                                        className='flex items-center gap-2 px-4 py-2 rounded-full border border-ink bg-sand-2 text-ink text-sm font-semibold hover:bg-sand-3 transition-colors'>
                                        <PencilIcon />
                                        Draw Mode
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </>
    );
}
