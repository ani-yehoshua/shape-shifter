"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import FretboardHorizontal from "@/components/FretboardHorizontal";
import FretboardVertical from "@/components/FretboardVertical";
import NotesIntervalsToggle from "@/components/NotesIntervalsToggle";
import DrawMode from "@/components/DrawMode";
import SavedChordsPanel from "@/components/SavedChordsPanel";
import ProgressionPanel from "@/components/ProgressionPanel";
import CapoButton from "@/components/CapoButton";
import RootNoteButton from "@/components/RootNoteButton";
import {
    saveChord,
    fetchSavedChords,
    getCurrentUserId,
    type SavedChord,
    type SavedChordContext,
} from "@/lib/savedChords";
import { playChord, playNote } from "@/lib/guitarAudio";
import {
    generateFretboardMap,
    generateAllVoicingsForShape,
    NOTES,
    shuffleArray,
    STANDARD_MIDI,
} from "@/lib/fretboardMap";
import { TUNINGS, STANDARD_TUNING } from "@/lib/tunings";
import type { Tuning } from "@/lib/tunings";
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
import { usePreferences } from "@/lib/contexts/PreferencesContext";

// default tuning — overridden by selectedTuning state at runtime
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

function StarIcon() {
    return (
        <svg
            className='w-3 h-3'
            viewBox='0 0 24 24'
            fill='currentColor'>
            <path d='M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' />
        </svg>
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

function ListIcon() {
    return (
        <svg
            className='w-4 h-4'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            strokeLinecap='round'>
            <line
                x1='8'
                y1='6'
                x2='21'
                y2='6'
            />
            <line
                x1='8'
                y1='12'
                x2='21'
                y2='12'
            />
            <line
                x1='8'
                y1='18'
                x2='21'
                y2='18'
            />
            <line
                x1='3'
                y1='6'
                x2='3.01'
                y2='6'
                strokeWidth={3}
            />
            <line
                x1='3'
                y1='12'
                x2='3.01'
                y2='12'
                strokeWidth={3}
            />
            <line
                x1='3'
                y1='18'
                x2='3.01'
                y2='18'
                strokeWidth={3}
            />
        </svg>
    );
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
    return (
        <svg
            className='w-4 h-4'
            viewBox='0 0 24 24'
            fill={filled ? "currentColor" : "none"}
            stroke='currentColor'
            strokeWidth={2}
            strokeLinecap='round'
            strokeLinejoin='round'>
            <path d='M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' />
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

function RandomizeIcon() {
    return (
        <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            viewBox='0 0 24 24'
            strokeLinecap='round'
            strokeLinejoin='round'>
            <path d='M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22' />
            <path d='m18 2 4 4-4 4' />
            <path d='M2 6h1.9c1.5 0 2.9.9 3.5 2.2' />
            <path d='M22 18h-5.9c-1.3 0-2.5-.7-3.1-1.8l-.5-.8' />
            <path d='m18 14 4 4-4 4' />
        </svg>
    );
}

function StopIcon({ className = "w-4 h-4" }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox='0 0 24 24'
            fill='currentColor'>
            <rect
                x='5'
                y='5'
                width='14'
                height='14'
                rx='2'
            />
        </svg>
    );
}

function SpeakerIcon() {
    return (
        <svg
            className='w-4 h-4'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            strokeLinecap='round'
            strokeLinejoin='round'>
            <polygon
                points='11 5 6 9 2 9 2 15 6 15 11 19 11 5'
                fill='currentColor'
                stroke='none'
            />
            <path d='M15.54 8.46a5 5 0 0 1 0 7.07' />
            <path d='M19.07 4.93a10 10 0 0 1 0 14.14' />
            <path
                d='M12 12h.01'
                stroke='none'
            />
        </svg>
    );
}

function PlaybackSpeedButton({
    speed,
    onSpeedChange,
}: {
    speed: number;
    onSpeedChange: (v: number) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const btnRef = React.useRef<HTMLButtonElement>(null);
    const popupRef = React.useRef<HTMLDivElement>(null);
    const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                !btnRef.current?.contains(e.target as Node) &&
                !popupRef.current?.contains(e.target as Node)
            )
                setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const popup =
        open && anchorRect
            ? createPortal(
                  <div
                      ref={popupRef}
                      className='bg-sand-1 border border-ink/20 rounded-xl shadow-lg px-4 py-3'
                      style={{
                          position: "fixed",
                          bottom: window.innerHeight - anchorRect.top + 8,
                          left: Math.max(
                              8,
                              Math.min(
                                  window.innerWidth - 192 - 8,
                                  anchorRect.left + anchorRect.width / 2 - 96,
                              ),
                          ),
                          width: 192,
                          zIndex: 9999,
                      }}>
                      <p className='text-[10px] font-bold uppercase tracking-widest text-ink/40 mb-2.5 text-center'>
                          Playback Speed
                      </p>
                      <input
                          type='range'
                          min={1}
                          max={8}
                          step={1}
                          value={speed}
                          onChange={e => onSpeedChange(Number(e.target.value))}
                          className='w-full accent-ink'
                      />
                      <div className='flex justify-between text-[10px] text-ink/40 font-semibold mt-1'>
                          <span>Slow</span>
                          <span>Fast</span>
                      </div>
                  </div>,
                  document.body,
              )
            : null;

    return (
        <>
            <button
                ref={btnRef}
                onClick={() => {
                    if (!open && btnRef.current)
                        setAnchorRect(btnRef.current.getBoundingClientRect());
                    setOpen(o => !o);
                }}
                title='Playback speed'
                className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full border transition-colors ${
                    open
                        ? "bg-ink text-sand-1 border-ink"
                        : "border-ink/40 text-ink hover:border-ink"
                }`}>
                <SpeakerIcon />
            </button>
            {popup}
        </>
    );
}

function TuningDropdown({
    selectedTuning,
    onSelect,
}: {
    selectedTuning: Tuning;
    onSelect: (t: Tuning) => void;
}) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div
            className='relative'
            ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-colors ${
                    selectedTuning.name !== "Standard"
                        ? "bg-ink text-sand-1 border-ink"
                        : "bg-sand-2 text-ink border-ink hover:bg-sand-3"
                }`}>
                {selectedTuning.name}
            </button>
            {open && (
                <div className='absolute bottom-[calc(100%+0.5rem)] left-0 bg-sand-1 border border-ink/20 rounded-xl shadow-lg py-1.5 z-50 min-w-[11rem]'>
                    {TUNINGS.map(t => (
                        <button
                            key={t.name}
                            onClick={() => {
                                onSelect(t);
                                setOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm font-semibold transition-colors ${
                                selectedTuning.name === t.name
                                    ? "bg-ink/10 text-ink"
                                    : "text-ink hover:bg-ink/5"
                            }`}>
                            <span>{t.name}</span>
                            <span className='block text-[10px] font-mono text-ink/40 mt-0.5'>
                                {[...t.notes].reverse().join(" · ")}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function wrapAtParen(text: string): React.ReactNode {
    const idx = text.indexOf(" (");
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <br />
            {text.slice(idx + 1)}
        </>
    );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Home() {
    const router = useRouter();
    const hasPro = useSubscription();
    const preferences = usePreferences();

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
    const [displayGroups, setDisplayGroups] = React.useState<NotePosition[][]>(
        [],
    );

    const [noteDeck, setNoteDeck] = React.useState<number[]>([]);

    type ChordRandomizeConfig = {
        categories: string[];
        voicingTypes: string[];
        stringSets: string[];
        qualities: string[];
        randomizeRoot: boolean;
    };
    type ScaleRandomizeConfig = {
        noteGroups: string[];
        scales: string[];
        modes: string[];
        randomizeRoot: boolean;
    };
    const [randomizeOn, setRandomizeOn] = React.useState(false);
    const [randomizeSheetOpen, setRandomizeSheetOpen] = React.useState(false);
    const [chordRandomize, setChordRandomize] =
        React.useState<ChordRandomizeConfig>({
            categories: [],
            voicingTypes: [],
            stringSets: [],
            qualities: [],
            randomizeRoot: true,
        });
    const [scaleRandomize, setScaleRandomize] =
        React.useState<ScaleRandomizeConfig>({
            noteGroups: [],
            scales: [],
            modes: [],
            randomizeRoot: true,
        });
    const [showIntervals, setShowIntervals] = React.useState(false);
    const isRight = preferences.handedness === "right";
    const setIsRight = React.useCallback(
        (v: boolean) => preferences.setHandedness(v ? "right" : "left"),
        [preferences],
    );
    const [octaveUp, setOctaveUp] = React.useState(false);
    const [capo, setCapo] = React.useState(0);
    const [selectedTuning, setSelectedTuningRaw] = React.useState<Tuning>(
        () =>
            TUNINGS.find(t => t.name === preferences.tuningName) ??
            STANDARD_TUNING,
    );
    const setSelectedTuning = React.useCallback(
        (t: Tuning) => {
            setSelectedTuningRaw(t);
            preferences.setTuningName(t.name);
        },
        [preferences],
    );
    // Sync when preference changes from the settings drawer
    React.useEffect(() => {
        setSelectedTuningRaw(
            TUNINGS.find(t => t.name === preferences.tuningName) ??
                STANDARD_TUNING,
        );
    }, [preferences.tuningName]);

    // notes per second: 1 = slowest (1000ms gap), 8 = fastest (~125ms gap)
    const [playbackSpeed, setPlaybackSpeed] = React.useState(4);
    const scalePlayRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);
    const [isPlayingScale, setIsPlayingScale] = React.useState(false);

    // ── saved chords ──────────────────────────────────────────────────────────
    const [userId, setUserId] = React.useState<string | null>(null);
    const [savedChordKeys, setSavedChordKeys] = React.useState<Set<string>>(
        new Set(),
    );
    const [savedPanelOpen, setSavedPanelOpen] = React.useState(false);
    const [savedRefreshKey, setSavedRefreshKey] = React.useState(0);
    const [progressionPanelOpen, setProgressionPanelOpen] =
        React.useState(false);
    const [progressionPendingChord, setProgressionPendingChord] =
        React.useState<{
            label: string;
            notes: import("@/lib/fretboardMap").NotePosition[];
            tuningName: string;
            tuningFreqs?: number[];
            capo: number;
        } | null>(null);
    const [authGateOpen, setAuthGateOpen] = React.useState(false);
    const [saveDialog, setSaveDialog] = React.useState<{
        label: string;
        notes: NotePosition[];
        context: SavedChordContext;
    } | null>(null);
    const [saveLabel, setSaveLabel] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    // For restoring Draw Mode chords from saved panel
    const [drawPreloadNotes, setDrawPreloadNotes] = React.useState<
        NotePosition[] | null
    >(null);

    React.useEffect(() => {
        getCurrentUserId().then(setUserId);
    }, []);

    const chordSignature = React.useCallback(
        (notes: NotePosition[]) =>
            `${selectedTuning.name}|${capo}|${notes
                .map(n => `${n.string}:${n.fret}`)
                .sort()
                .join(",")}`,
        [selectedTuning.name, capo],
    );

    // Fetch signatures whenever userId or savedRefreshKey changes
    React.useEffect(() => {
        if (!userId) {
            setSavedChordKeys(new Set());
            return;
        }
        fetchSavedChords()
            .then(chords => {
                setSavedChordKeys(
                    new Set(
                        chords.map(
                            c =>
                                `${c.context.tuningName}|${c.context.capo}|${c.notes
                                    .map(
                                        (n: NotePosition) =>
                                            `${n.string}:${n.fret}`,
                                    )
                                    .sort()
                                    .join(",")}`,
                        ),
                    ),
                );
            })
            .catch(() => {});
    }, [userId, savedRefreshKey]);

    const capoDisplayShape = React.useMemo(
        () =>
            capo === 0
                ? displayShape
                : displayShape.map(n => ({
                      ...n,
                      fret: n.fret != null ? n.fret + capo : n.fret,
                  })),
        [displayShape, capo],
    );
    const capoDisplayGroups = React.useMemo(
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
    const handedness = isRight ? "right" : "left";

    const isCurrentChordSaved =
        capoDisplayShape.length > 0 &&
        savedChordKeys.has(chordSignature(capoDisplayShape));

    const [menuOpen, setMenuOpen] = React.useState(false);

    const openPaywall = React.useCallback(() => {
        setMenuOpen(false);
        router.replace("?paywall=1", { scroll: false });
    }, [router]);

    const [showWelcome, setShowWelcome] = React.useState(false);

    React.useEffect(() => {
        if (
            typeof window !== "undefined" &&
            new URLSearchParams(window.location.search).get("subscribed") ===
                "true"
        ) {
            setShowWelcome(true);
            const url = new URL(window.location.href);
            url.searchParams.delete("subscribed");
            window.history.replaceState({}, "", url.toString());
        }
    }, []);

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
        () => generateFretboardMap(selectedTuning.notes, NUM_FRETS),
        [selectedTuning],
    );

    // ── save helpers ──────────────────────────────────────────────────────────
    const openSave = React.useCallback(
        (notes: NotePosition[], label: string, context: SavedChordContext) => {
            if (!userId) {
                setAuthGateOpen(true);
                return;
            }
            setSaveLabel(label);
            setSaveDialog({ label, notes, context });
        },
        [userId],
    );

    const stopScale = React.useCallback(() => {
        scalePlayRef.current.forEach(clearTimeout);
        scalePlayRef.current = [];
        setIsPlayingScale(false);
    }, []);

    const playScale = React.useCallback(() => {
        scalePlayRef.current.forEach(clearTimeout);
        scalePlayRef.current = [];
        const delay = Math.round(1000 / playbackSpeed);
        const sorted = [...capoDisplayShape]
            .filter(n => n.fret != null && n.fret >= 0)
            .sort((a, b) => {
                const pa =
                    (selectedTuning.semitones[a.string] ?? 0) + (a.fret ?? 0);
                const pb =
                    (selectedTuning.semitones[b.string] ?? 0) + (b.fret ?? 0);
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
    }, [capoDisplayShape, playbackSpeed, selectedTuning]);

    const handleSaveConfirm = React.useCallback(async () => {
        if (!saveDialog) return;
        setSaving(true);
        try {
            await saveChord({
                ...saveDialog,
                label: saveLabel.trim() || saveDialog.label,
            });
            const sig = chordSignature(saveDialog.notes);
            setSavedChordKeys(prev => new Set([...prev, sig]));
            setSaveDialog(null);
            setSavedRefreshKey(k => k + 1);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    }, [saveDialog, saveLabel, chordSignature]);

    const handleLoadSaved = React.useCallback(
        (chord: SavedChord) => {
            const ctx = chord.context;
            if (ctx.source === "draw") {
                setIsDrawMode(true);
                setDrawPreloadNotes(chord.notes);
                return;
            }
            setIsDrawMode(false);
            setSelectedMode(ctx.mode);
            setCurrentRootNote(ctx.rootNote);
            setCapo(ctx.capo);
            const t = TUNINGS.find(t => t.name === ctx.tuningName);
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
        },
        [setSelectedTuning],
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

    // ── randomize ──────────────────────────────────────────────────────────────
    function pick<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function pickFrom<T>(pool: T[], all: T[]): T {
        const src = pool.length ? pool : all;
        return pick(src);
    }

    const handleRandomize = () => {
        if (selectedMode === "scales") {
            // Compute the current displayed tonic (what the root button shows)
            // modeRootNote is declared later, so we compute it inline here
            const currentRootIdx = NOTES.findIndex(p =>
                p.includes(currentRootNote),
            );
            const currentEntry = SCALE_SHAPES[selectedNoteGroup]?.[selectedScale];
            const currentModeInterval = currentEntry?.intervals[selectedScalePosition] ?? 0;
            const currentDegreeNum = parseInt(
                (currentEntry?.degrees[selectedScalePosition] ?? "1").match(/\d+/)?.[0] ?? "1",
            );
            const displayedTonicIdx = (currentRootIdx + currentModeInterval) % 12;
            const tonicNoteStr = spellNote(currentRootNote, currentModeInterval, currentDegreeNum);
            const tonicLetterIdx = "ABCDEFG".indexOf(tonicNoteStr[0]);

            const allGroups = Object.keys(SCALE_SHAPES);
            const group = pickFrom(scaleRandomize.noteGroups, allGroups);
            const allScales = Object.keys(SCALE_SHAPES[group] ?? {});
            const pool = scaleRandomize.scales.length > 0
                ? scaleRandomize.scales.filter(s => allScales.includes(s))
                : allScales;
            // Filter scales to those that have at least one eligible mode position
            const eligibleScales =
                scaleRandomize.modes.length > 0
                    ? (() => {
                          const f = pool.filter(s =>
                              (SCALE_SHAPES[group]?.[s]?.positions ?? []).some(
                                  p =>
                                      p.modeName &&
                                      scaleRandomize.modes.includes(p.modeName),
                              ),
                          );
                          return f.length > 0 ? f : pool;
                      })()
                    : pool;
            const scale = pickFrom(eligibleScales, allScales);
            const entry = SCALE_SHAPES[group]?.[scale];
            if (!entry) return;
            const positionCount = entry.positions.length;
            // Pick a random eligible position (mode)
            const eligibleIndices =
                scaleRandomize.modes.length > 0
                    ? entry.positions
                          .map((p, i) => ({ p, i }))
                          .filter(
                              ({ p }) =>
                                  p.modeName &&
                                  scaleRandomize.modes.includes(p.modeName),
                          )
                          .map(({ i }) => i)
                    : Array.from({ length: positionCount }, (_, i) => i);
            const position =
                eligibleIndices.length > 0
                    ? eligibleIndices[
                          Math.floor(Math.random() * eligibleIndices.length)
                      ]
                    : 0;
            setSelectedNoteGroup(group);
            setSelectedScale(scale);
            setSelectedScalePosition(position);
            setSelectedScalePattern(entry.defaultPattern);
            setSelectedScaleVariant(0);

            let newRoot: string;
            if (scaleRandomize.randomizeRoot) {
                const naturals = NOTES[Math.floor(Math.random() * 12)].filter(
                    n => !n.includes("#") && !n.includes("b"),
                );
                newRoot = pick(naturals.length ? naturals : NOTES[0]);
            } else {
                // Back-calculate parent scale root so the displayed tonic stays fixed.
                const newModeInterval = entry.intervals[position];
                const parentIdx =
                    (displayedTonicIdx - newModeInterval + 12) % 12;
                const pair = NOTES[parentIdx];
                // Use letter-based selection: parent letter = tonic letter − (degree−1) in ABCDEFG space
                const newDegreeNum = parseInt(
                    (entry.degrees[position] ?? "1").match(/\d+/)?.[0] ?? "1",
                );
                const parentLetterIdx = ((tonicLetterIdx - (newDegreeNum - 1)) % 7 + 7) % 7;
                const parentLetter = "ABCDEFG"[parentLetterIdx];
                newRoot =
                    pair.find(n => n[0] === parentLetter) ??
                    pair.find(n => !n.includes("#")) ??
                    pair[0];
            }

            // Compute whether the scale sits entirely above fret 12 → needs octave shift
            const pos = entry.positions[position];
            if (pos?.notes?.length) {
                const newRootFret = (NOTES.findIndex(p => p.includes(newRoot)) - 7 + 12) % 12;
                const posFrets = pos.notes.map(n => {
                    const delta =
                        (selectedTuning.semitones[n.string] ?? STANDARD_MIDI[n.string]) -
                        STANDARD_MIDI[n.string];
                    return n.fretOffset + newRootFret - delta;
                });
                setOctaveUp(Math.max(...posFrets) > 24 && Math.min(...posFrets) >= 12);
            } else {
                setOctaveUp(false);
            }

            setCurrentRootNote(newRoot);
            return;
        }

        // Chord mode
        const cfg = chordRandomize;
        const allCats = Object.keys(allChordShapes);
        const cat = pickFrom(cfg.categories, allCats);

        const newSelections = {
            voicingType: "",
            stringSet: "",
            quality: "",
            position: "",
            altShape: 0,
        };
        let cursor: ChordLevel | undefined = (
            allChordShapes as Record<string, ChordLevel>
        )[cat];
        while (cursor && cursor.options && cursor.levelName !== "Positions") {
            const levelName = cursor.levelName;
            const options: Record<string, ChordLevel> = cursor.options;
            const allKeys = Object.keys(options);
            let pool: string[];
            if (levelName === "Voicing Types")
                pool = cfg.voicingTypes.filter(v => allKeys.includes(v));
            else if (levelName === "String Sets")
                pool = cfg.stringSets.filter(v => allKeys.includes(v));
            else if (levelName === "Chord Qualities")
                pool = cfg.qualities.filter(v => allKeys.includes(v));
            else pool = [];
            const chosen = pickFrom(pool, allKeys);
            if (levelName === "Voicing Types")
                newSelections.voicingType = chosen;
            else if (levelName === "String Sets")
                newSelections.stringSet = chosen;
            else if (levelName === "Chord Qualities")
                newSelections.quality = chosen;
            cursor = options[chosen];
        }

        if (!cursor?.options) return;
        const posKeys = Object.keys(cursor.options);
        newSelections.position = pick(posKeys);
        const pd = cursor.options[newSelections.position];
        const alts =
            Array.isArray(pd.altShapes) && pd.altShapes.length
                ? pd.altShapes
                : [];
        newSelections.altShape =
            hasPro && alts.length ? Math.floor(Math.random() * alts.length) : 0;

        setSelectedCategory(cat);
        setSelectedVoicingType(newSelections.voicingType);
        setSelectedStringSet(newSelections.stringSet);
        setSelectedChordQuality(newSelections.quality);
        setSelectedPosition(newSelections.position);
        setSelectedAltShape(newSelections.altShape);

        if (cfg.randomizeRoot) {
            const positionData = cursor.options[newSelections.position];
            const formula = Array.isArray(positionData.altShapes)
                ? positionData.altShapes[newSelections.altShape]
                : positionData;
            const pattern = formula?.pattern;
            if (pattern) {
                function isCleanRoot(root: string) {
                    if (root === "B#" || root === "E#") return false;
                    return (
                        pattern as Array<{ semitones: number; degree: number }>
                    ).every(({ semitones, degree }) => {
                        const label = spellInterval(root, semitones, degree);
                        return degree !== 1 &&
                            MAJOR_SCALE_OFFSETS[degree] !== semitones
                            ? /^[#b][2-7]$/.test(label)
                            : !/^[#b]/.test(label);
                    });
                }
                const sem = Math.floor(Math.random() * 12);
                const candidates = NOTES[sem];
                const valid = candidates.filter(isCleanRoot);
                setCurrentRootNote(
                    valid.length
                        ? pick(valid)
                        : (candidates.find(
                              r => !r.includes("#") && !r.includes("b"),
                          ) ?? candidates[0]),
                );
            } else {
                const sem = Math.floor(Math.random() * 12);
                const candidates = NOTES[sem];
                setCurrentRootNote(
                    candidates.find(
                        r => !r.includes("#") && !r.includes("b"),
                    ) ?? candidates[0],
                );
            }
        }
    };

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

    // When the user picks a root from the picker, reset to position 0 in scales
    // mode so the chosen note becomes the displayed tonic.
    const handleSelectRoot = React.useCallback(
        (note: string) => {
            setCurrentRootNote(note);
            if (selectedMode === "scales") setSelectedScalePosition(0);
        },
        [selectedMode],
    );

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
            selectedTuning.semitones,
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
        selectedTuning.semitones,
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
        const frets = pos.notes.map(n => {
            const delta =
                (selectedTuning.semitones[n.string] ??
                    STANDARD_MIDI[n.string]) - STANDARD_MIDI[n.string];
            return n.fretOffset + rootFret - delta;
        });
        const minFret = Math.min(...frets);
        return {
            hasAlt: minFret >= 12,
        };
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
        const modeInterval = scaleEntry.intervals[selectedScalePosition];
        const parentDegrees = scaleEntry.degrees.map(d =>
            parseInt(d.match(/\d+/)?.[0] ?? "1"),
        );
        const modeRootParentDeg = parentDegrees[selectedScalePosition];
        // Pre-compute raw frets so we can gate octaveOffset on whether this
        // position actually sits above fret 12 (same logic as scaleOctaveInfo.hasAlt).
        const rawFrets = position.notes.map(n => {
            const delta =
                (selectedTuning.semitones[n.string] ?? STANDARD_MIDI[n.string]) -
                STANDARD_MIDI[n.string];
            return n.fretOffset + rootFret - delta;
        });
        const octaveOffset = octaveUp && Math.min(...rawFrets) >= 12 ? -12 : 0;
        setDisplayShape(
            position.notes.map((n, i) => ({
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
        currentRootNote,
        octaveUp,
        selectedTuning.semitones,
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
    }, [
        isDrawMode,
        selectedMode,
        currentRootNote,
        selectedPosition,
        selectionHierarchy.finalFormulas,
        fretboardMap,
        voicingInfo,
        octaveUp,
        selectedTuning.semitones,
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
        if (
            !hasPro &&
            pattern !==
                SCALE_SHAPES[selectedNoteGroup]?.[selectedScale]?.defaultPattern
        ) {
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

    const capoRootNote = React.useMemo(() => {
        if (capo === 0) return modeRootNote;
        const idx = NOTES.findIndex(pair => pair.includes(modeRootNote));
        const shifted = NOTES[(idx + capo) % NOTES.length];
        return shifted[shifted.length - 1];
    }, [modeRootNote, capo]);

    // ── chord label ─────────────────────────────────────────────────────────────
    const chordLabel =
        selectedCategory === "CAGED"
            ? capoRootNote
            : `${capoRootNote} ${selectedChordQuality}`;

    const scaleLabel = scalePosition?.modeName
        ? `${capoRootNote} ${scalePosition.modeName}`
        : `${capoRootNote} ${selectedScale} — Pos. ${selectedScalePosition + 1}`;
    const displayLabel = selectedMode === "scales" ? scaleLabel : chordLabel;

    const currentChordForProgression = React.useMemo(
        () =>
            capoDisplayShape.length > 0
                ? {
                      label: displayLabel,
                      notes: capoDisplayShape,
                      tuningName: selectedTuning.name,
                      tuningFreqs: selectedTuning.freqs,
                      capo,
                  }
                : null,
        [capoDisplayShape, displayLabel, selectedTuning, capo],
    );

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
        url: "https://the-shape-shifter.com",
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
                        <div className='flex items-center px-4 pt-3 pb-1 shrink-0'>
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
                        <DrawMode
                            tuning={selectedTuning.notes}
                            tuningFreqs={selectedTuning.freqs}
                            capo={capo}
                            onCapoChange={setCapo}
                            preloadNotes={drawPreloadNotes}
                            onPreloadConsumed={() => setDrawPreloadNotes(null)}
                            onSaveRequest={(notes, label) => {
                                if (!userId) {
                                    setAuthGateOpen(true);
                                    return;
                                }
                                setSaveLabel(label);
                                setSaveDialog({
                                    label,
                                    notes,
                                    context: {
                                        source: "draw",
                                        tuningName: selectedTuning.name,
                                        capo,
                                    },
                                });
                            }}
                            onProgressionRequest={(notes, label) => {
                                setProgressionPendingChord({
                                    label,
                                    notes,
                                    tuningName: selectedTuning.name,
                                    tuningFreqs: selectedTuning.freqs,
                                    capo,
                                });
                                setProgressionPanelOpen(true);
                            }}
                        />
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
                                        ? `${capoRootNote} ${selectedScale}`
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

                                <div className='flex-1 min-w-0 overflow-x-auto no-scrollbar flex items-center justify-end gap-1 h-8'>
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
                                                    title='Previous position'
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
                                                    title='Next position'
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
                                                            onClick={() =>
                                                                setSelectedScalePosition(
                                                                    p =>
                                                                        (p -
                                                                            1 +
                                                                            numPos) %
                                                                        numPos,
                                                                )
                                                            }
                                                            title='Previous position'
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
                                                            onClick={() =>
                                                                setSelectedScalePosition(
                                                                    p =>
                                                                        (p +
                                                                            1) %
                                                                        numPos,
                                                                )
                                                            }
                                                            title='Next position'
                                                            className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                            <ChevronRight />
                                                        </button>
                                                    </div>
                                                    {scalePatternKeys.length >
                                                        1 && (
                                                        <div className='flex items-center gap-1 ml-1'>
                                                            <button
                                                                onClick={() =>
                                                                    handleScalePatternChange(
                                                                        scalePatternKeys[
                                                                            (patIdx -
                                                                                1 +
                                                                                scalePatternKeys.length) %
                                                                                scalePatternKeys.length
                                                                        ],
                                                                    )
                                                                }
                                                                title='Previous pattern'
                                                                className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                                <ChevronLeft />
                                                            </button>
                                                            <span className='text-xs font-semibold text-ink w-8 text-center'>
                                                                {
                                                                    selectedScalePattern
                                                                }
                                                            </span>
                                                            <button
                                                                onClick={() =>
                                                                    handleScalePatternChange(
                                                                        scalePatternKeys[
                                                                            (patIdx +
                                                                                1) %
                                                                                scalePatternKeys.length
                                                                        ],
                                                                    )
                                                                }
                                                                title='Next pattern'
                                                                className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                                <ChevronRight />
                                                            </button>
                                                        </div>
                                                    )}
                                                    {scaleNumVariants > 1 && (
                                                        <div className='flex items-center gap-1 ml-1'>
                                                            <button
                                                                onClick={() =>
                                                                    handleScaleVariantChange(
                                                                        (selectedScaleVariant -
                                                                            1 +
                                                                            scaleNumVariants) %
                                                                            scaleNumVariants,
                                                                    )
                                                                }
                                                                title='Previous variant'
                                                                className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                                <ChevronLeft />
                                                            </button>
                                                            <span className='relative text-xs font-semibold text-ink w-6 text-center flex items-center justify-center'>
                                                                {scaleVariantLocked && (
                                                                    <span className='absolute -top-2 -right-1.5 w-4 h-4 rounded-full bg-olive border border-olive/60 flex items-center justify-center text-sand-1 z-10'>
                                                                        <StarIcon />
                                                                    </span>
                                                                )}
                                                                <span
                                                                    className={
                                                                        scaleVariantLocked
                                                                            ? "opacity-50"
                                                                            : ""
                                                                    }>
                                                                    {`${selectedScaleVariant + 1}/${scaleNumVariants}`}
                                                                </span>
                                                            </span>
                                                            <button
                                                                onClick={() =>
                                                                    handleScaleVariantChange(
                                                                        (selectedScaleVariant +
                                                                            1) %
                                                                            scaleNumVariants,
                                                                    )
                                                                }
                                                                title='Next variant'
                                                                className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                                                <ChevronRight />
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                </div>
                                {selectedMode === "chords" && hasAlts && (
                                    <div className='flex items-center gap-1 shrink-0'>
                                        <button
                                            onClick={goPrevAlt}
                                            title='Previous shape'
                                            className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                            <ChevronLeft />
                                        </button>
                                        <span className='relative text-xs font-semibold text-ink w-8 text-center flex items-center justify-center'>
                                            {altsLocked && (
                                                <span className='absolute -top-2 -right-1.5 w-4 h-4 rounded-full bg-olive border border-olive/60 flex items-center justify-center text-sand-1 z-10'>
                                                    <StarIcon />
                                                </span>
                                            )}
                                            <span
                                                className={
                                                    altsLocked
                                                        ? "opacity-50"
                                                        : ""
                                                }>{`${selectedAltShape + 1}/${availableAlts.length}`}</span>
                                        </span>
                                        <button
                                            onClick={goNextAlt}
                                            title='Next shape'
                                            className='w-7 h-7 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors'>
                                            <ChevronRight />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Action bar */}
                            <div className='shrink-0 border-t border-ink/20 bg-sand-1 pt-2 pb-4 flex items-center gap-3 pr-4'>
                                {/* Scrollable controls */}
                                <div className='flex-1 overflow-x-auto no-scrollbar'>
                                    <div className='flex items-center gap-3 px-4 w-max py-2.5'>
                                        <button
                                            onClick={() => {
                                                if (randomizeOn)
                                                    setRandomizeOn(false);
                                                else
                                                    setRandomizeSheetOpen(true);
                                            }}
                                            title={
                                                randomizeOn
                                                    ? "Turn off randomize"
                                                    : "Randomize"
                                            }
                                            className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-full border transition-colors ${
                                                randomizeOn
                                                    ? "bg-ink text-sand-1 border-ink"
                                                    : "text-ink border-ink/40 hover:border-ink"
                                            }`}>
                                            <RandomizeIcon />
                                        </button>

                                        <NotesIntervalsToggle
                                            showIntervals={showIntervals}
                                            onToggle={setShowIntervals}
                                        />

                                        <button
                                            onClick={() => setIsRight(!isRight)}
                                            title={
                                                isRight
                                                    ? "Right hand"
                                                    : "Left hand"
                                            }
                                            className='shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                                            <HandIcon flipped={!isRight} />
                                        </button>

                                        <CapoButton
                                            capo={capo}
                                            setCapo={setCapo}
                                            size='sm'
                                        />

                                        <button
                                            onClick={handleToggleDrawMode}
                                            title='Draw Mode'
                                            className='relative shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                                            {!hasPro && (
                                                <span className='absolute -top-1 -right-1 w-4 h-4 rounded-full bg-olive border border-olive/60 flex items-center justify-center text-sand-1'>
                                                    <StarIcon />
                                                </span>
                                            )}
                                            <PencilIcon />
                                        </button>

                                        {/* My Chords panel */}
                                        <button
                                            onClick={() =>
                                                setSavedPanelOpen(true)
                                            }
                                            title='My Chords'
                                            className='shrink-0 w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                                            <BookmarkIcon filled />
                                        </button>

                                        {/* Progression builder */}
                                        <button
                                            onClick={() =>
                                                hasPro
                                                    ? setProgressionPanelOpen(
                                                          true,
                                                      )
                                                    : openPaywall()
                                            }
                                            title='Progressions'
                                            className='shrink-0 relative w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors'>
                                            {!hasPro && (
                                                <span className='absolute -top-1 -right-1 w-4 h-4 rounded-full bg-olive border border-olive/60 flex items-center justify-center text-sand-1'>
                                                    <StarIcon />
                                                </span>
                                            )}
                                            <ListIcon />
                                        </button>

                                        {selectedMode === "scales" && (
                                            <PlaybackSpeedButton
                                                speed={playbackSpeed}
                                                onSpeedChange={setPlaybackSpeed}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Fixed right: Save + Play + New Chord */}
                                <div className='shrink-0 flex items-center gap-2'>
                                    {displayShape.length > 0 && (
                                        <>
                                            <button
                                                onClick={() =>
                                                    openSave(
                                                        capoDisplayShape,
                                                        displayLabel,
                                                        selectedMode ===
                                                            "scales"
                                                            ? {
                                                                  source: "library",
                                                                  mode: "scales",
                                                                  rootNote:
                                                                      currentRootNote,
                                                                  tuningName:
                                                                      selectedTuning.name,
                                                                  capo,
                                                                  noteGroup:
                                                                      selectedNoteGroup,
                                                                  scale: selectedScale,
                                                                  scalePosition:
                                                                      selectedScalePosition,
                                                                  scalePattern:
                                                                      selectedScalePattern,
                                                                  scaleVariant:
                                                                      selectedScaleVariant,
                                                              }
                                                            : {
                                                                  source: "library",
                                                                  mode: "chords",
                                                                  rootNote:
                                                                      currentRootNote,
                                                                  tuningName:
                                                                      selectedTuning.name,
                                                                  capo,
                                                                  category:
                                                                      selectedCategory,
                                                                  voicingType:
                                                                      selectedVoicingType,
                                                                  stringSet:
                                                                      selectedStringSet,
                                                                  chordQuality:
                                                                      selectedChordQuality,
                                                                  position:
                                                                      selectedPosition,
                                                                  altShape:
                                                                      selectedAltShape,
                                                              },
                                                    )
                                                }
                                                title='Save chord'
                                                className={`w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 hover:border-ink transition-colors ${isCurrentChordSaved ? "text-yellow-400" : "text-ink"}`}>
                                                <BookmarkIcon />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (
                                                        selectedMode ===
                                                        "scales"
                                                    ) {
                                                        if (isPlayingScale)
                                                            stopScale();
                                                        else playScale();
                                                    } else {
                                                        playChord(
                                                            capoDisplayShape,
                                                            selectedTuning.freqs,
                                                        );
                                                    }
                                                }}
                                                title={
                                                    selectedMode === "scales"
                                                        ? isPlayingScale
                                                            ? "Stop"
                                                            : "Play scale"
                                                        : "Play"
                                                }
                                                className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors ${isPlayingScale ? "bg-ink text-sand-1 border-ink" : "border-ink/40 text-ink hover:border-ink"}`}>
                                                {selectedMode === "scales" &&
                                                isPlayingScale ? (
                                                    <StopIcon />
                                                ) : (
                                                    <StrumIcon />
                                                )}
                                            </button>
                                        </>
                                    )}
                                    {randomizeOn ? (
                                        <button
                                            onClick={handleRandomize}
                                            title='Randomize again'
                                            className='whitespace-nowrap w-10 h-10 flex items-center justify-center bg-ink text-sand-1 rounded-full hover:opacity-90 active:scale-95 transition-all'>
                                            <RandomizeIcon />
                                        </button>
                                    ) : (
                                        <RootNoteButton
                                            root={modeRootNote}
                                            onSelect={handleSelectRoot}
                                            onRandom={handleGenerateNewRoot}
                                            className='whitespace-nowrap px-5 py-2.5 bg-ink text-sand-1 rounded-full font-bold text-sm hover:opacity-90 active:scale-95 transition-all'
                                        />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── Mobile Menu Sheet ───────────────────────────────── */}
                        {menuOpen && (
                            <div className='sm:hidden fixed inset-0 z-50 flex flex-col justify-end'>
                                <div
                                    className='flex-1 bg-black/40'
                                    onClick={() => setMenuOpen(false)}
                                />
                                <div className='bg-sand-1 rounded-t-2xl shadow-2xl flex flex-col max-h-[85dvh]'>
                                    {/* Handle */}
                                    <div className='shrink-0 py-3 flex justify-center'>
                                        <div className='w-10 h-1 bg-ink/20 rounded-full' />
                                    </div>

                                    {/* Mode toggle — always visible, never scrolls */}
                                    <div className='shrink-0 px-4 pb-3'>
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
                                    </div>

                                    {/* Scrollable content */}
                                    <div className='flex-1 min-h-0 overflow-y-auto px-4 flex flex-col gap-5'>
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
                                                        {(scaleVariants?.[
                                                            selectedScaleVariant
                                                        ] ??
                                                            scaleVariants?.[0])?.[0]
                                                            ?.modeName
                                                            ? "Mode"
                                                            : "Position"}
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
                                                                    ? wrapAtParen(
                                                                          pos.modeName,
                                                                      )
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
                                                                    const locked =
                                                                        !hasPro &&
                                                                        k !==
                                                                            scaleEntry?.defaultPattern;
                                                                    return (
                                                                        <button
                                                                            key={
                                                                                k
                                                                            }
                                                                            onClick={() =>
                                                                                handleScalePatternChange(
                                                                                    k,
                                                                                )
                                                                            }
                                                                            className={`relative px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                                                                selectedScalePattern ===
                                                                                k
                                                                                    ? "bg-sand-4 text-sand-1 border-ink"
                                                                                    : "text-ink border-ink/40 hover:border-ink"
                                                                            } ${locked ? "opacity-60" : ""}`}>
                                                                            {locked && (
                                                                                <span className='absolute -top-1 -right-1 w-4 h-4 rounded-full bg-olive border border-olive/60 flex items-center justify-center text-sand-1'>
                                                                                    <StarIcon />
                                                                                </span>
                                                                            )}
                                                                            {k}
                                                                        </button>
                                                                    );
                                                                },
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Tuning */}
                                        <div>
                                            <p className='text-[10px] font-bold text-ink/50 uppercase tracking-widest mb-2'>
                                                Tuning
                                            </p>
                                            <div className='flex flex-wrap gap-1.5'>
                                                {TUNINGS.map(t => (
                                                    <button
                                                        key={t.name}
                                                        onClick={() =>
                                                            setSelectedTuning(t)
                                                        }
                                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                                            selectedTuning.name ===
                                                            t.name
                                                                ? "bg-ink text-sand-1 border-ink"
                                                                : "text-ink border-ink/40 hover:border-ink"
                                                        }`}>
                                                        {t.name}
                                                    </button>
                                                ))}
                                            </div>
                                            {selectedTuning.name !==
                                                "Standard" && (
                                                <p className='mt-1.5 text-[10px] text-ink/40 font-mono'>
                                                    {[...selectedTuning.notes]
                                                        .reverse()
                                                        .join(" · ")}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className='shrink-0 px-4 pt-3 pb-8'>
                                        <button
                                            onClick={() => setMenuOpen(false)}
                                            className='w-full py-3 bg-ink text-sand-1 rounded-full font-bold text-sm hover:opacity-90 transition-opacity'>
                                            Done
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── DESKTOP layout (sm+) ─────────────────────────────────── */}
                        <div className='hidden sm:flex flex-col items-center justify-center gap-4 py-8 w-full min-h-0 flex-1'>
                            {/* Name label */}
                            <div className='text-center px-4 xl:px-8 w-full'>
                                <span className='text-3xl font-bold text-ink tracking-tight'>
                                    {selectedMode === "scales" &&
                                    !scalePosition?.modeName
                                        ? `${capoRootNote} ${selectedScale}`
                                        : wrapAtParen(displayLabel)}
                                </span>
                                {selectedMode === "scales" &&
                                    !scalePosition?.modeName && (
                                        <p className='text-sm font-semibold text-ink/60 mt-0.5'>
                                            {`Position ${selectedScalePosition + 1}`}
                                        </p>
                                    )}
                            </div>

                            {/* Fretboard */}
                            <div className='w-full px-4 xl:px-8'>
                                <FretboardHorizontal
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
                                                            ? wrapAtParen(
                                                                  pos.modeName,
                                                              )
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
                                                                <div className='flex items-center gap-2 border border-ink rounded'>
                                                                    <button
                                                                        onClick={() =>
                                                                            handleScalePatternChange(
                                                                                scalePatternKeys[
                                                                                    (patIdx -
                                                                                        1 +
                                                                                        scalePatternKeys.length) %
                                                                                        scalePatternKeys.length
                                                                                ],
                                                                            )
                                                                        }
                                                                        title='Previous pattern'
                                                                        className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-r border-ink rounded-l'>
                                                                        <ChevronLeft />
                                                                    </button>
                                                                    <span className='relative px-3 text-sm font-medium text-ink'>
                                                                        {!hasPro &&
                                                                            scalePatternKeys.length >
                                                                                1 && (
                                                                                <span className='absolute -top-1.5 -right-1 w-4 h-4 rounded-full bg-olive border border-olive/60 flex items-center justify-center text-sand-1'>
                                                                                    <StarIcon />
                                                                                </span>
                                                                            )}
                                                                        {
                                                                            selectedScalePattern
                                                                        }
                                                                    </span>
                                                                    <button
                                                                        onClick={() =>
                                                                            handleScalePatternChange(
                                                                                scalePatternKeys[
                                                                                    (patIdx +
                                                                                        1) %
                                                                                        scalePatternKeys.length
                                                                                ],
                                                                            )
                                                                        }
                                                                        title='Next pattern'
                                                                        className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-l border-ink rounded-r'>
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
                                                                <div className='flex items-center gap-2 border border-ink rounded'>
                                                                    <button
                                                                        onClick={() =>
                                                                            handleScaleVariantChange(
                                                                                (selectedScaleVariant -
                                                                                    1 +
                                                                                    scaleNumVariants) %
                                                                                    scaleNumVariants,
                                                                            )
                                                                        }
                                                                        title='Previous variant'
                                                                        className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-r border-ink rounded-l'>
                                                                        <ChevronLeft />
                                                                    </button>
                                                                    <span className='relative px-3 text-sm font-medium text-ink'>
                                                                        {scaleVariantLocked && (
                                                                            <span className='absolute -top-1.5 -right-1 w-4 h-4 rounded-full bg-olive border border-olive/60 flex items-center justify-center text-sand-1'>
                                                                                <StarIcon />
                                                                            </span>
                                                                        )}
                                                                        <span
                                                                            className={
                                                                                scaleVariantLocked
                                                                                    ? "opacity-50"
                                                                                    : ""
                                                                            }>
                                                                            {`${selectedScaleVariant + 1}/${scaleNumVariants}`}
                                                                        </span>
                                                                    </span>
                                                                    <button
                                                                        onClick={() =>
                                                                            handleScaleVariantChange(
                                                                                (selectedScaleVariant +
                                                                                    1) %
                                                                                    scaleNumVariants,
                                                                            )
                                                                        }
                                                                        title='Next variant'
                                                                        className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-l border-ink rounded-r'>
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
                                                onClick={() => setOctaveUp(o => !o)}
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
                                                        Alternate Shapes
                                                    </span>
                                                    <div className='flex items-center gap-2 border border-ink rounded'>
                                                        <button
                                                            onClick={goPrevAlt}
                                                            title='Previous shape'
                                                            className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-r border-ink rounded-l'>
                                                            <ChevronLeft />
                                                        </button>
                                                        <span className='relative px-3 text-sm font-medium text-ink'>
                                                            {altsLocked && (
                                                                <span className='absolute -top-1.5 -right-1 w-4 h-4 rounded-full bg-olive border border-olive/60 flex items-center justify-center text-sand-1'>
                                                                    <StarIcon />
                                                                </span>
                                                            )}
                                                            <span
                                                                className={
                                                                    altsLocked
                                                                        ? "opacity-50"
                                                                        : ""
                                                                }>{`${selectedAltShape + 1}/${availableAlts.length}`}</span>
                                                        </span>
                                                        <button
                                                            onClick={goNextAlt}
                                                            title='Next shape'
                                                            className='px-2 py-1.5 bg-sand-2 text-ink hover:bg-sand-3 transition-colors border-l border-ink rounded-r'>
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
                                <div className='flex items-center gap-2'>
                                    {displayShape.length > 0 && (
                                        <>
                                            <button
                                                onClick={() =>
                                                    openSave(
                                                        capoDisplayShape,
                                                        displayLabel,
                                                        selectedMode ===
                                                            "scales"
                                                            ? {
                                                                  source: "library",
                                                                  mode: "scales",
                                                                  rootNote:
                                                                      currentRootNote,
                                                                  tuningName:
                                                                      selectedTuning.name,
                                                                  capo,
                                                                  noteGroup:
                                                                      selectedNoteGroup,
                                                                  scale: selectedScale,
                                                                  scalePosition:
                                                                      selectedScalePosition,
                                                                  scalePattern:
                                                                      selectedScalePattern,
                                                                  scaleVariant:
                                                                      selectedScaleVariant,
                                                              }
                                                            : {
                                                                  source: "library",
                                                                  mode: "chords",
                                                                  rootNote:
                                                                      currentRootNote,
                                                                  tuningName:
                                                                      selectedTuning.name,
                                                                  capo,
                                                                  category:
                                                                      selectedCategory,
                                                                  voicingType:
                                                                      selectedVoicingType,
                                                                  stringSet:
                                                                      selectedStringSet,
                                                                  chordQuality:
                                                                      selectedChordQuality,
                                                                  position:
                                                                      selectedPosition,
                                                                  altShape:
                                                                      selectedAltShape,
                                                              },
                                                    )
                                                }
                                                title='Save chord'
                                                className={`flex items-center gap-2 px-4 py-2 rounded-full border border-ink/40 text-sm font-semibold hover:border-ink transition-colors ${isCurrentChordSaved ? "text-yellow-400" : "text-ink"}`}>
                                                <BookmarkIcon />
                                                Save
                                            </button>
                                            {selectedMode === "scales" && (
                                                <PlaybackSpeedButton
                                                    speed={playbackSpeed}
                                                    onSpeedChange={
                                                        setPlaybackSpeed
                                                    }
                                                />
                                            )}
                                            <button
                                                onClick={() => {
                                                    if (
                                                        selectedMode ===
                                                        "scales"
                                                    ) {
                                                        if (isPlayingScale)
                                                            stopScale();
                                                        else playScale();
                                                    } else {
                                                        playChord(
                                                            capoDisplayShape,
                                                            selectedTuning.freqs,
                                                        );
                                                    }
                                                }}
                                                title={
                                                    selectedMode === "scales"
                                                        ? isPlayingScale
                                                            ? "Stop"
                                                            : "Play scale"
                                                        : "Play"
                                                }
                                                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-colors ${isPlayingScale ? "bg-ink text-sand-1 border-ink hover:opacity-80" : "border-ink/40 text-ink hover:border-ink"}`}>
                                                {selectedMode === "scales" &&
                                                isPlayingScale ? (
                                                    <StopIcon />
                                                ) : (
                                                    <StrumIcon />
                                                )}
                                                {selectedMode === "scales"
                                                    ? isPlayingScale
                                                        ? "Stop"
                                                        : "Play"
                                                    : "Strum"}
                                            </button>
                                        </>
                                    )}
                                    {randomizeOn ? (
                                        <button
                                            onClick={handleRandomize}
                                            title='Randomize again'
                                            className='w-10 h-10 flex items-center justify-center bg-ink text-sand-1 rounded-full hover:opacity-90 transition-opacity'>
                                            <RandomizeIcon />
                                        </button>
                                    ) : (
                                        <RootNoteButton
                                            root={modeRootNote}
                                            onSelect={handleSelectRoot}
                                            onRandom={handleGenerateNewRoot}
                                            className='px-6 py-2 bg-ink text-sand-1 text-sm font-semibold rounded-full hover:opacity-90 transition-opacity'
                                        />
                                    )}
                                </div>

                                {/* Actions */}
                                <div className='flex flex-wrap items-center justify-center gap-4'>
                                    <TuningDropdown
                                        selectedTuning={selectedTuning}
                                        onSelect={setSelectedTuning}
                                    />
                                    <button
                                        onClick={() => {
                                            if (randomizeOn)
                                                setRandomizeOn(false);
                                            else setRandomizeSheetOpen(true);
                                        }}
                                        className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-colors ${
                                            randomizeOn
                                                ? "bg-ink text-sand-1 border-ink"
                                                : "bg-sand-1 text-ink border-ink hover:bg-sand-2"
                                        }`}>
                                        <RandomizeIcon />
                                        Randomize
                                    </button>
                                    <NotesIntervalsToggle
                                        showIntervals={showIntervals}
                                        onToggle={setShowIntervals}
                                    />
                                    <button
                                        onClick={() => setIsRight(!isRight)}
                                        className='whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-full border border-ink bg-sand-2 text-ink text-sm font-semibold hover:bg-sand-3 transition-colors'>
                                        <HandIcon flipped={!isRight} />
                                        {isRight ? "Right hand" : "Left hand"}
                                    </button>
                                    <CapoButton
                                        capo={capo}
                                        setCapo={setCapo}
                                        size='md'
                                    />
                                    <button
                                        onClick={handleToggleDrawMode}
                                        className='whitespace-nowrap relative flex items-center gap-2 px-4 py-2 rounded-full border border-ink bg-sand-2 text-ink text-sm font-semibold hover:bg-sand-3 transition-colors'>
                                        {!hasPro && (
                                            <span className='absolute -top-1 -right-1 w-4 h-4 rounded-full bg-olive border border-olive/60 flex items-center justify-center text-sand-1'>
                                                <StarIcon />
                                            </span>
                                        )}
                                        <PencilIcon />
                                        Draw Mode
                                    </button>
                                    <button
                                        onClick={() => setSavedPanelOpen(true)}
                                        title='My Chords'
                                        className='whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-full border border-ink bg-sand-2 text-ink text-sm font-semibold hover:bg-sand-3 transition-colors'>
                                        <BookmarkIcon filled />
                                        My Chords
                                    </button>
                                    <button
                                        onClick={() =>
                                            hasPro
                                                ? setProgressionPanelOpen(true)
                                                : openPaywall()
                                        }
                                        title='Progressions'
                                        className='whitespace-nowrap relative flex items-center gap-2 px-4 py-2 rounded-full border border-ink bg-sand-2 text-ink text-sm font-semibold hover:bg-sand-3 transition-colors'>
                                        {!hasPro && (
                                            <span className='absolute -top-1 -right-1 w-4 h-4 rounded-full bg-olive border border-olive/60 flex items-center justify-center text-sand-1'>
                                                <StarIcon />
                                            </span>
                                        )}
                                        <ListIcon />
                                        Progressions
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </main>

            {/* ── Saved Chords Panel ────────────────────────────── */}
            <SavedChordsPanel
                open={savedPanelOpen}
                onClose={() => setSavedPanelOpen(false)}
                onLoad={handleLoadSaved}
                refreshKey={savedRefreshKey}
            />

            {/* ── Progression Builder Panel ─────────────────────── */}
            <ProgressionPanel
                open={progressionPanelOpen}
                onClose={() => setProgressionPanelOpen(false)}
                currentChord={currentChordForProgression}
                userId={userId}
                hasPro={hasPro}
                onAuthRequired={() => {
                    setProgressionPanelOpen(false);
                    setAuthGateOpen(true);
                }}
                onProRequired={() => {
                    setProgressionPanelOpen(false);
                    openPaywall();
                }}
                onRequestOpen={() => setProgressionPanelOpen(true)}
                pendingChord={progressionPendingChord}
                onPendingConsumed={() => setProgressionPendingChord(null)}
            />

            {/* ── Randomize Sheet ──────────────────────────────── */}
            <>
                {randomizeSheetOpen && (
                    <div
                        className='fixed inset-0 z-40 bg-ink/30'
                        onClick={() => setRandomizeSheetOpen(false)}
                    />
                )}
                <div
                    className={`fixed z-50 bg-sand-1 shadow-xl transition-transform duration-300 flex flex-col
                    bottom-0 left-0 right-0 rounded-t-2xl max-h-[80dvh]
                    sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:w-96 sm:rounded-2xl sm:max-h-[85dvh]
                    ${randomizeSheetOpen ? "translate-y-0 sm:-translate-y-1/2" : "translate-y-full sm:translate-y-full sm:opacity-0 sm:pointer-events-none"}`}>
                    {/* Header */}
                    <div className='flex items-center justify-between px-5 pt-5 pb-3 border-b border-ink/10 shrink-0'>
                        <h2 className='text-base font-bold text-ink'>
                            Randomize
                        </h2>
                        <div className='flex items-center gap-3'>
                            <button
                                onClick={() => {
                                    if (selectedMode === "chords") {
                                        setChordRandomize({
                                            categories: [],
                                            voicingTypes: [],
                                            stringSets: [],
                                            qualities: [],
                                            randomizeRoot: true,
                                        });
                                    } else {
                                        setScaleRandomize({
                                            noteGroups: [],
                                            scales: [],
                                            modes: [],
                                            randomizeRoot: true,
                                        });
                                    }
                                }}
                                className='text-xs font-semibold text-ink/40 hover:text-ink transition-colors'>
                                Clear
                            </button>
                            <button
                                onClick={() => setRandomizeSheetOpen(false)}
                                className='text-ink/40 hover:text-ink transition-colors text-xl leading-none'>
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className='flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5'>
                        {selectedMode === "chords" ? (
                            <>
                                {/* Categories */}
                                <div>
                                    <p className='text-[10px] font-bold uppercase tracking-widest text-ink/40 mb-2'>
                                        Category{" "}
                                        <span className='normal-case font-semibold text-ink/30'>
                                            (empty = all)
                                        </span>
                                    </p>
                                    <div className='flex flex-wrap gap-2'>
                                        {Object.keys(allChordShapes).map(
                                            cat => {
                                                const active =
                                                    chordRandomize.categories.includes(
                                                        cat,
                                                    );
                                                return (
                                                    <button
                                                        key={cat}
                                                        onClick={() =>
                                                            setChordRandomize(
                                                                c => ({
                                                                    ...c,
                                                                    categories:
                                                                        active
                                                                            ? c.categories.filter(
                                                                                  x =>
                                                                                      x !==
                                                                                      cat,
                                                                              )
                                                                            : [
                                                                                  ...c.categories,
                                                                                  cat,
                                                                              ],
                                                                    voicingTypes:
                                                                        [],
                                                                    stringSets:
                                                                        [],
                                                                    qualities:
                                                                        [],
                                                                }),
                                                            )
                                                        }
                                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? "bg-ink text-sand-1 border-ink" : "text-ink border-ink/40 hover:border-ink"}`}>
                                                        {cat}
                                                    </button>
                                                );
                                            },
                                        )}
                                    </div>
                                </div>

                                {/* Sub-levels — only shown when exactly one category is pinned */}
                                {chordRandomize.categories.length === 1 &&
                                    (() => {
                                        const cat =
                                            chordRandomize.categories[0];
                                        const levels: {
                                            label: string;
                                            key: keyof ChordRandomizeConfig;
                                            options: string[];
                                        }[] = [];
                                        let cursor: ChordLevel | undefined = (
                                            allChordShapes as Record<
                                                string,
                                                ChordLevel
                                            >
                                        )[cat];
                                        while (
                                            cursor?.options &&
                                            cursor.levelName !== "Positions"
                                        ) {
                                            const keys: string[] = Object.keys(
                                                cursor.options,
                                            );
                                            if (
                                                cursor.levelName ===
                                                "Voicing Types"
                                            )
                                                levels.push({
                                                    label: "Voicing",
                                                    key: "voicingTypes",
                                                    options: keys,
                                                });
                                            else if (
                                                cursor.levelName ===
                                                "String Sets"
                                            )
                                                levels.push({
                                                    label: "String Set",
                                                    key: "stringSets",
                                                    options: keys,
                                                });
                                            else if (
                                                cursor.levelName ===
                                                "Chord Qualities"
                                            )
                                                levels.push({
                                                    label: "Quality",
                                                    key: "qualities",
                                                    options: keys,
                                                });
                                            // drill to first option to discover next level
                                            cursor = cursor.options[keys[0]];
                                        }
                                        return levels.map(
                                            ({ label, key, options }) => (
                                                <div key={key}>
                                                    <p className='text-[10px] font-bold uppercase tracking-widest text-ink/40 mb-2'>
                                                        {label}{" "}
                                                        <span className='normal-case font-semibold text-ink/30'>
                                                            (empty = all)
                                                        </span>
                                                    </p>
                                                    <div className='flex flex-wrap gap-2'>
                                                        {options.map(opt => {
                                                            const active = (
                                                                chordRandomize[
                                                                    key
                                                                ] as string[]
                                                            ).includes(opt);
                                                            return (
                                                                <button
                                                                    key={opt}
                                                                    onClick={() =>
                                                                        setChordRandomize(
                                                                            c => ({
                                                                                ...c,
                                                                                [key]: active
                                                                                    ? (
                                                                                          c[
                                                                                              key
                                                                                          ] as string[]
                                                                                      ).filter(
                                                                                          x =>
                                                                                              x !==
                                                                                              opt,
                                                                                      )
                                                                                    : [
                                                                                          ...(c[
                                                                                              key
                                                                                          ] as string[]),
                                                                                          opt,
                                                                                      ],
                                                                            }),
                                                                        )
                                                                    }
                                                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? "bg-ink text-sand-1 border-ink" : "text-ink border-ink/40 hover:border-ink"}`}>
                                                                    {opt}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ),
                                        );
                                    })()}

                                {/* Root note */}
                                <div className='flex items-center justify-between'>
                                    <p className='text-sm font-semibold text-ink'>
                                        Randomize root note
                                    </p>
                                    <button
                                        onClick={() =>
                                            setChordRandomize(c => ({
                                                ...c,
                                                randomizeRoot: !c.randomizeRoot,
                                            }))
                                        }
                                        className={`w-11 h-6 rounded-full transition-colors relative ${chordRandomize.randomizeRoot ? "bg-ink" : "bg-ink/20"}`}>
                                        <span
                                            className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-sand-1 shadow transition-transform ${chordRandomize.randomizeRoot ? "translate-x-[22px]" : "translate-x-[2px]"}`}
                                        />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Note Groups */}
                                <div>
                                    <p className='text-[10px] font-bold uppercase tracking-widest text-ink/40 mb-2'>
                                        Note Group{" "}
                                        <span className='normal-case font-semibold text-ink/30'>
                                            (empty = all)
                                        </span>
                                    </p>
                                    <div className='flex flex-wrap gap-2'>
                                        {Object.keys(SCALE_SHAPES).map(
                                            group => {
                                                const active =
                                                    scaleRandomize.noteGroups.includes(
                                                        group,
                                                    );
                                                return (
                                                    <button
                                                        key={group}
                                                        onClick={() =>
                                                            setScaleRandomize(
                                                                c => ({
                                                                    ...c,
                                                                    noteGroups:
                                                                        active
                                                                            ? c.noteGroups.filter(
                                                                                  x =>
                                                                                      x !==
                                                                                      group,
                                                                              )
                                                                            : [
                                                                                  ...c.noteGroups,
                                                                                  group,
                                                                              ],
                                                                    scales: [],
                                                                }),
                                                            )
                                                        }
                                                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? "bg-ink text-sand-1 border-ink" : "text-ink border-ink/40 hover:border-ink"}`}>
                                                        {group}
                                                    </button>
                                                );
                                            },
                                        )}
                                    </div>
                                </div>

                                {/* Specific scales — shown when note groups are pinned */}
                                {scaleRandomize.noteGroups.length > 0 && (
                                    <div>
                                        <p className='text-[10px] font-bold uppercase tracking-widest text-ink/40 mb-2'>
                                            Scale{" "}
                                            <span className='normal-case font-semibold text-ink/30'>
                                                (empty = all in group)
                                            </span>
                                        </p>
                                        <div className='flex flex-wrap gap-2'>
                                            {scaleRandomize.noteGroups
                                                .flatMap(g =>
                                                    Object.keys(
                                                        SCALE_SHAPES[g] ?? {},
                                                    ),
                                                )
                                                .map(s => {
                                                    const active =
                                                        scaleRandomize.scales.includes(
                                                            s,
                                                        );
                                                    return (
                                                        <button
                                                            key={s}
                                                            onClick={() =>
                                                                setScaleRandomize(
                                                                    c => ({
                                                                        ...c,
                                                                        scales: active
                                                                            ? c.scales.filter(
                                                                                  x =>
                                                                                      x !==
                                                                                      s,
                                                                              )
                                                                            : [
                                                                                  ...c.scales,
                                                                                  s,
                                                                              ],
                                                                    }),
                                                                )
                                                            }
                                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? "bg-ink text-sand-1 border-ink" : "text-ink border-ink/40 hover:border-ink"}`}>
                                                            {s}
                                                        </button>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}

                                {/* Modes — all named positions across applicable scales */}
                                {(() => {
                                    if (scaleRandomize.noteGroups.length === 0)
                                        return null;
                                    const relevantScales =
                                        scaleRandomize.scales.length > 0
                                            ? scaleRandomize.scales
                                            : scaleRandomize.noteGroups.flatMap(
                                                  g =>
                                                      Object.keys(
                                                          SCALE_SHAPES[g] ?? {},
                                                      ),
                                              );
                                    const allModeNames = Array.from(
                                        new Set(
                                            relevantScales.flatMap(s =>
                                                scaleRandomize.noteGroups.flatMap(
                                                    g =>
                                                        (
                                                            SCALE_SHAPES[g]?.[s]
                                                                ?.positions ?? []
                                                        )
                                                            .map(p => p.modeName)
                                                            .filter(
                                                                (
                                                                    m,
                                                                ): m is string =>
                                                                    !!m,
                                                            ),
                                                ),
                                            ),
                                        ),
                                    );
                                    if (allModeNames.length === 0) return null;
                                    return (
                                        <div>
                                            <p className='text-[10px] font-bold uppercase tracking-widest text-ink/40 mb-2'>
                                                Mode{" "}
                                                <span className='normal-case font-semibold text-ink/30'>
                                                    (empty = all)
                                                </span>
                                            </p>
                                            <div className='flex flex-wrap gap-2'>
                                                {allModeNames.map(modeName => {
                                                    const active =
                                                        scaleRandomize.modes.includes(
                                                            modeName,
                                                        );
                                                    return (
                                                        <button
                                                            key={modeName}
                                                            onClick={() =>
                                                                setScaleRandomize(
                                                                    c => ({
                                                                        ...c,
                                                                        modes: active
                                                                            ? c.modes.filter(
                                                                                  m =>
                                                                                      m !==
                                                                                      modeName,
                                                                              )
                                                                            : [
                                                                                  ...c.modes,
                                                                                  modeName,
                                                                              ],
                                                                    }),
                                                                )
                                                            }
                                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? "bg-ink text-sand-1 border-ink" : "text-ink border-ink/40 hover:border-ink"}`}>
                                                            {modeName}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Root note */}
                                <div className='flex items-center justify-between'>
                                    <p className='text-sm font-semibold text-ink'>
                                        Randomize root note
                                    </p>
                                    <button
                                        onClick={() =>
                                            setScaleRandomize(c => ({
                                                ...c,
                                                randomizeRoot: !c.randomizeRoot,
                                                modes: [],
                                            }))
                                        }
                                        className={`w-11 h-6 rounded-full transition-colors relative ${scaleRandomize.randomizeRoot ? "bg-ink" : "bg-ink/20"}`}>
                                        <span
                                            className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-sand-1 shadow transition-transform ${scaleRandomize.randomizeRoot ? "translate-x-[22px]" : "translate-x-[2px]"}`}
                                        />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className='shrink-0 px-5 pb-6 pt-3 border-t border-ink/10'>
                        <button
                            onClick={() => {
                                handleRandomize();
                                setRandomizeOn(true);
                                setRandomizeSheetOpen(false);
                            }}
                            className='w-full py-3 bg-ink text-sand-1 rounded-full text-sm font-bold hover:opacity-90 transition-opacity'>
                            Done
                        </button>
                    </div>
                </div>
            </>

            {/* ── Auth Gate Modal ───────────────────────────────── */}
            {authGateOpen && (
                <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
                    <div
                        className='absolute inset-0 bg-ink/40'
                        onClick={() => setAuthGateOpen(false)}
                    />
                    <div className='relative bg-sand-1 rounded-2xl shadow-xl p-6 w-full max-w-xs text-center flex flex-col gap-4'>
                        <div className='w-10 h-10 rounded-full bg-ink/10 flex items-center justify-center mx-auto'>
                            <BookmarkIcon />
                        </div>
                        <div>
                            <p className='font-bold text-ink text-lg'>
                                Sign in to save
                            </p>
                            <p className='text-sm text-ink/60 mt-1'>
                                Create a free account to save chords and access
                                them anywhere.
                            </p>
                        </div>
                        <div className='flex flex-col gap-2'>
                            <button
                                onClick={() => {
                                    setAuthGateOpen(false);
                                    router.push("/signin");
                                }}
                                className='w-full py-2.5 bg-ink text-sand-1 rounded-full font-bold text-sm hover:opacity-90 transition-opacity'>
                                Sign in
                            </button>
                            <button
                                onClick={() => setAuthGateOpen(false)}
                                className='w-full py-2 text-ink/50 text-sm hover:text-ink transition-colors'>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Save Dialog ───────────────────────────────────── */}
            {saveDialog && (
                <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
                    <div
                        className='absolute inset-0 bg-ink/40'
                        onClick={() => setSaveDialog(null)}
                    />
                    <div className='relative bg-sand-1 rounded-2xl shadow-xl p-6 w-full max-w-xs flex flex-col gap-4'>
                        <p className='font-bold text-ink text-lg'>Save chord</p>
                        <input
                            autoFocus
                            className='w-full bg-sand-2 border border-ink/20 rounded-xl px-4 py-2.5 text-sm text-ink outline-none focus:border-ink transition-colors'
                            value={saveLabel}
                            onChange={e => setSaveLabel(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter") handleSaveConfirm();
                                if (e.key === "Escape") setSaveDialog(null);
                            }}
                            placeholder='Chord name…'
                        />
                        <div className='flex gap-2'>
                            <button
                                onClick={() => setSaveDialog(null)}
                                className='flex-1 py-2.5 rounded-full border border-ink/30 text-ink text-sm font-semibold hover:border-ink transition-colors'>
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveConfirm}
                                disabled={saving}
                                className='flex-1 py-2.5 bg-ink text-sand-1 rounded-full font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity'>
                                {saving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Welcome Modal (post-subscribe) ────────────────── */}
            {showWelcome && (
                <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4'>
                    <div className='w-full max-w-sm bg-sand-4 rounded-3xl shadow-2xl overflow-hidden'>
                        <div className='px-6 pt-7 pb-5 flex flex-col items-center gap-2 border-b border-sand-1/10'>
                            <span className='inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-olive/20 border border-olive/40 text-olive text-xs font-bold tracking-wide uppercase'>
                                <StarIcon />
                                Pro
                            </span>
                            <h2 className='text-2xl font-bold text-sand-1 text-center leading-tight'>
                                You&rsquo;re in. Welcome to Pro.
                            </h2>
                            <p className='text-sm text-sand-1/60 text-center'>
                                Here&rsquo;s what&rsquo;s now unlocked for you
                            </p>
                        </div>
                        <ul className='px-6 py-4 flex flex-col gap-2.5'>
                            {[
                                "Alternate chord voicings",
                                "Additional scale patterns & variants",
                                "Draw Mode — build any shape",
                                "New content added regularly",
                            ].map(f => (
                                <li
                                    key={f}
                                    className='flex items-center gap-3'>
                                    <span className='shrink-0 w-5 h-5 rounded-full bg-olive/20 border border-olive/40 flex items-center justify-center'>
                                        <svg
                                            className='w-3 h-3 text-olive'
                                            viewBox='0 0 24 24'
                                            fill='none'
                                            stroke='currentColor'
                                            strokeWidth={3}>
                                            <path
                                                strokeLinecap='round'
                                                strokeLinejoin='round'
                                                d='M5 13l4 4L19 7'
                                            />
                                        </svg>
                                    </span>
                                    <span className='text-sm text-sand-1/80 font-medium'>
                                        {f}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <div className='px-6 pb-6'>
                            <button
                                onClick={() => setShowWelcome(false)}
                                className='w-full py-3.5 rounded-full bg-sand-1 text-sand-4 text-sm font-bold tracking-wide hover:opacity-90 transition-all active:scale-95'>
                                Start exploring
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
